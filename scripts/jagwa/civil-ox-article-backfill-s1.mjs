// 민법 정오문제 조문 매칭 1단계 — 결정적 백필.
// 대상: OX 적격(ox_ineligible=false, ox_truth 有)이고 related_article 미연결 지문.
// 규칙(보수적):
//   · 지문(body_md)+해설(explanation_md)에서 엄격 규칙으로 민법 조문 추출
//     (타법명 접두 20자·"같은/동/위/이/그 법" 간접 지칭 제외 — civil-audit-nonlaw-articles.mjs 동일)
//   · 추출 결과가 서로 다른 조문 1개(유일)일 때만 연결. 0개·복수 → 스킵(2단계 검토 큐행)
//   · 타법 언급(OTHER_LAW_RE)이 있는 텍스트에서 "민법" 명시 접두 없는 인용뿐이면 스킵
//   · 조문은 articles(level=article)에 실재해야 연결
// --apply 없으면 dry-run.
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: law } = await c.from("laws").select("law_id").eq("law_code", "civil").single();

const pids = [];
const tagOf = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c.from("problems").select("problem_id, year, problem_number").eq("law_id", law.law_id).is("deleted_at", null).range(from, from + 999);
  for (const p of data) { pids.push(p.problem_id); tagOf.set(p.problem_id, `${p.year}#${p.problem_number}`); }
  if (data.length < 1000) break;
}
const artMap = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c.from("articles").select("article_id, article_number").eq("law_id", law.law_id).eq("level", "article").range(from, from + 999);
  for (const a of data) artMap.set(a.article_number, a.article_id);
  if (data.length < 1000) break;
}
console.log("문제:", pids.length, "| 민법 조문:", artMap.size);

const OTHER_LAW_RE = /(가등기담보|가담법|주택임대차|주임법|상가건물|부동산\s*실권리자|부동산실명|집합건물|이자제한법|신탁법|상법|어음법|수표법|민사소송법|민사집행법|공익사업|농지법|국토계획|공장저당|광업법|수산업법|입목법|헌법|근로기준법|건물의\s*구분소유)/;

// 엄격 추출 — {num, explicitCivil} 목록
function strictCivilArticles(text) {
  const arts = [];
  const re = /제(\d+)조(?:의(\d+))?/g;
  let m;
  while ((m = re.exec(text))) {
    const prefix = text.slice(Math.max(0, m.index - 20), m.index);
    if (/(같은|동|위|이|그)\s*법\s*$/.test(prefix) && !/민법\s*$/.test(prefix)) continue;
    const pm = prefix.match(/([가-힣]+(?:법|법률)|법률|시행령|시행규칙|규칙)\s*$/);
    if (pm && pm[1] !== "민법") continue;
    arts.push({ num: m[2] ? `${m[1]}의${m[2]}` : m[1], explicitCivil: /민법\s*$/.test(prefix) });
  }
  return arts;
}

const toLink = [];
const skipped = { none: 0, multi: 0, otherLawBare: 0, notInDb: 0 };
async function scan(table, idCol) {
  for (let i = 0; i < pids.length; i += 150) {
    const { data: rows } = await c
      .from(table)
      .select(`${idCol}, problem_id, body_md, explanation_md, ox_truth, ox_ineligible, related_article_id, related_article_number`)
      .in("problem_id", pids.slice(i, i + 150))
      .limit(10000);
    for (const r of rows) {
      if (r.ox_ineligible || !r.ox_truth) continue;
      if (r.related_article_id || r.related_article_number) continue;
      const text = `${r.body_md ?? ""}\n${r.explanation_md ?? ""}`;
      const found = strictCivilArticles(text);
      if (found.length === 0) { skipped.none++; continue; }
      const uniq = [...new Set(found.map((f) => f.num))];
      if (uniq.length > 1) { skipped.multi++; continue; }
      const num = uniq[0];
      // 타법 언급 텍스트인데 "민법" 명시 접두가 하나도 없으면 보수적으로 스킵
      if (OTHER_LAW_RE.test(text) && !found.some((f) => f.explicitCivil)) { skipped.otherLawBare++; continue; }
      if (!artMap.has(num)) { skipped.notInDb++; continue; }
      toLink.push({ table, idCol, id: r[idCol], tag: tagOf.get(r.problem_id), num, snippet: text.replace(/\s+/g, " ").slice(0, 100) });
    }
  }
}
await scan("problem_choices", "choice_id");
await scan("problem_box_items", "box_item_id");

console.log("연결 대상:", toLink.length, "| 스킵:", JSON.stringify(skipped));
for (const t of toLink) console.log(` [${t.table === "problem_choices" ? "선지" : "박스"}] ${t.tag} → 제${t.num}조 | ${t.snippet}`);

writeFileSync("tmp/jagwa/civil-ox-s1-plan.json", JSON.stringify(toLink, null, 1));
if (!APPLY) { console.log("(dry-run — --apply 로 반영)"); process.exit(0); }

let ok = 0, err = 0;
for (const t of toLink) {
  const { error } = await c
    .from(t.table)
    .update({ related_article_number: t.num, related_article_id: artMap.get(t.num) })
    .eq(t.idCol, t.id)
    .is("related_article_id", null);
  if (error) { console.log("ERR", t.tag, error.message); err++; } else ok++;
}
console.log("반영:", ok, "| 오류:", err);
