import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: law } = await sb.from("laws").select("law_id").eq("law_code", "patent").single();
const problems = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("problems")
    .select("problem_id, origin, year, problem_number, explanation_md, body_md, problem_choices(choice_index, explanation_md), problem_box_items(marker, explanation_md)")
    .eq("law_id", law.law_id)
    .in("origin", ["past_exam", "past_exam_variant"])
    .is("deleted_at", null)
    .order("problem_id")
    .range(from, from + 999);
  if (error) throw error;
  problems.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
const IMG = /!\[[^\]]*\]\(([^)]+)\)/g;
const rows = [];
for (const p of problems) {
  const locs = [];
  for (const m of (p.explanation_md ?? "").matchAll(IMG)) locs.push({ loc: "expl", url: m[1] });
  for (const m of (p.body_md ?? "").matchAll(IMG)) locs.push({ loc: "body", url: m[1] });
  for (const c of p.problem_choices ?? [])
    for (const m of (c.explanation_md ?? "").matchAll(IMG)) locs.push({ loc: `choice${c.choice_index}`, url: m[1] });
  for (const b of p.problem_box_items ?? [])
    for (const m of (b.explanation_md ?? "").matchAll(IMG)) locs.push({ loc: `box${b.marker ?? ""}`, url: m[1] });
  if (locs.length) rows.push({ year: p.year, no: p.problem_number, origin: p.origin, problemId: p.problem_id, imgs: locs });
}
rows.sort((a, b) => (a.year - b.year) || (a.no - b.no));
console.log("문항 수:", rows.length, "· 이미지 총수:", rows.reduce((s, r) => s + r.imgs.length, 0));
for (const r of rows) console.log(r.year, "#" + r.no, r.origin, r.imgs.map((i) => i.loc).join(","));
