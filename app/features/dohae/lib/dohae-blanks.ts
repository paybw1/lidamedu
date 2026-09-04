// feat-2-037 S1 — 도해 빈칸 학습 모드의 **순수 로직**(서버·클라 공용).
//
//   유형 1 = 기출문제에서 논의된 말 · 유형 2 = 정오문제(OX)에서 논의된 말 · 유형 3 = 1 ∪ 2
//
// 이 파일이 하는 일은 셋이다 — ①빈칸을 놓을 수 있는 글 모으기 ②그 글에서 말이 놓일
// 자리 찾기 ③채점. **말을 고르는 규칙(무엇이 쟁점인가)은 여기 없다** — 그건 추출
// 스크립트가 정해 `dohae_blank_terms` 에 넣고, 화면은 찾기만 한다.
//
// ★좌표를 저장하지 않는다. 위치는 언제나 지금 본문에서 다시 찾는다 — 도해 본문은
//   운영자 편집으로도 재파싱으로도 바뀌므로, 좌표를 들고 있으면 조문 빈칸이 겪은
//   좌표 유실(재직렬화 한 번에 96세트)이 그대로 재현된다.

import { normalizeAnswer } from "~/features/blanks/lib/normalize";

import type { DohaeBlock, DohaeCell } from "../labels";

export const DOHAE_BLANK_TYPES = [1, 2, 3] as const;
export type DohaeBlankType = (typeof DOHAE_BLANK_TYPES)[number];

export const DOHAE_BLANK_TYPE_LABEL: Record<DohaeBlankType, string> = {
  1: "기출 유래",
  2: "정오 유래",
  3: "통합",
};

/** 한 유형에서 뚫는 **말**의 수 상한. 유형 3 은 1·2 의 합집합이라 따로 두지 않는다. */
export const MAX_TERMS_PER_TYPE = 12;

/**
 * 같은 말을 유닛에서 몇 번까지 뚫는가.
 * ★상한 12 는 *말* 의 수이지 *칸* 의 수가 아니다 — t25 「보정」에서 「거절이유통지」는
 *   23칸, 「최후거절이유」는 20칸에 나온다. 출현마다 뚫으면 한 유닛에 입력 칸이 100개를
 *   넘고 같은 답을 스무 번 치는 연습이 된다.
 */
export const MAX_HITS_PER_TERM = 2;

// ── ① 빈칸을 놓을 수 있는 글 ───────────────────────────────────────────────

export interface DohaeTextNode {
  /** `dohae-edit.ts` 와 **같은 경로 규칙** — "b3" · "b5.r0.c1" · "b5.r0.c1.t0.r1.c0" */
  path: string;
  text: string;
}

/**
 * 조문 원문 박스인가 — 1칸짜리 표 + 본문이 `제N조` 로 시작.
 *
 * ★팝업은 이 자리를 렌더 때 플랫폼 조문으로 갈아끼우지만, **그것도 유닛의 첫 박스
 *   하나뿐**이고 연결 조문이 없으면 교재 글이 그대로 나온다(「조약의 효력」). 그러니
 *   "렌더에서 바뀌니 괜찮다"고 두면 안 되고 **블록에서 직접 판정**해야 한다.
 *   도해에서 조문은 빈칸으로 만들지 않는다 — 조문 빈칸이 따로 있다(원장 지시).
 */
export function isArticleBox(block: DohaeBlock): boolean {
  if (block.type !== "table") return false;
  if (block.cells.length !== 1 || block.cells[0]?.length !== 1) return false;
  return /^제\d+조/.test(block.cells[0][0].text);
}

function collectCells(cells: DohaeCell[][], prefix: string, out: DohaeTextNode[]): void {
  cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      const path = `${prefix}.r${r}.c${c}`;
      // 도해가 그려진 칸은 이미지라 글자가 없다.
      if (!cell.diagram && cell.text.trim()) out.push({ path, text: cell.text });
      (cell.tables ?? []).forEach((t, ti) => collectCells(t, `${path}.t${ti}`, out));
    }),
  );
}

/**
 * 빈칸을 놓을 수 있는 글을 화면 순서대로.
 * 빼는 것 — 조문 원문 박스 · 소제목(`h`, 접기 머리 `<summary>` 안이라 입력 칸 자리가 아니다)
 * · 도해 이미지(`diagram`·`image` 블록과 `diagram: true` 칸).
 */
