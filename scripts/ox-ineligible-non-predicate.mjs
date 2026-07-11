// 정오문제 전수감사 — 서술어(종결어미)로 끝나지 않는 OX 지문을 정오불가(ox_ineligible=true) 처리.
//   대상: ox_truth IS NOT NULL AND ox_ineligible=false 인 problem_choices / problem_box_items.
//   서술어 종결 판정(뒤쪽 공백·문장부호·인용부호·괄호 제거 후 마지막 글자):
//     · '다'(종결: 이다/한다/없다/아니다 …)  · 종성 ㅁ(음/함/됨/있음/없음)  · '요'(구어 종결)
//   그 외(명사·조사·연결어미·열거 ㄱㄴㄷ/㉠㉡/㈎㈏·개수 'N개'·청구항 헤더 등) = 정오불가.
//
//   dry-run:  node scripts/ox-ineligible-non-predicate.mjs
//   apply:    node scripts/ox-ineligible-non-predicate.mjs --apply
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const c = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TRAIL = /[\s.。…·․«»()[\]{}『』「」“”‘’"'`~!?、,;:∙ㆍ]+$/gu;
export function isPredicateEnding(raw) {
  const t = (raw || "").replace(TRAIL, "");
  if (!t) return false;
  const last = t[t.length - 1];
  if (last === "다" || last === "요") return true;
  if (last >= "가" && last <= "힣") {
    const jong = (last.charCodeAt(0) - 0xac00) % 28;
    if (jong === 16) return true; // 종성 ㅁ
  }
  return false;
}

async function fetchAll(table, idCol) {
  const rows = [];
  let f = 0;
  for (;;) {
    const { data, error } = await c
      .from(table)
      .select(`${idCol}, body_md`)
      .not("ox_truth", "is", null)
      .eq("ox_ineligible", false)
      .range(f, f + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
    f += 1000;
  }
  return rows;
}

async function run(table, idCol) {
  const rows = await fetchAll(table, idCol);
  const targets = rows.filter((r) => !isPredicateEnding(r.body_md));
  console.log(
    `\n[${table}] OX-eligible ${rows.length} → 정오불가 대상 ${targets.length}`,
  );
  console.log("  예시 12:");
  for (const r of targets.slice(0, 12))
    console.log(`    · …${(r.body_md || "").trim().slice(-34)}`);
  if (!APPLY) return { total: rows.length, marked: targets.length };
  let ok = 0;
  const CHUNK = 200;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const ids = targets.slice(i, i + CHUNK).map((r) => r[idCol]);
    const { error } = await c
      .from(table)
      .update({ ox_ineligible: true })
      .in(idCol, ids);
    if (error) {
      console.log(`  ✗ ${error.message}`);
      break;
    }
    ok += ids.length;
  }
  console.log(`  ✓ 적용 ${ok}/${targets.length}`);
  return { total: rows.length, marked: ok };
}

const a = await run("problem_choices", "choice_id");
const b = await run("problem_box_items", "box_item_id");
console.log(
  `\n합계: OX-eligible ${a.total + b.total} → 정오불가 ${a.marked + b.marked}`,
);
if (!APPLY) console.log("[dry-run] 적용하려면 --apply");
