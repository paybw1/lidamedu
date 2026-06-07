// 판례 전문 PDF 자동 조판 — pdf-lib + @pdf-lib/fontkit + 나눔명조.
//
// 입력: 머리말 메타(사건번호·법원·선고일·사건명) + 본문 텍스트(official_text_md).
// 출력: PDF bytes + 미커버 글자 리스트 (한자 등).
//
// 미커버 정책: 폰트가 렌더 못 하는 글자가 1자라도 있으면 PDF 생성 skip + 보고만.
// 사용자 결정: "□ 로 조용히 내보내지 말 것" — Noto Serif CJK KR 등 대체 검토 위함.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

// Noto Serif KR (TTF/glyf) — 한글+한자+단위(℃㎎)+그리스(αβ)+로마숫자(ⅠⅡ) 전부 커버 +
// pdf-lib 정상 서브셋·임베드.
// ⚠️ 과거 NotoSerifCJKkr-Regular.otf(OTF/CFF)는 pdf-lib subset:true 에서 CFF outline 이
//    깨져 뷰어가 CJK 글리프를 못 그렸다(영문·숫자만 표시 → 전문 PDF "깨짐"). TTF 로 교체해 해결.
//    NanumMyeongjo(TTF)는 한자 미커버라 ~28% skip → Noto Serif KR 채택.
//
// 경로: 서버리스(Vercel) 함수 번들에 폰트가 포함되도록 import.meta.url 상대경로를
// 1순위로 사용(Vercel nft 가 new URL(literal, import.meta.url) 를 추적해 번들에 동봉).
// process.cwd() 폴백은 로컬 dev/스크립트용. (process.cwd() 만 쓰면 서버리스에서
// public/ 가 함수에 없어 ENOENT 가능 — 정방향 PDF 렌더가 cron 에서 실패하던 잠재 원인)
const FONT_URL = new URL(
  "../../../../public/fonts/NotoSerifKR-Regular.ttf",
  import.meta.url,
);
const FONT_PATH = (() => {
  const traced = fileURLToPath(FONT_URL);
  if (existsSync(traced)) return traced;
  return resolve(process.cwd(), "public/fonts/NotoSerifKR-Regular.ttf");
})();

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = { left: 50, right: 50, top: 60, bottom: 60 } as const;
const CONTENT_W = A4_W - MARGIN.left - MARGIN.right;

const TITLE_PT = 16; // 사건번호
const SUBTITLE_PT = 13; // 사건명
const META_PT = 10;   // 법원·선고일
const BODY_PT = 11;
const LINE_GAP = BODY_PT * 0.6; // 줄 간격 (size + LINE_GAP)
const LINE_HEIGHT = BODY_PT + LINE_GAP;
const PARA_GAP = 4;
const FOOTER_PT = 9;

const COURT_KO: Record<string, string> = {
  supreme: "대법원",
  patent_court: "특허법원",
  high_court: "고등법원",
  district_court: "지방법원",
};

export interface OfficialTextPdfInput {
  caseNumber: string;
  caseTitle: string | null;
  /** cases.court enum value 또는 표시명. */
  court: string | null;
  /** 'YYYY-MM-DD' 또는 'YYYYMMDD'. */
  decidedAt: string | null;
  /** cases.official_text_md (정규화 완료). */
  fullText: string;
}

export interface UnrenderableEntry {
  char: string;
  codePoint: number;
  offset: number;
}

export interface OfficialTextPdfResult {
  pdfBytes: Uint8Array;
  pageCount: number;
  /** 비어 있으면 정상. 1건 이상이면 PDF 생성 skip — 호출자가 보고. */
  unrenderable: UnrenderableEntry[];
}

let cachedFontBytes: Uint8Array | null = null;
function loadFontBytes(): Uint8Array {
  if (!cachedFontBytes) cachedFontBytes = readFileSync(FONT_PATH);
  return cachedFontBytes;
}

function formatDecidedAt(raw: string | null): string {
  if (!raw) return "";
  // YYYYMMDD → YYYY-MM-DD.
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return raw;
}

interface FontkitGlyphProbe {
  hasGlyphForCodePoint(cp: number): boolean;
}

