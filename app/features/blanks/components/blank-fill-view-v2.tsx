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

import type { Block, Inline } from "~/features/laws/lib/article-body";

import {
  blockCumulativeText,
  computeBlockBlankHits,
  inlineTokenContent,
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

// ★조문(에디터) 경계 이월 방어 — 전 에디터 공유 모듈 상태.
//   iOS 는 조문 A 에서 조합 중이던 텍스트를 조문 B 로 넘어가는 순간(host 변경) 그대로
//   딸려보낸다(within-article 단일 host 는 이월 없음). 막기 어려우니 **도착 후 지운다**:
//   마지막으로 입력된 슬롯의 값(carried)을 기억했다가, 다른 에디터의 새 슬롯에 캐럿이
//   진입하면 짧은 창(window) 을 열고, 그 창 안에 그 슬롯이 carried 텍스트를 머금으면 제거.
// 인라인 토큰 종류별 비편집 스타일(article-body 렌더 정책과 대략 일치). 관련조문=점선 밑줄
//   primary, 강사 라벨(annotation)=앰버, 소제목=파랑, 시행령=앰버, 개정주기=회색 작게.
function applyTokStyle(
  el: HTMLElement,
  kind: "text" | "underline" | "subtitle" | "annotation" | "ordinance" | "amendment" | "ref",
): void {
  switch (kind) {
    case "underline":
      el.style.textDecoration = "underline";
      break;
    case "subtitle":
      el.style.color = "#2563eb";
      el.style.fontWeight = "600";
      break;
    case "annotation":
      el.style.backgroundColor = "rgba(245,158,11,0.18)";
      el.style.color = "#92400e";
      el.style.borderRadius = "3px";
      el.style.padding = "0 2px";
      el.style.fontSize = "0.92em";
      break;
    case "ordinance":
      el.style.color = "#b45309";
      break;
    case "amendment":
      el.style.color = "#94a3b8";
      el.style.fontSize = "0.85em";
      break;
    case "ref":
      el.style.color = "var(--primary, #4f46e5)";
      el.style.textDecoration = "underline dotted";
      el.style.textUnderlineOffset = "2px";
      break;
    default:
      break;
  }
}

const CROSS_CLEAR_MS = 1500;
let crossPrev: { editor: HTMLElement; value: string } | null = null;
let crossClear: { slot: HTMLElement; carried: string; until: number } | null =
  null;

// 인라인 토큰 종류 → 세그먼트 kind(스타일 결정).
type TokKind =
  | "text"
  | "underline"
  | "subtitle"
  | "annotation"
  | "ordinance"
  | "amendment"
  | "ref";
function tokKind(t: Inline): TokKind {
  switch (t.type) {
    case "underline":
      return "underline";
    case "subtitle":
      return "subtitle";
    case "annotation":
      return "annotation";
    case "ordinance_ref":
      return "ordinance";
    case "amendment_note":
      return "amendment";
    case "ref_article":
    case "ref_law":
      return "ref";
    default:
      return "text";
  }
}

type Seg =
  | { t: "tok"; kind: TokKind; s: string }
  | {
      t: "blank";
      idx: number;
      answer: string;
      blockIndex?: number;
      cumOffset?: number;
    };
interface Line {
  depth: number;
  label: string;
  subtitle: string | null;
  // 특수 라인(비편집 컨텍스트) — 있으면 heading/box 로 렌더.
  heading?: string;
  context?: string;
  segs: Seg[];
}

// 한 블록의 inline 을 리치 세그먼트로 — 토큰 종류별 스타일 유지 + 빈칸 자리(문자단위, 크로스토큰 안전).
function buildInlineSegs(
  block: Block,
  hits: { blank: BlankItem; start: number; end: number }[],
  blankByIdx: Map<number, BlankItem>,
): Seg[] {
  if (
    block.kind !== "clause" &&
    block.kind !== "item" &&
    block.kind !== "sub" &&
    block.kind !== "para"
  ) {
    return [];
  }
  const text = blockCumulativeText(block);
  if (text.length === 0) return [];
  // 문자별 토큰 종류.
  const typeAt: TokKind[] = new Array(text.length).fill("text");
  {
    let pos = 0;
    for (const tok of block.inline) {
      const c = inlineTokenContent(tok);
      const k = tokKind(tok);
      for (let i = 0; i < c.length && pos + i < text.length; i++) {
        typeAt[pos + i] = k;
      }
      pos += c.length;
    }
  }
  // 빈칸 hit — 시작 위치 map + 덮인 구간.
  const hitStart = new Map<number, { blank: BlankItem; end: number }>();
  for (const h of hits) {
    if (h.start < 0) continue;
    const s = Math.max(0, Math.min(text.length, h.start));
    const e = Math.max(0, Math.min(text.length, h.end));
    if (!hitStart.has(s)) hitStart.set(s, { blank: h.blank, end: e });
  }
  const segs: Seg[] = [];
  let pos = 0;
  while (pos < text.length) {
    const hit = hitStart.get(pos);
    if (hit) {
      const bi = blankByIdx.get(hit.blank.idx);
      segs.push({
        t: "blank",
        idx: hit.blank.idx,
        answer: hit.blank.answer,
        blockIndex: bi?.blockIndex ?? undefined,
        cumOffset: bi?.cumOffset ?? undefined,
      });
      pos = Math.max(pos + 1, hit.end);
      continue;
    }
    const kind = typeAt[pos];
    let j = pos;
    while (j < text.length && !hitStart.has(j) && typeAt[j] === kind) j++;
    const s = text.slice(pos, j);
    if (s) segs.push({ t: "tok", kind, s });
    pos = j;
  }
  return segs;
}

// body + blanks → 리치 라인. 블록 계층(라벨/소제목/들여쓰기) + 시행령 박스 컨텍스트 보존.
function buildLines(body: ArticleBody, blanks: BlankItem[]): Line[] {
  const blockHits = computeBlockBlankHits(body, blanks);
  const blankByIdx = new Map(blanks.map((b) => [b.idx, b]));
  const lines: Line[] = [];
  const visit = (block: Block, depth: number) => {
    if (block.kind === "title_marker") {
      lines.push({ depth, label: "", subtitle: null, heading: block.text, segs: [] });
      return;
    }
    if (block.kind === "header_refs") {
      const s = block.refs.map(inlineTokenContent).join(" ").trim();
      if (s) lines.push({ depth, label: "", subtitle: null, context: s, segs: [] });
      return;
    }
    if (block.kind === "sub_article_group") {
      lines.push({
        depth,
        label: "",
        subtitle: null,
        heading: `함께 공부할 조문 · ${block.source}`,
        segs: [],
      });
      for (const b of block.preface ?? []) visit(b, depth + 1);
      for (const sa of block.articles) {
        lines.push({
          depth: depth + 1,
          label: "",
          subtitle: null,
          context: `제${sa.number}조${sa.branch ? `의${sa.branch}` : ""} (${sa.title})`,
          segs: [],
        });
        for (const b of sa.blocks) visit(b, depth + 1);
      }
      return;
    }
    const label =
      block.kind === "clause" || block.kind === "item" || block.kind === "sub"
        ? block.label
        : "";
    const subtitle =
      (block.kind === "clause" ||
        block.kind === "item" ||
        block.kind === "sub") &&
      block.subtitle
        ? block.subtitle
        : null;
    const hits = (blockHits.get(block) ?? []).slice().sort((a, b) => a.start - b.start);
    const segs = buildInlineSegs(block, hits, blankByIdx);
    if (segs.length > 0 || label || subtitle) {
      lines.push({ depth, label, subtitle, segs });
    }
    if (block.kind === "clause" || block.kind === "item" || block.kind === "sub") {
      for (const c of block.children) visit(c, depth + 1);
    }
  };
  for (const b of body.blocks) visit(b, 0);
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

  const setCaretEnd = (slot: HTMLElement) => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(slot);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // 조문 경계 이월 방어 — 이 슬롯이 방금 이월 창(crossClear) 대상이면, 딸려온 carried
  //   텍스트를 제거하고 판정. 처리했으면 true. (조합 종료 후 호출 — 마크드 텍스트 아님)
  const stripCarryIfGuarded = (slot: HTMLElement): boolean => {
    if (
      !crossClear ||
      slot !== crossClear.slot ||
      typeof Date === "undefined" ||
      Date.now() >= crossClear.until
    ) {
      return false;
    }
    const carried = crossClear.carried;
    crossClear = null; // 한 번만 개입
    if (!carried) return false;
    const val = readSlot(slot);
    if (!val.includes(carried)) return false;
    const cleaned = val.split(carried).join("");
    slot.textContent = cleaned.length ? cleaned : ZWSP;
    setCaretEnd(slot);
    judgeSlot(slot, false);
    return true;
  };

  const judgeSlot = (slot: HTMLElement, save: boolean) => {
    const idx = Number(slot.dataset.blankIdx);
    const answer = slot.dataset.answer ?? "";
    const val = readSlot(slot);
    valuesRef.current.set(idx, val);
    // 마지막으로 입력된 슬롯 값 기억(다음 조문 이월 감지용).
    if (val.length > 0 && editorRef.current) {
      crossPrev = { editor: editorRef.current, value: val };
    }
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
    // ★대상 빈칸이 속한 편집영역에 포커스 — 다른 조문(에디터)으로 넘어가는 이동도 지원.
    const host = slot.closest('[contenteditable="true"]');
    if (host instanceof HTMLElement) host.focus();
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
      if (line.depth > 0) lineEl.style.paddingLeft = `${line.depth * 1.1}rem`;

      // 특수 라인 — 비편집 heading/컨텍스트 박스(시행령 그룹·소제목표제·관련조문).
      if (line.heading) {
        lineEl.style.marginTop = "0.4rem";
        const h = document.createElement("span");
        h.contentEditable = "false";
        h.textContent = line.heading;
        h.style.fontWeight = "700";
        lineEl.appendChild(h);
        root.appendChild(lineEl);
        continue;
      }
      if (line.context) {
        const c = document.createElement("span");
        c.contentEditable = "false";
        c.textContent = line.context;
        c.style.color = "#64748b";
        c.style.fontSize = "0.9em";
        lineEl.appendChild(c);
        root.appendChild(lineEl);
        continue;
      }

      if (line.label) {
        const lab = document.createElement("span");
        lab.contentEditable = "false";
        lab.textContent = line.label + " ";
        lab.style.fontWeight = "600";
        lineEl.appendChild(lab);
      }
      if (line.subtitle) {
        const st = document.createElement("span");
        st.contentEditable = "false";
        st.textContent = `(${line.subtitle}) `;
        st.style.color = "#2563eb";
        st.style.fontWeight = "600";
        lineEl.appendChild(st);
      }
      for (const seg of line.segs) {
        if (seg.t === "tok") {
          const s = document.createElement("span");
          s.contentEditable = "false";
          s.textContent = seg.s;
          applyTokStyle(s, seg.kind);
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
      const inSlot = isInSlot(anchor, root);
      if (inSlot) {
        // ★다른 조문(에디터)에서 이 에디터의 슬롯으로 캐럿이 진입 = 조문 경계 넘음.
        //   직전 입력 슬롯 값(carried)을 이월 방어 창으로 등록 → 딸려온 텍스트를 도착 후 제거.
        if (crossPrev && crossPrev.editor !== root && crossPrev.value) {
          crossClear = {
            slot: inSlot,
            carried: crossPrev.value,
            until: Date.now() + CROSS_CLEAR_MS,
          };
        }
        return; // 이미 슬롯 안 — 스냅 불필요
      }
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
    // 조합이 아닌 이월(붙여넣기식 삽입 등)도 도착 후 제거.
    if (!composing && stripCarryIfGuarded(slot)) return;
    judgeSlot(slot, !composing);
  };
  const onCompositionStart = () => {
    composingRef.current = true;
  };
  const onCompositionEnd = () => {
    composingRef.current = false;
    const slot = slotFromSelection();
    if (!slot) return;
    // ★조문 경계 이월 = 딸려온 조합이 이 슬롯에서 끝남 → carried 텍스트 제거 후 종료.
    if (stripCarryIfGuarded(slot)) return;
    judgeSlot(slot, true);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    const cur = slotFromSelection();
    // ★문서 전체 빈칸을 읽기 순서로 — 한 조문의 마지막 칸에서 Tab/Enter 면 다음 조문
    //   첫 빈칸으로 넘어간다(장 뷰어 다중 조문). 단일 조문이면 자기 빈칸만 나온다.
    const slots = Array.from(
      document.querySelectorAll<HTMLElement>(`.${SLOT_CLASS}`),
    );
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
