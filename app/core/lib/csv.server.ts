// CSV 다운로드 응답 — 회계·정산 핸드오프용. 운영 화면 loader 에서 ?export=csv 로 반환.
// Excel 이 한글을 깨지 않게 UTF-8 BOM 을 선두에 붙이고, 줄바꿈은 CRLF.

function escapeCell(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // CSV 수식 인젝션 방지(CWE-1236): =,+,-,@,탭,CR 로 시작하는 값은
  // Excel/Sheets 가 수식으로 실행할 수 있으므로 선두에 작은따옴표를 붙여 무력화.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
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
