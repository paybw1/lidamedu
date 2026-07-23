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
// ★이월 방어는 슬롯 단위(에디터 단위 아님) — 같은 조문 안의 빈칸→빈칸 이동에서도 iOS 가
//   직전 칸의 마지막 조합 음절을 다음 칸으로 딸려보내는 현상이 있어, 조문 경계뿐 아니라
//   모든 슬롯 전환에서 방어한다.
let crossPrev: { slot: HTMLElement; value: string } | null = null;
let crossClear: { slot: HTMLElement; carried: string; until: number } | null =
  null;

// carried 의 접미사와 val 의 접두사가 겹치는 최장 구간을 찾아 val 앞에서 제거.
//   전체 이월("사회질서")·부분 이월(마지막 음절 "명")을 모두 처리. 겹침 없으면 null.
function stripLeadingOverlap(val: string, carried: string): string | null {
  const max = Math.min(val.length, carried.length);
  for (let k = max; k >= 1; k--) {
    if (val.slice(0, k) === carried.slice(carried.length - k)) {
      return val.slice(k);
    }
  }
  return null;
}

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
interface SubGroupData {
  source: string;
  articleCount: number;
  hasBlanks: boolean;
  innerLines: Line[];
}
interface Line {
  depth: number;
  label: string;
  subtitle: string | null;
  // 특수 라인(비편집 컨텍스트) — 있으면 heading/box 로 렌더.
  heading?: string;
  context?: string;
  // 함께 공부할 조문 — 접이식 카드로 렌더(원래 디자인 유지). 있으면 이 라인은 그룹 전체.
  subGroup?: SubGroupData;
  segs: Seg[];
}

// 라인 트리에 편집 가능한 빈칸(slot)이 하나라도 있는지.
function linesHaveBlanks(ls: Line[]): boolean {
  for (const l of ls) {
    if (l.segs.some((s) => s.t === "blank")) return true;
    if (l.subGroup && linesHaveBlanks(l.subGroup.innerLines)) return true;
  }
  return false;
}

