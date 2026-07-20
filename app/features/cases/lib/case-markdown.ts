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

// 인라인 임베드 패턴 — 따옴표로 둘러싸인 image-only paragraph 는 인용구 안에
// 작은 글리프(브랜드 로고·표장·문자 도안 등)를 박는 의도. 본문 흐름에 inline
// 으로 풀어 큰 figure 블록 대신 텍스트 높이에 맞춰 렌더한다.
//   예) "...통상사용권을 부여한 "  ![](url)  "자 문양의 브랜드…"
// 검출 신호: 앞 paragraph 가 따옴표류로 끝나고 다음 paragraph 가 따옴표류로
// 시작하는 경우. 따옴표 매칭은 좌/우 짝을 가리지 않고 임의 조합 허용
// (대법원 판례 본문 표기 변이가 다양함 — "..." / "..." / "..." 등).
const INLINE_QUOTE_CHARS = new Set<string>([
  '"', // U+0022
  "'", // U+0027
  "‘", // ' LEFT SINGLE
  "’", // ' RIGHT SINGLE
  "“", // " LEFT DOUBLE
  "”", // " RIGHT DOUBLE
  "„", // „ LOW DOUBLE
  "‚", // ‚ LOW SINGLE
  "«", // « LEFT GUILLEMET
  "»", // » RIGHT GUILLEMET
  "《", // 《
  "》", // 》
  "〈", // 〈
  "〉", // 〉
]);

export function endsWithInlineQuote(s: string): boolean {
  const t = s.replace(/\s+$/u, "");
  if (t.length === 0) return false;
  return INLINE_QUOTE_CHARS.has(t.charAt(t.length - 1));
}

export function startsWithInlineQuote(s: string): boolean {
  const t = s.replace(/^\s+/u, "");
  if (t.length === 0) return false;
  return INLINE_QUOTE_CHARS.has(t.charAt(0));
}

// ── 열 폭 지정(colw 디렉티브) ──────────────────────────────────
// 표 블록 첫 줄의 `<!--colw:25%,,30em-->` 로 열별 폭을 지정한다(빈 값=auto).
// 파이프 행 바깥(주석)이라 marked·병합 마커("<"/"^")·빈칸/하이라이트 오프셋 체계와
// 완전히 무관하며, 디렉티브 없는 기존 표는 100% 그대로다. 값은 엄격 검증
// (숫자+%/em/px/rem)해 colgroup style 주입이 안전하다(XSS 불가).
const COLW_DIRECTIVE_RE = /^[^\S\n]*<!--\s*colw:([^>]*?)-->[^\S\n]*\r?\n/i;
const COLW_VALUE_RE = /^\d{1,3}(?:\.\d+)?(?:%|em|px|rem)$/;

/** 한 열의 폭 입력값을 검증 — 유효하면 정규화 문자열, 아니면 null(=auto). */
export function normalizeColWidth(v: string): string | null {
  const t = v.trim();
  return t !== "" && COLW_VALUE_RE.test(t) ? t : null;
}

/** 표 원문에서 colw 디렉티브를 떼어내 폭 배열 + 나머지 본문을 반환. */
export function extractColWidths(p: string): {
  widths: (string | null)[] | null;
  body: string;
} {
  const m = p.match(COLW_DIRECTIVE_RE);
  if (!m) return { widths: null, body: p };
  const widths = m[1].split(",").map((s) => normalizeColWidth(s));
  return {
    widths: widths.some((w) => w !== null) ? widths : null,
    body: p.slice(m[0].length),
  };
}

/** 폭 배열 → colw 디렉티브 한 줄(모두 auto면 null). */
export function buildColWidthDirective(
  widths: (string | null)[],
): string | null {
  if (!widths.some((w) => w !== null)) return null;
  return `<!--colw:${widths.map((w) => w ?? "").join(",")}-->`;
}

