// 우측 패널이 처음 열릴 때 어느 탭을 보여줄지 (원장 지시 2026-08-29).
//
// 포스트잇 → 코멘트 → 정오문제 → 유사문제 → 질의응답 → 관련자료 → 하이라이트 → 즐겨찾기(중요도).
// 내용이 있는 탭 중 이 순서에서 가장 앞선 것을 연다 — 포스트잇이 있으면 포스트잇부터.
//
// 목록에 없던 판례·개정이력은 같은 성격(연결 콘텐츠) 자리에 끼워 둔다.
// ★좌측 레일 버튼도 이 순서로 그린다 — 보이는 순서와 열리는 순서가 다르면 헷갈린다.

export type PanelTabKey =
  | "bookmark"
  | "memo"
  | "highlight"
  | "cases"
  | "related-problems"
  | "qna"
  | "revisions"
  | "ox"
  | "comment"
  | "materials";

export const PANEL_TAB_ORDER: readonly PanelTabKey[] = [
  "memo",
  "comment",
  "ox",
  "related-problems",
  "cases",
  "qna",
  "materials",
  "revisions",
  "highlight",
  "bookmark",
] as const;

/**
 * counts 의 값이 `undefined` 면 그 대상에는 그 탭이 아예 없다는 뜻(0 과 구분).
 * 아무 탭에도 내용이 없으면 맨 앞(포스트잇) — 바로 하나 적을 수 있는 자리로 연다.
 */
export function pickInitialPanelTab(
  counts: Partial<Record<PanelTabKey, number>>,
): PanelTabKey {
  return PANEL_TAB_ORDER.find((key) => (counts[key] ?? 0) > 0) ?? PANEL_TAB_ORDER[0];
}
