// 상표 판례 book_sections 의 "전심의 판단"/"본심의 판단" 라벨을 워크북 원문 명칭으로 교정.
//   워크북(판례.hwpx → tm-precedents.json)의 sectionLabels 를 참조:
//     lower  원문: 원심의 판단 / 특허법원의 판단 / 법원의 판단
//     holding 원문: 대법원의 판단 / 사안의 경우
//   백필이 특허법원 확정판결(court!=대법원 & holding 없음)의 lower 를 holding 으로
//   재배치했으므로, DB holding 라벨은 sectionLabels.holding ?? sectionLabels.lower 로 해석.
//
//   dry-run:  node scripts/precedents/relabel-tm-court-sections.mjs
//   apply:    node scripts/precedents/relabel-tm-court-sections.mjs --apply
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const JSON_PATH = resolve(ROOT, "source/_converted/tm-precedents.json");
const APPLY = process.argv.includes("--apply");

const OLD_LOWER = "전심의 판단";
const OLD_HOLDING = "본심의 판단";

const client = createClient(
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── 워크북 원문 명칭 맵 ──
const wb = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const labelByCaseNumber = new Map(); // caseNumber → { lower, holding }
for (const t of wb.topics) {
  for (const c of t.cases) {
    const sl = c.sectionLabels ?? {};
    const cur = labelByCaseNumber.get(c.caseNumber);
    const next = {
      lower: sl.lower ?? cur?.lower ?? null,
      holding: sl.holding ?? cur?.holding ?? null,
    };
    labelByCaseNumber.set(c.caseNumber, next);
  }
}

// ── DB 상표 판례(book_sections 有) ──
const rows = [];
{
  let from = 0;
  const PAGE = 500;
  for (;;) {
    const { data, error } = await client
      .from("cases")
      .select("case_id, case_number, book_sections")
      .contains("subject_laws", ["trademark"])
      .not("book_sections", "is", null)
      .is("deleted_at", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
}

let changed = 0;
let unchanged = 0;
const unmatched = [];
const previews = [];
const newLabelCounts = {};
const updates = [];

for (const row of rows) {
  const bs = row.book_sections;
  const sections = Array.isArray(bs?.sections) ? bs.sections : null;
  if (!sections) continue;
  const wbLabels = labelByCaseNumber.get(row.case_number);
  let touched = false;
  const rowChanges = [];
  for (const sec of sections) {
    if (sec.key === "lower" && sec.label === OLD_LOWER) {
      const nl = wbLabels?.lower;
      if (!nl) {
        unmatched.push(`${row.case_number} (lower, 워크북 원문 없음)`);
        continue;
      }
      if (nl !== sec.label) {
        rowChanges.push(`전심: ${OLD_LOWER} → ${nl}`);
        sec.label = nl;
        newLabelCounts[nl] = (newLabelCounts[nl] || 0) + 1;
        touched = true;
      }
    } else if (sec.key === "holding" && sec.label === OLD_HOLDING) {
      const nl = wbLabels?.holding ?? wbLabels?.lower;
      if (!nl) {
        unmatched.push(`${row.case_number} (holding, 워크북 원문 없음)`);
        continue;
      }
      if (nl !== sec.label) {
        rowChanges.push(`본심: ${OLD_HOLDING} → ${nl}`);
        sec.label = nl;
        newLabelCounts[nl] = (newLabelCounts[nl] || 0) + 1;
        touched = true;
      }
    }
  }
  if (touched) {
    changed++;
    if (previews.length < 25)
      previews.push(`  ${row.case_number}: ${rowChanges.join(" | ")}`);
    updates.push({ case_id: row.case_id, book_sections: bs });
  } else {
    unchanged++;
  }
}

console.log(`상표 판례(book_sections): ${rows.length}건`);
console.log(`변경 대상: ${changed}건 / 변경 없음: ${unchanged}건`);
console.log(`새 라벨 분포:`, JSON.stringify(newLabelCounts, null, 0));
console.log(`\n미리보기(최대 25):`);
console.log(previews.join("\n"));
if (unmatched.length) {
  console.log(`\n⚠ 워크북 원문 미확보(스킵) ${unmatched.length}건:`);
  console.log(unmatched.slice(0, 30).map((u) => "  " + u).join("\n"));
}

if (!APPLY) {
  console.log(`\n[dry-run] 적용하려면 --apply`);
  process.exit(0);
}

console.log(`\n적용 중… ${updates.length}건`);
let ok = 0;
for (const u of updates) {
  const { error } = await client
    .from("cases")
    .update({ book_sections: u.book_sections })
    .eq("case_id", u.case_id);
  if (error) {
    console.log(`  ✗ ${u.case_id}: ${error.message}`);
  } else {
    ok++;
  }
}
console.log(`✓ 적용 완료: ${ok}/${updates.length}`);
