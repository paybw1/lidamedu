// feat-7-037 (역방향) — 업로드된 전문 PDF 에서 텍스트 추출 (mupdf).
// 스캔 이미지 PDF(텍스트 레이어 없음)는 빈 문자열 반환 → 호출부에서 경고.

import * as mupdf from "mupdf";

export interface PdfExtractResult {
  text: string;
  pageCount: number;
}

/** 같은 줄로 묶는 baseline 허용 오차(글자 크기 대비). */
const LINE_TOLERANCE_RATIO = 0.35;
/** 이 폭 이상 벌어지면(글자 크기 대비) 공백을 넣는다 — 공백 문자가 없는 PDF 대비. */
const SPACE_GAP_RATIO = 0.28;

interface Glyph {
  x0: number;
  x1: number;
  y: number;
  size: number;
  c: string;
}

/**
 * 페이지의 글자를 **좌표로 다시 줄 세운다**.
 *
 * ★법원 판결문 PDF 는 본문·괄호·숫자를 별도 텍스트 런으로 흩어 놓는 경우가 많아,
 *   mupdf 의 기본 읽기 순서(`asText()`)를 그대로 쓰면 문장이 조각나고 숫자가 줄 끝으로
 *   밀린다("갑 제호증 5(9)"). 사실관계는 날짜·번호가 그대로 남아야 하는 자료라
 *   조각난 텍스트를 AI 입력으로 쓰면 사실을 잘못 옮긴다.
 *   그래서 글자별 좌표(baseline y → x)로 정렬해 원래 줄을 복원한다.
 */
function pageText(page: mupdf.Page): string {
  const st = page.toStructuredText("preserve-whitespace,preserve-spans");
  const glyphs: Glyph[] = [];
  st.walk({
    onChar(c: string, _origin: unknown, _font: unknown, size: number, quad) {
      const q = quad as unknown as number[];
      glyphs.push({ x0: q[0], x1: q[2], y: q[5], size, c });
    },
  });
  if (!glyphs.length) return "";

  glyphs.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines: Glyph[][] = [];
  for (const g of glyphs) {
    const cur = lines[lines.length - 1];
    const prev = cur?.[cur.length - 1];
    const tol = Math.max(2, (prev?.size ?? g.size) * LINE_TOLERANCE_RATIO);
    if (cur && prev && Math.abs(g.y - prev.y) <= tol) cur.push(g);
    else lines.push([g]);
  }

  return lines
    .map((line) => {
      line.sort((a, b) => a.x0 - b.x0);
      let out = "";
      let prev: Glyph | null = null;
      for (const g of line) {
        if (
          prev &&
          g.c !== " " &&
          !out.endsWith(" ") &&
          g.x0 - prev.x1 > g.size * SPACE_GAP_RATIO
        ) {
          out += " ";
        }
        out += g.c;
        prev = g;
      }
      return out.trimEnd();
    })
    .join("\n");
}

/** PDF bytes → 페이지별 텍스트 추출 + 경량 정리(과다 공백/빈 줄). */
export async function extractPdfText(
  bytes: Uint8Array,
): Promise<PdfExtractResult> {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pageCount = doc.countPages();
  const parts: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    parts.push(pageText(doc.loadPage(i) as mupdf.Page));
  }
  const text = parts
    .join("\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, pageCount };
}