export function blankableNodes(blocks: DohaeBlock[]): DohaeTextNode[] {
  const out: DohaeTextNode[] = [];
  blocks.forEach((b, i) => {
    const prefix = `b${i}`;
    if (b.type === "p") {
      if (b.text.trim()) out.push({ path: prefix, text: b.text });
    } else if (b.type === "table" && !isArticleBox(b)) {
      collectCells(b.cells, prefix, out);
    }
  });
  return out;
}

// ── ② 말이 놓일 자리 ───────────────────────────────────────────────────────

export interface DohaeTerm {
  termId: string;
  term: string;
  fromExam: boolean;
  fromOx: boolean;
  examCount: number;
  oxCount: number;
  score: number;
}

export interface DohaeBlankHit {
  /** 유닛 안 읽기 순 번호(0-based) — 입력값·채점의 키. */
  idx: number;
  path: string;
  /** 그 글 안 글자 오프셋 `[start, end)`. */
  start: number;
  end: number;
  termId: string;
  answer: string;
}

/**
 * 말이 시작할 수 있는 자리인가 — 앞 글자가 한글이 아니어야 한다.
 * ★어절 중간을 뚫으면 「특허출원」에서 「출원」만 사라져 「특허___」이 된다. 뒤쪽은
 *   열어 둔다(「재심사」를 뚫어 「___청구」가 되는 것은 정상적인 빈칸이다).
 */
function startsAtBoundary(text: string, at: number): boolean {
  return at === 0 || !/[가-힣]/.test(text[at - 1]);
}

/**
 * 긴 말이 먼저 자리를 잡는다 — 「정정심판」이 있는데 「정정」이 먼저 잡으면
 * 「___심판」이 되어 정작 물어야 할 말이 반쯤 드러난다. 길이가 같으면 점수 순,
 * 그것도 같으면 termId 순으로 고정해 **매번 같은 결과**가 나오게 한다.
 */
function byPlacementPriority(a: DohaeTerm, b: DohaeTerm): number {
  return (
    b.term.length - a.term.length || b.score - a.score || a.termId.localeCompare(b.termId)
  );
}

interface RawHit {
  nodeIndex: number;
  path: string;
  start: number;
  end: number;
  termId: string;
  answer: string;
}

/** 주어진 말들만으로 자리를 잡는다 — 겹침 금지, 말당 `MAX_HITS_PER_TERM` 회까지. */
function place(nodes: DohaeTextNode[], terms: DohaeTerm[]): RawHit[] {
  const ordered = [...terms].sort(byPlacementPriority);
  const raw: RawHit[] = [];

  nodes.forEach((node, nodeIndex) => {
    const taken: Array<[number, number]> = [];
    const overlaps = (s: number, e: number) => taken.some(([ts, te]) => s < te && ts < e);
    for (const t of ordered) {
      if (t.term.length < 2) continue;
      let from = 0;
      for (;;) {
        const at = node.text.indexOf(t.term, from);
        if (at < 0) break;
        const end = at + t.term.length;
        if (startsAtBoundary(node.text, at) && !overlaps(at, end)) {
          taken.push([at, end]);
          raw.push({ nodeIndex, path: node.path, start: at, end, termId: t.termId, answer: t.term });
        }
        from = at + 1;
      }
    }
  });

  // 읽기 순으로 세운 뒤 말마다 앞에서 MAX_HITS_PER_TERM 개만 남긴다.
  raw.sort((a, b) => a.nodeIndex - b.nodeIndex || a.start - b.start);
  const used = new Map<string, number>();
  return raw.filter((h) => {
    const n = (used.get(h.termId) ?? 0) + 1;
    used.set(h.termId, n);
    return n <= MAX_HITS_PER_TERM;
  });
}

/** 그 유형에서 쓰는 말들을 순위대로 — 유형 1 은 기출 등장 수, 유형 2 는 OX 등장 수. */
export function rankTerms(terms: DohaeTerm[], type: 1 | 2): DohaeTerm[] {
  const mine = terms.filter((t) => (type === 1 ? t.fromExam : t.fromOx));
  return mine.sort((a, b) => {
    const av = type === 1 ? a.examCount : a.oxCount;
    const bv = type === 1 ? b.examCount : b.oxCount;
    return bv - av || b.score - a.score || a.termId.localeCompare(b.termId);
  });
}

