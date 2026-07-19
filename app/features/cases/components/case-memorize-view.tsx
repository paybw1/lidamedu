// feat-2-029 S1 — 판례 단계별 암기(Phase 1). CaseBody(읽기·하이라이트)와 분리한 자기회상 뷰.
//   ②쟁점만 보기(issues): 쟁점(title) 노출 + 요지(body) 가림 → 항목별 단계식 힌트로 자기채점.
//     힌트 사다리(2026-07-19): 가림 → ①키워드 칩(그 쟁점의 빈칸 정답, 등장 순) →
//     ②빈칸 본문(핵심어만 가린 요지) → 전체. 빈칸(①단계) 학습과 역방향으로 이어진다.
//     빈칸 데이터 없는 판례/항목은 힌트 단계 자동 생략(가림→전체).
//   ③전체 복원(recall): 사건 식별자만 → "전체 복원"으로 모든 쟁점·요지 공개.
//   CaseBody 를 건드리지 않아 하이라이트 offset 안정성에 영향 없음.
import { useState } from "react";

import {
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  LightbulbIcon,
  ListChecksIcon,
} from "lucide-react";

import { Button } from "~/core/components/ui/button";
import type { CaseBlankItem } from "~/features/blanks/case-queries.server";
import { CaseBlankParts } from "~/features/blanks/components/case-blank-parts";
import { resolveCaseHits } from "~/features/blanks/components/case-blank-fill-view";
import type { SummaryItem } from "~/features/cases/labels";

import { Prose } from "./case-body";

export type CaseMemorizeMode = "issues" | "recall";

// 항목별 공개 단계 — 0=가림, 1=키워드 힌트, 2=빈칸 본문 힌트, 3=전체 공개.
const STAGE_HIDDEN = 0;
const STAGE_KEYWORDS = 1;
const STAGE_MASKED = 2;
const STAGE_FULL = 3;

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

// 힌트 ② — 요지 본문에서 빈칸 정답 자리만 가린 read-only 렌더(입력칸 없음).
function MaskedBody({ text, blanks }: { text: string; blanks: CaseBlankItem[] }) {
  const hits = resolveCaseHits(text, blanks);
  const renderRange = (from: number, to: number, key: string) => {
    const out: React.ReactNode[] = [];
    let cursor = from;
    for (const h of hits) {
      if (h.start < from || h.end > to) continue;
      if (h.start > cursor)
        out.push(<span key={`${key}.t${cursor}`}>{text.slice(cursor, h.start)}</span>);
      const w = Math.max(4, Math.min(40, h.blank.answer.length * 2 + 1));
      out.push(
        <span
          key={`${key}.m${h.blank.idx}`}
          aria-label="가려진 핵심어"
          title={`핵심어 ${h.blank.answer.length}자`}
          className="border-muted-foreground/50 bg-muted/60 mx-0.5 inline-block h-[1.05em] rounded border-b-2 align-baseline"
          style={{ width: `${w}ch` }}
        />,
      );
      cursor = h.end;
    }
    if (cursor < to)
      out.push(<span key={`${key}.tail${cursor}`}>{text.slice(cursor, to)}</span>);
    return out;
  };
  return (
    <div className="text-foreground text-[15px] leading-[1.9]">
      <CaseBlankParts text={text} renderRange={renderRange} />
    </div>
  );
}

