// 지정 display_no 에 대해 [원본 해설편 엔트리] vs [운영 DB] 를 나란히 출력.
import { readFileSync } from "node:fs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const mod = await import("./parse-answers.mjs");
const { parseAnswers, norm, normUnit } = mod;

const TARGETS = process.argv.slice(2).map(Number);
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const maps = [];
for (let from = 0; ; from += 500) {
  const { data } = await supa.from("publication_content_map")
    .select("content_id, toc_path, sort_key, publication_editions!inner(publications!inner(title))")
    .eq("content_type", "mcq").order("content_id").order("edition_id").range(from, from + 499);
  maps.push(...(data ?? []));
  if (!data || data.length < 500) break;
}
const { data: probs } = await supa.from("problems").select("problem_id, display_no, year, problem_number, origin").in("display_no", TARGETS);
const books = [["기출","source/_converted/answer.json"],["예상","source/_converted/expected-answers.json"]];
const entries = {};
for (const [t,f] of books) entries[t] = parseAnswers(JSON.parse(readFileSync(f,"utf8")).paragraphs);

for (const p of probs ?? []) {
  const m = maps.find((x) => x.content_id === p.problem_id);
  const title = m?.publication_editions?.publications?.title ?? "";
  const book = title.includes("예상") ? "예상" : "기출";
  const cands = entries[book].filter((e) => e.section && normUnit(e.section) === normUnit(m?.toc_path ?? "") && e.number === Number(m?.sort_key));
  const { data: cs } = await supa.from("problem_choices").select("choice_index, is_correct, explanation_md").eq("problem_id", p.problem_id).order("choice_index");
  console.log(`\n${"=".repeat(100)}\nP-${p.display_no} ${p.year ?? "-"}년 ${p.problem_number}번 · ${p.origin} · ${book} ${m?.toc_path} ${m?.sort_key}번 · 원본후보 ${cands.length}`);
  for (const e of cands) {
    console.log(`  --- 원본 정답 ${e.correct.join(",")} / DB 정답 ${cs.filter(c=>c.is_correct).map(c=>c.choice_index).join(",")}`);
    for (const c of cs) {
      const s = (e.perChoice[c.choice_index] ?? "").replace(/\s+/g," ").slice(0,95);
      const d = (c.explanation_md ?? "").replace(/\s+/g," ").slice(0,95);
      const same = norm(s).slice(0,25) && norm(d).startsWith(norm(s).slice(0,25));
      console.log(`   ${c.choice_index}${c.is_correct?"*":" "} ${same?"=":"≠"} 원본: ${s}`);
      console.log(`        ${" "} DB  : ${d}`);
    }
  }
}
