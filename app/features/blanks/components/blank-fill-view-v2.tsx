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

import {
  ArrowRightIcon,
  CheckIcon,
  EraserIcon,
  EyeIcon,
  LockIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
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
import {
  activeBlankIdxsForTier,
  BLANK_TIERS,
  type BlankTier,
  type ChapterTierGate,
  nextTier,
  TIER_LABEL,
  tierUnlockState,
} from "../lib/tiers";
import { deriveTierSpanBlanks } from "../lib/tier-spans";
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
      // 개정이력(<개정 …>·[전문개정 …])은 본문과 동일 폰트로 통일(작게/회색 강조 제거).
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

const CROSS_CLEAR_MS = 2500;
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
  // 원래 디자인: 코멘트(preface, amber 박스) + 참조 조문들(각 emerald 박스).
  prefaceLines: Line[];
  articleGroups: { header: string; lines: Line[] }[];
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
    if (l.subGroup) {
      if (linesHaveBlanks(l.subGroup.prefaceLines)) return true;
      for (const g of l.subGroup.articleGroups) {
        if (linesHaveBlanks(g.lines)) return true;
      }
    }
  }
  return false;
}

// 본문 끝에 분리되지 않고 박힌 raw 관련조문 방주("法 200의2①" 등, 특허법 import 잔재).
//   원래 뷰어(article-body)는 이를 추출해 관련조문 박스로 옮긴다 — 빈칸 문제에서는 관련조문을
//   숨기므로 렌더에서 잘라낸다(끝부분이라 빈칸 좌표는 그대로).
const TRAILING_LAW_REFS_RE =
  /(?:[\s,·、，/]*法\s*\d+(?:의\d+)?[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]*)+\s*$/;

// 한 블록의 inline 을 리치 세그먼트로 — 토큰 종류별 스타일 유지 + 빈칸 자리(문자단위, 크로스토큰 안전).
//   activeIdxs = 슬롯으로 만들 빈칸 idx(난이도 단계). null 이면 전부 슬롯. 비활성 빈칸은 정답이
//   본문 텍스트로 그대로 노출(가리지 않음).
function buildInlineSegs(
  block: Block,
  hits: { blank: BlankItem; start: number; end: number }[],
  blankByIdx: Map<number, BlankItem>,
  activeIdxs: ReadonlySet<number> | null,
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
  // ★관련조문(法 …) 숨김 — 빈칸 문제에서는 표시하지 않는다. 두 형태 모두 처리:
  //   (a) ref_article/ref_law 토큰("法 207①", "法 52②본문" 등, tokKind "ref")
  //   (b) 텍스트에 박힌 끝부분 raw 방주("… <개정>法 200의2①")
  //   위치 무관(뒤에 amendment_note 가 붙어도 됨) + 인접 구분자(,·、，/ 공백)까지 정리.
  const hidden = new Array(text.length).fill(false);
  for (let i = 0; i < text.length; i++) if (typeAt[i] === "ref") hidden[i] = true;
  const trailing = TRAILING_LAW_REFS_RE.exec(text);
  if (trailing) for (let i = trailing.index; i < text.length; i++) hidden[i] = true;
  const isSep = (ch: string) => /[\s,·、，/]/.test(ch);
  // 숨긴 구간에 인접(왼쪽)한 구분자도 숨겨 댕글링 ", " 를 없앤다.
  for (let i = text.length - 2; i >= 0; i--) {
    if (!hidden[i] && hidden[i + 1] && isSep(text[i])) hidden[i] = true;
  }
  // 빈칸 hit — 시작 위치 map + 덮인 구간. 비활성(상위 단계) 빈칸은 slot 을 만들지 않아
  //   정답 텍스트가 그대로 노출된다.
  const hitStart = new Map<number, { blank: BlankItem; end: number }>();
  for (const h of hits) {
    if (h.start < 0) continue;
    if (activeIdxs && !activeIdxs.has(h.blank.idx)) continue;
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
    // 같은 종류 + 같은 숨김상태 구간 묶기.
    const kind = typeAt[pos];
    const h = hidden[pos];
    let j = pos;
    while (
      j < text.length &&
      !hitStart.has(j) &&
      typeAt[j] === kind &&
      hidden[j] === h
    )
      j++;
    if (!h) {
      const s = text.slice(pos, j);
      if (s) segs.push({ t: "tok", kind, s });
    }
    pos = j;
  }
  return segs;
}

