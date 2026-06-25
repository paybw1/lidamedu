// 상표/디자인 기출 누락 24건 remediation (one-off).
//
// 원인: seed-tm-design-problems.mjs 가 선지≠5 / correctIndex==null 문제를 skip.
//  - 박스형 16건: "모두 고른 것은?" 선지가 한 줄에 병합(`① ㄱ,ㄴ② ㄱ,ㄷ③ …`)돼 파서가
//    줄당 1개만 잡아 선지 2개 → skip. patent splitChoices(단조 분리)로 5지문 복구 가능.
//  - 정답없음 8건: 출제오류로 해설편이 "정답 없음"(선지 전부 [×]) → correctIndex null → skip.
//
// 처리: 박스 16건 = 선지 재분리 후 approved(형제와 동일, 학생 노출).
//       정답없음 8건 = draft(원장 검토 후 전항정답/제외 결정), 선지 전부 is_correct=false.
//
// 입력: source/_converted/tm-design-merged.json (parse-tm-design-* 산출).
// 사용: node scripts/seed-missing-tm-design.mjs [--apply]   (dry-run 기본)
// 사전조건: .env = 운영(mcgdoplo) + SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REF = "mcgdoplovrjgklbxmozi";
const SOURCE_DOC = "864c30b9-655b-4fe3-89e1-7a850c6ad865"; // 상표+디자인 기출문제편 제3판
const APPLY = process.argv.includes("--apply");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MERGED = resolve(ROOT, "source/_converted/tm-design-merged.json");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL?.includes(REF)) {
  console.error(`SAFETY: SUPABASE_URL 이 ${REF}(운영) 아님 → 중단`);
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 발문 핵심부(파이프 앞)로 대조 — 박스 텍스트 차이로 인한 오탐 방지.
const norm = (s) => (s || "").split(/[|｜]/)[0].split("\n")[0].replace(/\s+/g, "").trim();

// patent 단조성 splitChoices — 병합된 선지 줄을 5개로 분리.
function splitChoices(text) {
  const re = /([①②③④⑤])\s*/g;
  const order = "①②③④⑤";
  const pos = [];
  let m;
  while ((m = re.exec(text)) !== null) pos.push({ mk: m[1], idx: m.index, end: m.index + m[0].length });
  if (!pos.length) return [];
  const sp = [pos[0]];
  let prev = order.indexOf(pos[0].mk);
  for (let k = 1; k < pos.length; k++) {
    const i = order.indexOf(pos[k].mk);
    if (i === prev + 1) { sp.push(pos[k]); prev = i; }
  }
  const out = [];
  for (let k = 0; k < sp.length; k++) {
    const cur = sp[k], nx = sp[k + 1];
    const b = text.slice(cur.end, nx ? nx.idx : text.length).trim();
    if (b) out.push({ index: order.indexOf(cur.mk) + 1, body: b });
  }
  return out;
}
const resplit = (choices) =>
  splitChoices((choices || []).map((c) => "①②③④⑤"[c.index - 1] + c.body).join(""));

const inferFormat = (stem) =>
  /사례/.test(stem) ? "mc_case"
  : /<\s*보기\s*>|\[\s*보기\s*\]|모두\s*고른/.test(stem) ? "mc_box"
  : "mc_short";
const inferPolarity = (stem) =>
  /옳지\s*않은|틀린|아닌|아니한|않는/.test(stem) ? "negative" : "positive";

const { problems } = JSON.parse(readFileSync(MERGED, "utf8"));

const { data: laws } = await supa
  .from("laws").select("law_id, law_code").in("law_code", ["trademark", "design"]);
const idByCode = new Map((laws ?? []).map((l) => [l.law_code, l.law_id]));
const codeById = new Map((laws ?? []).map((l) => [l.law_id, l.law_code]));

const { data: dbRows, error } = await supa
  .from("problems").select("law_id, year, body_md")
  .in("law_id", [...codeById.keys()]).is("deleted_at", null);
if (error) { console.error(error); process.exit(1); }

const dbCount = new Map();
for (const r of dbRows) {
  const k = `${codeById.get(r.law_id)}|${r.year}|${norm(r.body_md)}`;
  dbCount.set(k, (dbCount.get(k) || 0) + 1);
}
const missing = [];
for (const p of problems) {
  const k = `${p.lawCode}|${p.year}|${norm(p.stem)}`;
  const c = dbCount.get(k) || 0;
  if (c > 0) dbCount.set(k, c - 1);
  else missing.push(p);
}

// 각 누락 후보 정규화: 선지 5개 확보 시도 + 분류.
const prepared = missing.map((p) => {
  let choices = p.choices || [];
  let note = "";
  if (choices.length !== 5) {
    const rs = resplit(choices);
    if (rs.length === 5) { choices = rs; note = "박스재분리"; }
  }
  const hasFive = choices.length === 5;
  const hasAnswer = p.correctIndex != null;
  const status = hasFive && hasAnswer ? "approved" : "draft";
  return { p, choices, hasFive, hasAnswer, status, note };
});

console.log(`누락 ${missing.length} · approved예정 ${prepared.filter((x) => x.status === "approved").length} · draft예정 ${prepared.filter((x) => x.status === "draft").length}\n`);
for (const x of prepared) {
  const { p } = x;
  console.log(
    `[${x.status}${x.note ? "/" + x.note : ""}] ${p.lawCode} ${p.year} #${p.problemNumber} | 선지${x.choices.length} | 정답 ${p.correctIndex ?? "없음"} | ${inferFormat(p.stem)} | ${(p.stem || "").replace(/\s+/g, " ").slice(0, 60)}`,
  );
  if (!x.hasFive) console.log(`   ⚠ 5지문 미확보 — 삽입 보류`);
}

if (!APPLY) { console.log(`\n(dry-run — 적용하려면 --apply)`); process.exit(0); }

let ins = 0;
for (const x of prepared) {
  const { p, choices, status, hasAnswer } = x;
  if (choices.length !== 5) { console.log(`= 보류(5지문 미확보) ${p.lawCode} ${p.year}#${p.problemNumber}`); continue; }
  const lawId = idByCode.get(p.lawCode);
  // 멱등: 동일 (law,year,body) live 행 있으면 skip.
  const { data: dup } = await supa
    .from("problems").select("problem_id")
    .eq("law_id", lawId).eq("year", p.year).eq("body_md", p.stem).is("deleted_at", null).maybeSingle();
  if (dup) { console.log(`= skip(존재) ${p.lawCode} ${p.year}#${p.problemNumber}`); continue; }

  const { data: probRow, error: e1 } = await supa
    .from("problems").insert({
      law_id: lawId, exam_round: "first", subject_type: "law", origin: "past_exam",
      format: inferFormat(p.stem), scope: "comprehensive", polarity: inferPolarity(p.stem),
      year: p.year, problem_number: p.problemNumber, primary_article_id: null,
      body_md: p.stem, explanation_md: p.explanation || null, source_doc_id: SOURCE_DOC,
      review_status: status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
    }).select("problem_id").single();
  if (e1) { console.error(`insert 실패 ${p.lawCode} ${p.year}#${p.problemNumber}`, e1.message); continue; }

  const choiceRows = choices.map((c) => ({
    problem_id: probRow.problem_id, choice_index: c.index, body_md: c.body,
    is_correct: hasAnswer && c.index === p.correctIndex,
    explanation_md: p.choiceExplanations?.[c.index] ?? null,
  }));
  const { error: e2 } = await supa.from("problem_choices").insert(choiceRows);
  if (e2) { console.error(`choices 실패 ${p.lawCode} ${p.year}#${p.problemNumber}`, e2.message); continue; }
  ins++;
  console.log(`✓ [${status}] ${p.lawCode} ${p.year} #${p.problemNumber} → ${probRow.problem_id}`);
}
console.log(`\n적용 완료: ${ins} inserted`);
