// feat-2-029 — 판례 빈칸 편집 모드(staff). 요지/판시이유/평석 전 섹션을 렌더하고,
//   본문 드래그 → "새 빈칸" 플로팅 버튼 → /api/blanks/case-admin-add-blank,
//   기존 빈칸 chip × → /api/blanks/case-admin-remove-blank.
//   오프셋은 텍스트 세그먼트 span 의 data-cum + selection offset 으로 결정적 계산.
import { useCallback, useState } from "react";
import { useFetcher } from "react-router";
import { XIcon } from "lucide-react";

import { cn } from "~/core/lib/utils";
import type {
  CaseBlankSet,
  CaseBlankTarget,
} from "~/features/blanks/case-queries.server";
import { CaseBlankParts } from "~/features/blanks/components/case-blank-parts";
import { resolveCaseHits } from "~/features/blanks/components/case-blank-fill-view";
import type { SummaryItem } from "~/features/cases/labels";

const MAX_ANSWER_LEN = 100;

interface PendingSelection {
  target: CaseBlankTarget;
  itemIndex: number | null;
  answer: string;
  cumOffset: number;
  // 플로팅 버튼 위치(viewport 기준).
  x: number;
  y: number;
}

// selection 컨테이너(node)에서 data-cum 세그먼트 span 을 찾는다.
function segmentSpanOf(node: Node | null): HTMLElement | null {
  let el: Node | null = node;
  while (el) {
    if (el instanceof HTMLElement && el.dataset.cum != null) return el;
    el = el.parentNode;
  }
  return null;
}

