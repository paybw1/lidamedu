// 민법 primary_article_id 백필 — 선지/박스 related_article_id 최빈값, 폴백=종합해설 trailer 첫 민법 조문.
// 기존 값이 있으면 건드리지 않음. dry-run 기본, --apply 로 반영.
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: law } = await c.from("laws").select("law_id").eq("law_code", "civil").single();
const problems = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await c
    .from("problems")
    .select("problem_id, display_no, year, problem_number, primary_article_id, explanation_md")
    .eq("law_id", law.law_id)
    .is("deleted_at", null)
    .order("problem_id")
    .range(from, from + 999);
  if (error) throw error;
  problems.push(...data);
  if (data.length < 1000) break;
}
const pids = problems.map((p) => p.problem_id);
const refs = new Map(); // problem_id → article_id[]
for (let i = 0; i < pids.length; i += 150) {
  const ids = pids.slice(i, i + 150);
  const { data: chs } = await c.from("problem_choices").select("problem_id, choice_index, related_article_id").in("problem_id", ids).limit(10000);
  for (const ch of chs.sort((a, b) => a.choice_index - b.choice_index)) {
    if (!ch.related_article_id) continue;
    if (!refs.has(ch.problem_id)) refs.set(ch.problem_id, []);
    refs.get(ch.problem_id).push(ch.related_article_id);
  }
  const { data: bis } = await c.from("problem_box_items").select("problem_id, position_index, related_article_id").in("problem_id", ids).limit(10000);
  for (const bi of bis.sort((a, b) => a.position_index - b.position_index)) {
    if (!bi.related_article_id) continue;
    if (!refs.has(bi.problem_id)) refs.set(bi.problem_id, []);
    refs.get(bi.problem_id).push(bi.related_article_id);
  }
}
// trailer 폴백용: 민법 조문 번호 → article_id
const artMap = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c.from("articles").select("article_id, article_number").eq("law_id", law.law_id).eq("level", "article").range(from, from + 999);
  for (const a of data) artMap.set(a.article_number, a.article_id);
  if (data.length < 1000) break;
}
function trailerFirstArticle(md) {
  const t = (md || "").match(/^\*(?:판례·조문|관련 조문·판례|관련 판례|관련 조문|조문·판례)\s*:([^\n]*)\*\s*$/m);
  if (!t) return null;
  const m = t[1].match(/민법\s*제(\d+)조(?:의(\d+))?/);
  if (!m) return null;
  const no = m[2] ? `${m[1]}의${m[2]}` : m[1];
  return artMap.get(no) ?? null;
}
// 최후 폴백: 해설 전문에서 첫 민법 조문 (타법명 접두 제외 — wire2 와 동일 규칙)
function bodyFirstArticle(md) {
  const text = md || "";
  const re = /제(\d+)조(?:의(\d+))?/g;
  let m;
  while ((m = re.exec(text))) {
    const prefix = text.slice(Math.max(0, m.index - 14), m.index);
    const pm = prefix.match(/([가-힣]+법(?:률)?|시행령|규칙)\s*$/);
    if (pm && pm[1] !== "민법") continue;
    const no = m[2] ? `${m[1]}의${m[2]}` : m[1];
    const id = artMap.get(no);
    if (id) return id;
  }
  return null;
}

const updates = [];
let already = 0, fromRefs = 0, fromTrailer = 0, fromBody = 0, none = [];
for (const p of problems) {
  if (p.primary_article_id) { already++; continue; }
  const list = refs.get(p.problem_id) ?? [];
  let pick = null;
  if (list.length > 0) {
    const cnt = new Map();
    for (const a of list) cnt.set(a, (cnt.get(a) ?? 0) + 1);
    // 최빈값, 동률이면 먼저 인용된(선지 순서) 조문
    let best = null, bestN = 0;
    for (const a of list) {
      const n = cnt.get(a);
      if (n > bestN) { best = a; bestN = n; }
    }
    pick = best;
    fromRefs++;
  } else {
    pick = trailerFirstArticle(p.explanation_md);
    if (pick) fromTrailer++;
    else {
      pick = bodyFirstArticle(p.explanation_md);
      if (pick) fromBody++;
    }
  }
  if (!pick) { none.push(`${p.year}#${p.problem_number}`); continue; }
  updates.push({ problem_id: p.problem_id, tag: `${p.year}#${p.problem_number}`, primary_article_id: pick });
}
console.log("총", problems.length, "| 기존값 보존:", already, "| 최빈값 파생:", fromRefs, "| trailer 폴백:", fromTrailer, "| 본문 폴백:", fromBody, "| 미도출:", none.length);
if (none.length) console.log("  미도출:", none.join(", "));
writeFileSync("tmp/jagwa/civil-choice-wiring/plan-primary.json", JSON.stringify(updates, null, 0));

if (!APPLY) { console.log("(dry-run — --apply 로 반영)"); process.exit(0); }
let err = 0;
for (const u of updates) {
  const { error } = await c.from("problems").update({ primary_article_id: u.primary_article_id }).eq("problem_id", u.problem_id);
  if (error) { console.log("ERR", u.tag, error.message); err++; }
}
console.log("적용:", updates.length - err, "건 | 오류:", err);
