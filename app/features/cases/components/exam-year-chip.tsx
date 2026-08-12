// 판례 기출 칩.
// ExamProblemChip — 이 판례가 출제된 1차 객관식 기출문제 칩. 클릭 → 문제 미리보기 팝업
//   (+ 하단 [공부하러 가기]) — 문제 뷰어의 관련 판례 배지와 동일 UX(다른 화면 이탈 없음).
// Exam2ndProblemChip — 2차 주관식 기출 칩(모범답안 인용·메인 판례 파생). 동일 팝업 UX,
//   메인 지정 연도는 ★ 앰버 강조.
// ExamYearChip — 문제 매칭이 없는 연도의 비-링크 배지(1차 수동 연도·2차 미매칭 연도).
import { ArrowRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { cn } from "~/core/lib/utils";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import type { ExamProblemRef } from "~/features/problems/labels";

export type ExamRound = "first" | "second";

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];

interface ProblemPreviewData {
  kind?: "problem";
  heading?: string;
  title?: string | null;
  bodyMd?: string;
  choices?: Array<{ index: number; body: string }>;
  lawCode?: string | null;
  error?: string;
}

// 기출 문제 미리보기 팝업 칩 — 클릭 시 발문(+객관식 선지) lazy 로드, 하단 [공부하러 가기].
function ProblemPreviewChip({
  problemId,
  lawCode,
  label,
  title,
  chipClassName,
  prefix,
}: {
  problemId: string;
  lawCode: string;
  label: string;
  title?: string;
  chipClassName: string;
  prefix?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<ProblemPreviewData>();
  useEffect(() => {
    if (open && fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/api/problems/ref-preview?type=problem&id=${problemId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const d = fetcher.data;
  const studyHref = `/subjects/${lawCode}/problems/${problemId}`;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // 판례 목록 행 전체가 클릭 진입(Link)이라 버블링을 끊는다.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title={title ?? `${label} 기출문제 미리보기`}
        className={cn(
          "inline-flex cursor-pointer items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] transition-colors",
          chipClassName,
        )}
      >
        {prefix}
        {label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* 헤더(제목·X)·하단 버튼 고정, 본문만 스크롤 — ref-preview-badge 와 동일 골격 */}
        <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug">
              {d?.heading ?? label}
            </DialogTitle>
          </DialogHeader>
          <div className="-mr-2 flex-1 space-y-4 overflow-y-auto pr-2">
            {!d && fetcher.state !== "idle" ? (
              <p className="text-muted-foreground text-sm">불러오는 중…</p>
            ) : d?.error ? (
              <p className="text-muted-foreground text-sm">
                내용을 불러오지 못했습니다.
              </p>
            ) : d ? (
              <>
                {d.title ? (
                  <div className="border-border bg-muted/30 rounded-lg border px-4 py-3">
                    <p className="text-foreground text-sm leading-relaxed font-medium">
                      논점 — {d.title}
                    </p>
                  </div>
                ) : null}
                {d.bodyMd ? (
                  <MarkdownView text={d.bodyMd} className="text-sm leading-[1.8]" />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    등록된 본문이 없습니다.
                  </p>
                )}
                {d.choices?.length ? (
                  <ol className="space-y-2">
                    {d.choices.map((c) => (
                      <li key={c.index} className="flex gap-2 text-sm">
                        <span className="text-muted-foreground shrink-0">
                          {CIRCLED[c.index - 1] ?? `${c.index}.`}
                        </span>
                        <MarkdownView
                          text={c.body}
                          className="min-w-0 flex-1 leading-[1.7]"
                        />
                      </li>
                    ))}
                  </ol>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="flex justify-end pt-1">
            <Button asChild size="sm" className="gap-1">
              <Link to={studyHref} viewTransition>
                공부하러 가기 <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ExamProblemChip({
  lawCode,
  problemId,
  year,
  isVariant,
}: {
  lawCode: string;
  problemId: string;
  year: number | null;
  isVariant?: boolean;
}) {
  const label = year ? `1차 ${year}` : "1차";
  return (
    <ProblemPreviewChip
      problemId={problemId}
      lawCode={lawCode}
      label={label}
      title={`${label} 기출${isVariant ? "(변형)" : ""}문제 미리보기`}
      chipClassName={cn(
        "border-sky-300 text-sky-700 hover:bg-sky-50",
        "dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/40",
      )}
    />
  );
}

// 2차 주관식 기출 칩 — 메인 지정이면 ★ 앰버, 아니면 rose. 같은 연도에 문제가 여럿이면
// 문제 번호를 붙여 구분한다(호출부에서 label 결정).
export function Exam2ndProblemChip({
  lawCode,
  problemId,
  label,
  isMain,
}: {
  lawCode: string;
  problemId: string;
  label: string;
  isMain: boolean;
}) {
  return (
    <ProblemPreviewChip
      problemId={problemId}
      lawCode={lawCode}
      label={label}
      title={isMain ? `${label} 메인 판례 — 기출문제 미리보기` : `${label} 기출문제 미리보기`}
      chipClassName={
        isMain
          ? "border-amber-400 bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-600/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
          : "border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
      }
      prefix={
        isMain ? (
          <span aria-hidden className="text-amber-500">
            ★
          </span>
        ) : undefined
      }
    />
  );
}

// 1차 기출 칩을 연도 오름차순으로 통합 렌더 — problem link 있는 연도는
// 미리보기 팝업 ExamProblemChip, link 없는 운영자 수동 연도는 ExamYearChip
// (round="first"). 같은 연도에 problem 이 여러 개 있어도 사건명 셀 폭을 위해
// 연도당 1개로 dedup(첫 problem 선택).
export function mergeFirstRoundChips(
  examProblems: ExamProblemRef[],
  extraYears: number[],
): ReactNode[] {
  const problemByYear = new Map<number, ExamProblemRef>();
  for (const p of examProblems) {
    if (p.year === null || p.year === undefined) continue;
    if (!problemByYear.has(p.year)) problemByYear.set(p.year, p);
  }
  const allYears = new Set<number>([...problemByYear.keys(), ...extraYears]);
  return [...allYears]
    .sort((a, b) => a - b)
    .map((y) => {
      const p = problemByYear.get(y);
      return p ? (
        <ExamProblemChip
          key={`1p-${y}`}
          lawCode={p.lawCode}
          problemId={p.problemId}
          year={p.year}
          isVariant={p.isVariant}
        />
      ) : (
        <ExamYearChip key={`1y-${y}`} round="first" year={y} />
      );
    });
}

// 2차 기출 칩 통합 렌더 — 연도 오름차순. 주관식 문제가 매칭된 연도는 미리보기 팝업
// (같은 연도 복수 문제는 "문제N" 붙여 각각), 미매칭 연도는 비-링크 ExamYearChip.
export interface Exam2ndProblemRef {
  problemId: string;
  lawCode: string;
  year: number;
  problemNumber: number | null;
  isMain: boolean;
}
export function merge2ndRoundChips(
  years: number[],
  problems: Exam2ndProblemRef[],
  mainYears: number[] = [],
): ReactNode[] {
  const sorted = [...years].sort((a, b) => a - b);
  return sorted.flatMap((y) => {
    const matched = problems
      .filter((p) => p.year === y)
      .sort((a, b) => (a.problemNumber ?? 0) - (b.problemNumber ?? 0));
    if (matched.length === 0) {
      return [
        <ExamYearChip
          key={`2y-${y}`}
          round="second"
          year={y}
          main={mainYears.includes(y)}
        />,
      ];
    }
    const multi = matched.length > 1;
    return matched.map((p) => (
      <Exam2ndProblemChip
        key={`2p-${p.problemId}`}
        lawCode={p.lawCode}
        problemId={p.problemId}
        label={`2차 ${y}${multi && p.problemNumber != null ? ` 문제${p.problemNumber}` : ""}`}
        isMain={p.isMain}
      />
    ));
  });
}

export function ExamYearChip({
  round,
  year,
  main = false,
}: {
  round: ExamRound;
  year: number;
  // 2차 주관식 메인 판례로 지정된 연도 — ★ 앰버 강조(문제 뷰어 메인 배지와 동일 시각 언어).
  main?: boolean;
}) {
  const label = `${round === "first" ? "1차" : "2차"} ${year}`;
  if (main) {
    return (
      <Badge
        variant="outline"
        className="border-amber-400 bg-amber-50 text-[10px] font-semibold text-amber-900 dark:border-amber-600/60 dark:bg-amber-950/40 dark:text-amber-200"
        title={`${year}년 2차 메인 판례`}
      >
        <span aria-hidden className="text-amber-500">
          ★
        </span>
        {label}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        round === "first"
          ? "border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300"
          : "border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300",
      )}
    >
      {label}
    </Badge>
  );
}
