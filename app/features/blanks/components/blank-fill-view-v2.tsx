// 빈칸 모드 V2 프로토타입 (feat-4-A-130b, ?blankv2=1 게이트) — iOS IME 이월 근본 해결 실험.
//
// 근본 아이디어: 빈칸마다 별개 <input>(요소 간 blur/focus로 iOS 조합 잔여 이월) 대신
//   본문 전체를 **하나의 contenteditable 컨테이너**로 렌더. 고정 텍스트=contenteditable=false,
//   빈칸만 편집 가능 구역. 칸 이동 = 한 요소 안 캐럿 이동(blur/focus 없음) → 넘어갈 다른
//   요소가 없어 이월이 구조적으로 불가능.
//
//   ★단일 host 는 유지하되, 캐럿이 고정 텍스트로 새지 않게 selectionchange 로 빈칸 안으로만
//   가둔다(문장 전체 배회·고정 텍스트 편집 방지). 색상은 클래스 충돌을 피해 인라인 스타일로.
//
// P1 범위: 단일 조문 + 순수 텍스트 블록. 리치 토큰(관련조문 링크·표)은 평문으로 렌더(P2에서 보강).
// DOM은 명령형으로 빌드해 React 재조정이 편집 중 DOM을 덮어쓰지 않게 한다(uncontrolled).

import { EyeIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/core/components/ui/button";
import type { ArticleBody } from "~/features/laws/lib/article-body";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";
import type { BlankItem } from "~/features/blanks/queries.server";

import {
  blockCumulativeText,
  computeBlockBlankHits,
  walkBlocks,
} from "../lib/blank-layout";
import { normalizeAnswer } from "../lib/normalize";
import type { AutoBlankMeta } from "./blanks-context";

const ZWSP = "​";
const SLOT_CLASS = "blank-slot-v2";

const COLORS = {
  neutral: { border: "#94a3b8", bg: "transparent", fg: "" },
  correct: { border: "#10b981", bg: "rgba(16,185,129,0.14)", fg: "#047857" },
  wrong: { border: "#f43f5e", bg: "rgba(244,63,94,0.12)", fg: "#be123c" },
} as const;

type Seg =
  | { t: "text"; s: string }
  | {
      t: "blank";
      idx: number;
      answer: string;
      blockIndex?: number;
      cumOffset?: number;
    };
interface Line {
  label: string;
  segs: Seg[];
}

// body + blanks → 렌더 순서의 라인(블록) + 세그먼트. 빈칸은 blockHit offset 자리에 삽입.
function buildLines(body: ArticleBody, blanks: BlankItem[]): Line[] {
  const blockHits = computeBlockBlankHits(body, blanks);
  const blankByIdx = new Map(blanks.map((b) => [b.idx, b]));
  const lines: Line[] = [];
  walkBlocks(body, (block) => {
    const text = blockCumulativeText(block);
    const hits = (blockHits.get(block) ?? [])
      .slice()
      .sort((a, b) => a.start - b.start);
    if (text.length === 0 && hits.length === 0) return; // 빈 블록 skip
    const label =
      block.kind === "clause" || block.kind === "item" || block.kind === "sub"
        ? block.label
        : "";
    const segs: Seg[] = [];
    let cursor = 0;
    for (const h of hits) {
      const start = Math.max(0, Math.min(text.length, h.start));
      const end = Math.max(0, Math.min(text.length, h.end));
      if (h.start < 0) continue;
      if (start > cursor) segs.push({ t: "text", s: text.slice(cursor, start) });
      const bi = blankByIdx.get(h.blank.idx);
      segs.push({
        t: "blank",
        idx: h.blank.idx,
        answer: h.blank.answer,
        blockIndex: bi?.blockIndex ?? undefined,
        cumOffset: bi?.cumOffset ?? undefined,
      });
      cursor = Math.max(cursor, end);
    }
    if (cursor < text.length) segs.push({ t: "text", s: text.slice(cursor) });
    lines.push({ label, segs });
  });
  return lines;
}

function isInSlot(node: Node | null, root: Node): HTMLElement | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n instanceof HTMLElement && n.classList.contains(SLOT_CLASS)) return n;
    n = n.parentNode;
  }
  return null;
}

