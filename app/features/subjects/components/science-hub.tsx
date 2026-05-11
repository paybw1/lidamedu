// 자연과학 4과목 공용 허브 UI — 단원 목록 + KPI placeholder.
// 풀이 Runner / 색인 / 통계 등 5.4.A.3 의 객관식 자산을 추후 연결한다.

import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import {
  SCIENCE_SUBJECTS,
  type ScienceSectionStats,
  type ScienceSubjectSlug,
} from "~/features/subjects/lib/science";

export default function ScienceHub({
  subject,
  sections,
  progress,
}: {
  subject: ScienceSubjectSlug;
  sections: ScienceSectionStats[];
  progress: { attempted: number; correct: number; total: number };
}) {
  const meta = SCIENCE_SUBJECTS[subject];
  const totalProblems = sections.reduce((s, x) => s + x.problemCount, 0);
  const correctRate =
    progress.attempted > 0
      ? Math.round((progress.correct / progress.attempted) * 100)
      : null;

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/subjects/science"
            className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
          >
            ← 자연과학
          </Link>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            <span className="mr-2">{meta.emoji}</span>
            {meta.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            변리사 1차 자연과학 선택과목 · 객관식 문제 풀이
          </p>
        </div>
        {totalProblems > 0 ? (
          <Link
            to={`/subjects/science/${subject}/quiz/setup`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium"
          >
            맞춤 퀴즈 시작 →
          </Link>
        ) : null}
      </header>

      {/* KPI placeholder — 추후 정답률·풀이수 등 연결. */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
              총 문제
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {totalProblems}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
              내 풀이
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {progress.attempted}
              <span className="text-muted-foreground ml-1 text-sm font-normal">
                / {progress.total}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
              내 정답률
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {correctRate != null ? (
                <>
                  {correctRate}
                  <span className="text-muted-foreground ml-1 text-sm font-normal">
                    % ({progress.correct}/{progress.attempted})
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground text-sm italic">
                  풀이 없음
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold tracking-tight">
            단원 ({sections.length})
          </h2>
          <p className="text-muted-foreground text-xs">
            대단원 분류표 — 각 단원에 문제가 등록되면 풀이 화면으로 진입할 수
            있습니다.
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-1.5 pt-4">
          {sections.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              등록된 단원이 없습니다.
            </p>
          ) : (
            sections.map((s) => {
              const acc = s.accuracyPct;
              const accTone =
                acc === null
                  ? "text-muted-foreground"
                  : acc >= 80
                    ? "text-emerald-600 dark:text-emerald-400"
                    : acc >= 60
                      ? "text-lime-600 dark:text-lime-400"
                      : acc >= 40
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-rose-600 dark:text-rose-400";
              const pctOfTotal =
                s.problemCount > 0
                  ? Math.min(100, Math.round((s.attempted / s.problemCount) * 100))
                  : 0;
              return (
                <div
                  key={s.sectionId}
                  className="hover:bg-muted/40 grid grid-cols-[24px_1fr_auto_auto_auto] items-center gap-2 rounded-md border p-3"
                >
                  <span className="text-muted-foreground text-[11px] tabular-nums">
                    {s.orderIndex + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.label}</p>
                    {s.descriptionMd ? (
                      <p className="text-muted-foreground text-[11px]">
                        {s.descriptionMd}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant="outline" className="text-[10px] tabular-nums">
                    {s.problemCount} 문제
                  </Badge>
                  <div className="text-right">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      풀이
                    </p>
                    <p className="text-xs tabular-nums">
                      {s.attempted} / {s.problemCount}{" "}
                      <span className="text-muted-foreground">
                        ({pctOfTotal}%)
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      정답률
                    </p>
                    <p
                      className={"text-xs font-semibold tabular-nums " + accTone}
                    >
                      {acc === null ? "—" : `${acc}%`}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground mt-6 text-xs">
        ※ 자연과학 풀이 Runner 는 5.4.A 의 객관식 Runner(`feat-4-A-304`) 를 재사용할
        예정입니다. 현재는 단원/문제 시드 단계.
      </p>
    </div>
  );
}
