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
  MaximizeIcon,
  PlayCircleIcon,
  PlayIcon,
  XIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { duration as fmtDuration } from "~/core/lib/format";
import { cn } from "~/core/lib/utils";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  type PlaybackDenyReason,
  lockNotice,
} from "~/features/lms/lib/lock-notice";
import {
  PLAYER_SIZES,
  PLAYER_SIZE_LABEL,
  type PlayerSize,
  usePlayerSize,
} from "~/features/lms/lib/use-player-size";
import { requestPlaybackGrant } from "~/features/lms/playback.server";
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
    return { ok: false as const, reason: judgement.reason, ...base };
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
  startSeconds: number;
  enabled: boolean;
}) {
  const { grantId, durationSeconds, startSeconds, enabled } = opts;
  const posRef = useRef(0);
  const seqRef = useRef(0);
  useEffect(() => {
    if (!enabled || !grantId || durationSeconds <= 0) return;
    // ★feat-11-012 P6-a — **커서 시드.** 종전에는 화면에 들어올 때마다 0 에서 다시 셌다.
    //   이미 본 구간을 매번 처음부터 덮어 보고하니, 진도(구간 union 병합)는 같은 자리만
    //   거듭 채워 앞부분에 갇혔다 — 운영 실측: 한 회차에서 원시 513초를 보고했는데 누적
    //   진도는 73초에 멈춰 있었다. 마지막 위치에서 시작하면 그 중복이 사라진다.
    // ★끝까지 본 회차는 0 에서 시작한다 — 안 그러면 posRef 가 곧바로 길이에 닿아 아래
    //   가드에 걸려 **다시 볼 때 한 번도 보고되지 않는다**(진도·차감이 통째로 멈춘다).
    posRef.current =
      startSeconds > 0 && startSeconds < durationSeconds ? startSeconds : 0;
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
  }, [grantId, durationSeconds, startSeconds, enabled]);
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
    startSeconds: loaderData.ok ? loaderData.resumeSeconds : 0,
    enabled: loaderData.ok && Boolean(loaderData.playbackUrl),
  });
  const { size, setSize, isFullscreen, toggleFullscreen, playerRef } =
    usePlayerSize();
  const theater = size === "max"; // 최대 = 집중(별도 화면) 오버레이
  const showSidebar = size === "standard";

  // 집중(별도 화면) 모드: 배경 페이지 스크롤 잠금 + ESC 이탈.
  useEffect(() => {
    if (!theater) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) setSize("standard");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [theater, setSize]);

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

      <div
        className={cn(
          "mt-4 gap-6",
          showSidebar
            ? "grid lg:grid-cols-[minmax(0,1fr)_340px]"
            : "block",
        )}
      >
        {/* ── 플레이어 열 ── */}
        <div className="min-w-0">
          {loaderData.ok ? (
            loaderData.playbackUrl ? (
              <div>
                {/* 화면 크기 툴바(집중 모드 아닐 때, 데스크톱 전용) */}
                {!theater ? (
                  <div className="mb-2 hidden items-center justify-end gap-2 lg:flex">
                    <span className="text-muted-foreground text-xs font-medium">
                      화면 크기
                    </span>
                    <PlayerSizeSegments
                      size={size}
                      onSize={setSize}
                      tone="light"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={toggleFullscreen}
                      className="h-8 gap-1.5"
                    >
                      <MaximizeIcon className="size-3.5" /> 전체화면
                    </Button>
                  </div>
                ) : null}

                {/* 크기 래퍼 — 집중 모드에선 고정 오버레이(별도 화면).
                    ★iframe DOM 노드는 어느 크기에서도 재마운트되지 않아 재생 위치·
                    하트비트가 유지된다(부모 className/style 만 변경). */}
                <div
                  className={
                    theater
                      ? "fixed inset-0 z-[60] flex flex-col bg-black"
                      : "w-full"
                  }
                >
                  {/* 집중 모드 헤더(오버레이일 때만) */}
                  <div
                    className={cn(
                      "shrink-0 items-center justify-between gap-3 px-4 py-2",
                      theater ? "flex" : "hidden",
                    )}
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-white">
                      {lessonNo}강 · {lessonTitle}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <PlayerSizeSegments
                        size={size}
                        onSize={setSize}
                        tone="dark"
                      />
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2.5 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10"
                      >
                        <MaximizeIcon className="size-3.5" /> 전체화면
                      </button>
                      <button
                        type="button"
                        onClick={() => setSize("standard")}
                        aria-label="집중 모드 닫기"
                        className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2.5 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10"
                      >
                        <XIcon className="size-3.5" /> 닫기
                      </button>
                    </div>
                  </div>

                  {/* 중앙 정렬 + (집중 모드) 높이 클램프 */}
                  <div
                    className={
                      theater
                        ? "flex min-h-0 flex-1 items-center justify-center px-3 pb-3"
                        : ""
                    }
                  >
                    <div
                      className="w-full"
                      style={
                        theater
                          ? {
                              maxWidth:
                                "min(100%, calc((100vh - 4rem) * 16 / 9))",
                            }
                          : undefined
                      }
                    >
                      <div
                        ref={playerRef}
                        className={cn(
                          "relative overflow-hidden bg-black",
                          isFullscreen
                            ? "flex h-full w-full items-center justify-center"
                            : "aspect-video w-full",
                          !theater && "rounded-xl shadow-sm",
                        )}
                      >
                        <iframe
                          src={loaderData.playbackUrl}
                          title={lessonTitle}
                          className="h-full w-full border-0"
                          // local-network-access · loopback-network: 크롬142/엣지143 로컬 네트워크
                          //   액세스 정책 강화로 Kollus 보안 에이전트 실행에 필요(미지정 시 "플레이어
                          //   초기화 실패"). Kollus(카테노이드) 지원팀 안내. 사용자도 브라우저 권한 허용 필요.
                          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; local-network-access; loopback-network"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <PlayerPlaceholder />
            )
          ) : (
            <DenyView reason={loaderData.reason} />
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
            {/* ★「이어보기 7:05」는 뺐다(feat-11-012 P6-a) — 크로스오리진 iframe 이라
                플레이어에 시작 위치를 넣을 통로가 없다. 위치는 표시하면서 거기서
                시작해 주지는 못하니, 지킬 수 없는 약속이었다. */}
            <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {curDuration > 0 ? (
                <span className="tabular-nums">{fmtDuration(curDuration)}</span>
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

        {/* ── 목차 열 (sticky) — 확대/집중 모드에선 숨김 ── */}
        <aside
          className={cn(
            "lg:self-start",
            showSidebar ? "lg:sticky lg:top-20" : "hidden",
          )}
        >
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

// 화면 크기 세그먼트(기본/확대/최대). tone: light=본문 툴바 / dark=집중 오버레이 헤더.
function PlayerSizeSegments({
  size,
  onSize,
  tone,
}: {
  size: PlayerSize;
  onSize: (s: PlayerSize) => void;
  tone: "light" | "dark";
}) {
  return (
    <div
      className={cn(
        "inline-flex overflow-hidden rounded-lg border",
        tone === "dark" ? "border-white/20" : "border-border",
      )}
      role="group"
      aria-label="영상 화면 크기"
    >
      {PLAYER_SIZES.map((s) => {
        const active = size === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSize(s)}
            aria-pressed={active}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : tone === "dark"
                  ? "bg-transparent text-white/80 hover:bg-white/10"
                  : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {PLAYER_SIZE_LABEL[s]}
          </button>
        );
      })}
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

// ★사유별 문구와 버튼은 lib/lock-notice.ts 한 곳에서 온다 — 강의실 목록도 같은 말을 한다.
function DenyView({ reason }: { reason: PlaybackDenyReason }) {
  const notice = lockNotice(reason);
  return (
    <div className="bg-muted/40 flex aspect-video w-full flex-col items-center justify-center rounded-xl border px-6 text-center">
      <LockIcon className="text-muted-foreground/60 size-9" />
      <p className="mt-3 max-w-sm text-sm font-semibold text-balance">
        {notice.message}
      </p>
      {notice.action ? (
        <div className="mt-4">
          <Button asChild size="sm">
            <Link to={notice.action.to}>{notice.action.label}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
