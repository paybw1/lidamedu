// /lecture/watch/:lessonId — 강의 재생 화면(Kollus 웹플레이어).
//   재생 판정(requestPlaybackGrant) → 성공 시 서명된 Kollus URL 을 iframe 임베드.
//   좌: 플레이어 + 회차 정보 + 이전/다음 이동 / 우: 진도 표시 sticky 목차.
//   시청 구간 하트비트로 진도·이어보기·배수 원장 적재.
import { useEffect, useRef } from "react";

import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LockIcon,
  PlayCircleIcon,
  PlayIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  PLAYBACK_DENY_MESSAGE,
  requestPlaybackGrant,
} from "~/features/lms/playback.server";
import {
  getLessonProgressForUser,
  getResumePosition,
} from "~/features/lms/watch.server";

import type { Route } from "./+types/lecture-watch";

export function meta({ data: d }: Route.MetaArgs) {
  return [{ title: `${d?.lessonTitle ?? "강의 재생"} | 리담변리사학원` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const lessonId = params.lessonId ?? "";

  // 회차·강의 메타(재생 판정과 별개로 화면 구성에 사용).
  const { data: lesson } = await adminClient
    .from("course_lessons")
    .select("lesson_id, course_id, lesson_no, title, is_published, deleted_at")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (!lesson || lesson.deleted_at) {
    throw data("회차를 찾을 수 없습니다", { status: 404 });
  }

  // 강의 라벨 + 재생목록(published 회차).
  const { data: course } = await adminClient
    .from("courses")
    .select(
      "course_id, edition_label, series:course_series!courses_series_id_fkey(title)",
    )
    .eq("course_id", lesson.course_id)
    .maybeSingle();
  const courseLabel = course
    ? `${(course.series as { title: string } | null)?.title ?? ""} ${course.edition_label}`.trim()
    : "강의";
  const { data: siblings } = await adminClient
    .from("course_lessons")
    .select("lesson_id, lesson_no, title, is_preview")
    .eq("course_id", lesson.course_id)
    .eq("is_published", true)
    .is("deleted_at", null)
    .order("sort_order")
    .order("lesson_no");
  const siblingRows = siblings ?? [];

  // 회차별 진도(로그인 시) — 목차 완강/진행 표시.
  const progress = user
    ? await getLessonProgressForUser(
        user.id,
        siblingRows.map((l) => l.lesson_id),
      )
    : new Map();
  const lessons = siblingRows.map((l) => {
    const p = progress.get(l.lesson_id);
    return {
      lessonId: l.lesson_id,
      lessonNo: l.lesson_no,
      title: l.title,
      isPreview: l.is_preview,
      completed: p?.completed ?? false,
      ratio: p?.progressRatio ?? 0,
      durationSeconds: p?.durationSeconds ?? 0,
    };
  });
  const completedCount = lessons.filter((l) => l.completed).length;
  const coursePct =
    lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;

  // 재생 판정 + Kollus 서명 URL.
  const judgement = await requestPlaybackGrant(client, {
    lessonId,
    userId: user?.id ?? null,
    clientIp:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  });

  const base = {
    lessonTitle: lesson.title,
    lessonNo: lesson.lesson_no,
    courseLabel,
    lessons,
    completedCount,
    coursePct,
    currentLessonId: lessonId,
    isAuthed: Boolean(user),
  };

  if (!judgement.ok) {
    return {
      ok: false as const,
      reason: judgement.reason,
      message: PLAYBACK_DENY_MESSAGE[judgement.reason],
      ...base,
    };
  }

  const resumeSeconds =
    user && !judgement.isPreview
      ? await getResumePosition(user.id, lessonId)
      : 0;

  return {
    ok: true as const,
    grantId: judgement.grantId,
    playbackUrl: judgement.playbackUrl,
    durationSeconds: judgement.durationSeconds,
    resumeSeconds,
    ...base,
  };
}

// ── 시청 구간 하트비트 ────────────────────────────────────────────────────
// ★근사치(임시): 크로스오리진 iframe 은 재생 currentTime 을 읽을 수 없어, 탭이 보이는
//   동안의 경과 wall-clock 을 시청으로 근사 보고한다(일시정지 감지는 못 함 → 약간 과다
//   집계 가능). 파이프라인(진도·이어보기·원장) 검증에는 충분. ★후속: Kollus 웹플레이어
//   JS SDK 의 timeupdate 이벤트로 실제 재생 위치를 받아 정확 보고로 교체할 것.
function useApproxWatchHeartbeat(opts: {
  grantId: string | null;
  durationSeconds: number;
  enabled: boolean;
}) {
  const { grantId, durationSeconds, enabled } = opts;
  const posRef = useRef(0);
  const seqRef = useRef(0);
  useEffect(() => {
    if (!enabled || !grantId || durationSeconds <= 0) return;
    posRef.current = 0;
    seqRef.current = 0;
    let last = Date.now();
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const now = Date.now();
      const elapsed = Math.min(60, Math.floor((now - last) / 1000));
      last = now;
      if (
        document.visibilityState !== "visible" ||
        elapsed < 1 ||
        posRef.current >= durationSeconds
      ) {
        return;
      }
      const from = Math.floor(posRef.current);
      const to = Math.min(durationSeconds, from + elapsed);
      if (to <= from) return;
      posRef.current = to;
      const fd = new FormData();
      fd.set("grantId", grantId);
      fd.set("clientSeq", String(seqRef.current++));
      fd.set("fromSeconds", String(from));
      fd.set("toSeconds", String(to));
      fd.set("positionSeconds", String(to));
      void fetch("/api/lms/watch-heartbeat", {
        method: "post",
        body: fd,
      }).catch(() => {});
    };
    const id = window.setInterval(tick, 15_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [grantId, durationSeconds, enabled]);
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtDuration(sec: number): string {
  if (sec <= 0) return "";
  const m = Math.round(sec / 60);
  return `${m}분`;
}

type WatchLesson = {
  lessonId: string;
  lessonNo: number;
  title: string;
  isPreview: boolean;
  completed: boolean;
  ratio: number;
  durationSeconds: number;
};

export default function LectureWatch({ loaderData }: Route.ComponentProps) {
  useApproxWatchHeartbeat({
    grantId: loaderData.ok ? loaderData.grantId : null,
    durationSeconds: loaderData.ok ? loaderData.durationSeconds : 0,
    enabled: loaderData.ok && Boolean(loaderData.playbackUrl),
  });

  const {
    courseLabel,
    lessonTitle,
    lessonNo,
    lessons,
    completedCount,
    coursePct,
    currentLessonId,
  } = loaderData;

  const idx = lessons.findIndex((l) => l.lessonId === currentLessonId);
  const prev = idx > 0 ? lessons[idx - 1] : null;
  const next =
    idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null;
  const curDuration =
    lessons[idx]?.durationSeconds ||
    (loaderData.ok ? loaderData.durationSeconds : 0);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          to="/lecture"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
        >
          <ArrowLeftIcon className="size-4" /> 내 강의실
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-muted-foreground min-w-0 truncate">
          {courseLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── 플레이어 열 ── */}
        <div className="min-w-0">
          {loaderData.ok ? (
            loaderData.playbackUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm">
                <iframe
                  src={loaderData.playbackUrl}
                  title={lessonTitle}
                  className="h-full w-full border-0"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <PlayerPlaceholder />
            )
          ) : (
            <DenyView reason={loaderData.reason} message={loaderData.message} />
          )}

          {/* 회차 헤더 */}
          <div className="mt-4">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide">
              {courseLabel}
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-balance">
              <span className="text-primary tabular-nums">{lessonNo}강</span>{" "}
              {lessonTitle}
            </h1>
            <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {curDuration > 0 ? (
                <span className="tabular-nums">{fmtDuration(curDuration)}</span>
              ) : null}
              {loaderData.ok && loaderData.resumeSeconds > 0 ? (
                <span className="text-primary font-medium tabular-nums">
                  이어보기 {fmtClock(loaderData.resumeSeconds)}
                </span>
              ) : null}
            </div>
          </div>

          {/* 이전/다음 회차 */}
          {lessons.length > 1 ? (
            <div className="mt-4 flex items-stretch gap-2">
              <NavLessonButton lesson={prev} dir="prev" />
              <NavLessonButton lesson={next} dir="next" />
            </div>
          ) : null}
        </div>

        {/* ── 목차 열 (sticky) ── */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="bg-card overflow-hidden rounded-xl border">
            <div className="border-b px-4 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold">강의 목차</h2>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {completedCount}/{lessons.length}강 · {coursePct}%
                </span>
              </div>
              <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${coursePct}%` }}
                />
              </div>
            </div>
            {lessons.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-sm">
                등록된 회차가 없습니다.
              </p>
            ) : (
              <ul className="max-h-[60vh] divide-y overflow-y-auto lg:max-h-[calc(100vh-12rem)]">
                {lessons.map((l) => (
                  <PlaylistRow
                    key={l.lessonId}
                    lesson={l}
                    active={l.lessonId === currentLessonId}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function PlaylistRow({
  lesson,
  active,
}: {
  lesson: WatchLesson;
  active: boolean;
}) {
  return (
    <li>
      <Link
        to={`/lecture/watch/${lesson.lessonId}`}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
          active ? "bg-primary/10" : "hover:bg-muted/50",
        )}
      >
        {/* 상태 아이콘 */}
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
            lesson.completed
              ? "bg-emerald-500 text-white"
              : active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
          )}
        >
          {lesson.completed ? (
            <CheckIcon className="size-3.5" />
          ) : active ? (
            <PlayIcon className="size-3 fill-current" />
          ) : (
            lesson.lessonNo
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate",
              active ? "font-semibold" : "font-medium",
            )}
          >
            {lesson.title}
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <span className="tabular-nums">{lesson.lessonNo}강</span>
            {lesson.durationSeconds > 0 ? (
              <span className="tabular-nums">
                · {fmtDuration(lesson.durationSeconds)}
              </span>
            ) : null}
            {!lesson.completed && lesson.ratio > 0 ? (
              <span className="text-primary tabular-nums">
                · {Math.round(lesson.ratio * 100)}%
              </span>
            ) : null}
            {lesson.isPreview ? (
              <span className="text-primary font-semibold">· 맛보기</span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

function NavLessonButton({
  lesson,
  dir,
}: {
  lesson: WatchLesson | null;
  dir: "prev" | "next";
}) {
  if (!lesson) {
    return <div className="flex-1" />;
  }
  const isNext = dir === "next";
  return (
    <Link
      to={`/lecture/watch/${lesson.lessonId}`}
      className={cn(
        "border-border hover:bg-muted/50 flex flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors",
        isNext ? "flex-row-reverse text-right" : "",
      )}
    >
      {isNext ? (
        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
      ) : (
        <ChevronLeftIcon className="text-muted-foreground size-4 shrink-0" />
      )}
      <span className="min-w-0">
        <span className="text-muted-foreground block text-[11px] font-medium">
          {isNext ? "다음 회차" : "이전 회차"}
        </span>
        <span className="block truncate text-[13px] font-semibold">
          {lesson.lessonNo}강 · {lesson.title}
        </span>
      </span>
    </Link>
  );
}

function PlayerPlaceholder() {
  return (
    <div className="bg-muted/40 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
      <PlayCircleIcon className="text-muted-foreground/50 size-10" />
      <p className="mt-3 text-sm font-semibold">재생 설정 준비 중입니다</p>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        Kollus 재생 키 또는 이 회차의 영상(미디어 콘텐츠 키)이 아직 설정되지
        않았습니다. 설정이 완료되면 이 화면에서 바로 재생됩니다.
      </p>
    </div>
  );
}

function DenyView({ reason, message }: { reason: string; message: string }) {
  const cta =
    reason === "login_required" ? (
      <Button asChild size="sm">
        <Link to="/login">로그인</Link>
      </Button>
    ) : reason === "no_enrollment" ? (
      <Button asChild size="sm">
        <Link to="/lecture/catalog">수강신청</Link>
      </Button>
    ) : (
      <Button asChild size="sm" variant="outline">
        <Link to="/lecture">내 강의실</Link>
      </Button>
    );
  return (
    <div className="bg-muted/40 flex aspect-video w-full flex-col items-center justify-center rounded-xl border px-6 text-center">
      <LockIcon className="text-muted-foreground/60 size-9" />
      <p className="mt-3 text-sm font-semibold">{message}</p>
      <div className="mt-4">{cta}</div>
    </div>
  );
}