// 렌더된 표 HTML 에 명시 폭 colgroup 을 주입(자동 cmp colgroup override) + colw 클래스
// (table-layout:fixed). 폭은 이미 검증된 토큰만 담기므로 sanitize 이후 주입해도 안전.
function applyExplicitColgroup(html: string, widths: (string | null)[]): string {
  const cols = widths
    .map((w) => (w ? `<col style="width:${w}">` : "<col>"))
    .join("");
  const colgroup = `<colgroup>${cols}</colgroup>`;
  const stripped = html.replace(/<colgroup>[\s\S]*?<\/colgroup>/i, "");
  return stripped.replace(/<table\b([^>]*)>/i, (_m, attrs: string) => {
    const withClass = /\bclass="/.test(attrs)
      ? attrs.replace(/class="([^"]*)"/i, (_mm, c: string) => `class="${c} colw"`)
      : `${attrs} class="colw"`;
    return `<table${withClass}>${colgroup}`;
  });
}

// 표 paragraph 인지 — GFM 표 또는 raw HTML `<table>` 시작.
// HTML 표는 colspan/rowspan 표현 가능. hwpx 등 외부 자료에서 변환된 본문에
// 사용된다(renderTableHtml 이 sanitize 후 그대로 렌더).
export function isMarkdownTableParagraph(p: string): boolean {
  const body = extractColWidths(p).body;
  if (body.trimStart().toLowerCase().startsWith("<table")) return true;
  const lines = body.split("\n");
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
  // 표 셀 안 markdown image — 도형/도면 등을 셀 단위로 박는 유스케이스.
  // (예: 수치한정발명 신규성 판단 표의 A~E유형 도형 5개)
  "img",
  "a",
];
const ALLOWED_TABLE_ATTR = [
  "colspan",
  "rowspan",
  "align",
  "scope",
  "src",
  "alt",
  "title",
  "loading",
  "href",
  "target",
  "rel",
];

// 비교표 판정 + 열 분류 — GFM 표에서 첫 열이 "짧은 라벨"(≤ 임계)이고 열이 2개 이상이면
// 비교표(table.cmp)로 본다. 각 열은 "라벨 열"(모든 셀이 짧음 → 내용 폭·nowrap)과
// "값 열"(긴 비교 본문 → 균등 폭)로 분류. 예:
//   · "발명의 특정 | 특허요건 판단 | 보호범위 판단" → 라벨[0] · 값[1,2]
//   · "종류 | 형태 | 미국 | 한국"                    → 라벨[0,1] · 값[2,3]
// 첫 열에 긴 본문이 들어가는 박스형 표는 임계 초과라 미해당 → 기존 렌더 유지(가로 스크롤 방지).
const CMP_FIRST_COL_MAX = 30; // 첫 열 라벨 최대 길이(문자). "발명의 설명 참작의 원칙"=12 여유.
const CMP_LABEL_MAX = 24; // 라벨 열 판정 — 열의 최대 셀 길이가 이 이하면 라벨(짧은) 열.
function analyzeCmpTable(
  gfm: string,
): { labelCols: Set<number>; cols: number; colMax: number[] } | null {
  const lines = gfm
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (lines.length < 2) return null;
  let cols = 0;
  let maxFirst = 0;
  const colMax: number[] = [];
  for (const l of lines) {
    // 구분선(| --- | --- |) 은 건너뜀.
    if (/^\|[\s:|-]+\|$/.test(l)) continue;
    const cells = l.slice(1, -1).split("|").map((s) => s.trim());
    if (cells.length < 2) return null;
    cols = Math.max(cols, cells.length);
    maxFirst = Math.max(maxFirst, cells[0].length);
    cells.forEach((cell, i) => {
      colMax[i] = Math.max(colMax[i] ?? 0, cell.length);
    });
  }
  if (cols < 2 || maxFirst === 0 || maxFirst > CMP_FIRST_COL_MAX) return null;
  const labelCols = new Set<number>();
  for (let i = 0; i < cols; i++) {
    if ((colMax[i] ?? 0) <= CMP_LABEL_MAX) labelCols.add(i);
  }
  // 값 열이 하나도 없으면(전부 짧은 표) 첫 열만 라벨·나머지는 값(균등)으로 —
  // 2열 등에서 우측 여백이 크게 남지 않게.
  if (labelCols.size >= cols) {
    labelCols.clear();
    labelCols.add(0);
  }
  return { labelCols, cols, colMax };
}

