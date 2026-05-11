// 연속 학습 워커 — "조문 → 관련 판례 → 그 판례를 다룬 문제" 자동 순회.
// flow 큐는 URL search param 'flow' 에 컴팩트 인코딩.
//   포맷: "a:<articleNumber>|c:<caseId>|p:<problemId>|c:..."  (a=article, c=case, p=problem)
// step 은 1-indexed.

export type FlowStepType = "article" | "case" | "problem";

export interface FlowStep {
  type: FlowStepType;
  id: string; // article 은 articleNumber, case/problem 은 UUID
}

const TYPE_CODE: Record<FlowStepType, string> = {
  article: "a",
  case: "c",
  problem: "p",
};

const CODE_TYPE: Record<string, FlowStepType> = {
  a: "article",
  c: "case",
  p: "problem",
};

export function serializeFlow(steps: FlowStep[]): string {
  return steps
    .map((s) => `${TYPE_CODE[s.type]}:${encodeURIComponent(s.id)}`)
    .join("|");
}

export function parseFlow(raw: string | null | undefined): FlowStep[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((part): FlowStep | null => {
      const [code, ...rest] = part.split(":");
      const id = rest.join(":");
      const t = CODE_TYPE[code];
      if (!t || !id) return null;
      return { type: t, id: decodeURIComponent(id) };
    })
    .filter((s): s is FlowStep => s !== null);
}

export function stepHref(
  subjectSlug: string,
  step: FlowStep,
  query: Record<string, string>,
): string {
  const sp = new URLSearchParams(query);
  switch (step.type) {
    case "article":
      return `/subjects/${subjectSlug}/articles/${step.id}?${sp.toString()}`;
    case "case":
      return `/subjects/${subjectSlug}/cases/${step.id}?${sp.toString()}`;
    case "problem":
      return `/subjects/${subjectSlug}/problems/${step.id}?${sp.toString()}`;
  }
}

export function findStepIndex(
  steps: FlowStep[],
  type: FlowStepType,
  id: string,
): number {
  return steps.findIndex((s) => s.type === type && s.id === id);
}
