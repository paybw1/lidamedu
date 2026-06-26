// 자연과학 기출 그림 전수 점검. 모든 past-exam-figure 를 받아 하단 선지행 혼입
// (detached bottom band) 후보를 잉크 분석으로 자동 플래그하고, 후보를 라벨 몽타주로 묶어
// 비전 확인할 수 있게 한다. 재크롭은 recrop-detect/recrop-at 로 별도 수행.
//   out: .tmp-audit/img/<dir>__q<NN>.png, candidates.json, montage-*.png
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");

const OUT = ".tmp-audit";
const IMG = path.join(OUT, "img");
fs.mkdirSync(IMG, { recursive: true });

// 1) 그림 URL 목록 (관리 API).
async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const rows = await q(`
  select p.problem_id,
         substring(p.body_md from '(https://[^) ]+past-exam-figure/[^) ]+)') as url
  from problems p
  where p.body_md like '%past-exam-figure%' and p.deleted_at is null
  order by 2`);
console.log(`figures: ${rows.length}`);

// 2) 다운로드 + 잉크분석.
function dirNumFromUrl(u) {
  const m = u.match(/past-exam-figure\/([^/]+)\/([^/?]+)/);
  return { dir: m?.[1] ?? "unknown", file: m?.[2] ?? "x.png" };
}

const candidates = [];
const all = [];
let i = 0;
for (const r of rows) {
  i++;
  const { dir, file } = dirNumFromUrl(r.url);
  const local = path.join(IMG, `${dir}__${file}`);
  try {
    if (!fs.existsSync(local)) {
      const resp = await fetch(r.url);
      if (!resp.ok) {
        all.push({ dir, file, url: r.url, problemId: r.problem_id, status: resp.status });
        console.log(`[${i}/${rows.length}] MISS ${resp.status} ${dir}/${file}`);
        continue;
      }
      fs.writeFileSync(local, Buffer.from(await resp.arrayBuffer()));
    }
    // 잉크 행 분석.
    const { data, info } = await sharp(local).greyscale().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const minInk = Math.max(3, Math.round(width * 0.004));
    const ink = new Array(height).fill(0);
    for (let y = 0; y < height; y++) {
      let c = 0;
      for (let x = 0; x < width; x++) if (data[y * width + x] < 140) c++;
      ink[y] = c;
    }
    const isInk = (y) => ink[y] > minInk;
    const BIG_GAP = Math.round(height * 0.035);
    // 맨 아래 잉크밴드 추적.
    let y = height - 1;
    while (y > 0 && !isInk(y)) y--;
    const bandBottom = y;
    let top = y, gap = 0, gapAbove = 0;
    for (let yy = y; yy >= 0; yy--) {
      if (isInk(yy)) { top = yy; gap = 0; }
      else { gap++; if (gap >= BIG_GAP) { gapAbove = gap; break; } }
    }
    const bandH = bandBottom - top + 1;
    // 후보 = 하단밴드가 짧고(<14%) 위로 큰 간격으로 분리 + 밴드가 하단 35% 안.
    const detached = gapAbove >= BIG_GAP && bandH < height * 0.14 && top > height * 0.6;
    const rec = {
      dir, file, url: r.url, problemId: r.problem_id, width, height,
      bandTop: top, bandH, gapAbove, cropFrac: +((top - Math.round(height * 0.012)) / height).toFixed(4),
      detached,
    };
    all.push(rec);
    if (detached) candidates.push(rec);
    if (i % 25 === 0) console.log(`[${i}/${rows.length}] scanned`);
  } catch (e) {
    console.log(`ERR ${dir}/${file}: ${e.message}`);
  }
}

fs.writeFileSync(path.join(OUT, "all.json"), JSON.stringify(all, null, 2));
fs.writeFileSync(path.join(OUT, "candidates.json"), JSON.stringify(candidates, null, 2));
console.log(`\ncandidates(하단밴드 혼입 의심): ${candidates.length}/${all.length}`);
console.log(candidates.map((c) => `${c.dir}/${c.file} band@${(c.cropFrac * 100).toFixed(0)}%`).join("\n"));

// 3) 후보 라벨 몽타주 (4열, 타일폭 360).
async function montage(items, tag) {
  const COLS = 4, TW = 360, LH = 22;
  for (let b = 0; b * 16 < items.length; b++) {
    const batch = items.slice(b * 16, b * 16 + 16);
    const tiles = await Promise.all(batch.map(async (it) => {
      const local = path.join(IMG, `${it.dir}__${it.file}`);
      const img = sharp(local);
      const meta = await img.metadata();
      const tw = TW, th = Math.round((meta.height / meta.width) * tw);
      const scaled = await img.resize(tw, th, { fit: "inside" }).extend({ bottom: LH, background: "#fff" }).toBuffer();
      const label = `${it.dir} ${it.file}`;
      const svg = Buffer.from(`<svg width="${tw}" height="${th + LH}"><text x="4" y="${th + 16}" font-size="13" fill="#c00" font-family="sans-serif">${label}</text></svg>`);
      return { buf: await sharp(scaled).composite([{ input: svg, top: 0, left: 0 }]).toBuffer(), w: tw, h: th + LH };
    }));
    const rowH = Math.max(...tiles.map((t) => t.h));
    const rows2 = Math.ceil(tiles.length / COLS);
    const canvasW = COLS * (TW + 8), canvasH = rows2 * (rowH + 8);
    const comp = tiles.map((t, idx) => ({ input: t.buf, top: Math.floor(idx / COLS) * (rowH + 8), left: (idx % COLS) * (TW + 8) }));
    const outp = path.join(OUT, `montage-${tag}-${b}.png`);
    await sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: "#ddd" } }).composite(comp).png().toFile(outp);
    console.log(`montage: ${outp} (${batch.length})`);
  }
}
await montage(candidates, "cand");
console.log("done");