export function BlankFillViewV2({
  setId,
  autoMeta,
  body,
  blanks,
  lawCode,
}: {
  setId: string | null;
  autoMeta?: AutoBlankMeta;
  body: ArticleBody;
  blanks: BlankItem[];
  titleMap?: unknown;
  lawCode: LawSubjectSlug;
}) {
  const [reveal, setReveal] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<Map<number, string>>(new Map());
  const savedRef = useRef<Set<number>>(new Set());
  // 한글 IME 조합 중 — 조합 중엔 캐럿 스냅·값 덮어쓰기 금지(조합 파괴 방지).
  const composingRef = useRef(false);

  const lines = useMemo(() => buildLines(body, blanks), [body, blanks]);
  const totalBlanks = blanks.length;
  const mappedCount = blanks.filter((b) => b.answer).length;
  const unmappedCount = totalBlanks - mappedCount;

  const readSlot = (slot: HTMLElement): string =>
    (slot.textContent ?? "").split(ZWSP).join("");

  const setSlotColor = (slot: HTMLElement, s: keyof typeof COLORS) => {
    // 인라인 스타일 — Tailwind 클래스 순서 충돌 없이 확실히 반영.
    slot.style.borderBottomColor = COLORS[s].border;
    slot.style.backgroundColor = COLORS[s].bg;
    slot.style.color = COLORS[s].fg;
  };

  // ★attempt 저장은 RR fetcher 가 아니라 순수 fetch(fire-and-forget) 로 보낸다 —
  //   fetcher.submit 은 로더 revalidation 을 유발해 편집 중 contenteditable 이 React
  //   재렌더에 휘말려(캐럿 튐·문장 훼손) 버린다. fetch 는 재검증을 안 일으켜 편집영역 무영향.
  const saveAttempt = (slot: HTMLElement, idx: number, input: string) => {
    if (savedRef.current.has(idx)) return;
    savedRef.current.add(idx);
    const fd = new FormData();
    let action: string | null = null;
    if (setId) {
      fd.set("setId", setId);
      fd.set("blankIdx", String(idx));
      fd.set("userInput", input);
      action = "/api/blanks/attempt";
    } else {
      const bi = slot.dataset.blockIndex;
      const co = slot.dataset.cumOffset;
      if (autoMeta && bi != null && co != null) {
        fd.set("articleId", autoMeta.articleId);
        fd.set("blankType", autoMeta.blankType);
        fd.set("blockIndex", bi);
        fd.set("cumOffset", co);
        fd.set("answer", slot.dataset.answer ?? "");
        fd.set("userInput", input);
        action = "/api/blanks/auto-attempt";
      }
    }
    if (!action) return;
    void fetch(action, { method: "POST", body: fd }).catch(() => {});
  };

  const judgeSlot = (slot: HTMLElement, save: boolean) => {
    const idx = Number(slot.dataset.blankIdx);
    const answer = slot.dataset.answer ?? "";
    const val = readSlot(slot);
    valuesRef.current.set(idx, val);
    if (val.length === 0) {
      setSlotColor(slot, "neutral");
      return;
    }
    const correct = normalizeAnswer(val) === normalizeAnswer(answer);
    if (correct) {
      setSlotColor(slot, "correct");
      if (save) saveAttempt(slot, idx, val);
    } else {
      setSlotColor(slot, "wrong");
    }
  };

  const slotFromSelection = (): HTMLElement | null => {
    const root = editorRef.current;
    if (!root || typeof window === "undefined") return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    return isInSlot(sel.anchorNode, root);
  };

  const caretToEnd = (slot: HTMLElement) => {
    if (typeof window === "undefined") return;
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(slot);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // ── DOM 빌드 (mount / reset / body 변경) ─────────────────────────────
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    root.innerHTML = "";
    valuesRef.current = new Map();
    savedRef.current = new Set();
    for (const line of lines) {
      const lineEl = document.createElement("div");
      lineEl.className = "blank-line-v2";
      lineEl.style.lineHeight = "2.1";
      if (line.label) {
        const lab = document.createElement("span");
        lab.contentEditable = "false";
        lab.className = "mr-1 font-semibold";
        lab.textContent = line.label;
        lineEl.appendChild(lab);
      }
      for (const seg of line.segs) {
        if (seg.t === "text") {
          const s = document.createElement("span");
          s.contentEditable = "false";
          s.textContent = seg.s;
          lineEl.appendChild(s);
        } else {
          const b = document.createElement("span");
          // ★개별 contenteditable 안 줌(주면 요소별 편집 host=이월 재발). 컨테이너가 host,
          //   고정 텍스트만 false → 편집 가능 구멍은 슬롯뿐. 캐럿 가두기로 슬롯 밖 편집 차단.
          b.className = SLOT_CLASS;
          b.dataset.blankIdx = String(seg.idx);
          b.dataset.answer = seg.answer;
          if (seg.blockIndex != null)
            b.dataset.blockIndex = String(seg.blockIndex);
          if (seg.cumOffset != null) b.dataset.cumOffset = String(seg.cumOffset);
          b.style.display = "inline-block";
          b.style.minWidth = `${Math.max(3, Math.min(30, (seg.answer.length || 2) * 1.6))}ch`;
          b.style.margin = "0 2px";
          b.style.padding = "0 4px";
          b.style.textAlign = "center";
          b.style.borderBottom = "2px solid";
          b.style.borderRadius = "3px";
          b.style.borderBottomColor = COLORS.neutral.border;
          b.style.outline = "none";
          b.textContent = ZWSP; // 캐럿 안착용 zero-width space
          lineEl.appendChild(b);
        }
      }
      root.appendChild(lineEl);
    }
    // ★deps=[resetKey]만 — 정답 저장(fetcher)·기타 revalidation 으로 body/blanks 참조가
    //   바뀌어도 편집 DOM(과 캐럿)을 재빌드하지 않는다. 조문/세트가 실제로 바뀌면 부모가
    //   key 로 remount 하므로 mount + 다시풀기에만 재빌드하면 충분. (lines 는 mount 시점 값 사용)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // ── 캐럿 가두기 — 선택이 슬롯 밖(고정 텍스트)에 놓이면 인접 슬롯으로 스냅 ────
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onSelChange = () => {
      const root = editorRef.current;
      if (!root || composingRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
      const anchor = sel.anchorNode;
      if (!anchor || !root.contains(anchor)) return; // 이 에디터 밖 — 무시
      if (isInSlot(anchor, root)) return; // 이미 슬롯 안 — OK
      // 슬롯 밖(고정 텍스트/컨테이너) — anchor 이후 첫 슬롯, 없으면 마지막 슬롯으로.
      const slots = Array.from(
        root.querySelectorAll<HTMLElement>(`.${SLOT_CLASS}`),
      );
      if (slots.length === 0) return;
      const after = slots.find(
        (s) =>
          (anchor.compareDocumentPosition(s) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
      );
      caretToEnd(after ?? slots[slots.length - 1]);
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── reveal 토글 — 슬롯 텍스트 직접 갱신(정답 채움/복원) ─────────────
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    const slots = root.querySelectorAll<HTMLElement>(`.${SLOT_CLASS}`);
    slots.forEach((slot) => {
      const idx = Number(slot.dataset.blankIdx);
      const answer = slot.dataset.answer ?? "";
      if (reveal) {
        slot.textContent = answer.length > 0 ? answer : ZWSP;
        setSlotColor(slot, "correct");
      } else {
        const v = valuesRef.current.get(idx) ?? "";
        slot.textContent = v.length > 0 ? v : ZWSP;
        judgeSlot(slot, false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  // ── 편집 이벤트 (컨테이너 위임) ─────────────────────────────────────
  const onBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
    // 슬롯 밖 편집(고정 텍스트 수정) 차단.
    if (!slotFromSelection()) e.preventDefault();
  };
  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    const slot = slotFromSelection();
    if (!slot) return;
    const composing = (e.nativeEvent as InputEvent).isComposing === true;
    judgeSlot(slot, !composing);
  };
  const onCompositionStart = () => {
    composingRef.current = true;
  };
  const onCompositionEnd = () => {
    composingRef.current = false;
    const slot = slotFromSelection();
    if (slot) judgeSlot(slot, true);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    const root = editorRef.current;
    if (!root) return;
    const cur = slotFromSelection();
    const slots = Array.from(root.querySelectorAll<HTMLElement>(`.${SLOT_CLASS}`));
    const i = cur ? slots.indexOf(cur) : -1;
    const dir = e.key === "Tab" && e.shiftKey ? -1 : 1;
    const next = i < 0 ? slots[0] : slots[i + dir];
    if (next) {
      e.preventDefault();
      caretToEnd(next);
    } else if (e.key === "Enter") {
      e.preventDefault();
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2 text-xs">
        <span className="font-medium">총 빈칸 {totalBlanks}개</span>
        <span className="text-primary font-semibold">실험 렌더(v2)</span>
        <span className="text-muted-foreground">
          정답을 맞히면 초록색 · <kbd className="rounded border px-1">Enter</kbd>{" "}
          / <kbd className="rounded border px-1">Tab</kbd> 로 다음 빈칸
        </span>
        {unmappedCount > 0 ? (
          <span className="text-muted-foreground">
            (정답 미입력 {unmappedCount}개)
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant={reveal ? "default" : "outline"}
            size="sm"
            onClick={() => setReveal((v) => !v)}
            className="h-7 gap-1 text-xs"
          >
            <EyeIcon className="size-3.5" />
            {reveal ? "정답 숨기기" : "정답 모두 보기"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setReveal(false);
              setResetKey((k) => k + 1);
            }}
            className="h-7 gap-1 text-xs"
          >
            <RotateCcwIcon className="size-3.5" /> 다시 풀기
          </Button>
        </div>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={`${lawCode} 조문 빈칸 채우기`}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        data-gramm="false"
        lang="ko"
        onBeforeInput={onBeforeInput}
        onInput={onInput}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onKeyDown={onKeyDown}
        className="border-border bg-card focus-within:border-primary rounded-xl border p-4 text-[15px] whitespace-pre-wrap outline-none"
      />
    </div>
  );
}
