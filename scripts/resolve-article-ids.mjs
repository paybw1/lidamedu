// related_article_number 가 있고 related_article_id 가 NULL 인 choice 들에 article_id 연결.
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: arts } = await supa
  .from("articles")
  .select("article_id, article_number, law_id")
  .is("deleted_at", null)
  .not("article_number", "is", null);
const idByKey = new Map((arts ?? []).map((a) => [`${a.law_id}|${a.article_number}`, a.article_id]));
console.log(`articles: ${arts?.length ?? 0}`);

// Paginated choices fetch.
const choices = [];
const PAGE = 1000;
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supa
    .from("problem_choices")
    .select("choice_id, problem_id, related_article_number, related_article_id")
    .not("related_article_number", "is", null)
    .is("related_article_id", null)
    .range(from, from + PAGE - 1);
  if (error) { console.error(error); break; }
  if (!data || data.length === 0) break;
  choices.push(...data);
  if (data.length < PAGE) break;
}
console.log(`candidates: ${choices.length}`);

// 전체 problems pagination — in() 필터는 URL 길이 한계로 실패할 수 있어 전부 가져온다.
const problems = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supa
    .from("problems")
    .select("problem_id, law_id")
    .range(from, from + PAGE - 1);
  if (error) { console.error(error); break; }
  if (!data || data.length === 0) break;
  problems.push(...data);
  if (data.length < PAGE) break;
}
const lawByProblem = new Map(problems.map((p) => [p.problem_id, p.law_id]));
console.log(`problems: ${problems.length}`);

let resolved = 0;
let unresolved = 0;
const failures = [];
for (const c of choices) {
  const lawId = lawByProblem.get(c.problem_id);
  if (!lawId) { unresolved++; continue; }
  const id = idByKey.get(`${lawId}|${c.related_article_number}`);
  if (!id) { unresolved++; continue; }
  const { error } = await supa
    .from("problem_choices")
    .update({ related_article_id: id })
    .eq("choice_id", c.choice_id);
  if (error) failures.push({ id: c.choice_id, err: error.message });
  else resolved++;
}
console.log(`resolved: ${resolved}, unresolved: ${unresolved}, failures: ${failures.length}`);
if (failures.length) console.log(failures.slice(0, 3));
