// feat-2-029 S3 — 판례 빈칸(①) 렌더러. 판례 텍스트(요지 항목/판시이유/평석)는 단일 문자열이라
//   조문의 block-walk 없이 cumOffset(직접) 또는 문맥 앵커(findBlankHits)로 위치를 잡는다.
//   IME 보호(조합 가드·클릭 flush·컨트롤드 값)는 자체 내장 — 조문 blanks-context 를 건드리지 않는다.
//   승인된 빈칸(case_blank_sets)이 있을 때만 마운트(S4/S5 적재 후 활성). staff 전용(호출부 게이트).
import { useCallback, useRef, useState } from "react";

import { EyeIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { findBlankHits } from "~/features/blanks/components/blanks-context";
import { CaseBlankParts } from "~/features/blanks/components/case-blank-parts";
import type {
  CaseBlankItem,
  CaseBlankSet,
} from "~/features/blanks/case-queries.server";
import { normalizeAnswer } from "~/features/blanks/lib/normalize";
import type { SummaryItem } from "~/features/cases/labels";

type BlankStatus = "empty" | "correct" | "wrong";
export interface CaseBlankHit {
  blank: CaseBlankItem;
  start: number;
  end: number;
}
type Hit = CaseBlankHit;

// 텍스트 안에서 빈칸 위치 결정 — cumOffset 우선(substring 검증), 없으면 문맥 앵커.
export function resolveCaseHits(text: string, blanks: CaseBlankItem[]): Hit[] {
  const raw: Hit[] = [];
  for (const b of blanks) {
    if (!b.answer) continue;
    if (
      typeof b.cumOffset === "number" &&
      b.cumOffset >= 0 &&
      b.cumOffset + b.answer.length <= text.length &&
      text.slice(b.cumOffset, b.cumOffset + b.answer.length) === b.answer
    ) {
      raw.push({ blank: b, start: b.cumOffset, end: b.cumOffset + b.answer.length });
      continue;
    }
    // 문맥 앵커 — 조문과 동일 규칙(findBlankHits). BlankItem 호환 shape 로 넘긴다.
    const [h] = findBlankHits(text, [
      {
        idx: b.idx,
        length: b.answer.length,
        answer: b.answer,
        beforeContext: b.beforeContext,
        afterContext: b.afterContext,
      },
    ]);
    if (h) raw.push({ blank: b, start: h.start, end: h.end });
  }
  raw.sort((a, b) => a.start - b.start);
  // overlap 회피(앞선 hit 이 차지한 구간과 겹치면 skip).
  const out: Hit[] = [];
  let cursor = 0;
  for (const h of raw) {
    if (h.start >= cursor) {
      out.push(h);
      cursor = h.end;
    }
  }
  return out;
}

// ── IME 안전 입력 ─────────────────────────────────────────────
function CaseBlankInput({
  idx,
  value,
  status,
  answer,
  widthCh,
  onChange,
  onEnter,
  onPointerFlush,
  register,
}: {
  idx: number;
  value: string;
  status: BlankStatus;
  answer: string;
  widthCh: number;
  onChange: (v: string, composing: boolean) => void;
  onEnter: () => void;
  onPointerFlush: () => void;
  register: (idx: number, el: HTMLInputElement | null) => void;
}) {
  const composingRef = useRef(false);
  const cls = cn(
    "mx-0.5 inline-block rounded border-b-2 px-1 align-baseline focus:outline-none",
    status === "correct"
      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-medium"
      : status === "wrong"
        ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300"
        : "border-muted-foreground/40 bg-muted/30 focus:border-primary",
  );
  return (
    <input
      ref={(el) => register(idx, el)}
      type="text"
      value={value}
      className={cls}
      style={{ width: `${widthCh}ch` }}
      onChange={(e) => onChange(e.target.value, composingRef.current)}
      // 터치는 mousedown 합성이 늦거나 생략될 수 있어 pointerdown 에서 먼저 flush(멱등).
      onPointerDown={onPointerFlush}
      onMouseDown={onPointerFlush}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!composingRef.current) onEnter();
        }
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        onChange(e.currentTarget.value, false);
      }}
      aria-label={`빈칸 ${idx}`}
      title={`빈칸 (${answer.length}자)`}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore="true"
      data-lpignore="true"
      data-form-type="other"
    />
  );
}

