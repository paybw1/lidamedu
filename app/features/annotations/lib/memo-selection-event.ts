// 본문 selection → 우측 메모 탭 자동 prefill 을 위한 cross-component 이벤트.
// HighlightToolbar 의 "메모" 버튼이 dispatch, ArticleRightPanel + MemoList 가 listen.

export const MEMO_SNIPPET_EVENT = "lidam:memo-snippet";

export interface MemoSnippetEventDetail {
  snippet: string;
  // multi-article viewer (chapter / systematic) 에서 어떤 article 의 메모인지 식별.
  targetType: string;
  targetId: string;
  // 본문 위 정확 위치 — 같은 단어가 여러 곳에 등장해도 사용자가 선택한 자리에만 마크.
  // null 이면 (위치 캡처 실패) snippet text 매칭 fallback 만 사용.
  blockIndex: number | null;
  cumOffset: number | null;
}

export function dispatchMemoSnippet(detail: MemoSnippetEventDetail): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(MEMO_SNIPPET_EVENT, { detail }));
}