// body + blanks → 리치 라인. 블록 계층(라벨/소제목/들여쓰기) + 시행령 박스 컨텍스트 보존.
//   activeIdxs = 슬롯으로 만들 빈칸 idx(난이도 단계). null 이면 전부 슬롯.
function buildLines(
  body: ArticleBody,
  blanks: BlankItem[],
  activeIdxs: ReadonlySet<number> | null,
): Line[] {
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
      // 함께 공부할 조문 — 코멘트(preface) + 조문별 그룹으로 나눠 접이식 카드(원래 디자인).
      const prefaceLines: Line[] = [];
      for (const b of block.preface ?? []) visit(b, 0, prefaceLines);
      const articleGroups = block.articles.map((sa) => {
        const gLines: Line[] = [];
        for (const b of sa.blocks) visit(b, 0, gLines);
        return {
          header: `제${sa.number}조${sa.branch ? `의${sa.branch}` : ""} (${sa.title})`,
          lines: gLines,
        };
      });
      const hasBlanks =
        linesHaveBlanks(prefaceLines) ||
        articleGroups.some((g) => linesHaveBlanks(g.lines));
      target.push({
        depth,
        label: "",
        subtitle: null,
        segs: [],
        subGroup: {
          source: block.source,
          articleCount: block.articles.length,
          hasBlanks,
          prefaceLines,
          articleGroups,
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
    const segs = buildInlineSegs(block, hits, blankByIdx, activeIdxs);
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
  enableTiers = false,
  completedTiers,
  chapterGate,
}: {
  setId: string | null;
  autoMeta?: AutoBlankMeta;
  body: ArticleBody;
  blanks: BlankItem[];
  titleMap?: unknown;
  lawCode: LawSubjectSlug;
  // feat-2-030 — 난이도 계층(하/중/상). 커리큘럼된 내용 세트(setId)에서만 켠다.
  enableTiers?: boolean;
  completedTiers?: BlankTier[];
  // feat-2-030 S4-B — 장/편 단위 게이트(있으면 해금을 세트 아닌 장 단위로).
  chapterGate?: ChapterTierGate | null;
}) {
  const tiersOn = enableTiers && !!setId;
  const [completed, setCompleted] = useState<Set<BlankTier>>(
    () => new Set(completedTiers ?? []),
  );
  // 해금: 장 게이트가 있으면 장 단위(장 전체 통과), 없으면 세트 단위 폴백.
  const unlocked = chapterGate?.unlocked ?? tierUnlockState(completed);
  // ★기본은 항상 가장 낮은 단계(하) — 하는 언제나 해금. 상위 단계는 사용자가 직접 선택.
  //   (누적 완료 시 '상'이 기본으로 잡혀 시작하던 문제 + 상은 최상위라 완료해도 다음
  //    난이도 카운트가 안 오르던 문제를 함께 해소.)
  const [currentTier, setCurrentTier] = useState<BlankTier>(1);
  const [justPassed, setJustPassed] = useState(false);
  const submittedTierRef = useRef<Set<BlankTier>>(new Set());
  // ★상(tier 3)은 단어가 아니라 "구간" 빈칸 — 단어 빈칸 위치에서 자동 도출(10어절 캡).
  const spanBlanks = useMemo(
    () => (tiersOn ? deriveTierSpanBlanks(body, blanks) : []),
    [tiersOn, body, blanks],
  );
  // 현재 단계에서 실제로 렌더·판정할 빈칸(하/중=단어, 상=구간).
  const effectiveBlanks = useMemo(
    () => (tiersOn && currentTier === 3 ? spanBlanks : blanks),
    [tiersOn, currentTier, spanBlanks, blanks],
  );
  const answerByIdx = useMemo(
    () => new Map(effectiveBlanks.map((b) => [b.idx, b.answer ?? ""])),
    [effectiveBlanks],
  );
  const activeIdxs = useMemo(() => {
    if (!tiersOn) return null;
    if (currentTier === 3) return new Set(spanBlanks.map((b) => b.idx));
    return activeBlankIdxsForTier(blanks, currentTier);
  }, [tiersOn, blanks, spanBlanks, currentTier]);

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
  // 이월 안착 스위퍼 인터벌 id — Tab/Enter 착지 후 이월이 안착할 때까지 폴링(아래 scheduleArrivalSweep).
  const arrivalSweepRef = useRef<number | null>(null);
  // ★IME flush 용 throwaway <input>(편집영역 밖). 칸 이동 시 여기로 잠깐 포커스를 옮겨 iOS 조합을
  //   직전 칸에 확정·종료시킨다(조합 버퍼가 다음 칸으로 딸려오는 것을 원천 차단).
  const flushInputRef = useRef<HTMLInputElement>(null);
  // ★조합 중 Enter/Tab 이동을 미뤄두는 예약 슬롯 — 조합(marked text)이 살아있는 채로 caret 을
  //   옮기면 iOS 가 조합을 다음 칸으로 이월(재조합)한다. Lexical/Slate/ProseMirror 처럼 "조합 중엔
  //   caret 을 옮기지 않고 compositionend(조합 확정) 직후 이동"하는 게 iOS IME 동작과 정합.
  //   at=예약 시각(확정이 곧 오지 않으면=계속 입력 중이면 만료·취소).
  const pendingMoveRef = useRef<{ target: HTMLElement; at: number } | null>(
    null,
  );
  const PENDING_MOVE_MAX_MS = 1200;
  // ★iPad(크롬/사파리)에서 하드웨어 키보드 Enter/Tab 한 번이 keydown 을 두 번 흘려 "두 칸씩"
  //   이동하던 문제 방어 — 직전 이동 시각을 기억해 근접(70ms 내) 중복 keydown 은 무시한다.
  const lastNavAtRef = useRef(0);
  // ★한글 조합 확정 Enter/Tab 뒤에 iOS/iPad 가 흘리는 '확정 후 진짜' Enter/Tab(비조합)까지
  //   또 이동해 두 칸 넘어가는 문제 방어 — 조합 확정으로 이동을 '예약'한 시각을 기억해, 그
  //   직후 짧은 창(TRAILING_IME_NAV_MS) 안에 오는 '비조합' Enter/Tab 은 무시한다.
  const composingNavAtRef = useRef(0);
  const TRAILING_IME_NAV_MS = 500;

  const lines = useMemo(
    () => buildLines(body, effectiveBlanks, activeIdxs),
    [body, effectiveBlanks, activeIdxs],
  );
  const totalBlanks = blanks.length;
  const mappedCount = blanks.filter((b) => b.answer).length;
  const unmappedCount = totalBlanks - mappedCount;
  const activeCount = activeIdxs ? activeIdxs.size : mappedCount;

  const readSlot = (slot: HTMLElement): string =>
    (slot.textContent ?? "").split(ZWSP).join("");

  // ── 진단 로그(?imedebug=1) — 드물게 남는 이월을 실제 이벤트 순서로 '사후' 포착. iOS 타이밍을
  //   교란(이벤트마다 리렌더 = Heisenbug)하지 않도록 ref 링버퍼에만 쌓고(리렌더 없음), 오버레이는
  //   별도 인터벌로 렌더하며 '복사' 버튼으로 통째 확보한다. 각 줄에 crossClear(cc)·pendingMove(pm)·
  //   대상 슬롯 스냅샷을 함께 남겨 상태 전이(무엇이 언제 armed/consumed 됐는지)를 추적한다.
  const imeDebugRef = useRef(false);
  const [imeDebug, setImeDebug] = useState(false);
  const dbgBufRef = useRef<Array<{ t: number; s: string }>>([]);
  const dbgT0Ref = useRef(0);
  const lastSelDbgRef = useRef("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on =
      new URLSearchParams(window.location.search).get("imedebug") === "1";
    imeDebugRef.current = on;
    setImeDebug(on);
  }, []);
  const slotIdxOf = (el: HTMLElement | null | undefined): string =>
    el && el.dataset?.blankIdx != null ? `#${el.dataset.blankIdx}` : "∅";
  const pushDbg = useCallback((tag: string, extra?: string) => {
    if (!imeDebugRef.current) return;
    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : 0;
    if (dbgT0Ref.current === 0) dbgT0Ref.current = now;
    const cc = crossClear
      ? `cc${slotIdxOf(crossClear.slot)}"${crossClear.carried}"`
      : "cc-";
    const pm = pendingMoveRef.current
      ? `pm${slotIdxOf(pendingMoveRef.current.target)}`
      : "pm-";
    const buf = dbgBufRef.current;
    buf.push({
      t: now,
      s: `+${Math.round(now - dbgT0Ref.current)} ${tag} ${cc} ${pm}${extra ? ` ${extra}` : ""}`,
    });
    if (buf.length > 240) buf.shift();
  }, []);

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

  // 조문 경계/칸 전환 이월 방어 — 이 슬롯이 방금 이월 창(crossClear) 대상이면, 딸려온 carried
  //   텍스트를 제거하고 판정. 처리했으면 true.
  //   ★핵심: 부분(prefix) 이월이 아직 다 도착하지 않아 겹침이 안 잡히면(null) **가드를 소진하지
  //   않고 유지**한다. iOS 는 조합 이월을 "소"→"소멸"→"소멸시효" 처럼 점진적으로 채우거나 조합
  //   상태로 늦게 안착시켜, 첫 onInput 시점엔 아직 전체가 안 보인다. 여기서 소진하면(구버전 버그)
  //   전체가 도착했을 때 지울 가드가 없어 그대로 남는다. → 성공(제거) 또는 만료 시에만 해제.
  const stripCarryIfGuarded = (slot: HTMLElement): boolean => {
    const g = crossClear;
    if (!g || slot !== g.slot) return false;
    // ★조합(marked text) 활성 중에는 슬롯 DOM 을 절대 고치지 않는다 — iOS 는 marked text 가
    //   아직 이 자리를 가리킨다고 믿어, textContent 를 갈아끼우면 다음 프레임에 조합 글자를
    //   재삽입한다(=이월 글자가 "지울수록 더 생기는" 증상). 가드는 소진하지 말고 유지했다가
    //   compositionend(조합 확정, composingRef=false) 또는 비조합 프레임에서만 제거한다.
    if (composingRef.current) return false;
    if (typeof Date === "undefined" || Date.now() >= g.until) {
      crossClear = null; // 만료 — 해제
      return false;
    }
    if (!g.carried) {
      crossClear = null;
      return false;
    }
    const val = readSlot(slot);
    if (!val) return false; // 아직 아무것도 안 옴 — 가드 유지
    // ★이미 정답이 채워진 칸은 이월이 아니라 사용자의 실제 입력 — 절대 지우지 않는다.
    //   (빈칸을 순서 무시하고 채운 뒤 앞 칸에서 Enter 로 이동할 때, 겹치는 접두 때문에 이미
    //    채운 칸이 잘리던 버그 방지.) 가드는 해제하고 no-op.
    const answer = slot.dataset.answer ?? "";
    if (answer && normalizeAnswer(val) === normalizeAnswer(answer)) {
      crossClear = null;
      return false;
    }
    const stripped = stripLeadingOverlap(val, g.carried);
    if (stripped === null) return false; // 부분만 도착 — 가드 유지(다음 입력에서 재시도)
    slot.textContent = stripped.length ? stripped : ZWSP;
    setCaretEnd(slot);
    crossClear = null; // 전체 이월 제거 완료 — 해제
    judgeSlot(slot, false);
    return true;
  };

  // ★이월 안착 스위퍼 — Tab/Enter 로 다음 칸에 착지한 뒤, iOS 이월 조합이 언제 안착하든(즉시·
  //   지연·조합 종료 후) 짧은 창 동안 폴링하며 제거한다. 조합 중엔 손대지 않고(조합 파괴 방지)
  //   settle 된 프레임에만 stripCarryIfGuarded 를 시도. 제거 성공/가드 소멸/만료 시 정지.
  const scheduleArrivalSweep = (slot: HTMLElement) => {
    if (typeof window === "undefined") return;
    if (arrivalSweepRef.current != null) {
      window.clearInterval(arrivalSweepRef.current);
      arrivalSweepRef.current = null;
    }
    const stop = (id: number) => {
      window.clearInterval(id);
      if (arrivalSweepRef.current === id) arrivalSweepRef.current = null;
    };
    const id = window.setInterval(() => {
      if (!crossClear || crossClear.slot !== slot) return stop(id);
      if (Date.now() >= crossClear.until) {
        crossClear = null;
        return stop(id);
      }
      // ★조합 중이면 stripCarryIfGuarded 가 내부에서 no-op(가드 유지) — marked text 와 싸우지
      //   않으려고 조합 확정(compositionend) 후 프레임에서만 실제 제거한다. 폴링은 그때까지 유지.
      if (stripCarryIfGuarded(slot)) return stop(id);
    }, 60);
    arrivalSweepRef.current = id as unknown as number;
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
    const flush = flushInputRef.current;
    const land = () => {
      caretToEnd(target);
      scrollBlankIntoViewIfNeeded(target);
    };
    if (!target.isConnected) {
      land();
      return;
    }
    // ★iOS IME 잠복 버퍼 flush — 직전 칸 조합이 IME 버퍼에 잠복한 채 다음 칸으로 딸려오면,
    //   DOM 에 안 보여 sink/스위퍼가 못 잡고 다음 칸에서 backspace 를 누르는 순간 직전 답이
    //   튀어나와 지워진다. blur·contentEditable 토글로는 iOS 가 버퍼를 유지 → **편집영역 밖의
    //   실제 <input> 에 잠깐 포커스**를 옮겨 조합을 직전 칸(현재 캐럿 위치)에 **확정·종료**시킨다
    //   (다른 텍스트 필드로의 포커스 이동 = 조합 커밋의 가장 강한 신호, input 이라 소프트 키보드
    //   유지). caret 은 직전 칸 끝에 있으므로 조합은 직전 칸에 올바로 커밋된다(drainToSink 안 함
    //   — sink 로 옮기면 직전 칸 마지막 음절이 sink 로 새어 손실될 수 있음).
    if (flush) flush.focus({ preventScroll: true });
    // 다음 프레임 — sink 잔여 폐기 후 목표 칸 재포커스·착지.
    requestAnimationFrame(() => {
      if (sink) sink.textContent = ZWSP;
      land();
    });
  };

  // ★조합 확정(compositionend) 직후 예약된 이동 실행 — 이 시점엔 marked text 가 사라져
  //   caret 을 옮겨도 이월이 없다(조합 중 이동 금지의 짝). 예약이 너무 오래됐으면(계속 입력 중)
  //   버린다. host.focus 는 caretToEnd 안에서 수행.
  const flushPendingMove = () => {
    const pm = pendingMoveRef.current;
    if (!pm) return;
    pendingMoveRef.current = null;
    const stale =
      typeof Date !== "undefined" && Date.now() - pm.at > PENDING_MOVE_MAX_MS;
    if (stale || !pm.target.isConnected) {
      pushDbg("pmFlush.skip", `${slotIdxOf(pm.target)} ${stale ? "stale" : "detached"}`);
      return;
    }
    pushDbg("pmFlush.move", slotIdxOf(pm.target));
    caretToEnd(pm.target);
    scrollBlankIntoViewIfNeeded(pm.target);
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
        "display:inline-flex;align-items:center;gap:6px;border:1px solid var(--bk-em-border);background:var(--bk-em-box-bg);border-radius:9999px;padding:3px 12px;cursor:pointer;font-size:12px;font-weight:700;color:var(--bk-em-text);line-height:1.2;";
      pill.textContent = `📜 함께 공부할 조문 · ${sg.source} · ${sg.articleCount}개`;

      const card = document.createElement("div");
      // 원래 디자인: 은은한 emerald 틴트 배경 + emerald 테두리(라이트/다크 테마 대응 변수).
      card.style.cssText =
        "position:relative;margin:0.5rem 0;border:1px solid var(--bk-em-border);border-radius:12px;padding:16px 14px 14px;background:var(--bk-em-card-bg);color:var(--card-foreground);";
      const badge = document.createElement("button");
      badge.type = "button";
      badge.contentEditable = "false";
      badge.title = "접기";
      badge.style.cssText =
        "position:absolute;top:-11px;left:12px;display:inline-flex;align-items:center;gap:4px;background:#059669;color:#fff;border:none;border-radius:9999px;padding:2px 10px;font-size:10.5px;font-weight:800;letter-spacing:0.05em;cursor:pointer;line-height:1.4;";
      badge.textContent = `📜 함께 공부할 조문 · ${sg.articleCount}개`;
      const src = document.createElement("p");
      src.contentEditable = "false";
      src.style.cssText = "margin:2px 0 0;color:var(--muted-foreground);font-size:11px;";
      src.textContent = sg.source;
      const content = document.createElement("div");
      content.style.cssText = "margin-top:10px;display:flex;flex-direction:column;gap:8px;";
      // 코멘트(preface) — amber 박스.
      if (sg.prefaceLines.length > 0) {
        const pbox = document.createElement("div");
        pbox.style.cssText =
          "border:1px solid var(--bk-amber-border);background:var(--bk-amber-bg);border-radius:8px;padding:8px 12px;";
        const plabel = document.createElement("p");
        plabel.contentEditable = "false";
        plabel.textContent = "코멘트";
        plabel.style.cssText =
          "margin:0 0 4px;color:var(--muted-foreground);font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;";
        pbox.appendChild(plabel);
        for (const il of sg.prefaceLines) pbox.appendChild(buildLineEl(il));
        content.appendChild(pbox);
      }
      // 참조 조문 — 각 emerald 박스(헤더 + 내용).
      for (const g of sg.articleGroups) {
        const abox = document.createElement("div");
        abox.style.cssText =
          "border:1px solid var(--bk-em-box-border);background:var(--bk-em-box-bg);border-radius:8px;padding:8px 12px;";
        const ahead = document.createElement("p");
        ahead.contentEditable = "false";
        ahead.textContent = g.header;
        ahead.style.cssText =
          "margin:0 0 2px;color:var(--bk-em-text);font-size:12px;font-weight:700;";
        abox.appendChild(ahead);
        for (const il of g.lines) abox.appendChild(buildLineEl(il));
        content.appendChild(abox);
      }
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
          // 인라인 강조 라벨은 원래 뷰어처럼 괄호 자동 추가:
          //   subtitle→(X), annotation→[X], ordinance(시행령·시행규칙)→(X).
          s.textContent =
            seg.kind === "subtitle"
              ? `(${seg.s})`
              : seg.kind === "annotation"
                ? `[${seg.s}]`
                : seg.kind === "ordinance"
                  ? seg.s.startsWith("(") && seg.s.endsWith(")")
                    ? seg.s
                    : `(${seg.s})`
                  : seg.s;
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

  // ── 언마운트 시 안착 스위퍼 인터벌 정리 ─────────────────────────────
  useEffect(() => {
    return () => {
      if (arrivalSweepRef.current != null && typeof window !== "undefined") {
        window.clearInterval(arrivalSweepRef.current);
        arrivalSweepRef.current = null;
      }
    };
  }, []);

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
        // 슬롯 간 캐럿 이동만 기록(같은 슬롯 연속 selectionchange 는 dedupe — 버퍼 범람 방지).
        const selKey = slotIdxOf(inSlot);
        if (selKey !== lastSelDbgRef.current) {
          lastSelDbgRef.current = selKey;
          pushDbg("sel", `${selKey} v="${readSlot(inSlot)}"`);
        }
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
          crossPrev.value &&
          readSlot(inSlot) === "" // ★이미 채워진 칸엔 걸지 않음(순서 무시 입력 삭제 방지)
        ) {
          crossClear = {
            slot: inSlot,
            carried: crossPrev.value,
            until: Date.now() + CROSS_CLEAR_MS,
          };
          pushDbg("ccArm@sel", `${slotIdxOf(inSlot)} carried="${crossPrev.value}"`);
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
      pushDbg(
        "beforeinput",
        `${(e.inputType || "").toLowerCase()} comp=${e.isComposing} s=${slotIdxOf(startSlot)} v="${startSlot ? readSlot(startSlot) : "∅"}"`,
      );
      // 선택 양끝이 같은 슬롯 안이 아니면(고정 텍스트/컨테이너/두 슬롯 걸침) 모든 편집 차단.
      if (!startSlot || startSlot !== endSlot) {
        e.preventDefault();
        return;
      }
      const it = (e.inputType || "").toLowerCase();
      // ★★iPad 이월 근본 차단 — "조합 중(isComposing) + 실제 내용이 빈 슬롯에서 삭제".
      //   iOS 는 직전 칸 조합을 버퍼에 물고 있다가, 다음(빈) 칸에서 backspace 를 누르는 순간
      //   그 버퍼를 이 칸에 재구현(직전 답이 튀어나옴)한다. 빈 슬롯 삭제는 원래 no-op 이므로,
      //   이 순간을 막고(ZWSP 유지) 이월 버퍼가 실체화되지 못하게 한다. 이 칸에서 실제로 조합
      //   중이면(readSlot 비어있지 않음) 통과 → 정상 한글 자모 삭제 보존.
      if (it.startsWith("delete") && e.isComposing && readSlot(startSlot) === "") {
        e.preventDefault();
        if (startSlot.textContent !== ZWSP) startSlot.textContent = ZWSP;
        if (crossClear && crossClear.slot === startSlot) crossClear = null;
        return;
      }
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

  // ── feat-2-030 난이도 단계 통과 ─────────────────────────────────────
  //   현재 단계 활성 빈칸을 전부 맞히면 서버에 통과 요청(재검증) → 다음 단계 해금.
  const submitTierComplete = (tier: BlankTier) => {
    if (!tiersOn || !setId || !activeIdxs) return;
    // 현재 단계 활성 idx(상=구간 idx). tier 는 항상 currentTier 라 activeIdxs 와 일치.
    const answers: Record<string, string> = {};
    for (const idx of activeIdxs)
      answers[String(idx)] = valuesRef.current.get(idx) ?? "";
    const fd = new FormData();
    fd.set("setId", setId);
    fd.set("tier", String(tier));
    fd.set("answers", JSON.stringify(answers));
    void fetch("/api/blanks/tier-complete", { method: "POST", body: fd })
      .then((r) => r.json())
      .then((j: { passed?: boolean; completedTiers?: number[] }) => {
        if (!j?.passed) return;
        setCompleted((prev) => {
          const n = new Set(prev);
          for (const t of j.completedTiers ?? [tier]) {
            if (t === 1 || t === 2 || t === 3) n.add(t as BlankTier);
          }
          return n;
        });
        setJustPassed(true);
      })
      .catch(() => {});
  };
  const maybeCompleteTier = () => {
    if (!tiersOn || !activeIdxs || activeIdxs.size === 0) return;
    if (submittedTierRef.current.has(currentTier)) return;
    for (const idx of activeIdxs) {
      const ans = answerByIdx.get(idx) ?? "";
      const val = valuesRef.current.get(idx) ?? "";
      if (ans.length === 0 || normalizeAnswer(val) !== normalizeAnswer(ans)) return;
    }
    submittedTierRef.current.add(currentTier);
    submitTierComplete(currentTier);
  };
  const changeTier = (t: BlankTier) => {
    if (!unlocked[t] || t === currentTier) return;
    submittedTierRef.current = new Set();
    setJustPassed(false);
    setReveal(false);
    setCurrentTier(t);
    setResetKey((k) => k + 1);
  };

  // ── 틀린 곳만 다시 — 맞힌 칸(초록)은 유지, 오답 칸만 비워 재도전. 첫 오답 칸으로 포커스.
  //   DOM 을 재빌드하지 않고 슬롯만 직접 갱신(맞힌 칸 보존). 빈 칸은 그대로 둔다.
  const resetWrongOnly = () => {
    const root = editorRef.current;
    if (!root) return;
    setReveal(false);
    let firstWrong: HTMLElement | null = null;
    root.querySelectorAll<HTMLElement>(`.${SLOT_CLASS}`).forEach((slot) => {
      const idx = Number(slot.dataset.blankIdx);
      const answer = slot.dataset.answer ?? "";
      const val = readSlot(slot);
      if (val.length === 0) return; // 아직 안 푼 칸은 그대로
      if (normalizeAnswer(val) === normalizeAnswer(answer)) return; // 맞힌 칸 유지
      valuesRef.current.set(idx, "");
      slot.textContent = ZWSP;
      setSlotColor(slot, "neutral");
      if (!firstWrong) firstWrong = slot;
    });
    if (firstWrong) caretToEnd(firstWrong);
  };

  // ── 편집 이벤트 (컨테이너 위임) ─────────────────────────────────────
  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    const slot = slotFromSelection();
    if (!slot) {
      // ★캐럿이 sink(가상 빈칸)에 있는데 이월이 흘러든 경우 = 도착 후 즉시 폐기.
      const sink = sinkRef.current;
      const sel = window.getSelection();
      const anchor = sel?.anchorNode ?? null;
      if (
        sink &&
        anchor &&
        (sink === anchor || sink.contains(anchor)) &&
        readSlot(sink).length > 0
      ) {
        sink.textContent = ZWSP;
        setCaretEnd(sink);
      }
      return;
    }
    const ne = e.nativeEvent as InputEvent;
    const composing = ne.isComposing === true;
    const isDelete = (ne.inputType || "").toLowerCase().startsWith("delete");
    pushDbg(
      "input",
      `${(ne.inputType || "").toLowerCase()} comp=${composing} ${slotIdxOf(slot)} v="${readSlot(slot)}"`,
    );
    // ★이월 도착 제거 — **조합이 끝난(비조합) 프레임에서만** 실행한다. 조합(marked text) 활성
    //   중에 slot.textContent 를 갈아끼우면 iOS 가 다음 프레임에 조합 글자를 재삽입해 "지울수록
    //   앞 칸 글자가 더 생기는" 증상이 된다. 조합 중엔 가드(crossClear)를 소진하지 말고 유지했다가
    //   onCompositionEnd→stripCarryIfGuarded 가 확정 후 정리한다. 두 형태 처리:
    //   (a) stripLeadingOverlap — 겹치는 이월분만 제거(실입력 보존).
    //   (b) delete 로 재구현된 직전 답의 앞부분 조각(carried 의 prefix) — 통째로 비운다.
    if (
      !composing &&
      crossClear &&
      crossClear.slot === slot &&
      typeof Date !== "undefined" &&
      Date.now() < crossClear.until &&
      // ★이미 정답이 채워진 칸이면 이월이 아니라 실제 입력 — 스트립하지 않는다(순서 무시 입력 보호).
      normalizeAnswer(readSlot(slot)) !==
        normalizeAnswer(slot.dataset.answer ?? " ")
    ) {
      const carried = crossClear.carried;
      const val = readSlot(slot);
      const overlap = val ? stripLeadingOverlap(val, carried) : null;
      if (overlap !== null) {
        pushDbg("input.strip", `${slotIdxOf(slot)} "${val}"→"${overlap}" carried="${carried}"`);
        slot.textContent = overlap.length ? overlap : ZWSP;
        setCaretEnd(slot);
        crossClear = null;
        judgeSlot(slot, false);
        maybeCompleteTier();
        return;
      }
      if (isDelete && val && carried.startsWith(val)) {
        // backspace 로 튀어나온 직전 답 조각 — 사용자 눈엔 빈 칸이었으므로 통째로 제거.
        pushDbg("input.nukeFrag", `${slotIdxOf(slot)} "${val}" carried="${carried}"`);
        slot.textContent = ZWSP;
        setCaretEnd(slot);
        crossClear = null;
        return;
      }
    }
    judgeSlot(slot, !composing);
    // 슬롯이 완전히 비면(모든 글자 삭제) 캐럿 안착용 ZWSP 복원 — inline-block 붕괴·캐럿
    //   유실 방지. 조합 중엔 건드리지 않는다.
    if (!composing && slot.textContent === "") {
      slot.textContent = ZWSP;
      setCaretEnd(slot);
    }
    if (!composing) maybeCompleteTier();
  };
  const onCompositionStart = () => {
    composingRef.current = true;
    compStartSlotRef.current = slotFromSelection();
    pushDbg("compStart", slotIdxOf(compStartSlotRef.current));
  };
  const onCompositionEnd = () => {
    composingRef.current = false;
    // ★compositionend 직후에는 DOM 을 절대 건드리지 않는다 — iOS Safari 는 compositionend 뒤에
    //   trailing beforeinput/input(insertFromComposition) 을 흘리는 경우가 있어, 여기서
    //   slot.textContent 를 바꾸면 늦게 온 input 이 그 수정을 덮어쓴다. 그래서 지금은 슬롯 참조만
    //   캡처하고, 실제 판정·이월 스트립(DOM 수정)·예약 이동을 rAF 로 미룬다(trailing input 안착·
    //   paint 후). 슬롯은 요소 참조라 rAF 시점에도 유효(DOM 재빌드 없음).
    const endSlot = slotFromSelection();
    const startSlot = compStartSlotRef.current;
    compStartSlotRef.current = null;
    pushDbg(
      "compEnd",
      `end=${slotIdxOf(endSlot)} start=${slotIdxOf(startSlot)} drift=${!!(startSlot && startSlot !== endSlot)} v="${endSlot ? readSlot(endSlot) : "∅"}"`,
    );

    // 조합-확정 처리(이월 드리프트/스트립/판정) — DOM 수정 포함이라 rAF 로 미룬다. 조기 return
    //   있으므로 IIFE 로 감싸고, 그 뒤 예약 이동을 실행한다.
    const commit = () => {
      (() => {
        const slot = endSlot;
        if (!slot) return;
        // ★조합 중 다른 칸 터치로 조합이 이 슬롯으로 이월된 경우(시작 슬롯≠종료 슬롯) —
        //   딸려온 접두(직전 칸 값의 접미)를 제거하고, 직전 칸 값은 복원한다.
        if (startSlot && startSlot !== slot) {
          const startIdx = Number(startSlot.dataset.blankIdx);
          const carried = valuesRef.current.get(startIdx) ?? readSlot(startSlot);
          if (carried) {
            // ★도착 슬롯이 이미 자기 정답으로 완성돼 있으면 이월이 아니라 실제 입력 — 스트립
            //   금지(이전 칸과 같은 단어가 정답일 때 완성 칸이 지워지던 버그 방지).
            const endAns = slot.dataset.answer ?? "";
            const endVal = readSlot(slot);
            const endComplete =
              endAns.length > 0 &&
              normalizeAnswer(endVal) === normalizeAnswer(endAns);
            const stripped = endComplete
              ? null
              : stripLeadingOverlap(endVal, carried);
            pushDbg(
              "compEnd.drift",
              `${slotIdxOf(startSlot)}→${slotIdxOf(slot)} v="${endVal}" carried="${carried}" complete=${endComplete} stripped=${stripped === null ? "-" : `"${stripped}"`}`,
            );
            if (stripped !== null) {
              slot.textContent = stripped.length ? stripped : ZWSP;
            }
            // 이월로 직전 칸의 마지막 음절이 빠졌을 수 있어 값 복원.
            if (readSlot(startSlot) !== carried) startSlot.textContent = carried;
            judgeSlot(startSlot, true);
            setCaretEnd(slot);
            judgeSlot(slot, true);
            // 드리프트로 이 슬롯을 이미 정리했으니 도착-가드/스위퍼는 해제(중복 개입 방지).
            if (crossClear && crossClear.slot === slot) crossClear = null;
            maybeCompleteTier();
            return;
          }
        }
        // ★조문 경계/비조합 이월 = 딸려온 조합이 이 슬롯에서 끝남 → carried 텍스트 제거 후 종료.
        if (stripCarryIfGuarded(slot)) return;
        judgeSlot(slot, true);
        maybeCompleteTier();
      })();
      // 판정·스트립 다음에 예약 이동 — marked text 없고 trailing input 도 안착한 시점.
      flushPendingMove();
    };

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(commit);
    } else {
      commit();
    }
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // 조합 중 Enter/Tab 으로 예약해 둔 이동은, 그 사이 '다른 키'(글자·삭제 등)를 누르면 취소한다 —
    //   사용자가 계속 입력 중이면 이동 의도가 아니고, compositionend 지연으로 캐럿이 늦게 튀는 것 방지.
    //   Enter/Tab 은 예약을 설정/유지하므로 제외.
    if (e.key !== "Enter" && e.key !== "Tab") pendingMoveRef.current = null;
    // ★★iPad 이월 원천 차단(핵심) — "빈 슬롯에서 Backspace" 를 keydown 에서 취소한다.
    //   iOS 는 직전 칸 조합을 버퍼에 물고 있다가 backspace(삭제) 가 있을 때만 이 칸에 한 음절씩
    //   뱉어낸다(직전 답이 backspace마다 나타남). 빈 칸 backspace 는 원래 지울 게 없어 no-op 이므로,
    //   keydown 에서 기본동작을 막으면 iOS 가 버퍼를 뱉을 기회 자체가 사라진다. keydown 은
    //   beforeinput 보다 확실히 취소된다. 실제 입력이 있는 칸(readSlot 비어있지 않음)은 통과.
    const isBackspace =
      e.key === "Backspace" || e.keyCode === 8 || e.which === 8;
    if (isBackspace) {
      const curSlot = slotFromSelection();
      if (curSlot) {
        const val = readSlot(curSlot);
        pushDbg(
          "keydown.BS",
          `comp=${composingRef.current} ${slotIdxOf(curSlot)} v="${val}"`,
        );
        if (val === "") {
          e.preventDefault();
          if (curSlot.textContent !== ZWSP) curSlot.textContent = ZWSP;
          setCaretEnd(curSlot);
          pushDbg("keydown.BS.blockEmpty", slotIdxOf(curSlot));
          return;
        }
        // ★이월 버퍼 materialization — 이 칸 내용이 이월 가드(carried)의 접미사이고 자기 정답은
        //   아니면(=사용자 입력이 아니라 직전 칸 잔여가 뱉어진 것) backspace 로 한 글자씩 뱉게 두지
        //   말고 통째로 지운다(가드 해제). 132조 등에서 "지울수록 앞 글자가 계속 나오는" 증상 차단.
        const g = crossClear;
        const answer = curSlot.dataset.answer ?? "";
        if (
          g &&
          g.slot === curSlot &&
          g.carried &&
          g.carried.endsWith(val) &&
          normalizeAnswer(val) !== normalizeAnswer(answer)
        ) {
          e.preventDefault();
          pushDbg("keydown.BS.nukeBuf", `${slotIdxOf(curSlot)} "${val}"`);
          curSlot.textContent = ZWSP;
          setCaretEnd(curSlot);
          crossClear = null;
          return;
        }
      }
      return;
    }
    if (e.key !== "Enter" && e.key !== "Tab") return;
    // ★이중 이동 방어(iPad) — 한 번의 키 입력이 keydown 을 두 번 흘리면 근접 중복을 무시.
    //   (사람의 개별 탭은 70ms 보다 훨씬 느리므로 정상 이동은 영향 없음.)
    const nowNav = Date.now();
    if (nowNav - lastNavAtRef.current < 70) {
      e.preventDefault();
      return;
    }
    // ★IME 확정 후 트레일링 Enter/Tab 삼키기 — 한글 조합을 확정하는 Enter/Tab(조합 중)로
    //   아래에서 이동을 예약한 직후, iOS/iPad 는 '확정 후 진짜' Enter/Tab(비조합)을 한 번 더
    //   흘린다. 그 두 번째 이벤트로 또 이동하면 두 칸 넘어가므로, 조합 확정 이동 예약 시각부터
    //   짧은 창 안의 '비조합' Enter/Tab 은 무시한다(정상 연속 입력은 그보다 느림).
    if (
      !composingRef.current &&
      nowNav - composingNavAtRef.current < TRAILING_IME_NAV_MS
    ) {
      e.preventDefault();
      composingNavAtRef.current = 0;
      return;
    }
    lastNavAtRef.current = nowNav;
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
      // ★★근본 수정 — 조합(marked text) 중이면 지금 caret 을 옮기지 않는다. 옮기면 iOS 가 조합을
      //   다음 칸으로 이월(재조합)한다. 이동을 예약만 하고, Enter/Tab 이 유발하는 IME commit 의
      //   compositionend 직후(flushPendingMove)에 실제로 이동한다. (Lexical/Slate/ProseMirror 패턴)
      if (composingRef.current) {
        pendingMoveRef.current = { target: next, at: Date.now() };
        // ★확정 후 트레일링 Enter/Tab 을 삼키기 위한 기준 시각(위 가드 참조).
        composingNavAtRef.current = nowNav;
        pushDbg("pmSet", `${e.key} ${slotIdxOf(cur)}→${slotIdxOf(next)}`);
        return;
      }
      // 비조합 — marked text 없음. 즉시 이동. (직전 칸 latent 버퍼 대비 crossClear/sweep 보조 유지)
      //   ★이월 가드는 '다음 칸이 비어 있을 때만' 건다 — 이미 채워진 칸이면 그 내용은 이월이
      //   아니라 사용자가 순서 무시하고 먼저 채운 실제 입력이므로, 가드를 걸면 겹치는 접두가
      //   지워진다(순서 무시 입력 삭제 버그).
      const curVal = cur ? readSlot(cur) : "";
      const nextEmpty = readSlot(next) === "";
      if (curVal && nextEmpty) {
        crossClear = {
          slot: next,
          carried: curVal,
          until: Date.now() + CROSS_CLEAR_MS,
        };
        pushDbg("ccArm@move", `${slotIdxOf(next)} carried="${curVal}"`);
      }
      pushDbg("move", `${e.key} ${slotIdxOf(cur)}→${slotIdxOf(next)} nextEmpty=${nextEmpty}`);
      focusViaSink(next);
      if (nextEmpty) scheduleArrivalSweep(next);
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

  const allDone =
    completed.has(1) && completed.has(2) && completed.has(3);
  const nt = nextTier(currentTier);
  // 장 게이트 진행률(하/중) — 로컬 통과분 +1 보정(loader 값은 이번 통과 반영 전).
  const chapterProgress = (tier: BlankTier): { done: number; total: number } | null => {
    if (!chapterGate || (tier !== 1 && tier !== 2)) return null;
    const base = tier === 1 ? chapterGate.tier1Sets : chapterGate.tier2Sets;
    const newlyPassed =
      completed.has(tier) && !(completedTiers ?? []).includes(tier);
    return {
      done: Math.min(chapterGate.totalSets, base + (newlyPassed ? 1 : 0)),
      total: chapterGate.totalSets,
    };
  };
  const gateLabel = chapterGate?.chapterLabel ?? "이 장";

  return (
    <div className="space-y-4">
      {/* ★IME flush 용 throwaway input — 화면 밖(포커스만 받고 안 보임). 칸 이동 시 여기로 포커스를
          잠깐 옮겨 iOS 조합을 직전 칸에 확정·종료(조합 버퍼 이월 원천 차단). 텍스트 필드라 소프트
          키보드 유지, tabIndex=-1 로 Tab 순회 제외. */}
      <input
        ref={flushInputRef}
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        inputMode="text"
        autoComplete="off"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
          border: 0,
          padding: 0,
          zIndex: -1,
        }}
      />
      {tiersOn ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">난이도</span>
          <div className="bg-muted inline-flex items-center rounded-lg p-[3px]">
            {BLANK_TIERS.map((t) => {
              const isCur = t === currentTier;
              const isLocked = !unlocked[t];
              const isDone = completed.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={isLocked}
                  onClick={() => changeTier(t)}
                  aria-pressed={isCur}
                  title={
                    isLocked
                      ? chapterGate
                        ? `${gateLabel} 모든 조문의 ${TIER_LABEL[(t - 1) as BlankTier]}를 통과하면 열립니다`
                        : "이전 단계를 통과하면 열립니다"
                      : TIER_LABEL[t]
                  }
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md px-3 text-xs font-semibold transition-colors",
                    isCur
                      ? "bg-background text-link shadow-sm"
                      : "text-muted-foreground",
                    isLocked
                      ? "cursor-not-allowed opacity-45"
                      : "hover:text-foreground",
                  )}
                >
                  {isLocked ? (
                    <LockIcon className="size-3" />
                  ) : isDone ? (
                    <CheckIcon className="size-3 text-emerald-500" />
                  ) : null}
                  {TIER_LABEL[t]}
                </button>
              );
            })}
          </div>
          {allDone ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <CheckIcon className="size-3.5" /> 완전 암기
            </span>
          ) : null}
        </div>
      ) : null}

      {tiersOn && justPassed ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-700/50 dark:bg-emerald-950/30">
          <span className="font-bold text-emerald-700 dark:text-emerald-300">
            ✓ {TIER_LABEL[currentTier]} 단계 통과!
          </span>
          {nt && unlocked[nt] ? (
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => changeTier(nt)}
            >
              {TIER_LABEL[nt]} 단계 도전 <ArrowRightIcon className="size-3.5" />
            </Button>
          ) : nt && chapterGate ? (
            // 장 게이트 — 이 단계는 통과했지만 장 전체가 아직. 진행률 안내.
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
              {gateLabel}의 다른 조문도 {TIER_LABEL[currentTier]}를 통과하면{" "}
              {TIER_LABEL[nt]} 단계가 열립니다
              {chapterProgress(currentTier)
                ? ` · ${TIER_LABEL[currentTier]} ${chapterProgress(currentTier)!.done}/${chapterProgress(currentTier)!.total}`
                : ""}
            </span>
          ) : (
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
              🎉 이 조문 완전 암기 완료!
            </span>
          )}
        </div>
      ) : null}

      <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2 text-xs">
        <span className="font-medium">
          {tiersOn
            ? `${TIER_LABEL[currentTier]} 단계 · 빈칸 ${activeCount}개`
            : `총 빈칸 ${totalBlanks}개`}
        </span>
        <span className="text-muted-foreground">
          정답을 맞히면 초록색 · <kbd className="rounded border px-1">Enter</kbd>{" "}
          / <kbd className="rounded border px-1">Tab</kbd> 로 다음 빈칸
        </span>
        {!tiersOn && unmappedCount > 0 ? (
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
            variant="outline"
            size="sm"
            onClick={resetWrongOnly}
            className="h-7 gap-1 text-xs"
            title="맞힌 칸은 그대로 두고 틀린 칸만 비웁니다"
          >
            <EraserIcon className="size-3.5" /> 틀린 곳만 다시
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
      {imeDebug ? <ImeDebugOverlay bufRef={dbgBufRef} /> : null}
    </div>
  );
}