// ── 한 텍스트 단위(요지 항목/판시/평석) 렌더 ─────────────────
function CaseBlankText({
  text,
  blanks,
  states,
  reveal,
  onChange,
  onEnter,
  onPointerFlush,
  register,
}: {
  text: string;
  blanks: CaseBlankItem[];
  states: Record<number, { input: string; status: BlankStatus }>;
  reveal: boolean;
  onChange: (idx: number, v: string, composing: boolean) => void;
  onEnter: (idx: number) => void;
  onPointerFlush: (idx: number) => void;
  register: (idx: number, el: HTMLInputElement | null) => void;
}) {
  const hits = resolveCaseHits(text, blanks);
  // 원시 구간 [from, to) → 텍스트 + 빈칸 input. 표 셀/문단 공용 (CaseBlankParts).
  const renderRange = (from: number, to: number, key: string) => {
    const out: React.ReactNode[] = [];
    let cursor = from;
    hits.forEach((h) => {
      if (h.start < from || h.end > to) return;
      if (h.start > cursor)
        out.push(<span key={`${key}.t${cursor}`}>{text.slice(cursor, h.start)}</span>);
      const st = states[h.blank.idx] ?? { input: "", status: "empty" as const };
      const showRevealed = reveal && st.status !== "correct";
      const widthCh = Math.max(5, Math.min(40, h.blank.answer.length * 2 + 2));
      out.push(
        <CaseBlankInput
          key={`${key}.b${h.blank.idx}`}
          idx={h.blank.idx}
          value={showRevealed ? h.blank.answer : st.input}
          status={showRevealed ? "correct" : st.status}
          answer={h.blank.answer}
          widthCh={widthCh}
          onChange={(v, composing) => onChange(h.blank.idx, v, composing)}
          onEnter={() => onEnter(h.blank.idx)}
          onPointerFlush={() => onPointerFlush(h.blank.idx)}
          register={register}
        />,
      );
      cursor = h.end;
    });
    if (cursor < to)
      out.push(<span key={`${key}.tail${cursor}`}>{text.slice(cursor, to)}</span>);
    return out;
  };
  return <CaseBlankParts text={text} renderRange={renderRange} />;
}