export interface DohaeBlankPlan {
  /** 실제로 뚫린 말들(자리를 못 잡은 말은 빠진다). */
  terms: DohaeTerm[];
  hits: DohaeBlankHit[];
}

/**
 * 한 유닛·한 유형의 빈칸 배치.
 *
 * ★자리를 못 잡는 말이 있다(본문에 있긴 하나 어절 중간이거나 더 긴 말에 먹혔다).
 *   그런 말이 상한 12 를 차지하면 빈칸이 조용히 줄어든다 — 그래서 **한 번 놓아 보고
 *   자리를 잡은 말만 세어** 12 를 채운다. 조문 빈칸에서 미렌더 빈칸이 모수에 남아
 *   난이도가 영영 안 열리던 것과 같은 함정이다(feat-2-030 `filterPlaceableBlanks`).
 */
export function buildBlanks(
  nodes: DohaeTextNode[],
  terms: DohaeTerm[],
  type: DohaeBlankType,
  limit = MAX_TERMS_PER_TYPE,
): DohaeBlankPlan {
  const pick = (t: 1 | 2): DohaeTerm[] => {
    const ranked = rankTerms(terms, t);
    const placed = new Set(place(nodes, ranked).map((h) => h.termId));
    return ranked.filter((x) => placed.has(x.termId)).slice(0, limit);
  };

  let chosen: DohaeTerm[];
  if (type === 3) {
    // 유형 3 = 유형 1 ∪ 유형 2. 합친 뒤 유닛 안 순위(점수)로 세운다.
    const byId = new Map<string, DohaeTerm>();
    for (const t of [...pick(1), ...pick(2)]) byId.set(t.termId, t);
    chosen = [...byId.values()].sort(
      (a, b) => b.score - a.score || a.termId.localeCompare(b.termId),
    );
  } else {
    chosen = pick(type);
  }

  // 고른 말들만으로 다시 놓는다 — 안 고른 말이 막아 둔 자리를 되돌려 받는다.
  const raw = place(nodes, chosen);
  const hits: DohaeBlankHit[] = raw.map((h, i) => ({
    idx: i,
    path: h.path,
    start: h.start,
    end: h.end,
    termId: h.termId,
    answer: h.answer,
  }));
  const live = new Set(hits.map((h) => h.termId));
  return { terms: chosen.filter((t) => live.has(t.termId)), hits };
}

/** 한 글 안의 빈칸만, 시작 오프셋 순으로. 렌더가 글자를 잘라 넣을 때 쓴다. */
export function hitsOfPath(hits: DohaeBlankHit[], path: string): DohaeBlankHit[] {
  return hits.filter((h) => h.path === path).sort((a, b) => a.start - b.start);
}

// ── ③ 채점 ─────────────────────────────────────────────────────────────────

export type DohaeBlankStatus = "empty" | "correct" | "wrong";

/** 조문·판례 빈칸과 같은 잣대 — 공백·괄호 차이 무시, 한자 병기는 한글만 써도 정답. */
export function judgeBlank(input: string, answer: string): DohaeBlankStatus {
  if (!input.trim()) return "empty";
  return normalizeAnswer(input) === normalizeAnswer(answer) ? "correct" : "wrong";
}

export interface DohaeBlankScore {
  total: number;
  /** 실제로 쓴 칸. */
  written: number;
  correct: number;
  /** 쓴 칸 중 맞은 비율. 아무것도 안 썼으면 0. */
  ratio: number;
}

/**
 * ★비워 둔 칸은 채점에서 뺀다 — 0점으로 깔면 한두 칸만 연습한 학생이 크게 손해다
 *   (모범답안 연습 feat-2-036 과 같은 규칙).
 */
export function scoreBlanks(
  hits: DohaeBlankHit[],
  answers: Record<number, string>,
): DohaeBlankScore {
  let written = 0;
  let correct = 0;
  for (const h of hits) {
    const s = judgeBlank(answers[h.idx] ?? "", h.answer);
    if (s === "empty") continue;
    written++;
    if (s === "correct") correct++;
  }
  return { total: hits.length, written, correct, ratio: written ? correct / written : 0 };
}
