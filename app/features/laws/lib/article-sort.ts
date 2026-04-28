// 자연 정렬 키 — article: articleNumber("29", "29의2") → [29,0] / [29,2]
// chapter/section: ltree 마지막 segment("ch06_02") → [6,2]

export interface SortableArticle {
  articleNumber: string | null;
  path: string;
}

export function naturalSortKey(n: SortableArticle): [number, number, string] {
  if (n.articleNumber) {
    const m = n.articleNumber.match(/^(\d+)(?:의(\d+))?$/);
    if (m) {
      return [parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, ""];
    }
  }
  const last = n.path.split(".").at(-1) ?? "";
  const main = last.match(/^[a-z]+(\d+)/i);
  const branch = last.match(/_(\d+)$/);
  return [
    main ? parseInt(main[1], 10) : 0,
    branch ? parseInt(branch[1], 10) : 0,
    last,
  ];
}

export function compareArticlesNatural(
  a: SortableArticle,
  b: SortableArticle,
): number {
  const ka = naturalSortKey(a);
  const kb = naturalSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2].localeCompare(kb[2]);
}
