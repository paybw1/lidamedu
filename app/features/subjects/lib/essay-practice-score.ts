// feat-2-036 — 연습 채점. 두 연습은 **거울 관계**라 채점도 한 벌이다(원장 2026-09-04).
//
//   목차 연습 — 본문을 보여 주고 **제목**을 빈칸으로. "이 글에 붙일 이름은 무엇인가"
//   내용 연습 — 목차를 보여 주고 **본문**을 빈칸으로. "이 자리에 무슨 법리를 쓰는가"
//
// 채점은 도식 연습의 핵심어 커버리지(`answer-match.ts`)를 그대로 쓴다. 임계값 0.65/0.35 도
// 공용이다 — 짧은 제목에도 통하는지는 구현 전에 쟀다(`outline-practice-probe.test.ts`).
//
// ★한자를 남긴다(`keepCjk`). 지우면 「2. 甲의 주장」과 「3. 乙의 주장」이 둘 다 `주장`
//   하나로 줄어 같은 항목이 된다 — 당사자 표시가 항목을 가르는 자리다.
// ★순서는 채점하지 않는다. 칸이 제자리에 놓여 있으므로 순서를 물을 일이 없다
//   (한 칸에 목차를 통째로 받던 때는 순서 신호가 필요했지만, 빈칸 방식에서는 무의미하다).

import {
  type MatchResult,
  type Verdict,
  matchAnswer,
  verdictOf,
} from "~/features/cases/lib/answer-match";

import { type OutlineBlock, type OutlineNode } from "./essay-outline";

const CJK = { keepCjk: true } as const;

export type PracticeMode = "outline" | "content";

export interface BlankScore {
  nodeId: string;
  /** 이 칸의 모범답안 — 목차 연습이면 제목, 내용 연습이면 본문. */
  model: string;
  /** 학생이 쓴 글. */
  input: string;
  match: MatchResult;
  verdict: Verdict;
  /** 아예 비워 둔 칸 — 채점에서 뺀다(0점으로 깔면 한 칸만 쓴 학생이 크게 손해다). */
  blank: boolean;
}

export interface PracticeScore {
  blanks: BlankScore[];
  /** 쓴 칸 수 / 전체 칸 수. */
  writtenCount: number;
  totalCount: number;
  /** 인정 칸 수. */
  acceptedCount: number;
  /** 쓴 칸들의 평균 커버리지. 아무것도 안 썼으면 0. */
  ratio: number;
  verdict: Verdict;
}

/**
 * 이 연습에서 빈칸이 되는 칸들 — **두 연습 모두 본문이 있는 칸만**이다.
 *   목차 연습 — 그 본문을 보여 주고 제목을 묻는다.
 *   내용 연습 — 그 제목을 보여 주고 본문을 묻는다.
 *
 * ★본문 없이 하위를 묶기만 하는 자리(「2. 甲의 주장」)는 목차 연습에서도 묻지 않는다
 *   (원장 2026-09-04). 단서가 될 본문이 없어 학생이 맞힐 근거가 없고, 그냥 비워 두게
 *   되어 채점에서도 빠진다 — 물어도 아무 의미가 없는 칸이었다.
 */
export function blanksOf(block: OutlineBlock, _mode: PracticeMode): OutlineNode[] {
  return block.leaves;
}

/** 그 칸의 모범답안. */
export function modelOf(node: OutlineNode, mode: PracticeMode): string {
  return mode === "outline" ? node.title : node.bodyMd;
}

export function scorePractice(
  block: OutlineBlock,
  mode: PracticeMode,
  answers: Record<string, string>,
): PracticeScore {
  const nodes = blanksOf(block, mode);
  const blanks: BlankScore[] = nodes.map((n) => {
    const input = (answers[n.id] ?? "").trim();
    const model = modelOf(n, mode);
    // ★내용 연습은 사건 고유의 수치를 핵심어에서 뺀다(도식 포섭과 같은 이유).
    //   금액·날짜를 못 외웠다고 법리를 틀린 것은 아니다.
    const match = matchAnswer(model, input, { ...CJK, dropFigures: mode === "content" });
    return {
      nodeId: n.id,
      model,
      input,
      match,
      verdict: verdictOf(match.ratio),
      blank: input.length === 0,
    };
  });

  const written = blanks.filter((b) => !b.blank);
  const ratio = written.length
    ? written.reduce((s, b) => s + b.match.ratio, 0) / written.length
    : 0;
  return {
    blanks,
    writtenCount: written.length,
    totalCount: blanks.length,
    acceptedCount: written.filter((b) => b.verdict === "accepted").length,
    ratio,
    verdict: verdictOf(ratio),
  };
}