export function CaseBlankFillView({
  set,
  summaryItems,
  reasoningMd,
  commentMd,
}: {
  set: CaseBlankSet;
  summaryItems: SummaryItem[];
  reasoningMd: string | null;
  commentMd: string | null;
}) {
  const [states, setStates] = useState<
    Record<number, { input: string; status: BlankStatus }>
  >(() => {
    const init: Record<number, { input: string; status: BlankStatus }> = {};
    for (const b of set.blanks) init[b.idx] = { input: "", status: "empty" };
    return init;
  });
  const [reveal, setReveal] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const inputsRef = useRef<Map<number, HTMLInputElement>>(new Map());
  const orderRef = useRef<number[]>(set.blanks.map((b) => b.idx));

  const register = useCallback((idx: number, el: HTMLInputElement | null) => {
    if (el) inputsRef.current.set(idx, el);
    else inputsRef.current.delete(idx);
  }, []);

  // 마우스 클릭 이동 전 현재 포커스 빈칸 flush(IME 이월 차단) — 조문 수정과 동일 원리.
  const pointerFlush = useCallback((targetIdx: number) => {
    if (typeof document === "undefined") return;
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === inputsRef.current.get(targetIdx)) return;
    for (const el of inputsRef.current.values())
      if (el === active) {
        active.blur();
        return;
      }
  }, []);

  const answerByIdx = useRef(new Map(set.blanks.map((b) => [b.idx, b.answer])));
  const check = useCallback(
    (idx: number, raw: string, composing: boolean) => {
      const answer = answerByIdx.current.get(idx);
      if (answer == null) return;
      if (composing) {
        setStates((p) => ({ ...p, [idx]: { input: raw, status: raw ? "wrong" : "empty" } }));
        return;
      }
      const correct = normalizeAnswer(raw) === normalizeAnswer(answer);
      setStates((p) => ({
        ...p,
        [idx]: { input: raw, status: correct ? "correct" : raw ? "wrong" : "empty" },
      }));
    },
    [],
  );

  // Enter → 다음 빈 빈칸으로 이동(렌더 순 = set.blanks 순 근사).
  const focusNext = useCallback((afterIdx: number) => {
    const order = orderRef.current;
    const pos = order.indexOf(afterIdx);
    const seq = [...order.slice(pos + 1), ...order.slice(0, pos)];
    for (const nid of seq) {
      const el = inputsRef.current.get(nid);
      if (el) {
        el.focus();
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          /* noop */
        }
        return;
      }
    }
  }, []);

  const total = set.blanks.length;
  const correctCount = Object.values(states).filter((s) => s.status === "correct").length;

  // target 별 그룹.
  const summaryBlanksByItem = (i: number) =>
    set.blanks.filter((b) => b.target === "summary" && (b.itemIndex ?? 0) === i);
  const reasoningBlanks = set.blanks.filter((b) => b.target === "reasoning");
  const commentBlanks = set.blanks.filter((b) => b.target === "comment");

  return (
    <div key={resetKey} className="border-border bg-card space-y-5 rounded-xl border p-5 shadow-sm md:p-6">
      <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2 text-xs">
        <span className="font-medium">요지 핵심어 빈칸 {total}개</span>
        <span className="text-muted-foreground">
          맞히면 초록 · <kbd className="rounded border px-1">Enter</kbd> 다음 칸
        </span>
        <span className="text-muted-foreground tabular-nums">
          {correctCount}/{total}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant={reveal ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setReveal((v) => !v)}
          >
            <EyeIcon className="size-3.5" />
            {reveal ? "정답 숨기기" : "정답 보기"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => {
              setReveal(false);
              setStates(() => {
                const init: Record<number, { input: string; status: BlankStatus }> = {};
                for (const b of set.blanks) init[b.idx] = { input: "", status: "empty" };
                return init;
              });
              inputsRef.current.clear();
              setResetKey((k) => k + 1);
            }}
          >
            <RotateCcwIcon className="size-3.5" /> 다시 풀기
          </Button>
        </div>
      </div>

      {/* 요지(항목별) — 빈칸 없는 항목도 본문·이미지·표 맥락 유지 위해 함께 표시. */}
      {summaryItems.map((it, i) => {
        const bl = summaryBlanksByItem(i);
        if (!it.body) return null;
        return (
          <section key={`s${i}`} className="space-y-2">
            <h3 className="text-link font-mono text-[11px] font-bold tracking-widest uppercase">
              {summaryItems.length > 1 ? `판결요지 [${i + 1}]` : "판결요지"}
            </h3>
            <div className="text-foreground text-[16px] leading-[1.9]">
              <CaseBlankText
                text={it.body}
                blanks={bl}
                states={states}
                reveal={reveal}
                onChange={check}
                onEnter={focusNext}
                onPointerFlush={pointerFlush}
                register={register}
              />
            </div>
          </section>
        );
      })}

      {/* 판시이유 — 빈칸 없어도 표시(풀기 중 맥락·이미지 유지). */}
      {reasoningMd ? (
        <section className="space-y-2">
          <h3 className="text-link font-mono text-[11px] font-bold tracking-widest uppercase">판시이유</h3>
          <div className="text-foreground text-[16px] leading-[1.9]">
            <CaseBlankText
              text={reasoningMd}
              blanks={reasoningBlanks}
              states={states}
              reveal={reveal}
              onChange={check}
              onEnter={focusNext}
              onPointerFlush={pointerFlush}
              register={register}
            />
          </div>
        </section>
      ) : null}

      {/* 평석 — 빈칸 없어도 표시(풀기 중 맥락·이미지 유지). */}
      {commentMd ? (
        <section className="space-y-2">
          <h3 className="text-link font-mono text-[11px] font-bold tracking-widest uppercase">평석</h3>
          <div className="text-foreground text-[16px] leading-[1.9]">
            <CaseBlankText
              text={commentMd}
              blanks={commentBlanks}
              states={states}
              reveal={reveal}
              onChange={check}
              onEnter={focusNext}
              onPointerFlush={pointerFlush}
              register={register}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
