// 정렬 불일치 조사(investigate-expected-mismatches)에서 확인된, 옛 파서가
// 이웃 지문을 복제하고 원래 지문을 분실한 손상 4건을 문제편 원본으로 복구.
//
// 각 타깃은 (problem_id, choice_index, locate=원본 정답의 distinctive 조각).
// locate 로 원본 paragraph 를 유일하게 찾아 선지 마커 제거 후 본문으로 교체.
// 유일 매칭 + 현재값과 다름 + 원본 검증을 통과한 것만 적용.
//
//   node scripts/recover-expected-mangled-choices.mjs            # dry-run
//   node scripts/recover-expected-mangled-choices.mjs --apply

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
console.log(`proj: ${process.env.SUPABASE_URL}`);

const paras = JSON.parse(
  readFileSync("source/_converted/expected-problems.json", "utf8"),
).paragraphs;
const stripMarker = (s) => (s ?? "").replace(/^\s*[①②③④⑤]\s*/, "").trim();
const flat = (s) => (s ?? "").replace(/\s+/g, "");

const TARGETS = [
  { problem_id: "493ef9d7-0f90-4d60-ad21-9f832582a78c", choice_index: 2, label: "#10 비밀유지명령", locate: "비밀유지명령의 일부가 취소된 소송" },
  { problem_id: "5a20c2aa-3740-4e4a-8fcc-5ea07b2139b8", choice_index: 4, label: "#9 확대된선출원", locate: "「특허협력조약」 제21조에 따라 국제공개되거나" },
  { problem_id: "b4abf57a-438d-4b7f-9b85-57d9be45a0b7", choice_index: 3, label: "#7 외국어출원", locate: "기한 이전에 그 국어번역문을 갈음하여 새로운 국어번역문" },
  { problem_id: "e41fc66d-0b86-4165-9d55-5cccf786778f", choice_index: 2, label: "#7 甲청구항", locate: "기간내 보정료 납부에 대한 보정을 하지 않은 경우" },
];

function findUniqueSource(locate) {
  const hits = [];
  for (const p of paras) {
    for (const line of String(p.text ?? "").split(/\n/)) {
      if (/^\s*[①②③④⑤]/.test(line) && flat(line).includes(flat(locate))) {
        hits.push(stripMarker(line));
      }
    }
  }
  // 동일 본문 중복은 1개로.
  const uniq = [...new Set(hits)];
  return uniq;
}

const updates = [];
for (const t of TARGETS) {
  const src = findUniqueSource(t.locate);
  const { data: cur, error } = await supa
    .from("problem_choices")
    .select("choice_id, body_md")
    .eq("problem_id", t.problem_id)
    .eq("choice_index", t.choice_index)
    .single();
  if (error) { console.log(`\n[${t.label}] DB 조회 실패: ${error.message}`); continue; }
  console.log(`\n[${t.label}] idx=${t.choice_index}  원본매칭 ${src.length}건`);
  if (src.length !== 1) { console.log(`  ⚠ 유일 매칭 아님 — 건너뜀`); continue; }
  const newBody = src[0];
  console.log(`  old(${cur.body_md.length}): ${JSON.stringify(cur.body_md)}`);
  console.log(`  new(${newBody.length}): ${JSON.stringify(newBody)}`);
  if (flat(cur.body_md) === flat(newBody)) { console.log(`  = 이미 동일 — 건너뜀`); continue; }
  updates.push({ choice_id: cur.choice_id, label: t.label, idx: t.choice_index, newBody });
}

console.log(`\n=== 복구 대상 ${updates.length}건 ===`);
if (!APPLY) { console.log(`(dry-run — --apply 로 실행)`); process.exit(0); }

let ok = 0;
for (const u of updates) {
  const { error } = await supa
    .from("problem_choices").update({ body_md: u.newBody }).eq("choice_id", u.choice_id);
  if (error) console.error(`  실패 ${u.label}: ${error.message}`);
  else ok++;
}
console.log(`완료 — ok=${ok}/${updates.length}`);
