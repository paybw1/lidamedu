// {law}-{year}.json → {law}-{year}-review.md 재생성 (수리 반영본 검수용).
//   node scripts/jagwa/rebuild-review-md.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const GEN_DIR = "tmp/rubric-gen";
const LAW_LABEL = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  "civil-procedure": "민사소송법",
};
let n = 0;
for (const f of readdirSync(GEN_DIR)) {
  const m = f.match(/^([a-z-]+)-(\d{4})\.json$/);
  if (!m || !LAW_LABEL[m[1]]) continue;
  const items = JSON.parse(readFileSync(join(GEN_DIR, f), "utf8"));
  const review = items
    .sort((a, b) => a.problem_number - b.problem_number)
    .map(
      (r) =>
        `# ${LAW_LABEL[r.law]} 제${r.round}회(${r.year}) 문제 ${r.problem_number} (${r.total_points ?? "?"}점${r.has_examiner_note ? " · 채점위원 채점평 반영" : ""}${r.repaired_at ? " · 감수 수리본" : ""})\n\n` +
        `## 자기점검 체크리스트\n${r.rubric_items.map((it) => `- [ ] ${it.label} (${it.points}점)`).join("\n")}\n\n` +
        `${r.grading_rubric_md}\n\n---\n\n# 모범답안\n\n${r.model_answer_md}`,
    )
    .join("\n\n\n═══════════════════════════════════\n\n\n");
  writeFileSync(join(GEN_DIR, f.replace(/\.json$/, "-review.md")), review, "utf8");
  n++;
}
console.log(`review md ${n}개 재생성`);
