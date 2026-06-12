// 자연과학 4과목 공용 허브 UI — 단원 목록 + KPI placeholder.
// 풀이 Runner / 색인 / 통계 등 5.4.A.3 의 객관식 자산을 추후 연결한다.

import { ArrowRightIcon, ChevronRightIcon } from "lucide-react";
import { Form, Link } from "react-router";

import { cn } from "~/core/lib/utils";
import {
  SCIENCE_SUBJECTS,
  type ScienceSectionStats,
  type ScienceSubjectSlug,
} from "~/features/subjects/lib/science";

export default function ScienceHub({
  subject,
  sections,
  years,
  progress,
  hideBackLink = false,
}: {
  subject: ScienceSubjectSlug;
  sections: ScienceSectionStats[];
  years: { year: number; count: number }[];
  progress: { attempted: number; correct: number; total: number };
  // /subjects/science 허브에 탭으로 임베드될 때 "← 자연과학" 백링크 숨김(중복).
  hideBackLink?: boolean;
}) {
  const meta = SCIENCE_SUBJECTS[subject];
  const totalProblems = sections.reduce((s, x) => s + x.problemCount, 0);
  const correctRate =
    progress.attempted > 0
      ? Math.round((progress.correct / progress.attempted) * 100)
      : null;

  const sciencePath = subject === "earth_science" ? "earth-science" : subject;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="mx-auto w-full max-w-screen-lg px-5 py-8 md:px-10 md:py-10">

        {/* Page header */}
        <div className="mb-8">
          {hideBackLink ? null : (
            <Link
              to="/subjects/science"
              className="text-muted-foreground mb-3 inline-flex items-center gap-1 text-xs hover:text-foreground transition-colors"
            >
              <ChevronRightIcon className="size-3 rotate-180" /> 자연과학
            </Link>
          )}
          <p className="text-primary mb-1 font-mono text-[11px] font-bold uppercase tracking-widest">
            SCIENCE · 1차 필수
          </p>
          <h1 className="mb-1.5 text-3xl font-extrabold tracking-tight md:text-4xl">
            <span className="mr-2 text-2xl">{meta.emoji}</span>
            {meta.name}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            변리사 1차 자연과학 필수과목 · 객관식 문제 중심으로 학습합니다.
          </p>
        </div>

        {/* KPI row */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
            <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold uppercase tracking-widest">
              총 문제
            </p>
            <p className="text-3xl font-extrabold tabular-nums tracking-tight">
              {totalProblems.toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
            <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold uppercase tracking-widest">
              내 풀이
            </p>
            <p className="text-3xl font-extrabold tabular-nums tracking-tight">
              {progress.attempted.toLocaleString("ko-KR")}
              <span className="text-muted-foreground ml-1.5 text-base font-normal">
                / {progress.total.toLocaleString("ko-KR")}
              </span>
            </p>
          </div>
          <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
            <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold uppercase tracking-widest">
              내 정답률
            </p>
            <p className="text-3xl font-extrabold tabular-nums tracking-tight">
              {correctRate != null ? (
                <>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {correctRate}
                  </span>
                  <span className="text-muted-foreground ml-1 text-base font-normal">
                    % ({progress.correct}/{progress.attempted})
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground text-base font-normal italic">
                  풀이 없음
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Section list card */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                단원 <span className="text-muted-foreground font-normal">({sections.length})</span>
              </h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                대단원 분류표 — 각 단원에 문제가 등록되면 풀이 화면으로 진입할 수 있습니다.
              </p>
            </div>
            {totalProblems > 0 ? (
              <Link
                to={`/subjects/science/${sciencePath}/quiz/setup`}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors"
              >
                맞춤 퀴즈 시작
                <ArrowRightIcon className="size-3.5" />
              </Link>
            ) : null}
          </div>

          <div className="divide-y">
            {sections.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <p className="text-muted-foreground text-sm">등록된 단원이 없습니다.</p>
                <p className="text-muted-foreground text-xs">
                  운영자가 단원과 문제를 추가하면 학습을 시작할 수 있습니다.
                </p>
              </div>
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
                    className="hover:bg-muted/30 px-6 py-4 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* Order index */}
                      <span className="text-muted-foreground mt-0.5 w-6 shrink-0 text-right font-mono text-xs tabular-nums">
                        {s.orderIndex + 1}
                      </span>

                      {/* Label + description */}
                      <div className="min-w-0 flex-1">
                        <p className="mb-0.5 text-sm font-semibold leading-snug">
                          {s.label}
                        </p>
                        {s.descriptionMd ? (
                          <p className="text-muted-foreground text-xs leading-relaxed">
                            {s.descriptionMd}
                          </p>
                        ) : null}

                        {/* Progress bar */}
                        {s.problemCount > 0 ? (
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                pctOfTotal >= 80
                                  ? "bg-emerald-500"
                                  : pctOfTotal >= 40
                                    ? "bg-primary"
                                    : "bg-primary/60",
                              )}
                              style={{ width: `${pctOfTotal}%` }}
                            />
                          </div>
                        ) : null}
                      </div>

                      {/* Stats */}
                      <div className="flex shrink-0 items-center gap-4 text-right">
                        <div>
                          <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                            문제
                          </p>
                          <p className="text-sm font-bold tabular-nums">
                            {s.problemCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                            풀이
                          </p>
                          <p className="text-sm tabular-nums">
                            {s.attempted}
                            <span className="text-muted-foreground text-[10px]">
                              {" "}({pctOfTotal}%)
                            </span>
                          </p>
                        </div>
                        <div className="min-w-[3rem]">
                          <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                            정답률
                          </p>
                          <p className={cn("text-sm font-bold tabular-nums", accTone)}>
                            {acc === null ? "—" : `${acc}%`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 연도별 기출 — 클릭 시 그 해 문제를 번호순으로 바로 풀기 */}
        {years.length > 0 ? (
          <div className="mt-6 rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-sm font-bold tracking-tight">
                연도별 기출{" "}
                <span className="text-muted-foreground font-normal">
                  ({years.length}개년)
                </span>
              </h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                연도를 누르면 그 해 {meta.name} 기출을 번호 순서대로 바로 풉니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 px-6 py-4">
              {years.map((y) => (
                <Form
                  key={y.year}
                  method="post"
                  action={`/subjects/science/${sciencePath}/quiz/setup`}
                >
                  <input type="hidden" name="years" value={y.year} />
                  <input type="hidden" name="ordered" value="1" />
                  <input type="hidden" name="mode" value="study" />
                  <input type="hidden" name="count" value={y.count} />
                  <button
                    type="submit"
                    className="border-border hover:border-primary/50 hover:bg-primary/[0.04] inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-all"
                  >
                    {y.year}년
                    <span className="text-muted-foreground text-[11px] font-normal tabular-nums">
                      {y.count}
                    </span>
                  </button>
                </Form>
              ))}
            </div>
          </div>
        ) : null}

        {/* Info notice */}
        <div className="bg-primary/[0.06] mt-6 rounded-xl px-6 py-5">
          <p className="text-primary mb-1 font-mono text-[10px] font-bold uppercase tracking-widest">
            안내
          </p>
          <p className="text-foreground text-sm leading-relaxed">
            자연과학은 4과목(물리·화학·생물·지구과학)을 <strong>모두 응시</strong>하는 1차
            필수 과목입니다. 총 40문제 중 과목별 10문제씩 출제되므로, 네 과목을 고르게 학습하세요.
          </p>
        </div>

        <p className="text-muted-foreground mt-4 text-xs">
          ※ 자연과학 풀이 Runner 는 5.4.A 의 객관식 Runner(`feat-4-A-304`) 를 재사용할
          예정입니다. 현재는 단원/문제 시드 단계.
        </p>
      </div>
    </div>
  );
}
