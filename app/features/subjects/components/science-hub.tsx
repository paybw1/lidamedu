// 자연과학 4과목 공용 허브 UI — "기출 훈련장" 레이아웃.
// 상단 행동 카드(이어서 풀기·맞춤 퀴즈·오답 다시 풀기) + 2열(단원별 훈련 / 연도별 기출·즐겨찾기).
// 단원·연도·오답 클릭은 quiz-setup action POST 를 재사용 — 별도 러너 없이 즉시 세션 생성.

import { useState } from "react";

import {
  ArrowRightIcon,
  ChevronRightIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Form, Link } from "react-router";

import { cn } from "~/core/lib/utils";
import {
  SCIENCE_SUBJECTS,
  type ScienceResumeInfo,
  type ScienceSectionStats,
  type ScienceSubjectSlug,
} from "~/features/subjects/lib/science";

// 정답률 60% 미만 단원 = 약점 표시.
const WEAK_ACCURACY_PCT = 60;
// quiz-setup action 스키마의 count 상한.
const QUIZ_COUNT_MAX = 200;

type ScienceBookmark = {
  problemId: string;
  year: number | null;
  problemNumber: number | null;
  bodySnippet: string;
  starLevel: number;
};

function accuracyTone(acc: number | null): string {
  if (acc === null) return "text-muted-foreground";
  if (acc >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (acc >= WEAK_ACCURACY_PCT) return "text-lime-600 dark:text-lime-400";
  if (acc >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

// 자연과학 전용 즐겨찾기 검색 (C-3) — 별점 매긴 문제를 연도·번호·본문으로 찾기.
function ScienceBookmarkSearch({
  subject,
  items,
}: {
  subject: string; // URL path (earth-science 등)
  items: ScienceBookmark[];
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? items.filter((b) =>
        [
          b.year ? `${b.year}년` : "",
          b.problemNumber ? `${b.problemNumber}번` : "",
          b.bodySnippet,
        ].some((t) => t.toLowerCase().includes(query)),
      )
    : items;
  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <h2 className="text-sm font-bold tracking-tight">
          내 즐겨찾기{" "}
          <span className="text-muted-foreground font-normal">
            ({items.length})
          </span>
        </h2>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="연도·번호·본문"
          className="border-border focus:border-primary h-8 w-32 rounded-md border bg-transparent px-2 text-xs outline-none"
        />
      </div>
      <div className="divide-y">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground px-5 py-5 text-center text-xs">
            {query ? "검색 결과가 없습니다." : "즐겨찾기한 문제가 없습니다."}
          </p>
        ) : (
          filtered.map((b) => (
            <Link
              key={b.problemId}
              to={`/subjects/science/${subject}/problems/${b.problemId}`}
              viewTransition
              className="hover:bg-accent/50 flex items-center gap-2.5 px-5 py-2.5 transition-colors"
            >
              <span className="shrink-0 text-xs text-amber-500">
                {"★".repeat(b.starLevel)}
              </span>
              <span className="shrink-0 text-xs font-medium tabular-nums">
                {b.year ? `${b.year}년` : "—"}
                {b.problemNumber ? ` ${b.problemNumber}번` : ""}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {b.bodySnippet}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export default function ScienceHub({
  subject,
  sections,
  years,
  progress,
  bookmarks = [],
  resume = null,
  wrongCount = 0,
  hideBackLink = false,
}: {
  subject: ScienceSubjectSlug;
  sections: ScienceSectionStats[];
  years: { year: number; count: number }[];
  progress: { attempted: number; correct: number; total: number };
  bookmarks?: ScienceBookmark[];
  resume?: ScienceResumeInfo | null;
  wrongCount?: number;
  // /subjects/science 허브에 탭으로 임베드될 때 "← 자연과학" 백링크·eyebrow 숨김(중복).
  hideBackLink?: boolean;
}) {
  const meta = SCIENCE_SUBJECTS[subject];
  const totalProblems = sections.reduce((s, x) => s + x.problemCount, 0);
  const correctRate =
    progress.attempted > 0
      ? Math.round((progress.correct / progress.attempted) * 100)
      : null;

  const sciencePath = subject === "earth_science" ? "earth-science" : subject;
  const setupAction = `/subjects/science/${sciencePath}/quiz/setup`;

  return (
    <div className="bg-background min-h-[calc(100vh-56px)]">
      <div
        className={cn(
          "mx-auto w-full max-w-screen-lg px-5 md:px-10",
          hideBackLink ? "py-6" : "py-8 md:py-10",
        )}
      >
        {/* Page header — 제목 + 우측 요약 통계 한 줄 */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            {hideBackLink ? null : (
              <>
                <Link
                  to="/subjects/science"
                  className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs transition-colors"
                >
                  <ChevronRightIcon className="size-3 rotate-180" /> 자연과학
                </Link>
                <p className="text-link mb-1 font-mono text-[11px] font-bold tracking-widest uppercase">
                  자연과학 · 1차 필수
                </p>
              </>
            )}
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
              {meta.name}
            </h1>
            {hideBackLink ? null : (
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                자연과학은 4과목을 모두 응시합니다 — 과목당 10문항, 고르게
                학습하세요.
              </p>
            )}
          </div>
          {progress.total > 0 ? (
            <p className="text-muted-foreground pb-0.5 text-xs">
              내 풀이{" "}
              <span className="text-foreground font-bold tabular-nums">
                {progress.attempted.toLocaleString("ko-KR")}/
                {progress.total.toLocaleString("ko-KR")}
              </span>
              {correctRate != null ? (
                <>
                  {" "}
                  · 정답률{" "}
                  <span
                    className={cn("font-bold tabular-nums", accuracyTone(correctRate))}
                  >
                    {correctRate}%
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* 행동 카드 — 이어서 풀기 / 새 퀴즈 / 오답 다시 풀기 */}
        {totalProblems > 0 ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resume ? (
              <Link
                to={`/subjects/science/${sciencePath}/problems/${resume.nextProblemId}?session=${resume.sessionId}`}
                viewTransition
                className="group bg-card hover:border-primary rounded-xl border p-4 shadow-sm transition-colors"
              >
                <p className="text-link mb-1 font-mono text-[10px] font-bold tracking-widest uppercase">
                  이어서 풀기
                </p>
                <p className="inline-flex items-center gap-1.5 text-sm font-bold">
                  <span className="tabular-nums">
                    {resume.answered}/{resume.total}
                  </span>
                  문항 진행 중
                  <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  마지막 학습 세션을 이어서 풉니다.
                </p>
              </Link>
            ) : null}

            <Link
              to={setupAction}
              viewTransition
              className="group bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl p-4 shadow-sm transition-colors"
            >
              <p className="mb-1 font-mono text-[10px] font-bold tracking-widest uppercase opacity-70">
                맞춤 퀴즈
              </p>
              <p className="inline-flex items-center gap-1.5 text-sm font-bold">
                <PlayIcon className="size-3.5" /> 새 퀴즈 시작
                <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                단원·연도·문항 수를 골라 시작합니다.
              </p>
            </Link>

            {wrongCount > 0 ? (
              <Form method="post" action={setupAction} className="h-full">
                <input type="hidden" name="wrong" value="1" />
                <input type="hidden" name="mode" value="study" />
                <input
                  type="hidden"
                  name="count"
                  value={Math.min(wrongCount, QUIZ_COUNT_MAX)}
                />
                <button
                  type="submit"
                  className="group h-full w-full rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-left shadow-sm transition-colors hover:border-amber-400 dark:border-amber-700/60 dark:bg-amber-950/40 dark:hover:border-amber-600"
                >
                  <p className="mb-1 font-mono text-[10px] font-bold tracking-widest text-amber-700 uppercase dark:text-amber-400">
                    오답
                  </p>
                  <p className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-900 dark:text-amber-100">
                    <RotateCcwIcon className="size-3.5" />
                    <span className="tabular-nums">{wrongCount}</span>문항 다시
                    풀기
                    <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
                    최근 시도가 오답인 문제만 모았습니다.
                  </p>
                </button>
              </Form>
            ) : null}
          </div>
        ) : null}

        {/* 본문 2열 — 좌: 단원별 훈련 / 우: 연도별 기출·즐겨찾기 */}
        <div className="grid items-start gap-6 lg:grid-cols-3">
          {/* 단원별 훈련 */}
          <div className="bg-card rounded-xl border shadow-sm lg:col-span-2">
            <div className="border-b px-5 py-3.5">
              <h2 className="text-sm font-bold tracking-tight">
                단원별 훈련{" "}
                <span className="text-muted-foreground font-normal">
                  ({sections.length})
                </span>
              </h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                단원을 누르면 그 단원 문제를 바로 풉니다. 정답률{" "}
                {WEAK_ACCURACY_PCT}% 미만 단원은{" "}
                <span className="inline-block size-1.5 rounded-full bg-rose-500 align-middle" />{" "}
                약점 표시.
              </p>
            </div>

            {sections.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
                <p className="text-muted-foreground text-sm">
                  등록된 단원이 없습니다.
                </p>
                <p className="text-muted-foreground text-xs">
                  운영자가 단원과 문제를 추가하면 학습을 시작할 수 있습니다.
                </p>
              </div>
            ) : (
              <>
                {/* 열 라벨 — 우측 수치 3열과 폭을 맞춘다 */}
                <div className="text-muted-foreground flex items-center gap-3 border-b px-5 py-1.5 text-[10px] font-semibold tracking-wide uppercase">
                  <span className="w-5 shrink-0" />
                  <span className="min-w-0 flex-1">단원</span>
                  <span className="w-12 shrink-0 text-right">문항</span>
                  <span className="hidden w-12 shrink-0 text-right sm:block">
                    풀이
                  </span>
                  <span className="w-11 shrink-0 text-right">정답률</span>
                  <span className="w-3.5 shrink-0" />
                </div>
                <div className="divide-y">
                  {sections.map((s) => {
                    const acc = s.accuracyPct;
                    const weak = acc !== null && acc < WEAK_ACCURACY_PCT;
                    const pctOfTotal =
                      s.problemCount > 0
                        ? Math.min(
                            100,
                            Math.round((s.attempted / s.problemCount) * 100),
                          )
                        : 0;
                    const disabled = s.problemCount === 0;
                    return (
                      <Form
                        key={s.sectionId}
                        method="post"
                        action={setupAction}
                      >
                        <input
                          type="hidden"
                          name="sectionIds"
                          value={s.sectionId}
                        />
                        <input type="hidden" name="mode" value="study" />
                        <input
                          type="hidden"
                          name="count"
                          value={Math.min(
                            Math.max(s.problemCount, 1),
                            QUIZ_COUNT_MAX,
                          )}
                        />
                        <button
                          type="submit"
                          disabled={disabled}
                          className={cn(
                            "group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors",
                            disabled
                              ? "cursor-default opacity-45"
                              : "hover:bg-primary/[0.04]",
                          )}
                        >
                          <span className="text-muted-foreground w-5 shrink-0 text-right font-mono text-xs tabular-nums">
                            {s.orderIndex + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm leading-snug font-semibold">
                                {s.label}
                              </span>
                              {weak ? (
                                <span
                                  className="size-1.5 shrink-0 rounded-full bg-rose-500"
                                  title={`정답률 ${WEAK_ACCURACY_PCT}% 미만 — 약점 단원`}
                                />
                              ) : null}
                            </span>
                            {s.descriptionMd ? (
                              <span className="text-muted-foreground mt-0.5 line-clamp-1 block text-[11px] leading-relaxed">
                                {s.descriptionMd}
                              </span>
                            ) : null}
                            {s.problemCount > 0 ? (
                              <span className="bg-muted mt-1.5 block h-1 overflow-hidden rounded-full">
                                <span
                                  className={cn(
                                    "block h-full rounded-full transition-all",
                                    pctOfTotal >= 80
                                      ? "bg-emerald-500"
                                      : pctOfTotal >= 40
                                        ? "bg-primary"
                                        : "bg-primary/60",
                                  )}
                                  style={{ width: `${pctOfTotal}%` }}
                                />
                              </span>
                            ) : null}
                          </span>
                          <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums">
                            {s.problemCount}
                          </span>
                          <span className="text-muted-foreground hidden w-12 shrink-0 text-right text-sm tabular-nums sm:block">
                            {s.attempted}
                          </span>
                          <span
                            className={cn(
                              "w-11 shrink-0 text-right text-sm font-bold tabular-nums",
                              accuracyTone(acc),
                            )}
                          >
                            {acc === null ? "—" : `${acc}%`}
                          </span>
                          <ChevronRightIcon
                            className={cn(
                              "text-muted-foreground size-3.5 shrink-0 transition-opacity",
                              disabled
                                ? "opacity-0"
                                : "opacity-0 group-hover:opacity-100",
                            )}
                          />
                        </button>
                      </Form>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* 우측 — 연도별 기출 + 즐겨찾기 */}
          <div className="space-y-6">
            {years.length > 0 ? (
              <div className="bg-card rounded-xl border shadow-sm">
                <div className="border-b px-5 py-3.5">
                  <h2 className="text-sm font-bold tracking-tight">
                    연도별 기출{" "}
                    <span className="text-muted-foreground font-normal">
                      ({years.length}개년)
                    </span>
                  </h2>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    연도를 누르면 번호 순서대로 바로 풉니다.
                  </p>
                </div>
                <div className="divide-y">
                  {years.map((y) => (
                    <Form key={y.year} method="post" action={setupAction}>
                      <input type="hidden" name="years" value={y.year} />
                      <input type="hidden" name="ordered" value="1" />
                      <input type="hidden" name="mode" value="study" />
                      <input type="hidden" name="count" value={y.count} />
                      <button
                        type="submit"
                        className="group hover:bg-primary/[0.04] flex w-full items-center justify-between px-5 py-2.5 text-left transition-colors"
                      >
                        <span className="text-sm font-semibold tabular-nums">
                          {y.year}년
                        </span>
                        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs tabular-nums">
                          {y.count}문항
                          <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </button>
                    </Form>
                  ))}
                </div>
              </div>
            ) : null}

            {bookmarks.length > 0 ? (
              <ScienceBookmarkSearch subject={sciencePath} items={bookmarks} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
