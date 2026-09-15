// /lecture/room/:enrollmentId — 강의실(회차 선택). 입장 후 수험생이 회차를 골라 재생.
//
// ★feat-11-012 P6-a/b — 목록의 자물쇠 판정을 재생 판정과 **같은 함수**로 통일했다.
//   종전에는 playback_grants.counts_as_play 를 셌는데 그 플래그를 true 로 넣는 코드가 없어
//   (시간 비례 판정으로 바뀐 뒤 상수 false) **항상 0**이었다 — 운영 실측 2026-09-14 기준
//   grant 78건 중 0건. 자물쇠가 한 번도 켜진 적이 없어서, 다 쓴 회차도 목록에서는 멀쩡해
//   보이고 **눌러 들어간 뒤에야** 막혔다. 그리고 기준 컬럼도 갈라져 있었다(목록은
//   course_lessons.max_plays 로 「없으면 2회」, 판정은 courses.max_plays 로 「없으면 무제한」).
// ★막힌 사유와 다음 행동도 재생 화면과 같은 곳(lib/lock-notice.ts)에서 가져온다.

import { CheckCircle2Icon, LockIcon, PlayCircleIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { duration as fmtDuration, percent } from "~/core/lib/format";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  type PlaybackDenyReason,
  lockNotice,
} from "~/features/lms/lib/lock-notice";
import { getPlayLimitsForLessons } from "~/features/lms/play-limit.server";
import { getLessonProgressForUser } from "~/features/lms/watch.server";

import type { Route } from "./+types/lecture-room";