function EditSection({
  label,
  text,
  target,
  itemIndex,
  set,
  onSelect,
  onRemove,
  removing,
}: {
  label: string;
  text: string;
  target: CaseBlankTarget;
  itemIndex: number | null;
  set: CaseBlankSet | null;
  onSelect: (sel: PendingSelection | null) => void;
  onRemove: (blankIdx: number) => void;
  removing: boolean;
}) {
  const blanks = (set?.blanks ?? []).filter(
    (b) =>
      b.target === target &&
      (target === "summary" ? (b.itemIndex ?? 0) === itemIndex : true),
  );
  const hits = resolveCaseHits(text, blanks);

  const handleMouseUp = useCallback(() => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      onSelect(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const startSpan = segmentSpanOf(range.startContainer);
    const endSpan = segmentSpanOf(range.endContainer);
    // 이 섹션의 세그먼트 안에서 시작·끝나야 함(빈칸 chip 을 걸치면 무시).
    if (
      !startSpan ||
      !endSpan ||
      startSpan.dataset.sec !== `${target}:${itemIndex ?? 0}` ||
      endSpan.dataset.sec !== `${target}:${itemIndex ?? 0}`
    ) {
      onSelect(null);
      return;
    }
    let start = Number(startSpan.dataset.cum) + range.startOffset;
    let end = Number(endSpan.dataset.cum) + range.endOffset;
    if (end <= start) {
      onSelect(null);
      return;
    }
    // 앞뒤 공백 trim(오프셋 보정).
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    const answer = text.slice(start, end);
    if (!answer || answer.length > MAX_ANSWER_LEN) {
      onSelect(null);
      return;
    }
    // 표 셀 경계를 넘는 선택(파이프·개행 포함) — 원문 렌더에 없는 문자라 빈칸 불가.
    if (/[|\n]/.test(answer)) {
      onSelect(null);
      return;
    }
    // 기존 빈칸과 겹침이면 무시(서버도 재검증).
    if (hits.some((h) => start < h.end && end > h.start)) {
      onSelect(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    onSelect({
      target,
      itemIndex,
      answer,
      cumOffset: start,
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
  }, [text, target, itemIndex, hits, onSelect]);

  // 원시 구간 [from, to) → 세그먼트 span(data-cum) + 빈칸 chip. 표 셀/문단 공용.
  const secKey = `${target}:${itemIndex ?? 0}`;
  const renderRange = (from: number, to: number, key: string) => {
    const out: React.ReactNode[] = [];
    let cursor = from;
    hits.forEach((h) => {
      if (h.start < from || h.end > to) return; // 이 구간 밖(또는 걸침 — 렌더 불가)
      if (h.start > cursor)
        out.push(
          <span key={`${key}.t${cursor}`} data-sec={secKey} data-cum={cursor}>
            {text.slice(cursor, h.start)}
          </span>,
        );
      out.push(
        <span
          key={`${key}.b${h.blank.idx}`}
          className="border-primary/50 bg-primary/10 text-foreground mx-0.5 inline-flex items-center gap-0.5 rounded border-b-2 px-1 font-medium"
          title={h.blank.sourceOx ? `근거 ${h.blank.sourceOx}` : "직접 추가"}
        >
          {h.blank.answer}
          <button
            type="button"
            disabled={removing}
            onClick={() => onRemove(h.blank.idx)}
            aria-label={`빈칸 "${h.blank.answer}" 제거`}
            className="text-muted-foreground hover:text-destructive disabled:opacity-40"
          >
            <XIcon className="size-3" />
          </button>
        </span>,
      );
      cursor = h.end;
    });
    if (cursor < to)
      out.push(
        <span key={`${key}.tail${cursor}`} data-sec={secKey} data-cum={cursor}>
          {text.slice(cursor, to)}
        </span>,
      );
    return out;
  };

  return (
    <section className="space-y-2">
      <h3 className="text-link font-mono text-[11px] font-bold tracking-widest uppercase">
        {label}
      </h3>
      <div
        className="text-foreground text-[16px] leading-[1.9]"
        onMouseUp={handleMouseUp}
      >
        <CaseBlankParts text={text} renderRange={renderRange} />
      </div>
    </section>
  );
}

export function CaseBlankEditView({
  caseId,
  set,
  summaryItems,
  reasoningMd,
  commentMd,
}: {
  caseId: string;
  set: CaseBlankSet | null;
  summaryItems: SummaryItem[];
  reasoningMd: string | null;
  commentMd: string | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const busy = fetcher.state !== "idle";
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  const addBlank = useCallback(() => {
    if (!pending) return;
    const fd = new FormData();
    fd.set("caseId", caseId);
    fd.set("target", pending.target);
    if (pending.itemIndex != null) fd.set("itemIndex", String(pending.itemIndex));
    fd.set("answer", pending.answer);
    fd.set("cumOffset", String(pending.cumOffset));
    fetcher.submit(fd, {
      method: "post",
      action: "/api/blanks/case-admin-add-blank",
    });
    setPending(null);
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  }, [pending, caseId, fetcher]);

  const removeBlank = useCallback(
    (blankIdx: number) => {
      if (!set) return;
      const fd = new FormData();
      fd.set("setId", set.setId);
      fd.set("blankIdx", String(blankIdx));
      fetcher.submit(fd, {
        method: "post",
        action: "/api/blanks/case-admin-remove-blank",
      });
    },
    [set, fetcher],
  );

  return (
    <div className="border-primary/40 bg-card space-y-5 rounded-xl border-2 border-dashed p-5 shadow-sm md:p-6">
      <div className="bg-primary/5 flex flex-wrap items-center gap-3 rounded-md px-3 py-2 text-xs">
        <span className="text-link font-bold">빈칸 편집 모드</span>
        <span className="text-muted-foreground">
          본문을 드래그하면 그 자리에 빈칸을 추가합니다 · 빈칸의 ×로 제거
          (제거 시 같은 자리 승인 후보는 거절로 동기화)
        </span>
        {busy ? <span className="text-muted-foreground ml-auto">저장 중…</span> : null}
        {error ? (
          <span className="text-destructive ml-auto font-semibold">{error}</span>
        ) : null}
      </div>

      {summaryItems.map((it, i) =>
        it.body ? (
          <EditSection
            key={`s${i}`}
            label={summaryItems.length > 1 ? `판결요지 [${i + 1}]` : "판결요지"}
            text={it.body}
            target="summary"
            itemIndex={i}
            set={set}
            onSelect={setPending}
            onRemove={removeBlank}
            removing={busy}
          />
        ) : null,
      )}
      {reasoningMd ? (
        <EditSection
          label="판시이유"
          text={reasoningMd}
          target="reasoning"
          itemIndex={null}
          set={set}
          onSelect={setPending}
          onRemove={removeBlank}
          removing={busy}
        />
      ) : null}
      {commentMd ? (
        <EditSection
          label="평석"
          text={commentMd}
          target="comment"
          itemIndex={null}
          set={set}
          onSelect={setPending}
          onRemove={removeBlank}
          removing={busy}
        />
      ) : null}

      {/* 드래그 선택 플로팅 버튼 */}
      {pending ? (
        <button
          type="button"
          onClick={addBlank}
          disabled={busy}
          style={{
            position: "fixed",
            left: pending.x,
            top: pending.y + 6,
            transform: "translateX(-50%)",
            zIndex: 50,
          }}
          className={cn(
            "bg-primary text-primary-foreground rounded-md px-2.5 py-1.5 text-xs font-bold shadow-lg",
            "hover:opacity-90 disabled:opacity-50",
          )}
        >
          새 빈칸 “
          {pending.answer.length > 14
            ? `${pending.answer.slice(0, 14)}…`
            : pending.answer}
          ”
        </button>
      ) : null}
    </div>
  );
}
