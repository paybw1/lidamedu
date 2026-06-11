// Diagnostic: for each page, print x0 (leftmost content x) and for each whitespace
// gap the leftStart x of the row right after it (relative to x0) + first-token width.
// Goal: verify "question-number rows start at the far-left margin" hypothesis.
import sharp from "sharp";
import path from "node:path";
import { PAGE_QUESTIONS, RENDER_DIR } from "./data.mjs";

const DARK = 150, BLANK_MAX = 3, INK_MIN = 4, CUT_GAP = 20;

for (const [pageStr, nums] of Object.entries(PAGE_QUESTIONS)) {
  const page = Number(pageStr);
  const file = path.join(RENDER_DIR, `p${String(page).padStart(2, "0")}.png`);
  const { data, info } = await sharp(file).grayscale().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const rowDark = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    const off = y * W; let c = 0;
    for (let x = 0; x < W; x++) if (data[off + x] < DARK) c++;
    rowDark[y] = c;
  }
  // global x0 = min leftmost-ink over content rows
  let x0 = W;
  for (let y = 0; y < H; y++) {
    if (rowDark[y] <= INK_MIN) continue;
    const off = y * W;
    for (let x = 0; x < W; x++) { if (data[off + x] < DARK) { if (x < x0) x0 = x; break; } }
  }
  let top = 0, bot = H;
  while (top < H && rowDark[top] <= INK_MIN) top++;
  while (bot > top && rowDark[bot - 1] <= INK_MIN) bot--;
  // gaps
  const out = [];
  let s = -1;
  for (let y = top; y <= bot; y++) {
    const blank = y === bot || rowDark[y] <= BLANK_MAX;
    if (blank && s < 0) s = y;
    if (!blank && s >= 0) {
      const h = y - s;
      if (h >= CUT_GAP && s > top + 4) {
        // first content row after gap = y; measure leftStart + first token width
        const off = y * W; let ls = -1, te = -1;
        for (let x = 0; x < W; x++) { if (data[off + x] < DARK) { ls = x; break; } }
        if (ls >= 0) { // token end = first blank x after ls
          for (let x = ls; x < W; x++) { if (data[off + x] >= DARK) { // need a few blank px
            let blanks = 0, xx = x; while (xx < W && data[off + xx] >= DARK) { blanks++; xx++; }
            if (blanks >= 8) { te = x; break; }
          } }
        }
        out.push(`${Math.round((s + y) / 2)}(h${h},L${ls - x0}${te > 0 ? `,t${te - ls}` : ""})`);
      }
      s = -1;
    }
  }
  console.log(`p${page} K=${nums.length} x0=${x0} [${top}..${bot}]: ${out.join("  ")}`);
}
