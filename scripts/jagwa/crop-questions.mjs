// Crop each question out of the rendered page PNGs into .crops/q01..q40.png,
// then build a single contact sheet for visual verification of segmentation.
// Strategy: per page we know how many questions K it holds (PAGE_QUESTIONS).
// Detect horizontal whitespace bands; cut at the (K-1) largest interior gaps
// (or OVERRIDE_CUTS); tight-bbox each segment. No DB/Storage writes.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { PAGE_QUESTIONS, OVERRIDE_CUTS, QUESTIONS, RENDER_DIR, CROP_DIR } from "./data.mjs";

const DARK = 150;      // gray < DARK counts as ink
const BLANK_MAX = 3;   // row with <= this many ink px is "blank"
const INK_MIN = 4;     // row with > this many ink px is "content"
const MIN_GAP = 16;    // candidate whitespace band min height (px)
const CUT_GAP = 22;    // gap must be >= this to be eligible as a question cut
const PAD = 14;        // padding around tight bbox

fs.mkdirSync(CROP_DIR, { recursive: true });

async function rowColProfile(file) {
  const { data, info } = await sharp(file).grayscale().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const rowDark = new Int32Array(H);
  const colDark = new Int32Array(W);
  for (let y = 0; y < H; y++) {
    const off = y * W;
    let cnt = 0;
    for (let x = 0; x < W; x++) {
      if (data[off + x] < DARK) { cnt++; colDark[x]++; }
    }
    rowDark[y] = cnt;
  }
  return { rowDark, colDark, W, H };
}

// maximal runs of blank rows -> [{y0,y1,h}]
function blankRuns(rowDark, H) {
  const runs = [];
  let s = -1;
  for (let y = 0; y < H; y++) {
    const blank = rowDark[y] <= BLANK_MAX;
    if (blank && s < 0) s = y;
    if (!blank && s >= 0) { runs.push({ y0: s, y1: y, h: y - s }); s = -1; }
  }
  if (s >= 0) runs.push({ y0: s, y1: H, h: H - s });
  return runs;
}

function contentRange(rowDark, H) {
  let top = 0, bot = H;
  while (top < H && rowDark[top] <= INK_MIN) top++;
  while (bot > top && rowDark[bot - 1] <= INK_MIN) bot--;
  // Footer = short bottom ink cluster separated by a big gap -> exclude it.
  const runs = blankRuns(rowDark, H);
  const interiorBig = runs.filter((r) => r.y0 > top && r.y1 < bot && r.h >= 40);
  if (interiorBig.length) {
    const last = interiorBig[interiorBig.length - 1];
    const tail = bot - last.y1; // ink height below the last big gap
    if (tail > 0 && tail < 55 && last.h >= 50) bot = last.y0; // drop footer
  }
  return { top, bot };
}

function tightBox(rowDark, colDark, W, a, b) {
  let y0 = a, y1 = b;
  while (y0 < b && rowDark[y0] <= INK_MIN) y0++;
  while (y1 > y0 && rowDark[y1 - 1] <= INK_MIN) y1--;
  // horizontal bbox (whole-page column profile is a fine proxy; margins are uniform)
  let x0 = 0, x1 = W;
  while (x0 < W && colDark[x0] <= INK_MIN) x0++;
  while (x1 > x0 && colDark[x1 - 1] <= INK_MIN) x1--;
  return {
    left: Math.max(0, x0 - PAD),
    top: Math.max(0, y0 - PAD),
    width: Math.min(W, x1 + PAD) - Math.max(0, x0 - PAD),
    height: Math.min(b, y1 + PAD) - Math.max(0, y0 - PAD),
  };
}

const crops = []; // {n, file, box}
for (const [pageStr, nums] of Object.entries(PAGE_QUESTIONS)) {
  const page = Number(pageStr);
  const file = path.join(RENDER_DIR, `p${String(page).padStart(2, "0")}.png`);
  const { rowDark, colDark, W, H } = await rowColProfile(file);
  const { top, bot } = contentRange(rowDark, H);
  const K = nums.length;

  let cuts;
  if (OVERRIDE_CUTS[page]) {
    cuts = [...OVERRIDE_CUTS[page]].sort((a, b) => a - b);
  } else if (K === 1) {
    cuts = [];
  } else {
    const cands = blankRuns(rowDark, H)
      .filter((r) => r.y0 > top + 8 && r.y1 < bot - 8 && r.h >= CUT_GAP)
      .map((r) => ({ yc: Math.round((r.y0 + r.y1) / 2), h: r.h }));
    cands.sort((a, b) => b.h - a.h);
    cuts = cands.slice(0, K - 1).map((c) => c.yc).sort((a, b) => a - b);
  }

  const bounds = [top, ...cuts, bot];
  const gapReport = blankRuns(rowDark, H)
    .filter((r) => r.y0 > top + 8 && r.y1 < bot - 8 && r.h >= CUT_GAP)
    .map((r) => `${Math.round((r.y0 + r.y1) / 2)}:${r.h}`)
    .join("  ");
  console.log(`p${page} (K=${K}) content=[${top}..${bot}] cuts=[${cuts.join(",")}]  gaps{ ${gapReport} }`);

  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    const box = tightBox(rowDark, colDark, W, bounds[i], bounds[i + 1]);
    const out = path.join(CROP_DIR, `q${String(n).padStart(2, "0")}.png`);
    await sharp(file).extract(box).toFile(out);
    crops.push({ n, file: out, box });
    console.log(`   q${String(n).padStart(2, "0")}  ${box.width}x${box.height}`);
  }
}

// ---- Contact sheet: 5 cols x 8 rows, one cell per question (sorted) ----
const COLS = 5, ROWS = 8, CW = 300, CH = 362, TW = CW - 12, TH = CH - 34;
const sheetW = COLS * CW, sheetH = ROWS * CH;
const meta = new Map(QUESTIONS.map((q) => [q.n, q]));
const layers = [];
crops.sort((a, b) => a.n - b.n);
for (let idx = 0; idx < crops.length; idx++) {
  const { n, file } = crops[idx];
  const col = idx % COLS, row = Math.floor(idx / COLS);
  const cellX = col * CW, cellY = row * CH;
  const q = meta.get(n);
  const thumb = await sharp(file)
    .resize(TW, TH, { fit: "inside", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .toBuffer({ resolveWithObject: true });
  layers.push({ input: thumb.data, left: cellX + 6 + Math.floor((TW - thumb.info.width) / 2), top: cellY + 28 });
  const label = `Q${n}  ${q.scienceSubject.slice(0, 4)}  ${q.format}  ans:${q.answers.join(",")}`;
  const svg = Buffer.from(
    `<svg width="${CW}" height="26"><rect width="${CW}" height="26" fill="#eef"/>` +
    `<text x="6" y="18" font-family="sans-serif" font-size="15" fill="#003">${label}</text></svg>`,
  );
  layers.push({ input: svg, left: cellX, top: cellY + 2 });
}
const sheetPath = path.join(CROP_DIR, "_contact-sheet.png");
await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: "#ffffff" } })
  .composite(layers)
  .png()
  .toFile(sheetPath);
console.log(`\ncontact sheet -> ${sheetPath}  (${sheetW}x${sheetH})  crops=${crops.length}`);
