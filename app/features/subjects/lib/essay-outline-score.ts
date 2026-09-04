// feat-2-036 S2 — 목차 연습 채점.
//
// 채점 방식은 새로 만들지 않는다. 도식 연습의 핵심어 커버리지(`answer-match.ts`)를 쓰고
// 임계값도 그대로다 — **짧은 제목에도 통하는지 구현 전에 쟀다**(설계 §5 ·
// `outline-practice-probe.test.ts`): 제대로 쓴 목차 0.87 / 큰 뼈대만 0.17 / 다른 논점 0.03.
//
// ★한자를 남긴다(`keepCjk`). 지우면 「2. 甲의 주장」과 「3. 乙의 주장」이 둘 다 `주장`
//   하나로 줄어 같은 항목이 된다 — 당사자 표시가 항목을 가르는 자리다.
// ★커버리지는 순서를 보지 않는다. 목차는 순서가 곧 논리라 그대로 두면 뒤죽박죽 쓴
//   목차도 만점이 된다. 그래서 순서를 **점수와 별개 신호**로 낸다 — 감점은 하지 않는다.
//   순서가 다른 편이 나은 답안도 있고, 실측 없이 감점 규칙을 넣으면 근거 없는 채점이 된다.

import {
  ACCEPT_MIN,
  type MatchResult,
  type Verdict,
  matchAnswer,
  normalize,
  verdictOf,
} from "~/features/cases/lib/answer-match";

import { type OutlineBlock, outlineText } from "./essay-outline";

const CJK = { keepCjk: true } as const;

export interface HeadingScore {
  title: string;
  match: MatchResult;
  /** 이 항목이 학생 목차에 들어 있다고 볼 것인가. */
  hit: boolean;
  /** 학생 글에서 이 항목이 놓인 자리. 순서 판정에만 쓴다. 못 맞혔으면 null. */
  at: number | null;
  /** 앞 항목보다 먼저 나왔는가(순서 어긋남). 점수에는 영향이 없다. */
  outOfOrder: boolean;
}

export interface OutlineScore {
  /** 목차 전체를 한 덩이로 본 커버리지 — 점수·판정의 근거. */
  overall: MatchResult;
  verdict: Verdict;
  headings: HeadingScore[];
  hitCount: number;
  /** 맞은 항목들이 모범답안 순서대로 나왔는가. */
  orderOk: boolean;
  /** 순서에서 벗어난 항목 — 안내에만 쓴다(감점 없음). */
  outOfOrder: string[];
}

/** 맞은 말들이 학생 글에서 나온 자리 전부(오름차순, 중복 제거). */
function positionsOf(hay: string, terms: string[]): number[] {
  const out = new Set<number>();
  for (const t of terms) {
    const needle = normalize(t, CJK);
    if (!needle) continue;
    let i = hay.indexOf(needle);
    // 같은 말이 여러 번 나올 수 있다 — 자리를 다 모아 둔다.
    while (i >= 0) {
      out.add(i);
      i = hay.indexOf(needle, i + 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * 목차 한 판 채점. `student` 는 학생이 한 칸에 쓴 목차 글 전체.
 */
export function scoreOutline(block: OutlineBlock, student: string): OutlineScore {
  const model = outlineText(block);
  const overall = matchAnswer(model, student, CJK);
  const hay = normalize(student, CJK);

  // ★순서는 **모범답안 차례대로 훑으며 배정**한다. 각 항목은 앞 항목보다 뒤에 있는
  //   자리 중 가장 앞을 갖는다.
  //   그냥 "가장 먼저 나온 말"로 잡으면 안 된다 — 말이 겹치는 항목(「권리남용의 항변」과
  //   「권리남용 항변의 성부」, 「甲의 주장」과 「乙의 주장」)이 앞자리를 집어가, 제대로 쓴
  //   목차가 순서 어긋남으로 나온다. 실제로 그렇게 나왔다.
  let cursor = -1;
  const headings: HeadingScore[] = block.headingLines.map((title) => {
    const match = matchAnswer(title, student, CJK);
    // 제목은 짧아 핵심어가 2~4개다. 전체와 같은 문턱을 쓴다.
    const hit = match.ratio >= ACCEPT_MIN;
    if (!hit || !match.matched.length) {
      return { title, match, hit, at: null, outOfOrder: false };
    }
    const spots = positionsOf(hay, match.matched);
    const forward = spots.find((p) => p >= cursor);
    if (forward !== undefined) {
      cursor = forward;
      return { title, match, hit, at: forward, outOfOrder: false };
    }
    // 앞으로 갈 자리가 없다 — 이 항목은 앞 항목보다 먼저 쓰였다.
    return { title, match, hit, at: spots[0] ?? null, outOfOrder: true };
  });

  const outOfOrder = headings.filter((h) => h.outOfOrder).map((h) => h.title);
  return {
    overall,
    verdict: verdictOf(overall.ratio),
    headings,
    hitCount: headings.filter((h) => h.hit).length,
    orderOk: outOfOrder.length === 0,
    outOfOrder,
  };
}