// 비교표 colgroup — table-layout: fixed 에서 열 폭 지정.
// ★라벨(구분) 열 = 최소화: 내용이 1~2줄로 감기도록 좁게(최장 셀의 0.5배 + 여백, 4~9em).
//   한글 1자≈1em, wrap 허용(CSS td.lbl white-space:normal)이라 좁아도 넘치지 않는다.
// 값 열 = 폭 미지정 → fixed 레이아웃이 남은 폭을 균등 분배(비교 열들이 동일 폭).
function buildCmpColgroup(
  cols: number,
  labelCols: Set<number>,
  colMax: number[],
): string {
  const colTags: string[] = [];
  for (let i = 0; i < cols; i++) {
    if (labelCols.has(i)) {
      const raw = (colMax[i] ?? 4) * 0.6 + 2.4;
      const w = Math.min(Math.max(Math.round(raw * 10) / 10, 4.5), 9.5);
      colTags.push(`<col style="width:${w}em">`);
    } else {
      colTags.push("<col>");
    }
  }
  return `<colgroup>${colTags.join("")}</colgroup>`;
}

// sanitize 된 표 HTML 의 각 셀(th/td)에 열 위치별 class(lbl/val)를 부여.
// <tr> 마다 열 인덱스를 리셋. marked 산출 표라 colspan 없음(열 위치 안정).
function annotateCmpColumns(html: string, labelCols: Set<number>): string {
  let col = 0;
  return html.replace(
    /(<tr\b[^>]*>)|(<(?:th|td)\b)([^>]*)>/gi,
    (_m, trTag: string | undefined, cellOpen: string, cellAttrs: string) => {
      if (trTag) {
        col = 0;
        return trTag;
      }
      const cls = labelCols.has(col) ? "lbl" : "val";
      col += 1;
      return `${cellOpen}${cellAttrs} class="${cls}">`;
    },
  );
}

// ── 셀 병합 마커 ─────────────────────────────────────────────
// 파이프 표 셀에 "<"(왼쪽 칸과 병합) / "^"(위 칸과 병합)만 넣으면 렌더에서
// colspan/rowspan 으로 합쳐진다. 마커 셀 자체는 렌더되지 않는다 — 원시 텍스트
// 오프셋 체계(빈칸·하이라이트)는 변하지 않는다. 전 판례 전수 감사로 단독
// "<"/"^" 셀 기존 데이터 0건 확인(2026-07-20).
export const MERGE_LEFT = "<";
export const MERGE_UP = "^";

export interface CaseCellSpan {
  skip: boolean; // 마커 셀 — 렌더하지 않음(이웃 셀에 흡수됨)
  colSpan: number;
  rowSpan: number;
}

