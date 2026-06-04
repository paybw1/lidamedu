// LibreOffice WMF→PNG 변환 결과 중 깨끗하지 않은 후보 선별.
// 휴리스틱:
//   (1) 파일 크기 < 5KB → 거의 빈 페이지/단순 도형 (의심)
//   (2) sharp stats — channel 별 표준편차 < 임계값 → 텍스트/도형 정보 적음 (의심)
//   (3) 픽셀 평균값이 흰색(=거의 빈) → 의심
//   (4) 비정상적으로 큰 PNG 도 의심 (rendering 왜곡 추정)
//
// 각 항목에 problem_id + chapter+section+#번호 같이 표시.
//
//   node scripts/audit-expected-images.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import sharp from "sharp";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const DIR = "source/_converted/expected-images-png";
const MAP = JSON.parse(
  readFileSync("source/_converted/expected-image-map.json", "utf8"),
);

// answer image idx → url (storage).
const urlByImg = new Map();
for (const [k, v] of Object.entries(MAP)) {
  const m = k.match(/^answer:image(\d+)$/);
  if (m) urlByImg.set(m[1], v);
}

// answer:imageN → problem_id via DB explanation_md (저장 후 markdown image 검색).
const { data: lawRow } = await supa
  .from("laws").select("law_id").eq("law_code", "patent").single();
const { data: probs } = await supa
  .from("problems")
  .select("problem_id, body_md, explanation_md")
  .eq("origin", "expected")
  .eq("law_id", lawRow.law_id)
  .is("deleted_at", null)
  .not("explanation_md", "is", null);

const problemByUrl = new Map();
for (const p of probs ?? []) {
  for (const m of (p.explanation_md ?? "").matchAll(/!\[\]\((https?:\/\/[^)]+)\)/g)) {
    if (!problemByUrl.has(m[1])) {
      problemByUrl.set(m[1], { problemId: p.problem_id, stem: (p.body_md ?? "").slice(0, 50) });
    }
  }
}

// PNG 파일 — answer-imageN.png 만.
const files = readdirSync(DIR).filter((f) => /^answer-image\d+\.png$/.test(f));
console.log(`PNG: ${files.length} 개`);

const SIZE_SMALL = 5 * 1024;       // < 5KB
const SIZE_HUGE = 200 * 1024;       // > 200KB
const STD_LOW = 10;                  // sharp stats 평균 stdev 임계

const flagged = [];
for (const f of files) {
  const path = `${DIR}/${f}`;
  const size = statSync(path).size;
  const reasons = [];
  if (size < SIZE_SMALL) reasons.push(`size=${size}B<5KB`);
  if (size > SIZE_HUGE) reasons.push(`size=${(size / 1024).toFixed(0)}KB>200KB`);

  try {
    const stats = await sharp(path).stats();
    const stdevs = stats.channels.map((c) => c.stdev);
    const avgStd = stdevs.reduce((a, b) => a + b, 0) / stdevs.length;
    const means = stats.channels.map((c) => c.mean);
    const avgMean = means.reduce((a, b) => a + b, 0) / means.length;
    if (avgStd < STD_LOW) reasons.push(`stdev=${avgStd.toFixed(1)}<10`);
    if (avgMean > 245) reasons.push(`mean=${avgMean.toFixed(0)} (거의 흰색)`);
  } catch (e) {
    reasons.push(`sharp 실패: ${e.message}`);
  }

  if (reasons.length === 0) continue;
  const m = f.match(/answer-image(\d+)\.png/);
  const idx = m?.[1];
  const url = urlByImg.get(idx);
  const meta = url ? problemByUrl.get(url) : null;
  flagged.push({
    file: f,
    img: idx,
    size,
    reasons,
    problemId: meta?.problemId ?? "(unmapped)",
    stem: meta?.stem ?? "",
  });
}

// 심각도: 평균 색이 높을수록(빈 페이지 가까울수록) 우선.
for (const f of flagged) {
  try {
    const stats = await sharp(`${DIR}/${f.file}`).stats();
    f.mean = stats.channels.reduce((a, c) => a + c.mean, 0) / stats.channels.length;
  } catch {
    f.mean = 0;
  }
}
flagged.sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0));

console.log(`\n=== Redraw 후보 ${flagged.length} 건 (mean 색 높은 순) ===`);
for (const f of flagged) {
  console.log(
    `${f.file.padEnd(22)} mean=${(f.mean ?? 0).toFixed(0).padStart(3)} size=${String(f.size).padStart(6)}  ${f.problemId}  ${f.stem.slice(0, 40)}`,
  );
}

// markdown report 파일도 만들어 강사가 IDE/뷰어에서 검토 가능.
import { writeFileSync } from "node:fs";
const md = [
  "# Expected 해설 이미지 redraw 후보",
  "",
  `WMF→PNG 변환 결과 깨끗하지 않은 ${flagged.length} 건. 평균 색이 높을수록(흰색에 가까울수록) 우선.`,
  "",
  "| file | mean | size | problem_id | stem |",
  "|---|---:|---:|---|---|",
  ...flagged.map(
    (f) =>
      `| ${f.file} | ${(f.mean ?? 0).toFixed(0)} | ${f.size} | \`${f.problemId}\` | ${f.stem.slice(0, 50).replace(/\|/g, "\\|")} |`,
  ),
];
writeFileSync("source/_converted/expected-images-redraw.md", md.join("\n"));
console.log(`\nreport saved: source/_converted/expected-images-redraw.md`);