export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data?.courseLabel ?? "강의실"} | 리담변리사학원` },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const enrollmentId = params.enrollmentId ?? "";
  const { data: enr } = await adminClient
    .from("enrollments")
    .select(
      "enrollment_id, user_id, course_id, status, expires_at, course:courses!enrollments_course_id_fkey(edition_label, series:course_series!courses_series_id_fkey(title))",
    )
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  if (!enr || enr.user_id !== user.id) throw redirect("/lecture");

  const course = enr.course as {
    edition_label: string;
    series: { title: string } | null;
  } | null;
  const courseLabel = course
    ? `${course.series?.title ?? ""} ${course.edition_label}`.trim()
    : "강의";

  const { data: lessonRows } = await adminClient
    .from("course_lessons")
    .select("lesson_id, lesson_no, title, is_preview")
    .eq("course_id", enr.course_id)
    .eq("is_published", true)
    .is("deleted_at", null)
    .order("sort_order")
    .order("lesson_no");
  const lessons = lessonRows ?? [];
  const lessonIds = lessons.map((l) => l.lesson_id);

  const [progress, limits] = await Promise.all([
    getLessonProgressForUser(user.id, lessonIds),
    getPlayLimitsForLessons({
      enrollmentId: enr.enrollment_id,
      courseId: enr.course_id,
      lessonIds,
    }),
  ]);

  // 수강권 자체가 막혀 있으면 그 사유를 재생 판정과 같은 말로 알린다.
  // ★종전에는 「현재 수강중 상태가 아니라 재생할 수 없습니다」 한 마디로 뭉개, 기간이
  //   끝난 건지 일시정지인지 학생이 알 수 없었다(그래서 무엇을 해야 할지도 몰랐다).
  // ★상태값 네 가지(active·paused·expired·revoked)를 각각 제 사유로 보낸다.
  //   status 가 expired 인데 「수강권이 없습니다. 수강 신청 후 이용해 주세요」라고 하면
  //   산 적 없는 사람 취급이 된다. revoked(회수)는 대응하는 재생 거부 사유가 없어
  //   no_enrollment 로 보낸다 — 없는 사유를 지어내지 않는다.
  const pastDue = Date.parse(enr.expires_at) <= Date.now();
  const blockedReason: PlaybackDenyReason | null =
    enr.status === "paused"
      ? "paused"
      : enr.status === "expired"
        ? "expired"
        : enr.status === "active"
          ? pastDue
            ? "expired"
            : null
          : "no_enrollment";

  return {
    courseLabel,
    blockedReason,
    blockedNotice: blockedReason ? lockNotice(blockedReason) : null,
    lessons: lessons.map((l) => {
      const p = progress.get(l.lesson_id);
      const limit = limits.get(l.lesson_id);
      return {
        lessonId: l.lesson_id,
        lessonNo: l.lesson_no,
        title: l.title,
        completed: p?.completed ?? false,
        progressRatio: p?.progressRatio ?? 0,
        // feat-11-008 P0 — 수강생 화면은 강의 길이·학습량·진도율만 표시(횟수 비노출, 260807 요청서).
        durationSeconds: p?.durationSeconds ?? 0,
        watchedSeconds: p?.watchedSeconds ?? 0,
        // 재생 판정과 같은 값 — 이제 목록의 자물쇠가 실제 차단과 일치한다.
        exhausted: limit?.exhausted ?? false,
      };
    }),
  };
}

export default function LectureRoom({ loaderData }: Route.ComponentProps) {
  const { courseLabel, lessons, blockedNotice } = loaderData;
  const exhaustedNotice = lockNotice("play_limit_exhausted");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 md:px-6 md:py-10">
      <div className="space-y-1">
        <Link to="/lecture" className="text-muted-foreground text-[13px] hover:underline">
          ← 내 강의실
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{courseLabel}</h1>
        <p className="text-muted-foreground text-[13px]">
          수강할 회차를 선택하세요.
        </p>
      </div>

      {blockedNotice ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <LockIcon className="text-muted-foreground/60 size-8" />
            <p className="text-sm font-semibold">{blockedNotice.message}</p>
            {blockedNotice.action ? (
              <Button asChild size="sm" variant="outline">
                <Link to={blockedNotice.action.to}>
                  {blockedNotice.action.label}
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : lessons.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            공개된 회차가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-base font-bold">회차 목록 · 총 {lessons.length}강</h2>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-border/60 divide-y">
              {lessons.map((l) => (
                <li
                  key={l.lessonId}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="text-muted-foreground w-8 shrink-0 text-center text-[13px] font-semibold tabular-nums">
                    {l.lessonNo}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {l.title}
                      {l.completed ? (
                        <CheckCircle2Icon className="ml-1 inline size-3.5 text-emerald-500" />
                      ) : null}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[12px] tabular-nums">
                      <LessonMeta
                        durationSeconds={l.durationSeconds}
                        watchedSeconds={l.watchedSeconds}
                        progressRatio={l.progressRatio}
                      />
                    </p>
                  </div>
                  {l.exhausted ? (
                    <span
                      className="text-muted-foreground inline-flex h-8 shrink-0 items-center gap-1 px-2 text-[12px]"
                      title={exhaustedNotice.message}
                    >
                      <LockIcon className="size-3.5" /> {exhaustedNotice.short}
                    </span>
                  ) : (
                    <Button asChild size="sm" className="shrink-0">
                      <Link to={`/lecture/watch/${l.lessonId}`}>
                        <PlayCircleIcon className="size-4" />
                        재생
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 회차 한 줄의 부가 표기.
// ★종전에는 원시 초를 그대로 찍었다 — 「강의 1200초 · 학습 45초」. 사람이 읽는 단위가 아니다.
// ★「학습」은 **시청이 아니라 체류**다(크로스오리진 iframe 이라 재생 중 여부를 알 신호가
//   없어 탭이 보이는 동안의 경과로 근사한다). 그래서 표기를 사실까지만 낮춘다.
function LessonMeta({
  durationSeconds,
  watchedSeconds,
  progressRatio,
}: {
  durationSeconds: number;
  watchedSeconds: number;
  progressRatio: number;
}) {
  const len = fmtDuration(durationSeconds);
  const watched = fmtDuration(watchedSeconds);
  return (
    <>
      {len ? <span>{len}</span> : null}
      {len && watched ? <span> · </span> : null}
      {watched ? <span>{watched} 학습</span> : null}
      {(len || watched) && progressRatio > 0 ? <span> · </span> : null}
      {progressRatio > 0 ? <span>진도율 {percent(progressRatio)}</span> : null}
    </>
  );
}