export function CaseMemorizeView({
  mode,
  caseNumber,
  caseTitle,
  items,
  blanks = [],
}: {
  mode: CaseMemorizeMode;
  caseNumber: string;
  caseTitle: string | null;
  items: SummaryItem[];
  /** ①빈칸 세트의 blanks — 쟁점만 보기 힌트(키워드·빈칸 본문) 재료. 없으면 힌트 생략. */
  blanks?: CaseBlankItem[];
}) {
  const [stages, setStages] = useState<Record<number, number>>({});
  const stageOf = (i: number) => stages[i] ?? STAGE_HIDDEN;
  const setStage = (i: number, s: number) =>
    setStages((prev) => ({ ...prev, [i]: s }));

  const blanksFor = (i: number) =>
    blanks.filter(
      (b) => b.target === "summary" && (b.itemIndex ?? 0) === i && b.answer,
    );

  const allOpen =
    items.length > 0 && items.every((_, i) => stageOf(i) >= STAGE_FULL);
  const setAll = (open: boolean) =>
    setStages(
      open
        ? Object.fromEntries(items.map((_, i) => [i, STAGE_FULL]))
        : {},
    );

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
            ? "쟁점을 보고 요지를 떠올리세요. 막히면 힌트(키워드 → 빈칸 본문)를 단계로 여세요."
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
          const stage = stageOf(i);
          const open = stage >= STAGE_FULL;
          const bl = mode === "issues" ? blanksFor(i) : [];
          const hintable = bl.length > 0 && !!it.body;
          // 다음 단계 — 힌트 불가 항목은 가림↔전체 이단.
          const nextStage = hintable
            ? Math.min(stage + 1, STAGE_FULL)
            : STAGE_FULL;
          const nextLabel = !hintable
            ? "요지 확인"
            : stage === STAGE_HIDDEN
              ? "힌트 ① 키워드"
              : stage === STAGE_KEYWORDS
                ? "힌트 ② 빈칸 본문"
                : "요지 확인";
          // 키워드 — 본문 등장 순(문장 흐름의 골격), 중복 제거.
          const keywords =
            stage >= STAGE_KEYWORDS && hintable
              ? [...new Set(resolveCaseHits(it.body ?? "", bl).map((h) => h.blank.answer))]
              : [];
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
                {open ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 text-xs"
                    onClick={() => setStage(i, STAGE_HIDDEN)}
                  >
                    <EyeOffIcon className="size-3.5" /> 가리기
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1 text-xs"
                    onClick={() => setStage(i, nextStage)}
                  >
                    {hintable && stage < STAGE_MASKED ? (
                      <LightbulbIcon className="size-3.5" />
                    ) : (
                      <EyeIcon className="size-3.5" />
                    )}
                    {nextLabel}
                  </Button>
                )}
              </div>

              {/* 본문 영역 — 단계별: 가림 / 키워드 / 빈칸 본문 / 전체 */}
              {stage === STAGE_HIDDEN ? (
                <div className="text-muted-foreground/60 px-4 py-3 text-[12px]">
                  {mode === "issues"
                    ? hintable
                      ? "요지 가림 — 떠올린 뒤 막히면 힌트를 여세요"
                      : "요지 가림 — 떠올린 뒤 확인"
                    : "가림"}
                </div>
              ) : null}

              {stage >= STAGE_KEYWORDS && stage < STAGE_FULL ? (
                <div className="space-y-3 px-4 py-3">
                  {/* 힌트 ① — 빈칸 정답 키워드(등장 순) */}
                  <div>
                    <p className="text-muted-foreground mb-1.5 font-mono text-[10.5px] font-bold tracking-widest uppercase">
                      힌트 ① 키워드
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.map((k) => (
                        <span
                          key={k}
                          className="border-primary/40 bg-primary/[0.07] text-foreground rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium"
                        >
                          #{k}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* 힌트 ② — 핵심어만 가린 요지 본문 */}
                  {stage >= STAGE_MASKED ? (
                    <div>
                      <p className="text-muted-foreground mb-1.5 font-mono text-[10.5px] font-bold tracking-widest uppercase">
                        힌트 ② 빈칸 본문
                      </p>
                      <MaskedBody text={it.body ?? ""} blanks={bl} />
                    </div>
                  ) : null}
                </div>
              ) : null}

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
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="text-muted-foreground/70 text-[11px]">
        ※ 힌트는 ①빈칸 단계에서 승인된 핵심어를 재료로 합니다 — 키워드로 문장을 재구성하고,
        빈칸 본문으로 구조를 확인한 뒤 전체를 여세요.
      </p>
    </div>
  );
}