// rows: 렌더 순서(헤더 포함, 구분행 제외)의 셀 그리드. 정규 그리드(행별 열 수 일정) 가정.
// rowspan 은 같은 열 인덱스 기준으로 위로, colspan 은 같은 행에서 왼쪽으로 병합.
// 주의: thead↔tbody 경계를 넘는 rowspan 은 브라우저가 무시하므로 헤더 바로 아래
// 행에는 "^" 를 쓰지 않는다(운영 규약).
export function computeCaseCellSpans(
  rows: { text: string }[][],
): CaseCellSpan[][] {
  const spans = rows.map((r) =>
    r.map(() => ({ skip: false, colSpan: 1, rowSpan: 1 })),
  );
  for (let ri = 0; ri < rows.length; ri++) {
    for (let ci = 0; ci < rows[ri].length; ci++) {
      const t = rows[ri][ci].text;
      if (t === MERGE_LEFT) {
        let cj = ci - 1;
        while (cj >= 0 && rows[ri][cj].text === MERGE_LEFT) cj--;
        if (cj >= 0 && rows[ri][cj].text !== MERGE_UP) {
          spans[ri][ci].skip = true;
          spans[ri][cj].colSpan++;
        }
      } else if (t === MERGE_UP) {
        let rk = ri - 1;
        while (rk >= 0 && rows[rk][ci]?.text === MERGE_UP) rk--;
        if (rk >= 0 && rows[rk][ci] && rows[rk][ci].text !== MERGE_LEFT) {
          spans[ri][ci].skip = true;
          spans[rk][ci].rowSpan++;
        }
      }
    }
  }
  return spans;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 병합 마커가 있는 GFM 표 → colspan/rowspan 포함 HTML. marked 는 셀 병합을 못
// 만들므로 직접 조립(셀 내용은 escape — 병합 표 셀은 평문 가정). 비교표(cmp)
// 판정·colgroup·lbl/val class 는 기존 규칙 그대로 적용.
function renderMergedTableHtml(p: string): string | null {
  const lines = p
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));
  if (lines.length < 2) return null;
  const rowsRaw = lines.map((l) =>
    l
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim()),
  );
  const isSep = (cells: string[]) =>
    cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
  let header: string[] | null = null;
  let body: string[][];
  if (rowsRaw.length >= 2 && isSep(rowsRaw[1])) {
    header = rowsRaw[0];
    body = rowsRaw.slice(2).filter((r) => !isSep(r));
  } else {
    body = rowsRaw.filter((r) => !isSep(r));
  }
  const grid = [...(header ? [header] : []), ...body];
  if (
    !grid.some((r) => r.some((c) => c === MERGE_LEFT || c === MERGE_UP))
  )
    return null;
  const spans = computeCaseCellSpans(grid.map((r) => r.map((text) => ({ text }))));
  const cmpInfo = analyzeCmpTable(p);
  const renderRow = (cells: string[], gi: number, tag: "th" | "td") => {
    let out = "<tr>";
    cells.forEach((c, ci) => {
      const sp = spans[gi][ci];
      if (sp.skip) return;
      const cls = cmpInfo ? (cmpInfo.labelCols.has(ci) ? "lbl" : "val") : null;
      const attrs =
        (sp.colSpan > 1 ? ` colspan="${sp.colSpan}"` : "") +
        (sp.rowSpan > 1 ? ` rowspan="${sp.rowSpan}"` : "") +
        (cls ? ` class="${cls}"` : "");
      out += `<${tag}${attrs}>${escapeHtml(c)}</${tag}>`;
    });
    return out + "</tr>";
  };
  const bodyOffset = header ? 1 : 0;
  const html =
    (cmpInfo ? '<table class="cmp">' : "<table>") +
    (cmpInfo
      ? buildCmpColgroup(cmpInfo.cols, cmpInfo.labelCols, cmpInfo.colMax)
      : "") +
    (header ? `<thead>${renderRow(header, 0, "th")}</thead>` : "") +
    "<tbody>" +
    body.map((r, i) => renderRow(r, bodyOffset + i, "td")).join("") +
    "</tbody></table>";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ALLOWED_TABLE_TAGS,
    ALLOWED_ATTR: [...ALLOWED_TABLE_ATTR, "class", "style"],
  });
}

export function renderTableHtml(p: string): string {
  // colw 디렉티브(열 폭)를 먼저 떼어내 본문만 렌더 — marked·병합·cmp 판정은 body 로.
  const { widths, body } = extractColWidths(p);
  const withWidths = (html: string): string =>
    widths ? applyExplicitColgroup(html, widths) : html;

  // raw HTML `<table>` 입력은 marked 거치지 않고 그대로 sanitize.
  const isRawHtml = body.trimStart().toLowerCase().startsWith("<table");
  if (!isRawHtml) {
    // 병합 마커("<"/"^") 표는 직접 조립 — marked GFM 은 셀 병합 불가.
    const merged = renderMergedTableHtml(body);
    if (merged) return withWidths(merged);
  }
  const html = isRawHtml
    ? body
    : (marked.parse(body, { async: false, gfm: true }) as string);
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ALLOWED_TABLE_TAGS,
    ALLOWED_ATTR: ALLOWED_TABLE_ATTR,
  });
  // 비교표면 sanitize 이후(안전한 자체 문자열)에 class·colgroup 주입 —
  // table.cmp(+fixed 레이아웃) + 셀별 lbl/val + 열 폭 colgroup. 명시 폭이 있으면
  // withWidths 가 자동 colgroup 을 override 한다.
  if (!isRawHtml) {
    const info = analyzeCmpTable(body);
    if (info) {
      const withClass = clean
        .replace(/<table(?![^>]*\bclass=)/i, '<table class="cmp"')
        .replace(
          /(<table\b[^>]*>)/i,
          `$1${buildCmpColgroup(info.cols, info.labelCols, info.colMax)}`,
        );
      return withWidths(annotateCmpColumns(withClass, info.labelCols));
    }
  }
  return withWidths(clean);
}

