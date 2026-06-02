// 국가법령정보 OPEN API <판례내용> 정규화.
// 응답은 HTML 단편 — <br/>, CDATA, 엔티티 혼재. 표준 텍스트로 변환.
//
// 메모리 [cases-import-entity-cleanup.md] 28종 깨진 엔티티는 일반 numeric reference
// (&#NNNN;) 처리로 자동 복구. 새 import 도 동일 함수 통과 → 정합성 보장.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  middot: "·",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
};

export function normalizeOfficialText(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw);

  // CDATA 외피 제거 — pick 함수가 빼놓을 수도 있지만 안전망.
  s = s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");

  // 줄바꿈류.
  s = s.replace(/<br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/?p[^>]*>/gi, "\n");

  // 강조 등 인라인 — 본문 의미에는 영향 없음. 마크다운으로 변환하지 않고 평문화.
  s = s.replace(/<\/?(b|strong|i|em|u|span|font|a)[^>]*>/gi, "");

  // 잔여 태그 — 안전망(예측 못한 태그도 평문화).
  s = s.replace(/<[^>]+>/g, "");

  // numeric entity (&#1234; / &#x1A;).
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return code > 0 ? String.fromCharCode(code) : "";
  });
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    const code = parseInt(h, 16);
    return code > 0 ? String.fromCharCode(code) : "";
  });

  // named entity.
  s = s.replace(/&([a-zA-Z]+);/g, (full, name: string) => {
    return NAMED_ENTITIES[name] ?? full;
  });

  // 다중 공백/탭 정리 — 줄바꿈은 보존.
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]+\n/g, "\n");

  return s.trim();
}
