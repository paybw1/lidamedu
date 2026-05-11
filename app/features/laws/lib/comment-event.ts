// 본문/툴바의 "해설 보기" 링크 → 우측 패널의 코멘트 탭 자동 활성을 위한 cross-component 이벤트.
// dispatcher: article-viewer 의 코멘트 chip / 본문 inline 해설 링크.
// listener: ArticleRightPanel.

export const OPEN_COMMENT_TAB_EVENT = "lidam:open-comment-tab";

export interface OpenCommentTabEventDetail {
  targetType: string;
  targetId: string;
}

export function dispatchOpenCommentTab(detail: OpenCommentTabEventDetail): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent(OPEN_COMMENT_TAB_EVENT, { detail }),
  );
}
