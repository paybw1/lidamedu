// 조문 헤더의 "연결 콘텐츠" 배지 → 우측 패널의 해당 탭 자동 활성을 위한 cross-component 이벤트.
// dispatcher: article-viewer 의 RelationBadges. listener: ArticleRightPanel.
// (기존 comment-event / memo-selection-event 와 동일 패턴.)

export const OPEN_PANEL_TAB_EVENT = "lidam:open-panel-tab";

// 배지에서 여는 탭 — 우측 패널 TabKey 의 부분집합.
export type OpenablePanelTab = "cases" | "ox" | "related-problems";

export interface OpenPanelTabEventDetail {
  targetType: string;
  targetId: string;
  tab: OpenablePanelTab;
}

export function dispatchOpenPanelTab(detail: OpenPanelTabEventDetail): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(OPEN_PANEL_TAB_EVENT, { detail }));
}
