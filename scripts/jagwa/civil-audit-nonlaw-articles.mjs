// 민법 아닌 조문이 related_article 에 오입력됐는지 전수 감사.
// 엄격 규칙으로 해설 텍스트에서 조문을 재추출해 저장값과 대조. --apply 로 정정.
//   엄격 규칙: 타법명 접두(창 20자) + "같은 법/동 법/위 법/이 법/그 법" 간접 지칭 + 법률/시행령/규칙 제외
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

// 엄격 추출: 민법 조문만
function strictCivilArticles(text) {
  const arts = [];
  const re = /제(\d+)조(?:의(\d+))?/g;
  let m;
  while ((m = re.exec(text))) {
    const prefix = text.slice(Math.max(0, m.index - 20), m.index);
    // 타법명·간접 지칭·법률/시행령/규칙 접두 → 제외 ("민법"만 허용)
    if (/(같은|동|위|이|그)\s*법\s*$/.test(prefix) && !/민법\s*$/.test(prefix)) continue;
    const pm = prefix.match(/([가-힣]+(?:법|법률)|법률|시행령|시행규칙|규칙)\s*$/);
    if (pm && pm[1] !== "민법") continue;
    arts.push(m[2] ? `${m[1]}의${m[2]}` : m[1]);
  }
  return arts;
}
// 텍스트에 타법 언급이 있는지 (참고용 리포트)
const OTHER_LAW_RE = /(가등기담보|가담법|주택임대차|주임법|상가건물|부동산\s*실권리자|부동산실명|집합건물|이자제한법|신탁법|상법|어음법|수표법|민사소송법|민사집행법|공익사업|농지법|국토계획|공장저당|광업법|수산업법|입목법|헌법)/;

const issues = [];
let scanned = 0, withArt = 0;
async function auditRows(table, idCol) {
  for (let i = 0; i < pids.length; i += 150) {
    const { data: rows } = await c
      .from(table)
      .select(`${idCol}, problem_id, explanation_md, related_article_number, related_article_id`)
      .in("problem_id", pids.slice(i, i + 150))
      .limit(10000);
    for (const r of rows) {
      scanned++;
      if (!r.related_article_number) continue;
      withArt++;
      const strict = strictCivilArticles(r.explanation_md || "");
      const strictPick = strict.find((a) => artMap.has(a)) ?? strict[0] ?? null;
      if (r.related_article_number !== strictPick) {
        issues.push({
          table, id: r[idCol], tag: tagOf.get(r.problem_id),
          stored: r.related_article_number, strict: strictPick,
          otherLaw: OTHER_LAW_RE.test(r.explanation_md || "") ? (r.explanation_md.match(OTHER_LAW_RE) || [])[1] : null,
          snippet: (r.explanation_md || "").slice(0, 90),
        });
      }
    }
  }
}
await auditRows("problem_choices", "choice_id");
await auditRows("problem_box_items", "box_item_id");
console.log("검사:", scanned, "행 | 조문 연결:", withArt, "| 불일치:", issues.length);
for (const it of issues) console.log(` [${it.table === "problem_choices" ? "선지" : "박스"}] ${it.tag} 저장=${it.stored} 엄격=${it.strict} 타법언급=${it.otherLaw ?? "-"} | ${it.snippet}`);
writeFileSync("tmp/jagwa/civil-choice-wiring/audit-nonlaw.json", JSON.stringify(issues, null, 1));

if (!APPLY) { console.log("(dry-run — --apply 로 정정: 엄격값으로 교체, 없으면 null)"); process.exit(0); }
let err = 0;
for (const it of issues) {
  const patch = { related_article_number: it.strict, related_article_id: it.strict ? (artMap.get(it.strict) ?? null) : null };
  const { error } = await c.from(it.table).update(patch).eq(it.table === "problem_choices" ? "choice_id" : "box_item_id", it.id);
  if (error) { console.log("ERR", it.tag, error.message); err++; }
}
console.log("정정:", issues.length - err, "| 오류:", err);
