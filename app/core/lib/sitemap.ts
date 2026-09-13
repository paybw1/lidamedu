// 사이트맵 조립 — 순수 부분 (feat-11-012 P1).
//
// ★2026-09-13 실측: 운영 사이트맵 7건이 전부 `https://www.lidamipedu.com//legal/...` 처럼
//   슬래시가 둘이었다. 환경변수 끝 슬래시와 `${DOMAIN}${url}` 연결이 겹친 결과다.
//   주소를 문자열로 잇는 곳을 이 파일 하나로 모으고, 회귀 테스트를 붙였다.
// ★lastmod 는 **진짜 값이 있을 때만** 넣는다. 종전에는 모든 항목에 `new Date()` 를 찍어
//   "모든 페이지가 방금 바뀌었다"고 크롤러에게 거짓말을 하고 있었다.

export interface SitemapEntry {
  /** "/" 로 시작하는 경로. */
  path: string;
  /** ISO 8601. 없으면 lastmod 를 아예 쓰지 않는다. */
  lastmod?: string | null;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 호스트와 경로를 잇는 단일 지점 — 슬래시가 겹치거나 빠지지 않게. */
export function joinUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "");
  if (!path || path === "/") return `${base}/`;
  const rel = path.startsWith("/") ? path : `/${path}`;
  return `${base}${rel.replace(/\/+$/, "")}`;
}

/** 같은 경로가 두 번 들어가지 않게(정적 목록과 동적 목록이 겹칠 수 있다). */
export function dedupeEntries(entries: SitemapEntry[]): SitemapEntry[] {
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  for (const e of entries) {
    const key = e.path === "/" ? "/" : e.path.replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...e, path: key });
  }
  return out;
}

export function buildSitemapXml(
  origin: string,
  entries: SitemapEntry[],
): string {
  const body = dedupeEntries(entries)
    .map((e) => {
      const loc = `    <loc>${escapeXml(joinUrl(origin, e.path))}</loc>`;
      const mod = e.lastmod
        ? `\n    <lastmod>${escapeXml(e.lastmod)}</lastmod>`
        : "";
      return `  <url>\n${loc}${mod}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}
