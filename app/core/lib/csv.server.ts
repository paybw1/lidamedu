// CSV 다운로드 응답 — 회계·정산 핸드오프용. 운영 화면 loader 에서 ?export=csv 로 반환.
// Excel 이 한글을 깨지 않게 UTF-8 BOM 을 선두에 붙이고, 줄바꿈은 CRLF.

function escapeCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  // 콤마·따옴표·개행 포함 시 따옴표로 감싸고 내부 따옴표는 두 번.
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const r of rows) lines.push(r.map(escapeCell).join(","));
  return lines.join("\r\n");
}

/** 다운로드용 text/csv Response. filename 은 확장자 포함(예: "결제내역_2026-07.csv"). */
export function csvResponse(
  filename: string,
  headers: string[],
  rows: Array<Array<unknown>>,
): Response {
  const BOM = String.fromCharCode(0xfeff);
  const body = BOM + toCsv(headers, rows);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
