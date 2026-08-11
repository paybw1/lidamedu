// 주관식 해설·모범답안·채점기준의 노출 게이트 — staff 전용(전 과목).
//
// 화면에서 조건부 렌더로 가리는 것만으로는 부족하다. loader 가 실어 보낸 값은
// SSR 페이로드와 클라이언트 내비게이션의 .data 응답에 원문 그대로 남아 네트워크
// 탭에서 읽힌다. 그래서 서버에서 값을 걷어낸다.
//
// 객관식 해설(explanationMd)은 학습의 핵심 콘텐츠이므로 건드리지 않는다 —
// format === "subjective" 인 문제에만 적용한다.

import type { ProblemFormat, RubricItem } from "~/features/problems/labels";

/** 게이트 대상 필드만 추린 최소 형태 — ProblemDetail·ProblemListItem 이 모두 만족한다. */
export interface RedactableProblem {
  format: ProblemFormat;
  explanationMd: string | null;
  modelAnswerMd: string | null;
  gradingRubricMd: string | null;
  rubricItems: RubricItem[] | null;
}

export function redactSubjectiveAnswer<T extends RedactableProblem>(
  problem: T,
  isStaff: boolean,
): T {
  if (isStaff || problem.format !== "subjective") return problem;
  return {
    ...problem,
    explanationMd: null,
    modelAnswerMd: null,
    gradingRubricMd: null,
    rubricItems: null,
  };
}
