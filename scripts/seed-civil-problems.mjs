// 민법(civil) 1차 기출 문제 시드.
//   입력: source/_converted/civil-problems-parsed.json  (parse-civil-problems)
//         source/_converted/civil-answers.json          (정답 PDF 비전 판독)
//   대상: problems(subject_type=law, law_id=civil) + problem_choices
//
//   재실행 안전: problem_source_docs 1건으로 추적 → 재시드 시 해당 doc 문제 soft-delete.
//   기본 DRY-RUN. 실제 반영: --apply.  특정 연도만: --year 2026
//
//   node scripts/seed-civil-problems.mjs [--apply] [--year 2026]
import { config } from "dotenv";
config({ path: "C:/project/lidamedu/.env" });
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROD = "mcgdoplovrjgklbxmozi";
const URL = process.env.SUPABASE_URL;
if (!URL || !URL.includes(PROD)) throw new Error(`SAFETY: SUPABASE_URL not prod(${PROD})`);
const supa = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes("--apply");
const yi = process.argv.indexOf("--year");
const ONLY_YEAR = yi >= 0 ? Number(process.argv[yi + 1]) : null;
// 2021: 2단컬럼 추출 데이터손실(선지 중복/누락)로 일부 문항 불안정 → 별도 처리(비전) 전까지 제외.
const EXCLUDE_YEARS = new Set([2021]);

const { problems } = JSON.parse(readFileSync(resolve(ROOT, "source/_converted/civil-problems-parsed.json"), "utf8"));
const answers = JSON.parse(readFileSync(resolve(ROOT, "source/_converted/civil-answers.json"), "utf8"));

const SOURCE_FILE = "기출모음(2010~2026)/1차/민법";
const SOURCE_LABEL = "변리사 1차 민법개론 기출 2010-2026";

function inferFormat(stem) {
  if (/사례|다음.*사안|甲|乙/.test(stem)) return "mc_case";
  if (/<\s*보기\s*>|모두\s*고른|옳은 것을 모두|옳지 않은 것을 모두/.test(stem)) return "mc_box";
  if (/^\s*[ㄱ-ㅎ]\.|[ㄱ-ㅎ]\.\s/m.test(stem)) return "mc_box";
  return "mc_short";
}
function inferPolarity(stem) {
  return /옳지\s*않은|틀린|아닌|아니한|않는|없는 것은/.test(stem) ? "negative" : "positive";
}
function correctSet(year, n) {
  const v = answers[String(year)]?.[String(n)];
  if (v == null) return null;
  const arr = Array.isArray(v) ? v : [v];
  return new Set(arr.map(Number));
}

// civil law_id
const { data: laws } = await supa.from("laws").select("law_id, law_code").eq("law_code", "civil");
const lawId = laws?.[0]?.law_id;
if (!lawId) throw new Error("civil law 없음");

// source_doc (find or create)
let docId;
const { data: existDoc } = await supa.from("problem_source_docs").select("source_doc_id").eq("file_name", SOURCE_FILE).maybeSingle();
if (existDoc) docId = existDoc.source_doc_id;
else if (APPLY) {
  const { data, error } = await supa.from("problem_source_docs").insert({ label: SOURCE_LABEL, file_name: SOURCE_FILE, kind: "problem" }).select("source_doc_id").single();
  if (error) throw error;
  docId = data.source_doc_id;
}

const target = problems.filter((p) => (ONLY_YEAR ? p.year === ONLY_YEAR : !EXCLUDE_YEARS.has(p.year)));
console.log(`대상 ${target.length}문항 (year=${ONLY_YEAR ?? "all"}) apply=${APPLY} law_id=${lawId} doc=${docId ?? "(dry)"}`);

// 재시드: 같은 doc + (연도필터 시 해당 연도) soft-delete
if (APPLY && docId) {
  let del = supa.from("problems").update({ deleted_at: new Date().toISOString() }).eq("source_doc_id", docId).is("deleted_at", null);
  if (ONLY_YEAR) del = del.eq("year", ONLY_YEAR);
  const { error } = await del;
  if (error) console.error("기존 soft-delete 실패:", error.message);
}

let inserted = 0, skipped = 0;
const skip = { noFive: 0, noAnswer: 0 };
for (const p of target) {
  if (!p.choices || p.choices.length !== 5) { skipped++; skip.noFive++; continue; }
  const cset = correctSet(p.year, p.problemNumber);
  if (!cset) { skipped++; skip.noAnswer++; continue; }
  if (!APPLY) { inserted++; continue; }

  const { data: prob, error } = await supa.from("problems").insert({
    law_id: lawId, exam_round: "first", subject_type: "law", origin: "past_exam",
    format: inferFormat(p.stem), scope: "comprehensive", polarity: inferPolarity(p.stem),
    year: p.year, exam_round_no: p.round ?? null, problem_number: p.problemNumber,
    body_md: p.stem, source_doc_id: docId,
  }).select("problem_id").single();
  if (error) { console.error(`insert 실패 [${p.year} #${p.problemNumber}]:`, error.message); skipped++; continue; }

  const rows = p.choices.map((c) => ({ problem_id: prob.problem_id, choice_index: c.index, body_md: c.body, is_correct: cset.has(c.index) }));
  const { error: cErr } = await supa.from("problem_choices").insert(rows);
  if (cErr) { console.error(`choices 실패 [${p.year} #${p.problemNumber}]:`, cErr.message); skipped++; continue; }
  inserted++;
}
console.log(`\n=== ${APPLY ? "APPLIED" : "DRY-RUN"}: inserted=${inserted} skipped=${skipped} ${JSON.stringify(skip)} ===`);
