// Probe: can tesseract detect question-number tokens ("N.") at the left margin
// with positions? Validate on known 2010 pages (p3=Q4,5,6 / p4=Q7,8,9,10).
import fs from "node:fs";
import * as mupdf from "mupdf";

const PDF = "C:/project/lidamedu/source/기출모음(2010~2026)/1차/문제/2010_47_1_자과A.pdf";
const { createWorker } = await import("tesseract.js");
const buf = fs.readFileSync(PDF);
const doc = mupdf.Document.openDocument(new Uint8Array(buf), "application/pdf");
const SCALE = 2.5;
const worker = await createWorker("kor", 1, { logger: () => {} });

for (const pageIdx of [2, 3, 8]) { // pages 3,4,9 (0-based) — Q4-6, Q7-10, Q19
  const page = doc.loadPage(pageIdx);
  const pix = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = Buffer.from(pix.asPNG());
  const W = pix.getWidth(), H = pix.getHeight();
  const r = await worker.recognize(png, {}, { blocks: true });
  const words = [];
  for (const b of r.data.blocks || [])
    for (const p of b.paragraphs || [])
      for (const l of p.lines || [])
        for (const w of l.words || []) words.push(w);
  const leftMax = W * 0.22;
  const cands = words
    .filter((w) => /^\d{1,2}\.?$/.test(w.text.trim()) && w.bbox.x0 < leftMax)
    .map((w) => `${w.text.trim()}@y${Math.round(w.bbox.y0 / SCALE)}(x${Math.round(w.bbox.x0)},c${Math.round(w.confidence)})`);
  console.log(`page ${pageIdx + 1} (${W}x${H}) words=${words.length}: ${cands.join("  ")}`);
  pix.destroy?.(); page.destroy?.();
}
await worker.terminate();
doc.destroy?.();
