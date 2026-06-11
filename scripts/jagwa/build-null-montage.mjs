// Montage the 45 null-section question crops into review sheets (8/sheet, labeled).
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const TAG = { 2011: "2011_48_B", 2012: "2012_49_A", 2013: "2013_50_A", 2014: "2014_51_A", 2015: "2015_52_A", 2016: "2016_53_A", 2017: "2017_54_A", 2018: "2018_55_A", 2019: "2019_56_B", 2020: "2020_57_A", 2021: "2021_58_B", 2022: "2022_59_A", 2023: "2023_60_A", 2024: "2024_61_A", 2025: "2025_62_A", 2026: "2026_63_A" };
const NULLS = [
  [2011, [17, 23, 27, 31, 36, 40]], [2012, [8, 23, 28, 29, 39]], [2013, [12, 18, 22, 30, 31]],
  [2014, [18]], [2015, [14]], [2016, [18]], [2017, [20, 33, 34]], [2018, [11, 30]],
  [2019, [13, 19, 27, 28, 30]], [2020, [28]], [2021, [25]], [2022, [1, 2, 3, 4, 16, 21, 27, 38]],
  [2023, [4, 30, 32]], [2024, [35]], [2025, [18]], [2026, [30]],
].flatMap(([y, ns]) => ns.map((n) => ({ y, n, tag: TAG[y] })));

const OUT = "C:/project/lidamedu/scripts/jagwa/.crops/_null";
fs.mkdirSync(OUT, { recursive: true });
const CW = 730, CH = 360, COLS = 2, ROWS = 4, PER = COLS * ROWS;
let sheet = 0;
for (let i = 0; i < NULLS.length; i += PER) {
  const group = NULLS.slice(i, i + PER);
  const layers = [];
  for (let j = 0; j < group.length; j++) {
    const { y, n, tag } = group[j];
    const file = path.join("C:/project/lidamedu/scripts/jagwa/.crops", tag, `q${String(n).padStart(2, "0")}.png`);
    const col = j % COLS, row = Math.floor(j / COLS);
    const x = col * CW, yy = row * CH;
    if (fs.existsSync(file)) {
      const thumb = await sharp(file).resize(CW - 12, CH - 30, { fit: "inside", background: "#fff" }).flatten({ background: "#fff" }).toBuffer({ resolveWithObject: true });
      layers.push({ input: thumb.data, left: x + 6, top: yy + 26 });
    }
    const svg = Buffer.from(`<svg width="${CW}" height="24"><rect width="${CW}" height="24" fill="#dde"/><text x="6" y="17" font-family="sans-serif" font-size="16" fill="#003">${y} · Q${n} (${y <= 2010 ? "" : ""}${["", "phys", "chem", "biol", "earth"][n <= 10 ? 1 : n <= 20 ? 2 : n <= 30 ? 3 : 4]})</text></svg>`);
    layers.push({ input: svg, left: x, top: yy + 1 });
  }
  const out = path.join(OUT, `sheet-${sheet + 1}.png`);
  await sharp({ create: { width: COLS * CW, height: ROWS * CH, channels: 3, background: "#fff" } }).composite(layers).png().toFile(out);
  console.log(`sheet ${sheet + 1}: ${group.map((g) => `${g.y}q${g.n}`).join(", ")}`);
  sheet++;
}
console.log(`${sheet} sheets, ${NULLS.length} crops → ${OUT}`);
