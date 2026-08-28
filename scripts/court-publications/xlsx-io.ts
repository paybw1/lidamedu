// 엑셀(.xlsx) 최소 읽기·쓰기 — 새 의존성 없이 sheet1.xml 만 갈아 끼운다.
//
// ★두 스크립트(update-haeseol-xlsx · fill-case-no-by-title)가 **같은 파일**을 만지므로
//   읽고 쓰는 규칙은 여기 한 곳에만 둔다. 따로 두면 한쪽이 쓴 것을 다른 쪽이 못 읽는다.
import type AdmZip from "adm-zip";

// ★텍스트 노드에서는 & < > 만 이스케이프한다. 따옴표까지 바꾸면 원문에 없던
//   "&apos;" 가 제목에 박힌 것처럼 보인다(속성값이 아니라 필요도 없다).
const XML_ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};
const esc = (s: string) => s.replace(/[&<>]/g, (c) => XML_ESC[c]);

/** XML 실체참조 되돌리기 — &amp; 를 마지막에 풀어야 이중 복원이 안 생긴다. */
const unesc = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

function colName(i: number): string {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) {
    s = String.fromCharCode(65 + (n % 26)) + s;
  }
  return s;
}

/** 통합 목록처럼 시트가 여럿인 파일도 있다 — 이름을 주면 그 시트를 읽는다. */
export function sheetNames(zip: AdmZip): Array<{ name: string; entry: string }> {
  const wb = zip.readAsText("xl/workbook.xml");
  const rels = zip.readAsText("xl/_rels/workbook.xml.rels");
  const target = new Map<string, string>();
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g))
    target.set(m[1], `xl/${m[2].replace(/^\//, "")}`);
  const out: Array<{ name: string; entry: string }> = [];
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)) {
    const entry = target.get(m[2]);
    if (entry) out.push({ name: m[1], entry });
  }
  return out;
}

export function readSheet(zip: AdmZip, entry = "xl/worksheets/sheet1.xml"): string[][] {
  const ssXml = zip.readAsText("xl/sharedStrings.xml");
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unesc(
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""),
    ),
  );
  const sheet = zip.readAsText(entry);
  const out: string[][] = [];
  for (const r of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(
      /<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)<\/v>|<is>([\s\S]*?)<\/is>)?<\/c>|<c r="([A-Z]+)\d+"[^>]*\/>/g,
    )) {
      const ref = c[1] ?? c[5];
      let idx = 0;
      for (const ch of ref) idx = idx * 26 + (ch.charCodeAt(0) - 64);
      idx -= 1;
      let val = "";
      if (c[3] !== undefined) {
        val = /t="s"/.test(c[2] ?? "") ? (shared[Number(c[3])] ?? "") : c[3];
      } else if (c[4] !== undefined) {
        // 인라인 문자열(이 스크립트가 쓴 결과) — 다시 돌려도 값이 그대로여야 한다.
        val = unesc(
          [...c[4].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
            .map((x) => x[1])
            .join(""),
        );
      }
      row[idx] = val;
    }
    out.push([...row].map((v) => v ?? ""));
  }
  return out;
}

export function writeSheet(
  zip: AdmZip,
  rows: string[][],
  entry = "xl/worksheets/sheet1.xml",
): void {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) =>
          v === "" || v == null
            ? ""
            : /^\d+$/.test(v)
              ? `<c r="${colName(c)}${r + 1}"><v>${v}</v></c>`
              : `<c r="${colName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`,
        )
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const width = Math.max(...rows.map((r) => r.length));
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${colName(width - 1)}${rows.length}"/>` +
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="16.5"/>' +
    "<cols>" +
    '<col min="1" max="1" width="7" customWidth="1"/>' +
    '<col min="2" max="2" width="12" customWidth="1"/>' +
    '<col min="3" max="3" width="70" customWidth="1"/>' +
    '<col min="4" max="4" width="12" customWidth="1"/>' +
    '<col min="5" max="5" width="22" customWidth="1"/>' +
    '<col min="6" max="6" width="10" customWidth="1"/>' +
    '<col min="7" max="7" width="14" customWidth="1"/>' +
    '<col min="8" max="8" width="9" customWidth="1"/>' +
    '<col min="9" max="9" width="14" customWidth="1"/>' +
    "</cols>" +
    `<sheetData>${body}</sheetData>` +
    "</worksheet>";
  zip.updateFile("xl/worksheets/sheet1.xml", Buffer.from(xml, "utf8"));
  // 인라인 문자열만 쓰므로 공유문자열은 비운다(남겨 두면 Excel 이 불일치로 경고).
  zip.updateFile(
    "xl/sharedStrings.xml",
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>',
      "utf8",
    ),
  );
}
