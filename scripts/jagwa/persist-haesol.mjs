// 워크플로우가 .haesol/ 에 기록한 해설 JSON 을 problem_explanation_drafts 로 upsert.
// ★ problem_id 는 파일에 적힌 값이 아니라 파일명(year, NN)에서 DB 로 역참조한 값을 쓴다.
//   (일부 에이전트가 problem_id 필드를 off-by-one/swap 으로 잘못 기록 → 파일명이 권위.
//    content_md 는 에이전트가 읽은 cropPath(q<NN>)의 해설이라 파일명과 항상 일치함을 검증함.)
import { adminClient } from "./db.mjs";
import fs from "node:fs";
import path from "node:path";

const sb = adminClient();
const DIR = "C:/project/lidamedu/scripts/jagwa/.haesol";

// (year, problem_number) -> problem_id  (과목 무관 유일)
const { data: probs } = await sb.from("problems")
  .select("problem_id, year, problem_number")
  .eq("subject_type", "science").eq("origin", "past_exam").eq("exam_round", "first");
const byYN = new Map((probs ?? []).map((p) => [`${p.year}_${p.problem_number}`, p.problem_id]));

const files = fs.readdirSync(DIR).filter((f) => /^\d{4}_q\d{2}\.json$/.test(f));
let ok = 0, fail = 0, mismatch = 0, idFixed = 0;
const bad = [];
for (const f of files) {
  const m = f.match(/^(\d{4})_q(\d{2})\.json$/);
  const year = Number(m[1]), n = Number(m[2]);
  const problemId = byYN.get(`${year}_${n}`);
  if (!problemId) { bad.push(`${f}: no DB problem for ${year} #${n}`); fail++; continue; }
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); }
  catch (e) { bad.push(`${f}: parse ${e.message}`); fail++; continue; }
  if (!d.content_md) { bad.push(`${f}: no content_md`); fail++; continue; }
  if (d.problem_id !== problemId) idFixed++;
  const { error } = await sb.from("problem_explanation_drafts").upsert({
    problem_id: problemId,
    content_md: d.content_md,
    ai_answer: d.ai_answer ?? null,
    answer_match: typeof d.answer_match === "boolean" ? d.answer_match : null,
    model: d.model ?? "claude-opus-4-8",
    status: "pending",
  }, { onConflict: "problem_id" });
  if (error) { bad.push(`${f}: ${error.message}`); fail++; continue; }
  ok++;
  if (d.answer_match === false) mismatch++;
}

console.log(`files=${files.length} persisted=${ok} failed=${fail} idFixed(파일명기준교정)=${idFixed} mismatch(검수우선)=${mismatch}`);
if (bad.length) console.log("ISSUES:\n" + bad.slice(0, 30).join("\n"));

const { count: total } = await sb.from("problem_explanation_drafts").select("draft_id", { count: "exact", head: true });
const { count: pend } = await sb.from("problem_explanation_drafts").select("draft_id", { count: "exact", head: true }).eq("status", "pending");
console.log(`total drafts in table: ${total} (pending ${pend})`);
