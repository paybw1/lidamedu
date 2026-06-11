// Auto-detect question boundaries via OCR of the left-margin "N." tokens.
// Outputs PAGE_QUESTIONS + OVERRIDE_CUTS (scale-2.2 px) for a year's 문제 PDF.
// Usage: node ocr-cuts.mjs <pdfPath> <tag> [expectCount=40]
import fs from "node:fs";
import path from "node:path";
import * as mupdf from "mupdf";

const pdfPath = process.argv[2];
const tag = process.argv[3];
const EXPECT = Number(process.argv[4] ?? "40");
const SKIP = Number(process.argv[5] ?? "0"); // 앞쪽 안내 페이지 건너뛰기
if (!pdfPath || !tag) throw new Error("usage: ocr-cuts.mjs <pdfPath> <tag> [expect]");

const OCR_SCALE = 2.5, CROP_SCALE = 2.2, k = CROP_SCALE / OCR_SCALE;
const CONF_MIN = 45, PAD = 18;
const OUT_DIR = "C:/project/lidamedu/scripts/jagwa/.ocr";
fs.mkdirSync(OUT_DIR, { recursive: true });

const { createWorker } = await import("tesseract.js");
const buf = fs.readFileSync(pdfPath);
const doc = mupdf.Document.openDocument(new Uint8Array(buf), "application/pdf");
const nPages = doc.countPages();
const worker = await createWorker("kor", 1, { logger: () => {} });

const perPage = [];
for (let i = SKIP; i < nPages; i++) {
  const page = doc.loadPage(i);
  const pix = page.toPixmap(mupdf.Matrix.scale(OCR_SCALE, OCR_SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = Buffer.from(pix.asPNG());
  const W = pix.getWidth(), H = pix.getHeight();
  const r = await worker.recognize(png, {}, { blocks: true });
  const words = [];
  for (const b of r.data.blocks || [])
    for (const p of b.paragraphs || [])
      for (const l of p.lines || [])
        for (const w of l.words || []) words.push(w);
  const leftMax = W * 0.22;
  const seen = new Set();
  const cands = words
    .map((w) => ({ t: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, conf: w.confidence }))
    .filter((w) => /^\d{1,2}\.$/.test(w.t) && w.x0 < leftMax && w.conf >= CONF_MIN)
    .map((w) => ({ n: parseInt(w.t, 10), y22: Math.round(w.y0 * k), conf: Math.round(w.conf) }))
    .sort((a, b) => a.y22 - b.y22)
    .filter((c) => (seen.has(c.n) ? false : (seen.add(c.n), true)));
  perPage.push({ page: i + 1 - SKIP, cands });
  pix.destroy?.(); page.destroy?.();
}
await worker.terminate();
doc.destroy?.();

// Pass 1: greedy place cleanly-sequenced detections (the anchors).
const flat = [];
for (const pg of perPage) for (const c of pg.cands) flat.push({ n: c.n, page: pg.page, y22: c.y22, conf: c.conf });
flat.sort((a, b) => a.page - b.page || a.y22 - b.y22);
const detected = {};
let expected = 1;
for (const c of flat) {
  if (c.n < expected || c.n > expected + 3) continue;
  while (expected < c.n) expected++; // leave gaps for pass 2
  if (c.n === expected) { detected[c.n] = { page: c.page, y22: c.y22, conf: c.conf }; expected++; }
}
const anchorPages = new Set(Object.values(detected).map((v) => v.page));

// Pass 2: fill 1..EXPECT in ascending order (placed[n-1] already resolved).
const placed = {};
for (let n = 1; n <= EXPECT; n++) {
  if (detected[n]) { placed[n] = { ...detected[n], inferred: false }; continue; }
  const prev = placed[n - 1] ?? null;
  const next = detected[n + 1] ?? null; // only trust a detected next anchor
  let page, y22 = null;
  if (!prev) page = next?.page ?? 1;
  else if (!next) page = prev.page; // n+1 also missing → n continues on prev's page
  else if (prev.page === next.page) {
    page = prev.page;
    if (prev.y22 != null && next.y22 != null) y22 = Math.round((prev.y22 + next.y22) / 2); // interpolate (review)
  } else {
    let empty = null;
    for (let p = prev.page + 1; p < next.page; p++) if (!anchorPages.has(p)) { empty = p; break; }
    page = empty ?? next.page; // OCR most often drops the FIRST number of a page
  }
  placed[n] = { page, y22, conf: 0, inferred: true };
}

// build outputs
const pageQuestions = {}, cuts = {};
for (let n = 1; n <= EXPECT; n++) (pageQuestions[placed[n].page] ||= []).push(n);
const review = [];
for (const [page, ns] of Object.entries(pageQuestions)) {
  ns.sort((a, b) => a - b);
  cuts[page] = [];
  for (let i = 1; i < ns.length; i++) {
    const pl = placed[ns[i]];
    if (pl.y22 == null) { cuts[page].push(null); review.push(`p${page} q${ns[i]} cut=INFERRED(null)`); }
    else { cuts[page].push(Math.max(1, pl.y22 - PAD)); if (pl.conf < 70) review.push(`p${page} q${ns[i]} conf=${pl.conf}`); }
  }
}
const missing = Object.entries(placed).filter(([, v]) => v.inferred).map(([n]) => Number(n));

const out = { tag, pdfPath, expect: EXPECT, nPages, pageQuestions, cuts, missing, review };
const jsonPath = path.join(OUT_DIR, `${tag}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));

console.log(`pages=${nPages} detected=${Object.values(placed).filter((v) => !v.inferred).length}/${EXPECT} inferred=${missing.length}`);
console.log("pageQuestions:", JSON.stringify(pageQuestions));
console.log("cuts:", JSON.stringify(cuts));
if (missing.length) console.log("MISSING(inferred page, single-Q assumed):", missing.join(","));
if (review.length) console.log("REVIEW:", review.join(" | "));
console.log(`wrote ${jsonPath}`);
