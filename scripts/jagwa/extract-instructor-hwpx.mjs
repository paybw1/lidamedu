// 강사별 해설 hwpx → 텍스트 추출 + manifest 갱신 (feat-2-034 Stage 1 보강).
// scripts/hwpx-to-text.mjs 를 파일별로 실행해 paragraphs → 평문 txt 로 변환하고,
// tmp/instructor-explanations/manifest.json 의 hwp 오류 항목을 교체/추가한다.
//
//   node scripts/jagwa/extract-instructor-hwpx.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";

const SRC = "source/2차 기출 강사별 해설";
const OUT = "tmp/instructor-explanations";
const SUBJECT_PATTERNS = [
  ["patent", /특허/],
  ["trademark", /상표/],
  ["design", /디자인|디보/],
  ["civil-procedure", /민소|민사소송/],
];

const manifestPath = join(OUT, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

for (const dirent of readdirSync(SRC, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const round = Number(dirent.name.replace(/회$/, ""));
  if (Number.isNaN(round)) continue;
  for (const file of readdirSync(join(SRC, dirent.name))) {
    if (!/\.hwpx$/i.test(file)) continue;
    const srcPath = join(SRC, dirent.name, file);
    const tmpJson = join(OUT, "hwpx-tmp.json");
    execFileSync("node", ["scripts/hwpx-to-text.mjs", srcPath, "-o", tmpJson], {
      stdio: "pipe",
    });
    const { paragraphs } = JSON.parse(readFileSync(tmpJson, "utf8"));
    const text = paragraphs
      .map((p) => p.text ?? "")
      .filter((t) => t.trim().length > 0)
      .join("\n")
      .replace(/\[IMG:[^\]]+\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const subject =
      SUBJECT_PATTERNS.find(([, re]) => re.test(file))?.[0] ?? null;
    const txtName = basename(file, ".hwpx") + ".txt";
    writeFileSync(join(OUT, dirent.name, txtName), text, "utf8");
    // manifest: 같은 basename 의 .hwp 오류 항목 제거 후 hwpx 항목 추가/교체.
    const base = basename(file, ".hwpx");
    for (let i = manifest.length - 1; i >= 0; i--) {
      const m = manifest[i];
      if (m.round === round && m.file.replace(/\.(hwp|hwpx)$/i, "") === base)
        manifest.splice(i, 1);
    }
    manifest.push({
      round,
      year: round + 1963,
      file,
      subject,
      pages: 0,
      chars: text.length,
      suspectScan: false,
      error: null,
    });
    console.log(`✓ ${round}회 ${file} → ${txtName} (${text.length}자, ${subject})`);
    rmSync(tmpJson, { force: true });
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
console.log("manifest 갱신 완료");
