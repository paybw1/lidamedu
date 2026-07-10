// 2차 기출(주관식) 적재 — parse-essay-2cha.mjs 출력(.parsed.json)을 problems 에 insert.
//   exam_round=second, format=subjective, origin=past_exam, subject_type=law, review_status=approved.
//   display_no 는 시퀀스 default. 중복 방지: (law_id, year, exam_round_no, problem_number, second) 기존 있으면 skip.
// 사용: node scripts/jagwa/seed-essay-2cha.mjs <parsed.json> [--apply]
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, key);

const parsedPath = process.argv[2];
const apply = process.argv.includes("--apply");
if (!parsedPath) throw new Error("usage: seed-essay-2cha.mjs <parsed.json> [--apply]");
const rows = JSON.parse(readFileSync(parsedPath, "utf8"));

const SUBJECT_LAW = { 특허: "patent", 상표: "trademark", 민소: "civil-procedure", 디보: "design" };

const lawIdCache = new Map();
async function lawId(subjectKo) {
  const code = SUBJECT_LAW[subjectKo];
  if (!code) throw new Error(`알 수 없는 과목: ${subjectKo}`);
  if (lawIdCache.has(code)) return lawIdCache.get(code);
  const { data, error } = await sb.from("laws").select("law_id").eq("law_code", code).maybeSingle();
  if (error || !data) throw new Error(`law 조회 실패: ${code}`);
  lawIdCache.set(code, data.law_id);
  return data.law_id;
}

let inserted = 0,
  skipped = 0;
const done = [];
for (const r of rows) {
  const law_id = await lawId(r.subject);
  // 중복 체크
  const { data: exist } = await sb
    .from("problems")
    .select("problem_id")
    .eq("law_id", law_id)
    .eq("exam_round", "second")
    .eq("year", r.year)
    .eq("exam_round_no", r.examRoundNo)
    .eq("problem_number", r.problemNumber)
    .is("deleted_at", null)
    .maybeSingle();
  if (exist) {
    skipped++;
    console.log(`skip ${r.subject} ${r.year} ${r.examRoundNo}회 #${r.problemNumber}(${r.label}) — 이미 존재`);
    continue;
  }
  const row = {
    law_id,
    exam_round: "second",
    subject_type: "law",
    origin: "past_exam",
    format: "subjective",
    year: r.year,
    exam_round_no: r.examRoundNo,
    problem_number: r.problemNumber,
    total_points: r.totalPoints,
    subjective_kind: r.subjectiveKind,
    subjective_topic: r.label, // 원 문제 라벨(A-1 등) 보존
    body_md: r.bodyMd,
    review_status: "approved",
  };
  if (!apply) {
    console.log(`[dry] ${r.subject} ${r.year} ${r.examRoundNo}회 #${r.problemNumber}(${r.label}) ${r.totalPoints}점 ${r.bodyMd.length}자`);
    inserted++;
    continue;
  }
  const { data: ins, error } = await sb.from("problems").insert(row).select("problem_id, display_no").single();
  if (error) throw error;
  inserted++;
  done.push({ label: r.label, ...ins });
  console.log(`✔ ${r.subject} ${r.year} ${r.examRoundNo}회 #${r.problemNumber}(${r.label}) → P-${ins.display_no}`);
}
console.log(`\n${apply ? "적용" : "dry-run"}: insert ${inserted} / skip ${skipped}`);
if (apply && done.length) console.log("display_no:", done.map((d) => `${d.label}=P-${d.display_no}`).join(", "));
