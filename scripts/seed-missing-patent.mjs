// 누락된 특허 기출/변형 문제 백필 (one-off).
//
// 배경: 2026-05-03 객관식(Ⅰ) 기출 워크북 최종 재시드 당시, seed-problems.mjs 의
//   `if (p.choices.length !== 5) skip` 에 걸려 일부 문제가 적재되지 않았다.
//   그 후 파서(splitChoices 단조성 가드 등)가 수정돼 지금은 정상 파싱된다.
//   → 워크북을 현재 파서로 재파싱한 결과(merged-full.json)를 운영 DB와 대조해
//     DB 에 없는(=그때 skip된) 문제만 골라 삽입한다. 전체 재시드(soft-delete 후 재삽입)는
//     이후 쌓인 분류/해설/승인을 날리므로 하지 않는다.
//
// 입력 재생성:
//   node scripts/hwpx-to-text.mjs "source/특허법 기출(1차)/객관식 기출문제 [제20판].hwpx" -o tmp/kicheul-I.json
//   node scripts/hwpx-to-text.mjs "source/특허법 기출(1차)/[완0305+내지+해설편] 객관식(Ⅰ) 기출문제 [제20판].hwpx" -o tmp/haesol-I.json
//   node scripts/parse-problems.mjs tmp/kicheul-I.json tmp/haesol-I.json tmp/merged-full.json
//
// 사용: node scripts/seed-missing-patent.mjs [merged.json]            # dry-run
//       node scripts/seed-missing-patent.mjs [merged.json] --apply    # 실제 insert
//
// 사전조건: .env = 운영(mcgdoplo) SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { readFileSync } from "node:fs";

const REF = "mcgdoplovrjgklbxmozi";
const SOURCE_DOC = "b83a2018-18ea-4174-bed4-716244297a9b"; // 객관식(Ⅰ) 기출 — 문제편
const APPROVED_BY = "e20ac99a-bfa6-4862-94dd-23c063189463"; // 현재 임병웅 admin (형제 변형과 동일)

