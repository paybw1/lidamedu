// 특허법 2차 주관식 68문항 → JSON. 뷰어·책이 같은 파일을 읽는다(두 벌이 갈라지지 않게).
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: law } = await sb.from("laws").select("law_id").eq("law_code", "patent").single();
const { data: rows, error } = await sb
  .from("problems")
  .select(
    "problem_id, year, exam_round_no, problem_number, exam_number, display_no, total_points, " +
      "subjective_topic, subjective_kind, subjective_keywords, main_case_number, " +
      "body_md, model_answer_md, grading_rubric_md, rubric_items, importance",
  )
  .eq("law_id", law.law_id)
  .eq("format", "subjective")
  .eq("exam_round", "second")
  .eq("review_status", "approved")
  .is("deleted_at", null)
  .order("year", { ascending: true })
  .order("problem_number", { ascending: true });
if (error) throw new Error(error.message);

const items = rows.map((r) => ({
  id: r.problem_id,
  year: r.year,
  roundNo: r.exam_round_no,
  no: r.problem_number,
  examNo: r.exam_number,
  displayNo: r.display_no,
  points: r.total_points,
  topic: r.subjective_topic,
  kind: r.subjective_kind,
  keywords: Array.isArray(r.subjective_keywords) ? r.subjective_keywords : [],
  caseNumber: r.main_case_number,
  importance: r.importance,
  body: r.body_md ?? "",
  answer: r.model_answer_md ?? "",
  rubric: r.grading_rubric_md ?? "",
  rubricItems: Array.isArray(r.rubric_items) ? r.rubric_items : [],
}));

mkdirSync("tmp/patent-essay", { recursive: true });
writeFileSync("tmp/patent-essay/data.json", JSON.stringify(items, null, 2), "utf8");

const byYear = new Map();
for (const it of items) byYear.set(it.year, (byYear.get(it.year) ?? 0) + 1);
console.log(`${items.length}문항 · ${byYear.size}개 연도`);
console.log(
  [...byYear.entries()].map(([y, n]) => `${y}(${n})`).join(" "),
);
const missing = items.filter((i) => !i.body || !i.answer || !i.rubric);
console.log(missing.length ? `★결측 ${missing.length}건` : "결측 없음");
const chars = items.reduce((s, i) => s + i.body.length + i.answer.length + i.rubric.length, 0);
console.log(`총 ${chars.toLocaleString()}자`);
