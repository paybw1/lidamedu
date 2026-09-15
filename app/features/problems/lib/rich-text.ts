// 해설·발문이 **서식을 가진 글**인지 판정한다 — 그렇다면 MarkdownView 로 그려야 한다.
//
// ★그냥 글자로 찍으면 표·이미지가 **코드 그대로 보인다**(오류신고 2026-09-10:
//   "해설에 코드가보임" — 행위능력 단원 OX 해설에 HTML `<table>` 이 들어 있었다).
//   같은 규칙이 문제 뷰어·기출 시트에 흩어져 있어 한 화면만 고치면 다음에 또 샌다 —
//   여기 한 곳에 둔다.

/** 이미지·표(HTML `<table>` 또는 GFM 파이프표)·블록 요소. */
const RICH_BLOCK_RE = /!\[[^\]]*\]\([^)]*\)|<(img|table|div)\b|\|[\s:]*-{3,}/i;
/** 마크다운 서식 — **굵게**, 헤더, 별표로 감싼 줄(민법 해설 "*관련 조문·판례*"). */
const RICH_FORMAT_RE =
  /\*\*[^*\n]+\*\*|(?:^|\n)#{1,6}\s+\S|(?:^|\n)\*[^*\n]+\*(?=\n|$)/;

/** 블록(이미지·표)만 — **발문**용. 발문은 굵게·별표 정도로 마크다운 렌더에 넘기지 않는다
 *  (평문에 우발적으로 섞인 `*`·`#` 가 서식으로 오렌더되는 것을 막는다). */
export function hasRichBlock(md: string | null | undefined): boolean {
  if (!md) return false;
  return RICH_BLOCK_RE.test(md);
}

/** 블록 또는 마크다운 서식 — **해설**용. 해설은 교재 편집물이라 서식이 의도된 것이다. */
export function hasRichText(md: string | null | undefined): boolean {
  if (!md) return false;
  return RICH_BLOCK_RE.test(md) || RICH_FORMAT_RE.test(md);
}
