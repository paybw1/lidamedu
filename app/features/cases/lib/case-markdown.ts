// 판례 본문 paragraph 단위 마크다운 helper.
//
// Prose 컴포넌트는 paragraph(`\n\n` split) 별로 다음 3가지로 분기 렌더:
//   1) 이미지 단독 paragraph (`![alt](url)` 또는 url 만) → <img>
//   2) markdown 표 paragraph (GFM table) → <table> (sanitized HTML)
//   3) 그 외 → 기존 텍스트 + `<u>` 마커 (기존 동작 유지)
//
// 텍스트 paragraph 가 marked 처리되지 않는 이유 — staff highlight 의 offset 이
// textContent 흐름에 의존하기 때문. inline markdown(**bold** 등) 을 풀어버리면
// 기존 하이라이트 offset 이 깨진다. 새 패턴(이미지/표) 만 점진 도입.

import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

// `![alt](url "선택 title")` 한 줄 paragraph — alt 와 url 만 캡처.
// trailing 공백/마침표 허용. url 에 공백 금지.
const IMG_PARA_RE =
  /^!\[(?<alt>[^\]]*)\]\((?<url>[^)\s]+)(?:\s+"[^"]*")?\)\s*$/;

export function parseImageParagraph(
  p: string,
): { alt: string; url: string } | null {
  const m = p.trim().match(IMG_PARA_RE);
  if (!m || !m.groups) return null;
  return { alt: m.groups.alt, url: m.groups.url };
}

// GFM 표 — 첫 줄 헤더(|...|), 둘째 줄 separator(|---|---|), 세 번째부터 데이터.
// alignment 마커 :---:, ---:, :--- 허용.
export function isMarkdownTableParagraph(p: string): boolean {
  const lines = p.split("\n");
  if (lines.length < 2) return false;
  const head = lines[0].trim();
  const sep = lines[1].trim();
  if (!head.startsWith("|") || !head.endsWith("|")) return false;
  if (!sep.startsWith("|") || !sep.endsWith("|")) return false;
  // separator 셀들: 각 셀이 :?-{3,}:? 패턴.
  const cells = sep
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

// 표 paragraph 를 sanitized HTML 로 변환.
// marked 의 GFM table 파서 + DOMPurify 로 XSS 방어. 허용 태그를 표 관련으로 제한.
const ALLOWED_TABLE_TAGS = [
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "strong",
  "em",
  "u",
  "br",
  "code",
];
const ALLOWED_TABLE_ATTR = ["colspan", "rowspan", "align", "scope"];

export function renderTableHtml(p: string): string {
  const html = marked.parse(p, { async: false, gfm: true }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ALLOWED_TABLE_TAGS,
    ALLOWED_ATTR: ALLOWED_TABLE_ATTR,
  });
}

// 사용자 작성용 표 템플릿 — "표 삽입" 버튼이 cursor 위치에 삽입할 markdown 원문.
export const MARKDOWN_TABLE_TEMPLATE = [
  "| 항목 | 내용 |",
  "| --- | --- |",
  "| 셀 1 | 셀 2 |",
  "| 셀 3 | 셀 4 |",
].join("\n");
