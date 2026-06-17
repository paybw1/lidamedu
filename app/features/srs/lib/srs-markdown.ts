// 판례 요지 등 markdown 본문을 암기 카드(SRS v2) 뒷면용 plain text 로 평탄화.
// 러너(srs-review)는 front/back 을 whitespace-pre-line 평문으로만 렌더하므로
// markdown 마커(헤더·강조·링크·이미지·표·인라인 태그)를 제거해 노이즈를 없앤다.
// 전체 markdown 파서가 아닌 경량 정규식 — best-effort 가독성 확보가 목적.

/** markdown → plain text. maxLen 초과 시 말줄임. */
export function flattenMarkdownForCard(md: string, maxLen = 600): string {
  let s = md ?? "";
  // 이미지 ![alt](url) → 제거 (링크보다 먼저).
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // 링크 [text](url) → text.
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // 인라인 HTML 태그 (<u>, <br> 등) → 내용만.
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  // 줄 시작 헤더(#) · 인용(>) 마커 제거.
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "");
  s = s.replace(/^[ \t]{0,3}>[ \t]?/gm, "");
  // 표 구분선 행(|---|:--:|) 제거 후 셀 구분 | → 공백.
  s = s.replace(/^[ \t]*\|?[ \t:|-]+\|?[ \t]*$/gm, "");
  s = s.replace(/\|/g, " ");
  // 줄 시작 리스트 마커(-, *, +) 제거.
  s = s.replace(/^[ \t]{0,3}[-*+][ \t]+/gm, "");
  // 강조 마커 — 굵게(**/__) 먼저, 기울임(*/_) 다음, 인라인 코드(`).
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  s = s.replace(/`([^`]*)`/g, "$1");
  // 공백/빈 줄 정리.
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).trimEnd() + "…";
  return s;
}
