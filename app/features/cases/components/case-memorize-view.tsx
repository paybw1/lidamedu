// feat-2-029 S1 — 판례 단계별 암기(Phase 1). CaseBody(읽기·하이라이트)와 분리한 자기회상 뷰.
//   ②쟁점만 보기(issues): 쟁점(title) 노출 + 요지(body) 가림 → 항목별 "요지 확인"으로 자기채점.
//   ③전체 복원(recall): 사건 식별자만 → "전체 복원"으로 모든 쟁점·요지 공개.
//   빈칸(①)·SRS(④)는 후속 Stage. summary_items 없으면 마운트하지 않음(호출부 가드).
//   CaseBody 를 건드리지 않아 하이라이트 offset 안정성에 영향 없음.
import { useState } from "react";

import { CheckCircle2Icon, EyeIcon, EyeOffIcon, ListChecksIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import type { SummaryItem } from "~/features/cases/labels";

import { Prose } from "./case-body";

export type CaseMemorizeMode = "issues" | "recall";

// summary title 의 "[N] " prefix 를 배지 번호 + 본문으로 분리(파서가 붙여둔 표기).
function stripIssueNo(title: string): { badge: string | null; text: string } {
  const m = title.match(/^\[(\d+)\]\s*(.*)$/);
  if (m) return { badge: m[1], text: m[2] };
  return { badge: null, text: title };
}

function IssueBadge({ n }: { n: string }) {
  return (
    <span className="bg-primary/85 mr-2 inline-flex items-center rounded px-1.5 align-[1px] font-mono text-[11.5px] font-extrabold text-white">
      {n}
    </span>
  );
}

export function CaseMemorizeView({
  mode,
  caseNumber,
  caseTitle,
  items,
}: {
  mode: CaseMemorizeMode;
  caseNumber: string;
  caseTitle: string | null;
  items: SummaryItem[];
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const allOpen = items.length > 0 && revealed.size >= items.length;
  const toggle = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const setAll = (open: boolean) =>
    setRevealed(open ? new Set(items.map((_, i) => i)) : new Set());

  const showLabel = items.length > 1;

  return (
    <div className="border-border bg-card space-y-4 rounded-xl border p-5 shadow-sm md:p-6">
      {/* 안내 + 전체 공개/가리기 */}
      <div className="border-border/60 flex flex-wrap items-center gap-2 border-b pb-3">
        <ListChecksIcon className="text-primary size-4" />
        <span className="text-[13px] font-bold">
          {mode === "issues" ? "쟁점만 보기 — 요지 자기회상" : "전체 복원 — 백지 회상"}
        </span>
        <span className="text-muted-foreground text-[12px]">
          {mode === "issues"
            ? "쟁점을 보고 요지를 떠올린 뒤 ‘요지 확인’으로 채점하세요."
            : "식별자만 보고 모든 쟁점·요지를 떠올린 뒤 ‘전체 복원’으로 확인하세요."}
        </span>
        <div className="ml-auto">
          <Button
            type="button"
            variant={allOpen ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setAll(!allOpen)}
          >
            {allOpen ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
            {allOpen ? "모두 가리기" : "모두 보기"}
          </Button>
        </div>
      </div>

      {/* recall — 사건 식별자(요지 회상의 단서) */}
      {mode === "recall" ? (
        <div className="bg-muted/40 rounded-lg border px-4 py-3">
          <p className="text-foreground font-mono text-[15px] font-bold tracking-tight">
            {caseNumber}
          </p>
          {caseTitle ? (
            <p className="text-muted-foreground mt-0.5 text-[13px]">{caseTitle}</p>
          ) : null}
          <p className="text-muted-foreground mt-1 text-[12px]">
            이 판례의 쟁점 <b className="text-foreground">{items.length}개</b>와 각 요지를
            떠올려 보세요.
          </p>
        </div>
      ) : null}

      {/* 항목 목록 */}
      <ol className="space-y-3">
        {items.map((it, i) => {
          const { badge, text } = stripIssueNo(it.title);
          const n = badge ?? (showLabel ? String(i + 1) : null);
          const open = revealed.has(i);
          return (
            <li key={i} className="border-border/70 rounded-lg border">
              {/* 쟁점(단서) — recall 모드에선 제목도 가려 번호만 노출 */}
              <div className="bg-muted/40 flex items-start gap-2 rounded-t-lg px-3.5 py-2.5">
                {n ? <IssueBadge n={n} /> : null}
                <p className="text-foreground flex-1 text-[15px] leading-[1.7] font-bold tracking-tight">
                  {mode === "recall" && !open ? (
                    <span className="text-muted-foreground/70 font-normal">쟁점 {n ?? i + 1} — 요지를 떠올려 보세요</span>
                  ) : (
                    text || `쟁점 ${n ?? i + 1}`
                  )}
                </p>
                <Button
                  type="button"
                  variant={open ? "ghost" : "outline"}
                  size="sm"
                  className="h-7 shrink-0 gap-1 text-xs"
                  onClick={() => toggle(i)}
                >
                  {open ? (
                    <>
                      <EyeOffIcon className="size-3.5" /> 가리기
                    </>
                  ) : (
                    <>
                      <EyeIcon className="size-3.5" /> 요지 확인
                    </>
                  )}
                </Button>
              </div>
              {/* 요지(정답) — 공개 시에만 */}
              {open ? (
                <div className="px-4 py-3">
                  {it.body ? (
                    <Prose text={it.body} />
                  ) : (
                    <p className="text-muted-foreground text-sm">요지 본문이 없습니다.</p>
                  )}
                  <p className="text-emerald-600 dark:text-emerald-400 mt-2 inline-flex items-center gap-1 text-[11px] font-semibold">
                    <CheckCircle2Icon className="size-3.5" /> 요지 공개됨
                  </p>
                </div>
              ) : (
                <div className="text-muted-foreground/60 px-4 py-3 text-[12px]">
                  {mode === "issues" ? "요지 가림 — 떠올린 뒤 확인" : "가림"}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="text-muted-foreground/70 text-[11px]">
        ※ 다음 단계(요지 핵심어 빈칸·암기카드)는 준비 중입니다. 지금은 쟁점→요지 회상 훈련입니다.
      </p>
    </div>
  );
}