/**
 * 본문에 빈번한 원문자(①②… ㉠㉡… ⒜… 등) 를 평문으로 변환.
 * 폰트 미커버 회피 + 가독성 손실 최소. 한자는 손대지 않음(의미 보존, 정책상 skip 대상).
 */
function substituteForFont(s: string): string {
  return s
    // ∼(U+223C TILDE OPERATOR) — Noto Serif CJK KR 미커버. 평문 ~ 로.
    .replace(/∼/g, "~")
    // 아래첨자 ₀–₉ (U+2080–U+2089) — Noto Serif CJK KR 미커버. 평문 0–9 로.
    // (화학식 등에 등장. 정보 손실 거의 없음.)
    .replace(/[₀-₉]/g, (ch) => String(ch.codePointAt(0)! - 0x2080))
    // 위첨자 ⁰–⁹ (U+2070, U+00B9, U+00B2, U+00B3, U+2074–U+2079) — 동일 대체.
    .replace(/⁰/g, "0")
    .replace(/¹/g, "1")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[⁴-⁹]/g, (ch) => String(ch.codePointAt(0)! - 0x2070))
    // ①(U+2460) – ⑳(U+2473) → "(1)" – "(20)"
    .replace(/[①-⑳]/g, (ch) => `(${ch.codePointAt(0)! - 0x2460 + 1})`)
    // ⑴(U+2474) – ⒇(U+2487) → 동일
    .replace(/[⑴-⒇]/g, (ch) => `(${ch.codePointAt(0)! - 0x2474 + 1})`)
    // ⒈(U+2488) – ⒛(U+249B) → "1." – "20."
    .replace(/[⒈-⒛]/g, (ch) => `${ch.codePointAt(0)! - 0x2488 + 1}.`)
    // ㉠(U+3260) – ㉭(U+326D) → "(가)" – "(하)"
    .replace(/[㉠-㉭]/g, (ch) => {
      const han = "가나다라마바사아자차카타파하";
      const i = ch.codePointAt(0)! - 0x3260;
      return `(${han[i] ?? ch})`;
    })
    // Ⓐ(U+24B6) – Ⓩ(U+24CF) → "(A)" – "(Z)"
    .replace(/[Ⓐ-Ⓩ]/g, (ch) =>
      `(${String.fromCodePoint(ch.codePointAt(0)! - 0x24b6 + 0x41)})`,
    )
    // ⓐ(U+24D0) – ⓩ(U+24E9) → "(a)" – "(z)"
    .replace(/[ⓐ-ⓩ]/g, (ch) =>
      `(${String.fromCodePoint(ch.codePointAt(0)! - 0x24d0 + 0x61)})`,
    );
}

/**
 * 한 텍스트 전부에 대해 폰트 글리프 커버리지 검사.
 * 공백·줄바꿈·탭은 항상 통과(글리프 없어도 조판상 무관).
 */
function findUnrenderable(
  font: FontkitGlyphProbe,
  text: string,
): UnrenderableEntry[] {
  const out: UnrenderableEntry[] = [];
  let offset = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp == null) {
      offset += ch.length;
      continue;
    }
    // 제어문자/공백류는 검사 제외.
    if (cp <= 0x20 || cp === 0xa0 || cp === 0x3000) {
      offset += ch.length;
      continue;
    }
    if (!font.hasGlyphForCodePoint(cp)) {
      out.push({ char: ch, codePoint: cp, offset });
    }
    offset += ch.length;
  }
  return out;
}

/**
 * 한 줄을 maxWidth 안에 맞춰 wrap. 한국어는 어절 경계 무시하고 글자 단위 wrap
 * (한국 법원 PDF 관습과 일치). 영문/한자는 동일 규칙.
 */
function wrapToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (!text) return [""];
  const lines: string[] = [];
  let current = "";
  for (const ch of text) {
    const candidate = current + ch;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface PageCursor {
  page: PDFPage;
  y: number;
}

function newPage(doc: PDFDocument): PageCursor {
  const page = doc.addPage([A4_W, A4_H]);
  return { page, y: A4_H - MARGIN.top };
}

function ensureSpace(
  doc: PDFDocument,
  cur: PageCursor,
  needed: number,
): PageCursor {
  if (cur.y - needed < MARGIN.bottom) {
    return newPage(doc);
  }
  return cur;
}

function drawLine(cur: PageCursor, font: PDFFont, text: string, size: number, opts?: { color?: ReturnType<typeof rgb>; lineHeight?: number }): void {
  const color = opts?.color ?? rgb(0, 0, 0);
  cur.page.drawText(text, { x: MARGIN.left, y: cur.y, size, font, color });
  cur.y -= opts?.lineHeight ?? size + LINE_GAP;
}

export async function renderOfficialTextPdf(
  input: OfficialTextPdfInput,
): Promise<OfficialTextPdfResult> {
  const fontBytes = loadFontBytes();

  // 1) 폰트 미커버 검사 (PDF 만들기 전 cheap).
  //    fontkit.create() 는 @pdf-lib/fontkit 0.x 의 default export 형태.
  const fkAny = fontkit as unknown as {
    create(b: Uint8Array): FontkitGlyphProbe;
  };
  const probe = fkAny.create(fontBytes);

  // 본문/메타 — 원문자 등 평문 대체 후 검사·렌더.
  const subTitle = substituteForFont(input.caseTitle ?? "");
  const subBody = substituteForFont(input.fullText);
  const subCourt = COURT_KO[input.court ?? ""] ?? input.court ?? "";
  const subDate = formatDecidedAt(input.decidedAt);
  const allText = [input.caseNumber, subTitle, subCourt, subDate, subBody].join("\n");

  const unrenderable = findUnrenderable(probe, allText);
  if (unrenderable.length > 0) {
    return { pdfBytes: new Uint8Array(0), pageCount: 0, unrenderable };
  }

  // 2) PDF 생성.
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  let cur = newPage(pdfDoc);

  // 머리말.
  cur = ensureSpace(pdfDoc, cur, TITLE_PT + 4);
  drawLine(cur, font, input.caseNumber, TITLE_PT);

  if (subTitle.trim()) {
    const wrapped = wrapToWidth(subTitle.trim(), font, SUBTITLE_PT, CONTENT_W);
    for (const ln of wrapped) {
      cur = ensureSpace(pdfDoc, cur, SUBTITLE_PT + 4);
      drawLine(cur, font, ln, SUBTITLE_PT, { color: rgb(0.15, 0.15, 0.15) });
    }
  }

  const meta = [subCourt, subDate].filter(Boolean).join("  ·  ");
  if (meta) {
    cur = ensureSpace(pdfDoc, cur, META_PT + 4);
    drawLine(cur, font, meta, META_PT, { color: rgb(0.45, 0.45, 0.45) });
  }

  cur.y -= 8;
  cur.page.drawLine({
    start: { x: MARGIN.left, y: cur.y },
    end: { x: A4_W - MARGIN.right, y: cur.y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  cur.y -= 14;

  // 본문 — 문단 단위(평문 대체 적용본).
  const paragraphs = subBody.split(/\n+/);
  for (const para of paragraphs) {
    if (!para.trim()) {
      cur.y -= LINE_HEIGHT / 2;
      continue;
    }
    const wrapped = wrapToWidth(para, font, BODY_PT, CONTENT_W);
    for (const ln of wrapped) {
      cur = ensureSpace(pdfDoc, cur, LINE_HEIGHT);
      cur.page.drawText(ln, {
        x: MARGIN.left,
        y: cur.y,
        size: BODY_PT,
        font,
        color: rgb(0, 0, 0),
      });
      cur.y -= LINE_HEIGHT;
    }
    cur.y -= PARA_GAP;
  }

  // 페이지 번호 — 모든 페이지.
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const label = `${i + 1} / ${pages.length}`;
    const w = font.widthOfTextAtSize(label, FOOTER_PT);
    p.drawText(label, {
      x: (A4_W - w) / 2,
      y: 30,
      size: FOOTER_PT,
      font,
      color: rgb(0.55, 0.55, 0.55),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, pageCount: pdfDoc.getPageCount(), unrenderable: [] };
}
