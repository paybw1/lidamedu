// 예상문제(객관식Ⅱ) 누락 4건 전사 삽입 (one-off). 표 문제는 표 verbatim을 stem에 보존.
//
// 배경: seed-patent-expected.mjs 는 선지<5 를 skip 안 하지만(0개·정답null·무stem만), 4건이 빠짐:
//   #2(정당한 권리자의 보호) = 복수정답 ③④ 인데 정답파서가 단일마커만 잡아 correctIndex null → noCorrect skip.
//   #17·18·20(실체보정) = 선지 ①~⑤ 가 마크다운 표 셀/열에 묻혀 0개 추출 → fewerChoices skip.
// 처리: #2 = 정상 5지문 + 복수정답[3,4]. #17/18/20 = stem 에 표 verbatim 보존 + 마커선지(원장 검토용).
//   전부 draft(기존 expected 588 전량 draft 와 동일).
//
// 입력: source/_converted/expected-problems.json (hwpx-to-text), 정답은 해설편 대조로 확정.
// 사용: node scripts/seed-missing-patent-expected.mjs [--apply]
// 사전조건: .env = 운영(mcgdoplo) + SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const REF = "mcgdoplovrjgklbxmozi";
const SOURCE_DOC = "1b7a79f1-a6e2-49a7-ada1-815032c9da67"; // 객관식(Ⅱ) 예상문제 문제편
if (!process.env.SUPABASE_URL?.includes(REF)) { console.error("SAFETY: not prod"); process.exit(1); }
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const P = JSON.parse(readFileSync("source/_converted/expected-problems.json", "utf8")).paragraphs;
const HDR = /^(\d{1,2})\s*(단원|종합)/;
const SCOPE_ROW = /^\|\s*(단원|종합)\s*\|/;

function grab(reTrigger) {
  const i = P.findIndex((p) => reTrigger.test(p.text || ""));
  if (i < 0) throw new Error("not found: " + reTrigger);
  const hm = (P[i].text || "").match(HDR);
  const scope = hm && hm[2] === "종합" ? "comprehensive" : "unit";
  const question = (P[i].text || "").replace(HDR, "").trim();
  const body = [];
  for (let k = i + 1; k < P.length; k++) {
    const t = (P[k].text || "").trim();
    if (!t) continue;
    if (HDR.test(t)) break;
    if (SCOPE_ROW.test(t.split("\n")[0])) continue;
    body.push(P[k].text); // verbatim (개행 보존)
  }
  return { question, scope, body };
}

const inferFormat = (s) => (/사례/.test(s) ? "mc_case" : /<\s*보기\s*>|\[\s*보기\s*\]|모두\s*고른/.test(s) ? "mc_box" : "mc_short");
const inferPolarity = (s) => (/옳지\s*않은|틀린|아닌|아니한|않는/.test(s) ? "negative" : "positive");
const MK = ["①", "②", "③", "④", "⑤"];

const items = [];
// #2 — 정상 5지문, 복수정답 [3,4]
{
  const g = grab(/정당한 권리자의 보호에 관한 사항이다\. 틀린/);
  const choices = g.body.map((para) => {
    const m = (para || "").trim().match(/^([①②③④⑤])\s*([\s\S]+)$/);
    return { index: MK.indexOf(m[1]) + 1, body: m[2].trim() };
  });
  items.push({ question: g.question, scope: g.scope, bodyMd: g.question, choices, correct: [3, 4], problemNumber: 2 });
}
// 표문제: stem = 질문 + 표 verbatim, 선지 = 마커
function tableProblem(trigger, correct, num) {
  const g = grab(trigger);
  const bodyMd = g.question + "\n\n" + g.body.join("\n\n");
  const choices = MK.map((mk, i) => ({ index: i + 1, body: mk }));
  return { question: g.question, scope: g.scope, bodyMd, choices, correct, problemNumber: num, tableNote: true };
}
items.push(tableProblem(/보정에 관한 구체적인 예와 그에 대한 설명 중 옳지 않은/, [3], 17));
items.push(tableProblem(/실체심사의 대상이 되는 명세서로 옳은/, [3], 18));
items.push(tableProblem(/외국어특허출원의 오역 정정에 대한/, [2], 20));

const { data: law } = await supa.from("laws").select("law_id").eq("law_code", "patent").maybeSingle();
const lawId = law.law_id;

console.log(`삽입 대상 ${items.length}건 (전부 draft)\n`);
for (const it of items) {
  console.log(`■ #${it.problemNumber} [${it.scope}/${inferPolarity(it.question)}/${inferFormat(it.question)}] 정답 ${it.correct.join(",")} · 선지 ${it.choices.length}${it.tableNote ? " (표 verbatim stem + 마커선지)" : ""}`);
  console.log(`  Q: ${it.question.slice(0, 70)}`);
  for (const c of it.choices) console.log(`   ${it.correct.includes(c.index) ? "★" : " "}${c.index}. ${c.body.replace(/\s+/g, " ").slice(0, 60)}`);
  console.log(`  body_md ${it.bodyMd.length}자`);
}

if (!APPLY) { console.log("\n(dry-run — --apply 로 삽입)"); process.exit(0); }

let ins = 0;
for (const it of items) {
  const { data: dup } = await supa.from("problems").select("problem_id")
    .eq("law_id", lawId).eq("origin", "expected").eq("body_md", it.bodyMd).is("deleted_at", null).maybeSingle();
  if (dup) { console.log(`= skip(존재) #${it.problemNumber}`); continue; }
  const { data: pr, error: e1 } = await supa.from("problems").insert({
    law_id: lawId, exam_round: "first", subject_type: "law", origin: "expected",
    format: inferFormat(it.question), scope: it.scope, polarity: inferPolarity(it.question),
    year: null, problem_number: it.problemNumber, primary_article_id: null,
    body_md: it.bodyMd, source_doc_id: SOURCE_DOC, review_status: "draft",
  }).select("problem_id").single();
  if (e1) { console.error(`insert 실패 #${it.problemNumber}`, e1.message); continue; }
  const rows = it.choices.map((c) => ({
    problem_id: pr.problem_id, choice_index: c.index, body_md: c.body, is_correct: it.correct.includes(c.index),
  }));
  const { error: e2 } = await supa.from("problem_choices").insert(rows);
  if (e2) { console.error(`choices 실패 #${it.problemNumber}`, e2.message); continue; }
  ins++;
  console.log(`✓ #${it.problemNumber} → ${pr.problem_id}`);
}
console.log(`\n적용 완료: ${ins} inserted`);