// 본문 끝에 분리되지 않고 박힌 raw 관련조문 방주("法 200의2①" 등, 특허법 import 잔재).
//   원래 뷰어(article-body)는 이를 추출해 관련조문 박스로 옮긴다 — 빈칸 문제에서는 관련조문을
//   숨기므로 렌더에서 잘라낸다(끝부분이라 빈칸 좌표는 그대로).
const TRAILING_LAW_REFS_RE =
  /(?:[\s,·、，/]*法\s*\d+(?:의\d+)?[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]*)+\s*$/;

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
  // 끝에 박힌 관련조문 방주는 렌더 대상에서 제외(빈칸은 그 앞이라 좌표 무관).
  const trailing = TRAILING_LAW_REFS_RE.exec(text);
  const renderLen = trailing ? trailing.index : text.length;
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
  while (pos < renderLen) {
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
    while (j < renderLen && !hitStart.has(j) && typeAt[j] === kind) j++;
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
  const visit = (block: Block, depth: number, target: Line[]) => {
    if (block.kind === "title_marker") {
      target.push({ depth, label: "", subtitle: null, heading: block.text, segs: [] });
      return;
    }
    if (block.kind === "header_refs") {
      // ★빈칸 문제에서는 관련조문(header_refs) 나열을 표시하지 않는다(암기 방해·불필요).
      return;
    }
    if (block.kind === "sub_article_group") {
      // 함께 공부할 조문 — 내부 라인을 따로 만들어 접이식 카드로(원래 디자인) 렌더.
      const inner: Line[] = [];
      for (const b of block.preface ?? []) visit(b, 0, inner);
      for (const sa of block.articles) {
        inner.push({
          depth: 0,
          label: "",
          subtitle: null,
          context: `제${sa.number}조${sa.branch ? `의${sa.branch}` : ""} (${sa.title})`,
          segs: [],
        });
        for (const b of sa.blocks) visit(b, 1, inner);
      }
      target.push({
        depth,
        label: "",
        subtitle: null,
        segs: [],
        subGroup: {
          source: block.source,
          articleCount: block.articles.length,
          hasBlanks: linesHaveBlanks(inner),
          innerLines: inner,
        },
      });
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
      target.push({ depth, label, subtitle, segs });
    }
    if (block.kind === "clause" || block.kind === "item" || block.kind === "sub") {
      for (const c of block.children) visit(c, depth + 1, target);
    }
  };
  for (const b of body.blocks) visit(b, 0, lines);
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
  // 조합이 시작된 슬롯 — 조합 중 다른 칸을 터치하면 iOS 가 조합을 그 칸으로 옮겨(이월)
  //   compositionend 가 다른 슬롯에서 발생한다. 시작≠종료 슬롯이면 이월로 판정해 제거.
  const compStartSlotRef = useRef<HTMLElement | null>(null);
  // ★이월 "흘려버리기" sink — 빈칸이 아닌 버리는 캐럿 자리. 다음 칸으로 이동하기 전에 캐럿을
  //   여기 잠깐 들르게 하면, 조합 이월이 이 sink 에서 확정(compositionend)·폐기되고 다음 칸은
  //   깨끗하게 안착한다. (SLOT_CLASS 아님 → 판정/드리프트 로직이 무시)
  const sinkRef = useRef<HTMLElement | null>(null);

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
    const stripped = stripLeadingOverlap(val, carried);
    if (stripped === null) return false;
    slot.textContent = stripped.length ? stripped : ZWSP;
    setCaretEnd(slot);
    judgeSlot(slot, false);
    return true;
  };

  const judgeSlot = (slot: HTMLElement, save: boolean) => {
    const idx = Number(slot.dataset.blankIdx);
    const answer = slot.dataset.answer ?? "";
    const val = readSlot(slot);
    valuesRef.current.set(idx, val);
    // 마지막으로 입력된 슬롯 값 기억(다음 칸 이월 감지용 — 슬롯 단위).
    if (val.length > 0) {
      crossPrev = { slot, value: val };
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

  // ★이월 흘려버리기 — 다음 칸으로 이동하기 전에 캐럿을 sink 에 잠깐 들르게 한다. 조합 이월이
  //   있으면 sink 에서 확정(compositionend)·폐기되고, 다음 프레임에 목표 칸으로 깨끗하게 이동.
  //   sink 없거나 이 에디터 밖 target 이면 그냥 바로 이동(안전한 폴백).
  const drainToSink = () => {
    const sink = sinkRef.current;
    if (!sink) return;
    sink.textContent = ZWSP;
    caretToEnd(sink);
  };
  // 이동 대상 빈칸이 화면 밖(상·하단 마진 안쪽 포함)이면 화면 중앙으로 부드럽게 스크롤.
  //   이미 보이면 아무것도 하지 않는다(불필요한 스크롤 방지).
  const scrollBlankIntoViewIfNeeded = (el: HTMLElement) => {
    if (typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const margin = 96; // 상단 sticky 헤더·하단 키보드 여유
    if (rect.top < margin || rect.bottom > vh - margin) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };
  const focusViaSink = (target: HTMLElement) => {
    const sink = sinkRef.current;
    const land = () => {
      caretToEnd(target);
      scrollBlankIntoViewIfNeeded(target);
    };
    if (!sink || !target.isConnected) {
      land();
      return;
    }
    drainToSink();
    // 다음 프레임 — sink 로 흘러든 이월분 폐기 후 실제 칸으로.
    requestAnimationFrame(() => {
      sink.textContent = ZWSP;
      land();
    });
  };

  // ── DOM 빌드 (mount / reset / body 변경) ─────────────────────────────
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    root.innerHTML = "";
    valuesRef.current = new Map();
    savedRef.current = new Set();

    // 함께 공부할 조문 — 원래(article-body) emerald 접이식 디자인 재현. 접힘=알약 버튼,
    //   펼침=카드. 내부(참조 조문·빈칸)는 buildLineEl 로 렌더(빈칸 있으면 기본 펼침).
    const buildSubGroup = (host: HTMLElement, sg: SubGroupData) => {
      host.style.margin = "0.6rem 0";
      let open = sg.hasBlanks;
      const pill = document.createElement("button");
      pill.type = "button";
      pill.contentEditable = "false";
      pill.style.cssText =
        "display:inline-flex;align-items:center;gap:6px;border:1px solid #a7f3d0;background:#ecfdf5;border-radius:9999px;padding:3px 12px;cursor:pointer;font-size:12px;font-weight:700;color:#065f46;line-height:1.2;";
      pill.textContent = `📜 함께 공부할 조문 · ${sg.source} · ${sg.articleCount}개`;

      const card = document.createElement("div");
      card.style.cssText =
        "position:relative;margin:0.5rem 0;border:1px solid #a7f3d0;border-radius:12px;padding:16px 14px 14px;background:var(--card,#ffffff);";
      const badge = document.createElement("button");
      badge.type = "button";
      badge.contentEditable = "false";
      badge.title = "접기";
      badge.style.cssText =
        "position:absolute;top:-11px;left:12px;display:inline-flex;align-items:center;gap:4px;background:#059669;color:#fff;border:none;border-radius:9999px;padding:2px 10px;font-size:10.5px;font-weight:800;letter-spacing:0.05em;cursor:pointer;line-height:1.4;";
      badge.textContent = `📜 함께 공부할 조문 · ${sg.articleCount}개`;
      const src = document.createElement("p");
      src.contentEditable = "false";
      src.style.cssText = "margin:2px 0 0;color:#64748b;font-size:11px;";
      src.textContent = sg.source;
      const content = document.createElement("div");
      content.style.cssText = "margin-top:10px;";
      for (const il of sg.innerLines) content.appendChild(buildLineEl(il));
      card.appendChild(badge);
      card.appendChild(src);
      card.appendChild(content);

      const render = () => {
        pill.style.display = open ? "none" : "inline-flex";
        card.style.display = open ? "block" : "none";
      };
      const stop = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
      };
      pill.addEventListener("pointerdown", stop);
      pill.addEventListener("mousedown", stop);
      pill.addEventListener("click", (e) => {
        stop(e);
        open = true;
        render();
      });
      badge.addEventListener("pointerdown", stop);
      badge.addEventListener("mousedown", stop);
      badge.addEventListener("click", (e) => {
        stop(e);
        open = false;
        render();
      });
      render();
      host.appendChild(pill);
      host.appendChild(card);
    };

    const buildLineEl = (line: Line): HTMLElement => {
      const lineEl = document.createElement("div");
      lineEl.className = "blank-line-v2";
      lineEl.style.lineHeight = "2.1";
      if (line.depth > 0) lineEl.style.paddingLeft = `${line.depth * 1.1}rem`;

      if (line.subGroup) {
        buildSubGroup(lineEl, line.subGroup);
        return lineEl;
      }
      // 특수 라인 — 비편집 heading/컨텍스트 박스(소제목표제 등).
      if (line.heading) {
        lineEl.style.marginTop = "0.4rem";
        const h = document.createElement("span");
        h.contentEditable = "false";
        h.textContent = line.heading;
        h.style.fontWeight = "700";
        lineEl.appendChild(h);
        return lineEl;
      }
      if (line.context) {
        const c = document.createElement("span");
        c.contentEditable = "false";
        c.textContent = line.context;
        c.style.color = "#047857";
        c.style.fontSize = "0.9em";
        c.style.fontWeight = "600";
        lineEl.appendChild(c);
        return lineEl;
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
      return lineEl;
    };

    for (const line of lines) root.appendChild(buildLineEl(line));
    // ★이월 흘려버리기 sink — 편집 컨테이너 안의 비-빈칸 캐럿 자리(안 보이게, 1px). 칸 이동 시
    //   여기 잠깐 들러 조합 이월을 확정·폐기시킨다. contentEditable 은 컨테이너에서 상속.
    const sink = document.createElement("span");
    sink.className = "blank-sink-v2";
    sink.setAttribute("aria-hidden", "true");
    sink.textContent = ZWSP;
    sink.style.display = "inline-block";
    sink.style.width = "1px";
    sink.style.height = "1px";
    sink.style.overflow = "hidden";
    sink.style.opacity = "0";
    sink.style.color = "transparent";
    sink.style.caretColor = "transparent";
    sink.style.verticalAlign = "bottom";
    root.appendChild(sink);
    sinkRef.current = sink;
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
      // sink(이월 흘려버리기 자리)에 캐럿이 있으면 스냅 금지 — 여기 잠깐 머물러 이월을
      //   확정시킨 뒤 focusViaSink 가 목표 칸으로 옮긴다. 스냅하면 sink 가 무력화됨.
      const sink = sinkRef.current;
      if (sink && (sink === anchor || sink.contains(anchor))) return;
      const inSlot = isInSlot(anchor, root);
      if (inSlot) {
        // ★다른 조문(에디터)의 슬롯에서 이 에디터의 슬롯으로 캐럿이 진입 = 조문 경계 넘음
        //   (커서 이동으로 넘어간 뒤 직전 값이 통째로 딸려오는 경우). 직전 슬롯 값을 이월
        //   방어 창으로 등록. 같은 조문 안의 칸 전환은 여기서 arming 하지 않는다 — 정상 입력을
        //   이월로 오인(첫 글자 겹침)할 수 있고, 같은 조문 내 이월은 compositionEnd 이월 감지가
        //   조합이 실제로 다른 칸에서 끝났을 때만 정확히 처리한다.
        const prevEditor = crossPrev?.slot.closest('[contenteditable="true"]');
        if (
          crossPrev &&
          crossPrev.slot !== inSlot &&
          prevEditor !== root &&
          crossPrev.value
        ) {
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

  // ── 삭제 경계 가드 (네이티브 beforeinput) ───────────────────────────
  //   ★React 의 onBeforeInput 은 삭제 inputType 에 신뢰성이 낮아(삽입 위주 폴리필) 네이티브
  //   리스너로 직접 처리. 삽입·삭제 모두 "선택 양끝이 같은 슬롯 안" 이 아니면 차단해
  //   삭제가 슬롯 경계를 넘어 앞/뒤 고정 텍스트(본문)를 지우지 못하게 한다.
  useEffect(() => {
    const root = editorRef.current;
    if (!root || typeof window === "undefined") return;
    // 슬롯 실제 텍스트(ZWSP 제외) 상 (container, offset) 위치 — 다중 텍스트노드·ZWSP 위치 무관.
    const realPosOf = (
      slot: HTMLElement,
      container: Node,
      offset: number,
    ): number => {
      const pre = document.createRange();
      pre.selectNodeContents(slot);
      try {
        pre.setEnd(container, offset);
      } catch {
        return 0;
      }
      return pre.toString().split(ZWSP).join("").length;
    };
    // 슬롯을 `ZWSP + realText` 단일 텍스트노드로 재구성하고 캐럿을 real 위치에 놓는다.
    const rebuildSlot = (
      slot: HTMLElement,
      realText: string,
      realCaret: number,
    ) => {
      slot.textContent = realText.length ? ZWSP + realText : ZWSP;
      const tn = slot.firstChild;
      const sel = window.getSelection();
      if (!sel || !tn) return;
      const r = document.createRange();
      const tnLen = tn.textContent?.length ?? 1;
      r.setStart(tn, Math.min(1 + Math.max(0, realCaret), tnLen));
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    };
    const handler = (e: InputEvent) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        e.preventDefault();
        return;
      }
      const range = sel.getRangeAt(0);
      // ★sink(이월 흘려버리기 자리) 안 편집은 허용 — 이월 조합이 sink 에서 확정돼야 다음 칸이
      //   깨끗해진다. sink 는 슬롯이 아니라 아래 슬롯 가드에 걸리므로 먼저 통과시킨다.
      const sink = sinkRef.current;
      if (sink && (sink === range.startContainer || sink.contains(range.startContainer))) {
        return;
      }
      const startSlot = isInSlot(range.startContainer, root);
      const endSlot = isInSlot(range.endContainer, root);
      // 선택 양끝이 같은 슬롯 안이 아니면(고정 텍스트/컨테이너/두 슬롯 걸침) 모든 편집 차단.
      if (!startSlot || startSlot !== endSlot) {
        e.preventDefault();
        return;
      }
      const it = (e.inputType || "").toLowerCase();
      // ★삭제는 전부 수동 처리(선택 삭제·backspace·delete·word/line 모두) — 슬롯 실제
      //   텍스트만 편집하고 항상 `ZWSP+텍스트`로 재구성한다. 이렇게 하면 (a) 앞/뒤 고정 텍스트
      //   침범 불가, (b) 빈 슬롯도 ZWSP 로 남아 브라우저가 빈 inline 요소를 제거(=빈칸 사라짐)
      //   하지 못한다. 조합 상태 판정은 stuck 되기 쉬운 ref 대신 이벤트 isComposing 사용.
      if (it.startsWith("delete") && !e.isComposing) {
        e.preventDefault();
        const realText = readSlot(startSlot);
        if (!sel.isCollapsed) {
          // 선택 범위 삭제 — 슬롯 안 real 구간 제거.
          const rs = realPosOf(startSlot, range.startContainer, range.startOffset);
          const re = realPosOf(startSlot, range.endContainer, range.endOffset);
          const a = Math.min(rs, re);
          const b = Math.max(rs, re);
          rebuildSlot(startSlot, realText.slice(0, a) + realText.slice(b), a);
          judgeSlot(startSlot, false);
          return;
        }
        const caret = realPosOf(startSlot, range.startContainer, range.startOffset);
        const backward = it.includes("backward");
        const wide = it.includes("word") || it.includes("line");
        let newText = realText;
        let newCaret = caret;
        if (backward) {
          if (caret > 0) {
            if (wide) {
              newText = realText.slice(caret);
              newCaret = 0;
            } else {
              newText = realText.slice(0, caret - 1) + realText.slice(caret);
              newCaret = caret - 1;
            }
          }
        } else if (caret < realText.length) {
          newText = wide
            ? realText.slice(0, caret)
            : realText.slice(0, caret) + realText.slice(caret + 1);
        }
        rebuildSlot(startSlot, newText, newCaret);
        judgeSlot(startSlot, false);
        return;
      }
    };
    root.addEventListener("beforeinput", handler);
    return () => root.removeEventListener("beforeinput", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 편집 이벤트 (컨테이너 위임) ─────────────────────────────────────
  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    const slot = slotFromSelection();
    if (!slot) return;
    const composing = (e.nativeEvent as InputEvent).isComposing === true;
    // 조합이 아닌 이월(붙여넣기식 삽입 등)도 도착 후 제거.
    if (!composing && stripCarryIfGuarded(slot)) return;
    judgeSlot(slot, !composing);
    // 슬롯이 완전히 비면(모든 글자 삭제) 캐럿 안착용 ZWSP 복원 — inline-block 붕괴·캐럿
    //   유실 방지. 조합 중엔 건드리지 않는다.
    if (!composing && slot.textContent === "") {
      slot.textContent = ZWSP;
      setCaretEnd(slot);
    }
  };
  const onCompositionStart = () => {
    composingRef.current = true;
    compStartSlotRef.current = slotFromSelection();
  };
  const onCompositionEnd = () => {
    composingRef.current = false;
    const slot = slotFromSelection();
    const startSlot = compStartSlotRef.current;
    compStartSlotRef.current = null;
    if (!slot) return;
    // ★조합 중 다른 칸 터치로 조합이 이 슬롯으로 이월된 경우(시작 슬롯≠종료 슬롯) —
    //   딸려온 접두(직전 칸 값의 접미)를 제거하고, 직전 칸 값은 복원한다.
    if (startSlot && startSlot !== slot) {
      const startIdx = Number(startSlot.dataset.blankIdx);
      const carried = valuesRef.current.get(startIdx) ?? readSlot(startSlot);
      if (carried) {
        const stripped = stripLeadingOverlap(readSlot(slot), carried);
        if (stripped !== null) {
          slot.textContent = stripped.length ? stripped : ZWSP;
        }
        // 이월로 직전 칸의 마지막 음절이 빠졌을 수 있어 값 복원.
        if (readSlot(startSlot) !== carried) startSlot.textContent = carried;
        judgeSlot(startSlot, true);
        setCaretEnd(slot);
        judgeSlot(slot, true);
        return;
      }
    }
    // ★조문 경계/비조합 이월 = 딸려온 조합이 이 슬롯에서 끝남 → carried 텍스트 제거 후 종료.
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
      // ★sink 경유 이동 — 조합 이월을 sink 에서 흘려버리고 다음 칸으로(키보드 Tab/Enter).
      focusViaSink(next);
    } else if (e.key === "Enter") {
      e.preventDefault();
    }
  };
  // ★터치로 "다른 빈칸"을 누를 때(조합 중)만 — 브라우저가 탭 위치로 캐럿을 놓기 전에 sink 로
  //   흘려 조합 이월을 sink 에서 확정·폐기. 같은 칸 재터치·버튼 등 비-빈칸 터치는 흘리지 않아
  //   캐럿이 sink 에 고립돼 삭제·입력이 먹통 되는 것을 막는다.
  const onPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!composingRef.current) return;
    const sink = sinkRef.current;
    if (!sink) return;
    const tgtSlot =
      e.target instanceof Element
        ? e.target.closest(`.${SLOT_CLASS}`)
        : null;
    const curSlot = slotFromSelection();
    if (!tgtSlot || tgtSlot === curSlot) return;
    drainToSink();
    requestAnimationFrame(() => {
      sink.textContent = ZWSP;
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2 text-xs">
        <span className="font-medium">총 빈칸 {totalBlanks}개</span>
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
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onKeyDown={onKeyDown}
        onPointerDownCapture={onPointerDownCapture}
        className="border-border bg-card focus-within:border-primary rounded-xl border p-4 text-[15px] whitespace-pre-wrap outline-none"
      />
    </div>
  );
}
