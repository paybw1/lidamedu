// 빈칸 모드 V2 프로토타입 (feat-4-A-130b, ?blankv2=1 게이트) — iOS IME 이월 근본 해결 실험.
//
// 근본 아이디어: 빈칸마다 별개 <input>(요소 간 blur/focus로 iOS 조합 잔여 이월) 대신
//   본문 전체를 **하나의 contenteditable 컨테이너**로 렌더. 고정 텍스트=contenteditable=false,
//   빈칸만 편집 가능 구역. 칸 이동 = 한 요소 안 캐럿 이동(blur/focus 없음) → 넘어갈 다른
//   요소가 없어 이월이 구조적으로 불가능.
//
// P1 범위: 단일 조문 + 순수 텍스트 블록. 리치 토큰(관련조문 링크·표)은 평문으로 렌더(P2에서 보강).
// DOM은 명령형으로 빌드해 React 재조정이 편집 중 DOM을 덮어쓰지 않게 한다(uncontrolled).

import { EyeIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

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
    if (text.length === 0 && hits.length === 0) return; // header_refs 등 빈 블록 skip
    const label =
      block.kind === "clause" || block.kind === "item" || block.kind === "sub"
        ? block.label
        : "";
    const segs: Seg[] = [];
    let cursor = 0;
    for (const h of hits) {
      const start = Math.max(0, Math.min(text.length, h.start));
      const end = Math.max(0, Math.min(text.length, h.end));
      if (h.start < 0) continue; // 이전 블록에서 시작한 hit — skip
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

const SLOT_BASE =
  "blank-slot-v2 inline-block min-w-[3ch] rounded border-b-2 border-muted-foreground/40 bg-muted/30 px-1 text-center align-baseline outline-none focus:border-primary";

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
  // titleMap 은 V2 평문 렌더에서 미사용(P2 리치 렌더에서 도입).
  titleMap?: unknown;
  lawCode: LawSubjectSlug;
}) {
  const [reveal, setReveal] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  // 사용자가 입력한 값(idx→값) — reveal 토글 복원용.
  const valuesRef = useRef<Map<number, string>>(new Map());
  // 이미 정답 저장(attempt)한 idx — 중복 submit 방지.
  const savedRef = useRef<Set<number>>(new Set());

  const lines = useMemo(() => buildLines(body, blanks), [body, blanks]);
  const totalBlanks = blanks.length;
  const mappedCount = blanks.filter((b) => b.answer).length;
  const unmappedCount = totalBlanks - mappedCount;

  const readSlot = (slot: HTMLElement): string =>
    (slot.textContent ?? "").split(ZWSP).join("");

  const saveAttempt = (slot: HTMLElement, idx: number, input: string) => {
    if (savedRef.current.has(idx)) return;
    savedRef.current.add(idx);
    const fd = new FormData();
    if (setId) {
      fd.set("setId", setId);
      fd.set("blankIdx", String(idx));
      fd.set("userInput", input);
      fetcherRef.current.submit(fd, {
        method: "post",
        action: "/api/blanks/attempt",
      });
      return;
    }
    const bi = slot.dataset.blockIndex;
    const co = slot.dataset.cumOffset;
    if (autoMeta && bi != null && co != null) {
      fd.set("articleId", autoMeta.articleId);
      fd.set("blankType", autoMeta.blankType);
      fd.set("blockIndex", bi);
      fd.set("cumOffset", co);
      fd.set("answer", slot.dataset.answer ?? "");
      fd.set("userInput", input);
      fetcherRef.current.submit(fd, {
        method: "post",
        action: "/api/blanks/auto-attempt",
      });
    }
  };

  // 슬롯 판정 + 색상 반영(직접 class 조작 — React 재렌더 없이). save=true 면 정답 시 attempt 저장.
  const judgeSlot = (slot: HTMLElement, save: boolean) => {
    const idx = Number(slot.dataset.blankIdx);
    const answer = slot.dataset.answer ?? "";
    const val = readSlot(slot);
    valuesRef.current.set(idx, val);
    slot.classList.remove(
      "border-emerald-500",
      "bg-emerald-50",
      "border-rose-500",
      "bg-rose-50",
    );
    if (val.length === 0) return;
    const correct = normalizeAnswer(val) === normalizeAnswer(answer);
    if (correct) {
      slot.classList.add("border-emerald-500", "bg-emerald-50");
      if (save) saveAttempt(slot, idx, val);
    } else {
      slot.classList.add("border-rose-500", "bg-rose-50");
    }
  };

  const slotFromSelection = (): HTMLElement | null => {
    if (typeof window === "undefined") return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== editorRef.current) {
      if (
        node instanceof HTMLElement &&
        node.classList.contains("blank-slot-v2")
      ) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  };

  const caretToEnd = (slot: HTMLElement) => {
    if (typeof window === "undefined") return;
    // 캐럿 소유자는 컨테이너(단일 편집 host) — 슬롯 자체는 편집 host 가 아니다.
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(slot);
    range.collapse(false); // 끝으로
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
      lineEl.className = "blank-line-v2 leading-8";
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
          // ★개별 contenteditable 를 주지 않는다(주면 요소별 편집 host 가 되어 이월 재발).
          //   컨테이너가 편집 host, 고정 텍스트만 false → 편집 가능한 '구멍'은 슬롯뿐.
          b.className = SLOT_BASE;
          b.dataset.blankIdx = String(seg.idx);
          b.dataset.answer = seg.answer;
          if (seg.blockIndex != null)
            b.dataset.blockIndex = String(seg.blockIndex);
          if (seg.cumOffset != null) b.dataset.cumOffset = String(seg.cumOffset);
          b.style.minWidth = `${Math.max(3, Math.min(30, (seg.answer.length || 2) * 1.6))}ch`;
          b.textContent = ZWSP; // 캐럿 안착용 zero-width space
          lineEl.appendChild(b);
        }
      }
      root.appendChild(lineEl);
    }
  }, [lines, resetKey]);

  // ── reveal 토글 — 슬롯 텍스트 직접 갱신(정답 채움/복원) ─────────────
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    const slots = root.querySelectorAll<HTMLElement>(".blank-slot-v2");
    slots.forEach((slot) => {
      const idx = Number(slot.dataset.blankIdx);
      const answer = slot.dataset.answer ?? "";
      slot.classList.remove(
        "border-emerald-500",
        "bg-emerald-50",
        "border-rose-500",
        "bg-rose-50",
        "text-emerald-700",
      );
      if (reveal) {
        slot.textContent = answer.length > 0 ? answer : ZWSP;
        slot.classList.add("border-emerald-500", "bg-emerald-50", "text-emerald-700");
      } else {
        const v = valuesRef.current.get(idx) ?? "";
        slot.textContent = v.length > 0 ? v : ZWSP;
        judgeSlot(slot, false);
      }
    });
    // reveal 은 사용자 버튼(조합 중 아님)이라 DOM 직접 갱신 안전.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  // ── 편집 이벤트 (컨테이너 위임) ─────────────────────────────────────
  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    const slot = slotFromSelection();
    if (!slot) return;
    // 조합 중이면 판정만(값 되돌림·DOM 덮어쓰기 금지), 저장은 조합 종료 후.
    const composing = (e.nativeEvent as InputEvent).isComposing === true;
    judgeSlot(slot, !composing);
  };
  const onCompositionEnd = () => {
    const slot = slotFromSelection();
    if (slot) judgeSlot(slot, true);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    // Enter/Tab = 다음 빈칸으로 캐럿 이동(같은 컨테이너 안 — blur/focus 없음).
    const root = editorRef.current;
    if (!root) return;
    const cur = slotFromSelection();
    const slots = Array.from(
      root.querySelectorAll<HTMLElement>(".blank-slot-v2"),
    );
    const i = cur ? slots.indexOf(cur) : -1;
    const dir = e.key === "Tab" && e.shiftKey ? -1 : 1;
    const next = slots[i + dir];
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
        onInput={onInput}
        onCompositionEnd={onCompositionEnd}
        onKeyDown={onKeyDown}
        className="border-border bg-card focus-within:border-primary rounded-xl border p-4 text-[15px] leading-8 whitespace-pre-wrap outline-none"
      />
    </div>
  );
}