const APPLY = process.argv.includes("--apply");
const mergedPath =
  process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) ?? "tmp/merged-full.json";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL?.includes(REF)) {
  console.error(`SAFETY: SUPABASE_URL 이 ${REF}(운영) 가 아님 → 중단`);
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 감사로 찾은 누락 후보 중, DB 직접 대조로 "진짜 누락(live 트윈 없음)"이 확인된 4건만
// 명시 allow-list 로 삽입한다. 나머지 후보는 파싱 잔재(2차변형단원/’98종합 접두)·다중행
// 발문·연도 오라벨 때문에 이미-존재함에도 오탐된 것이라 제외(=이미 DB live).
const ALLOW = [
  { origin: "past_exam_variant", year: 2018, num: 4, stem: "특허출원에 관한 설명으로 옳지 않은" },
  { origin: "past_exam_variant", year: 2000, num: 1, stem: "직무발명에 관한 다음의 기술 중 옳지 않은" },
  { origin: "past_exam_variant", year: 2007, num: 7, stem: "특허권 침해에 대한 손해배상청구에 관한 다음 설명 중 옳지 않은" },
  { origin: "past_exam", year: 2000, num: 1, stem: "심결에 대한 소" },
];

const norm = (s) => (s || "").split("\n")[0].replace(/\s+/g, "").trim();
const isAllowed = (p) =>
  ALLOW.some(
    (a) =>
      a.origin === p.origin &&
      a.year === p.year &&
      a.num === p.problemNumber &&
      norm(p.stem).includes(norm(a.stem)),
  );
const inferFormat = (stem) =>
  /사례|다음\s*사례/.test(stem)
    ? "mc_case"
    : /<\s*보기\s*>|\[\s*보기\s*\]/.test(stem)
      ? "mc_box"
      : "mc_short";
const inferPolarity = (stem) =>
  /옳지\s*않은|틀린|아닌|아니한|않는/.test(stem) ? "negative" : "positive";

const { problems } = JSON.parse(readFileSync(mergedPath, "utf8"));
// 이 워크북(객관식 Ⅰ)은 기출 + 기출변형만.
const wb = problems.filter(
  (p) => p.origin === "past_exam" || p.origin === "past_exam_variant",
);

const { data: law } = await supa
  .from("laws")
  .select("law_id")
  .eq("law_code", "patent")
  .maybeSingle();
if (!law) {
  console.error("patent law 없음");
  process.exit(1);
}
const lawId = law.law_id;

const { data: dbRows, error } = await supa
  .from("problems")
  .select("problem_id, origin, year, body_md")
  .eq("law_id", lawId)
  .in("origin", ["past_exam", "past_exam_variant"])
  .is("deleted_at", null);
if (error) {
  console.error(error);
  process.exit(1);
}

// (origin|year|normStem) 멀티셋 카운트 기반 diff.
const dbCount = new Map();
for (const r of dbRows) {
  const k = `${r.origin}|${r.year}|${norm(r.body_md)}`;
  dbCount.set(k, (dbCount.get(k) || 0) + 1);
}
const missing = [];
for (const p of wb) {
  const k = `${p.origin}|${p.year}|${norm(p.stem)}`;
  const c = dbCount.get(k) || 0;
  if (c > 0) dbCount.set(k, c - 1);
  else missing.push(p);
}

const toInsert = missing.filter(isAllowed);
console.log(
  `워크북 기출/변형 ${wb.length} · DB ${dbRows.length} · 누락 후보 ${missing.length} · 삽입대상(allow-list) ${toInsert.length}\n`,
);
for (const p of missing) {
  const ans = p.correctList ? p.correctList.join(",") : p.correctIndex;
  const tag = isAllowed(p) ? "▶ 삽입" : "· 제외(이미 live/오탐)";
  console.log(
    `${tag} | ${p.origin} ${p.year} #${p.problemNumber} [${p.scope}/${inferPolarity(p.stem)}/${p.format ?? inferFormat(p.stem)}] 정답 ${ans} · 선지 ${p.choices.length}`,
  );
  console.log(`   발문: ${(p.stem || "").replace(/\s+/g, " ").slice(0, 90)}`);
  if (isAllowed(p)) {
    for (const c of p.choices) {
      console.log(
        `    ${c.index === p.correctIndex ? "★" : " "}${c.index}. ${c.body.replace(/\s+/g, " ").slice(0, 64)}`,
      );
    }
  }
}

if (!APPLY) {
  console.log(`\n(dry-run — 적용하려면 --apply. 삽입은 위 ▶ ${toInsert.length}건만)`);
  process.exit(0);
}

let ins = 0;
for (const p of toInsert) {
  // 멱등: 동일 (law,origin,year,body) live 행이 이미 있으면 skip.
  const { data: dup } = await supa
    .from("problems")
    .select("problem_id")
    .eq("law_id", lawId)
    .eq("origin", p.origin)
    .eq("year", p.year)
    .eq("body_md", p.stem)
    .is("deleted_at", null)
    .maybeSingle();
  if (dup) {
    console.log(`= skip(존재) ${p.year} #${p.problemNumber}`);
    continue;
  }
  const { data: probRow, error: e1 } = await supa
    .from("problems")
    .insert({
      law_id: lawId,
      exam_round: "first",
      subject_type: "law",
      origin: p.origin,
      format: p.format ?? inferFormat(p.stem),
      scope: p.scope,
      polarity: inferPolarity(p.stem),
      year: p.year,
      problem_number: p.problemNumber,
      body_md: p.stem,
      explanation_md: p.explanation || null,
      source_doc_id: SOURCE_DOC,
      review_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: APPROVED_BY,
    })
    .select("problem_id")
    .single();
  if (e1) {
    console.error(`insert 실패 ${p.year}#${p.problemNumber}`, e1.message);
    continue;
  }
  const correctSet = new Set(
    p.correctList ?? (p.correctIndex != null ? [p.correctIndex] : []),
  );
  const choiceRows = p.choices.map((c) => ({
    problem_id: probRow.problem_id,
    choice_index: c.index,
    body_md: c.body,
    is_correct: !p.noAnswer && correctSet.has(c.index),
    explanation_md: p.choiceExplanations?.[c.index] ?? null,
    choice_type: p.choiceTypes?.[c.index] ?? null,
  }));
  const { error: e2 } = await supa.from("problem_choices").insert(choiceRows);
  if (e2) {
    console.error(`choices 실패 ${p.year}#${p.problemNumber}`, e2.message);
    continue;
  }
  if (p.boxItems?.length) {
    const boxRows = p.boxItems.map((bi) => ({
      problem_id: probRow.problem_id,
      position_index: bi.position,
      marker: bi.marker,
      body_md: bi.body,
      explanation_md: bi.explanation,
      ox_truth: bi.oxTruth,
      choice_type: bi.choiceType,
    }));
    await supa.from("problem_box_items").insert(boxRows);
  }
  ins++;
  console.log(`✓ ${p.year} #${p.problemNumber} → ${probRow.problem_id}`);
}
console.log(`\n적용 완료: ${ins} inserted`);