// ?imedebug=1 진단 오버레이 — ref 링버퍼를 인터벌로 스냅샷 렌더(IME 이벤트와 렌더를 분리해
//   타이밍 교란 방지). '복사'는 textarea+execCommand(iOS Safari 에서 가장 확실) 로 전체 로그 확보.
function ImeDebugOverlay({
  bufRef,
}: {
  bufRef: React.MutableRefObject<Array<{ t: number; s: string }>>;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      setLines(bufRef.current.slice(-26).map((e) => e.s));
    }, 300);
    return () => window.clearInterval(id);
  }, [bufRef]);
  const copy = () => {
    const text = bufRef.current.map((e) => e.s).join("\n");
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    if (!ok && navigator.clipboard) void navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  const btn: React.CSSProperties = {
    background: "#334",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 11,
    cursor: "pointer",
  };
  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 9999,
        width: 340,
        maxWidth: "92vw",
        maxHeight: "46vh",
        overflow: "auto",
        background: "rgba(0,0,0,0.86)",
        color: "#9edcff",
        font: "10px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: 8,
        borderRadius: 8,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          marginBottom: 6,
          position: "sticky",
          top: 0,
        }}
      >
        <span style={{ color: "#fff", fontWeight: 700 }}>
          IME log ({bufRef.current.length})
        </span>
        <button type="button" style={btn} onClick={copy}>
          {copied ? "복사됨" : "복사"}
        </button>
        <button
          type="button"
          style={btn}
          onClick={() => {
            bufRef.current.length = 0;
            setLines([]);
          }}
        >
          지우기
        </button>
      </div>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}
