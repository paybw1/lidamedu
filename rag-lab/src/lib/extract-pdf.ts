/**
 * PDF → 페이지별 텍스트.
 * pdfjs-dist (legacy build, Node 호환).
 *
 * 텍스트가 거의 없으면 (scanned PDF 추정) 호출자에게 신호 — OCR 권유 메시지.
 */
import { readFileSync } from 'node:fs';
// pdfjs-dist legacy build (Node 환경)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');

export interface PdfPage {
  text: string;
  page: number;
}

export interface PdfExtractResult {
  pages: PdfPage[];
  totalChars: number;
  avgCharsPerPage: number;
  ocrLikelyNeeded: boolean;  // chars/page < 임계
}

const OCR_THRESHOLD_CHARS_PER_PAGE = 50;

export async function extractPdf(filepath: string): Promise<PdfExtractResult> {
  const data = new Uint8Array(readFileSync(filepath));
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const pages: PdfPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // pdfjs textContent.items: { str, transform[5]=y, ... }. 단순 join 으로 line-break 추정.
    let lastY: number | null = null;
    const parts: string[] = [];
    for (const item of content.items as { str: string; transform?: number[] }[]) {
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        parts.push('\n');
      }
      parts.push(item.str);
      lastY = y;
    }
    pages.push({ page: i, text: parts.join('').trim() });
    page.cleanup();
  }
  await doc.cleanup();
  await doc.destroy();
  const totalChars = pages.reduce((s, p) => s + p.text.length, 0);
  const avgCharsPerPage = pages.length ? totalChars / pages.length : 0;
  return {
    pages,
    totalChars,
    avgCharsPerPage,
    ocrLikelyNeeded: avgCharsPerPage < OCR_THRESHOLD_CHARS_PER_PAGE,
  };
}
