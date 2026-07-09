// 상표 판례 요지의 "– 적극 / – 소극" 대시 마커를 특허와 동일한 "(적극)/(소극)" 괄호형으로 정규화.
// 대상: cases(subject_laws={trademark}) 의 summary_title + summary_items[].title (body 는 마커 0 확인).
// 규칙: title 끝의  [- – ] + <…적극|소극 로 끝나는 구> → ( <구> ).  전수조사상 마커는 전부 title 끝.
// dry-run 기본, --apply 로 반영. 원본은 tmp/trademark-marker-backup.json 에 백업(롤백용).
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// title 끝의 대시 마커 → 괄호. 대시(하이픈/엔대시), 뒤에 (…)/괄호 없는 구, 적극|소극 로 끝, 문자열 끝.
const MARKER_RE = /\s*[-–—]\s*([^-–—()]*?(?:적극|소극))\s*$/;
function convert(title) {
  if (typeof title !== "string") return title;
  return title.replace(MARKER_RE, " ($1)");
}

async function fetchAll() {
  const out = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb
      .from("cases")
      .select("case_id, case_number, summary_title, summary_items")
      .eq("subject_laws", "{trademark}")
      .is("deleted_at", null)
      .range(f, f + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const rows = await fetchAll();
const changes = [];
const backup = [];
let titleChanged = 0,
  itemChanged = 0;

for (const r of rows) {
  const newTitle = convert(r.summary_title);
  const items = Array.isArray(r.summary_items) ? r.summary_items : [];
  const newItems = items.map((it) =>
    it && typeof it === "object"
      ? { ...it, title: convert(it.title) }
      : it,
  );
  const titleDiff = newTitle !== r.summary_title;
  const itemsDiff = JSON.stringify(newItems) !== JSON.stringify(items);
  if (!titleDiff && !itemsDiff) continue;
  if (titleDiff) titleChanged++;
  if (itemsDiff) itemChanged++;
  backup.push({
    case_id: r.case_id,
    summary_title: r.summary_title,
    summary_items: r.summary_items,
  });
  changes.push({
    case_id: r.case_id,
    case_number: r.case_number,
    newTitle,
    newItems,
    titleDiff,
    itemsDiff,
    before: r.summary_title,
  });
}

console.log(`상표 판례 ${rows.length}건 중 변경 대상 ${changes.length}건`);
console.log(`  summary_title 변경 ${titleChanged} · summary_items title 변경 ${itemChanged}`);
console.log("\n샘플 (before → after):");
for (const c of changes.slice(0, 12)) {
  console.log(`  [${c.case_number}] ${c.before}\n      → ${c.newTitle}`);
}

// 잔여 대시 마커(변환 누락) 검증 — 변환 후 title 에 "- 적극" 류가 남으면 경고.
const leftover = changes.filter(
  (c) =>
    /[-–—]\s*[^()\n]{0,12}(적극|소극)/.test(c.newTitle) ||
    c.newItems.some(
      (it) => it?.title && /[-–—]\s*[^()\n]{0,12}(적극|소극)/.test(it.title),
    ),
);
console.log(`\n변환 후 잔여 대시 마커: ${leftover.length}건`);
leftover.slice(0, 5).forEach((c) => console.log("  ⚠", c.case_number, c.newTitle));

if (!APPLY) {
  console.log("\n[dry-run] DB 미반영. --apply 로 실행.");
  process.exit(0);
}

writeFileSync(
  "tmp/trademark-marker-backup.json",
  JSON.stringify(backup, null, 1),
);
console.log(`\n원본 백업 → tmp/trademark-marker-backup.json (${backup.length}건)`);

let done = 0;
for (const c of changes) {
  const { error } = await sb
    .from("cases")
    .update({ summary_title: c.newTitle, summary_items: c.newItems })
    .eq("case_id", c.case_id);
  if (error) {
    console.error("실패", c.case_number, error.message);
    continue;
  }
  done++;
  if (done % 50 === 0) console.log(`  ${done}/${changes.length}`);
}
console.log(`\n완료 — ${done}건 반영.`);
