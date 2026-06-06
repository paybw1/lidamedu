// feat-7-037 (역방향) — 업로드된 전문 PDF 에서 텍스트 추출 (mupdf).
// 스캔 이미지 PDF(텍스트 레이어 없음)는 빈 문자열 반환 → 호출부에서 경고.

import * as mupdf from "mupdf";

export interface PdfExtractResult {
  text: string;
  pageCount: number;
}

/** PDF bytes → 페이지별 텍스트 추출 + 경량 정리(과다 공백/빈 줄). */
export async function extractPdfText(
  bytes: Uint8Array,
): Promise<PdfExtractResult> {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pageCount = doc.countPages();
  const parts: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const st = page.toStructuredText("preserve-whitespace");
    parts.push(st.asText());
  }
  const text = parts
    .join("\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, pageCount };
}
