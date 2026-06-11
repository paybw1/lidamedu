// 2019(56회)는 2단 컬럼 레이아웃. 각 PDF 페이지를 좌/우 컬럼으로 분할해 14개 컬럼
// 이미지(= 단일컬럼 "페이지")로 만들고, 컬럼별 OCR 로 문항 경계를 검출한다.
// 출력: RENDER_DIR/p01..p14.png (컬럼) + .ocr/<tag>.json (col->questions + cuts).
// 이후 crop-questions/build/load 는 그대로 동작. JAGWA_TAG=2019_56_B node prep-2019-columns.mjs
import * as mupdf from "mupdf";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { EXAM, RENDER_DIR, TAG } from "./data.mjs";

const SCALE = 3.2, SPLIT_FRAC = 0.5, CONF_MIN = 35, PAD = 18, EXPECT = 40;
const { createWorker } = await import("tesseract.js");
fs.mkdirSync(RENDER_DIR, { recursive: true });

// 1) render + split each page into L/R column images
const cols = [];
const buf = fs.readFileSync(EXAM.problemPdf);
const doc = mupdf.Document.openDocument(new Uint8Array(buf), "application/pdf");
const nPages = doc.countPages();
for (let i = 0; i < nPages; i++) {
  const page = doc.loadPage(i);
  const pix = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = Buffer.from(pix.asPNG());
  const W = pix.getWidth(), H = pix.getHeight();
  const sx = Math.round(W * SPLIT_FRAC);
  cols.push(await sharp(png).extract({ left: 0, top: 0, width: sx, height: H }).png().toBuffer());
  cols.push(await sharp(png).extract({ left: sx, top: 0, width: W - sx, height: H }).png().toBuffer());
  pix.destroy?.(); page.destroy?.();
}
doc.destroy?.();
for (let c = 0; c < cols.length; c++) fs.writeFileSync(path.join(RENDER_DIR, `p${String(c + 1).padStart(2, "0")}.png`), cols[c]);
console.log(`[${TAG}] split ${nPages} pages → ${cols.length} columns`);

// 2) OCR each column for left-margin "N." tokens
const worker = await createWorker("kor", 1, { logger: () => {} });
await worker.setParameters({ tessedit_pageseg_mode: "6" }); // single uniform block — denser column detection
const perCol = [];
for (let c = 0; c < cols.length; c++) {
  const r = await worker.recognize(cols[c], {}, { blocks: true });
  const W = (await sharp(cols[c]).metadata()).width;
  const words = [];
  for (const b of r.data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) words.push(w);
  const seen = new Set();
  const cands = words
    .map((w) => ({ t: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, conf: w.confidence }))
    .filter((w) => /^\d{1,2}\.$/.test(w.t) && w.x0 < W * 0.28 && w.conf >= CONF_MIN)
    .map((w) => ({ n: parseInt(w.t, 10), y: Math.round(w.y0), conf: Math.round(w.confidence) }))
    .sort((a, b) => a.y - b.y)
    .filter((c2) => (seen.has(c2.n) ? false : (seen.add(c2.n), true)));
  perCol.push({ col: c + 1, cands });
}
await worker.terminate();

// 3) reconstruct canonical 1..EXPECT (same as ocr-cuts)
const flat = [];
for (const col of perCol) for (const c of col.cands) flat.push({ n: c.n, page: col.col, y: c.y });
flat.sort((a, b) => a.page - b.page || a.y - b.y);
const detected = {}; let exp = 1;
for (const c of flat) { if (c.n < exp || c.n > exp + 3) continue; while (exp < c.n) exp++; if (c.n === exp) { detected[c.n] = { page: c.page, y: c.y }; exp++; } }
const anchorPages = new Set(Object.values(detected).map((v) => v.page));
const placed = {};
for (let n = 1; n <= EXPECT; n++) {
  if (detected[n]) { placed[n] = { ...detected[n], inferred: false }; continue; }
  const prev = placed[n - 1] ?? null, next = detected[n + 1] ?? null;
  let page, y = null;
  if (!prev) page = next?.page ?? 1;
  else if (!next) page = prev.page;
  else if (prev.page === next.page) { page = prev.page; if (prev.y != null && next.y != null) y = Math.round((prev.y + next.y) / 2); }
  else { let empty = null; for (let p = prev.page + 1; p < next.page; p++) if (!anchorPages.has(p)) { empty = p; break; } page = empty ?? next.page; }
  placed[n] = { page, y, inferred: true };
}
const pageQuestions = {}, cuts = {};
for (let n = 1; n <= EXPECT; n++) (pageQuestions[placed[n].page] ||= []).push(n);
for (const [page, ns] of Object.entries(pageQuestions)) {
  ns.sort((a, b) => a - b); cuts[page] = [];
  for (let i = 1; i < ns.length; i++) { const pl = placed[ns[i]]; cuts[page].push(pl.y != null ? Math.max(1, pl.y - PAD) : null); }
}
const missing = Object.entries(placed).filter(([, v]) => v.inferred).map(([n]) => Number(n));
fs.mkdirSync(path.join(import.meta.dirname, ".ocr"), { recursive: true });
fs.writeFileSync(path.join(import.meta.dirname, ".ocr", `${TAG}.json`), JSON.stringify({ tag: TAG, columns: cols.length, pageQuestions, cuts, missing }, null, 2));
console.log(`detected=${Object.values(placed).filter((v) => !v.inferred).length}/${EXPECT} inferred=${missing.length}`);
console.log("colQuestions:", JSON.stringify(pageQuestions));
if (missing.length) console.log("MISSING:", missing.join(","));
