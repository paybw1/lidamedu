// /lecture/room/:enrollmentId — 강의실(회차 선택). 입장 후 수험생이 회차를 골라 재생.
//   각 회차는 정해진 재생 횟수(course_lessons.max_plays, 기본 2)만큼만 재생 가능(운영자 조정).

import { CheckCircle2Icon, LockIcon, PlayCircleIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getPlaysUsedByLesson } from "~/features/lms/queries.server";
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
    .select("lesson_id, lesson_no, title, max_plays, is_preview")
    .eq("course_id", enr.course_id)
    .eq("is_published", true)
    .is("deleted_at", null)
    .order("sort_order")
    .order("lesson_no");
  const lessons = lessonRows ?? [];
  const lessonIds = lessons.map((l) => l.lesson_id);

  const [progress, playsUsed] = await Promise.all([
    getLessonProgressForUser(user.id, lessonIds),
    getPlaysUsedByLesson(user.id, lessonIds),
  ]);

  const isActive =
    enr.status === "active" && Date.parse(enr.expires_at) > Date.now();

  return {
    courseLabel,
    isActive,
    status: enr.status,
    lessons: lessons.map((l) => {
      const p = progress.get(l.lesson_id);
      const maxPlays = l.max_plays ?? 2;
      const used = playsUsed.get(l.lesson_id) ?? 0;
      return {
        lessonId: l.lesson_id,
        lessonNo: l.lesson_no,
        title: l.title,
        completed: p?.completed ?? false,
        progressRatio: p?.progressRatio ?? 0,
        maxPlays,
        playsUsed: used,
        playsLeft: Math.max(0, maxPlays - used),
      };
    }),
  };
}

export default function LectureRoom({ loaderData }: Route.ComponentProps) {
  const { courseLabel, lessons, isActive } = loaderData;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 md:px-6 md:py-10">
      <div className="space-y-1">
        <Link to="/lecture" className="text-muted-foreground text-[13px] hover:underline">
          ← 내 강의실
        </Link>
        <h1 className="text-xl font-extrabold tracking-tight">{courseLabel}</h1>
        <p className="text-muted-foreground text-[13px]">
          수강할 회차를 선택하세요. 회차마다 정해진 횟수만큼 재생할 수 있습니다.
        </p>
      </div>

      {!isActive ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            현재 수강중 상태가 아니라 재생할 수 없습니다.
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
            <h2 className="text-[15px] font-bold">회차 목록 · 총 {lessons.length}강</h2>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-border/60 divide-y">
              {lessons.map((l) => {
                const exhausted = l.playsLeft <= 0;
                return (
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
                        재생 {l.playsUsed}/{l.maxPlays}회
                        {exhausted ? (
                          <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">
                            · 소진
                          </span>
                        ) : (
                          <span className="ml-1">· 남은 {l.playsLeft}회</span>
                        )}
                      </p>
                    </div>
                    {exhausted ? (
                      <span className="text-muted-foreground inline-flex h-8 shrink-0 items-center gap-1 px-2 text-[12px]">
                        <LockIcon className="size-3.5" /> 소진
                      </span>
                    ) : (
                      <Button asChild size="sm" className="shrink-0">
                        <Link to={`/lecture/watch/${l.lessonId}`}>
                          <PlayCircleIcon className="size-4" />
                          {l.progressRatio > 0 && !l.completed ? "이어보기" : "재생"}
                        </Link>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
