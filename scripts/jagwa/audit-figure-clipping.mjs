// 자연과학 figure 이미지 "가장자리 클리핑(그림 잘림)" 전수 감사.
// past-exam-figure 이미지를 받아 4변 outer band 의 content 밀도를 재고, 여백 없이
// 내용이 가장자리에 붙은(=잘린) 후보를 순위화 + 몽타주(육안 확정용) 생성.
//   node scripts/jagwa/audit-figure-clipping.mjs
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import "dotenv/config";

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const OUT = process.env.CLAUDE_JOB_DIR
  ? `${process.env.CLAUDE_JOB_DIR}/tmp/fig-audit`
  : "./.tmp-fig-audit";
mkdirSync(OUT, { recursive: true });

const CONTENT = 200; // gray < 200 = 내용(연회색 채움+선). 255=흰 여백.
const BAND = 0.012; // outer 1.2% 밴드
const MARGIN_DENSITY = 0.03; // 밴드 내 한 줄이라도 폭의 3%+ 내용이면 "가장자리 닿음"

function edgeTouch(gray, w, h) {
  const at = (x, y) => gray[y * w + x] < CONTENT;
  const bandV = Math.max(3, Math.round(h * BAND));
  const bandH = Math.max(3, Math.round(w * BAND));
  const rowDen = (y) => {
    let c = 0;
    for (let x = 0; x < w; x++) if (at(x, y)) c++;
    return c / w;
  };
  const colDen = (x) => {
    let c = 0;
    for (let y = 0; y < h; y++) if (at(x, y)) c++;
    return c / h;
  };
  let top = 0,
    bot = 0,
    left = 0,
    right = 0;
  for (let i = 0; i < bandV; i++) {
    top = Math.max(top, rowDen(i));
    bot = Math.max(bot, rowDen(h - 1 - i));
  }
  for (let i = 0; i < bandH; i++) {
    left = Math.max(left, colDen(i));
    right = Math.max(right, colDen(w - 1 - i));
  }
  return { top, bot, left, right };
}

const { data: rows } = await supa
  .from("problems")
  .select("problem_id, science_subject, year, problem_number, body_md")
  .like("body_md", "%past-exam-figure%")
  .is("deleted_at", null);
console.log(`figure 문제: ${rows.length}`);

const reUrl = /!\[[^\]]*\]\((https:\/\/[^)]+past-exam-figure[^)]+)\)/;
const items = [];
let done = 0;
async function analyze(r) {
  const m = r.body_md.match(reUrl);
  if (!m) return;
  const url = m[1];
  try {
    const resp = await fetch(url);
    if (!resp.ok) return;
    const buf = Buffer.from(await resp.arrayBuffer());
    const img = sharp(buf);
    const meta = await img.metadata();
    const { data, info } = await img
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const e = edgeTouch(data, info.width, info.height);
    // 클립 점수: top/left/right 가중(하단은 baseline 정상 많아 약가중).
    const score =
      (e.top > MARGIN_DENSITY ? e.top : 0) * 1.0 +
      (e.left > MARGIN_DENSITY ? e.left : 0) * 0.8 +
      (e.right > MARGIN_DENSITY ? e.right : 0) * 0.8 +
      (e.bot > MARGIN_DENSITY ? e.bot : 0) * 0.4;
    items.push({
      problemId: r.problem_id,
      subject: r.science_subject,
      year: r.year,
      num: r.problem_number,
      url,
      w: meta.width,
      h: meta.height,
      ...e,
      score: Math.round(score * 1000) / 1000,
      buf,
    });
  } catch (err) {
    console.error("err", r.problem_id, err.message);
  } finally {
    if (++done % 40 === 0) console.log(`  ${done}/${rows.length}`);
  }
}
// 동시성 10
const queue = [...rows];
await Promise.all(
  Array.from({ length: 10 }, async () => {
    while (queue.length) await analyze(queue.shift());
  }),
);

items.sort((a, b) => b.score - a.score);
const flagged = items.filter((it) => it.score >= MARGIN_DENSITY);
console.log(`\n클립 의심(score>=${MARGIN_DENSITY}): ${flagged.length} / ${items.length}`);
console.log("상위 20:");
for (const it of items.slice(0, 20)) {
  console.log(
    `  ${it.score.toFixed(3)} ${it.subject} ${it.year}#${it.num}  T${it.top.toFixed(2)} B${it.bot.toFixed(2)} L${it.left.toFixed(2)} R${it.right.toFixed(2)}  ${it.problemId}`,
  );
}

// 메타 저장(buf 제외)
writeFileSync(
  `${OUT}/all.json`,
  JSON.stringify(
    items.map(({ buf, ...m }) => m),
    null,
    1,
  ),
);

// 몽타주: 상위 후보를 40개씩 그리드(8열×5행), 라벨 포함.
const COLS = 5,
  ROWS = 8,
  CELL_W = 320,
  CELL_H = 200,
  LABEL_H = 22;
async function montage(list, path) {
  const cellH = CELL_H + LABEL_H;
  const canvas = sharp({
    create: {
      width: COLS * CELL_W,
      height: ROWS * cellH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  });
  const comps = [];
  for (let i = 0; i < list.length && i < COLS * ROWS; i++) {
    const it = list[i];
    const col = i % COLS,
      row = Math.floor(i / COLS);
    const thumb = await sharp(it.buf)
      .resize(CELL_W - 8, CELL_H - 8, {
        fit: "contain",
        background: { r: 245, g: 245, b: 245 },
      })
      .extend({ top: 4, bottom: 4, left: 4, right: 4, background: { r: 220, g: 60, b: 60 } })
      .png()
      .toBuffer();
    comps.push({ input: thumb, left: col * CELL_W, top: row * cellH });
    const label = Buffer.from(
      `<svg width="${CELL_W}" height="${LABEL_H}"><rect width="100%" height="100%" fill="white"/><text x="4" y="16" font-size="14" font-family="sans-serif">${it.score.toFixed(2)} ${it.subject} ${it.year}#${it.num} T${it.top.toFixed(2)} B${it.bot.toFixed(2)} L${it.left.toFixed(2)} R${it.right.toFixed(2)}</text></svg>`,
    );
    comps.push({ input: label, left: col * CELL_W, top: row * cellH + CELL_H });
  }
  await canvas.composite(comps).png().toFile(path);
  console.log(`몽타주: ${path}`);
}
// 전수 몽타주 — 과목·연도·번호 순으로 40개씩(육안 전수 검토용).
const ord = [...items].sort(
  (a, b) =>
    a.subject.localeCompare(b.subject) ||
    a.year - b.year ||
    a.num - b.num,
);
const PER = 40;
for (let b = 0; b * PER < ord.length; b++) {
  await montage(
    ord.slice(b * PER, b * PER + PER),
    `${OUT}/all-${String(b + 1).padStart(2, "0")}.png`,
  );
}
console.log(`\n출력 폴더: ${OUT}  (전수 몽타주 all-NN.png ${Math.ceil(ord.length / PER)}장)`);
process.exit(0);