// 사용자 작성용 표 템플릿 — "표 삽입" 버튼이 cursor 위치에 삽입할 markdown 원문.
export const MARKDOWN_TABLE_TEMPLATE = [
  "| 항목 | 내용 |",
  "| --- | --- |",
  "| 셀 1 | 셀 2 |",
  "| 셀 3 | 셀 4 |",
].join("\n");

// ── 클립보드 → markdown 표 변환 ──────────────────────────────
// 운영자가 Excel/Word/HTML 표를 복사해 textarea 에 paste 하면 자동으로 GFM
// markdown 표로 변환되어 cursor 위치에 삽입된다. 이미지 paste 와 동일한 UX.
//
// 우선순위:
//   1) text/html 에 <table>…</table> 이 있으면 그것을 파싱 (Excel·Word·Google 시트
//      등 모든 office 도구가 HTML clipboard 제공)
//   2) text/plain 이 TSV (모든 line 에 tab) 면 그것을 파싱 — Excel 의 가벼운 fallback
//   3) 그 외 → null (기본 paste 동작 유지)

function sanitizeCell(s: string): string {
  // markdown 표 cell 에 들어가면 안 되는 문자: `|`(컬럼 구분자), 줄넘김.
  // 줄넘김은 `<br>` 으로 바꿀 수도 있지만 GFM 호환성·간단함 위해 공백.
  return s.trim().replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

function buildGfmTable(rows: string[][]): string | null {
  if (rows.length === 0) return null;
  const maxCols = Math.max(...rows.map((r) => r.length));
  if (maxCols < 1) return null;
  // 행별로 부족한 셀은 공백으로 채워 align.
  const padded = rows.map((r) => {
    const copy = [...r];
    while (copy.length < maxCols) copy.push("");
    return copy.map(sanitizeCell);
  });
  const out: string[] = [];
  out.push(`| ${padded[0].join(" | ")} |`);
  out.push(`| ${padded[0].map(() => "---").join(" | ")} |`);
  for (let i = 1; i < padded.length; i++) {
    out.push(`| ${padded[i].join(" | ")} |`);
  }
  return out.join("\n");
}

export function htmlTableToMarkdown(html: string): string | null {
  if (typeof DOMParser === "undefined") return null;
  if (!/<table[\s>]/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const trs = table.querySelectorAll("tr");
  if (trs.length === 0) return null;
  const rows: string[][] = [];
  trs.forEach((tr) => {
    const cells = tr.querySelectorAll("th, td");
    const row: string[] = [];
    cells.forEach((c) => row.push(c.textContent ?? ""));
    if (row.length > 0) rows.push(row);
  });
  if (rows.length === 0) return null;
  return buildGfmTable(rows);
}

// TSV (tab-separated values) — Excel 등에서 plain text paste 시 형식.
// 모든 줄에 탭이 있어야 표로 인정 (오탐 방지).
export function tsvToMarkdown(text: string): string | null {
  const lines = text.split(/\r?\n/).filter((l) => l !== "");
  if (lines.length < 2) return null;
  if (!lines.every((l) => l.includes("\t"))) return null;
  const rows = lines.map((l) => l.split("\t"));
  return buildGfmTable(rows);
}

// 클립보드 데이터 → markdown 표 (HTML 우선, fallback TSV).
// onPaste 핸들러가 직접 호출.
export function clipboardToMarkdownTable(
  dt: DataTransfer | null,
): string | null {
  if (!dt) return null;
  const html = dt.getData("text/html");
  if (html) {
    const fromHtml = htmlTableToMarkdown(html);
    if (fromHtml) return fromHtml;
  }
  const plain = dt.getData("text/plain");
  if (plain) {
    const fromTsv = tsvToMarkdown(plain);
    if (fromTsv) return fromTsv;
  }
  return null;
}
