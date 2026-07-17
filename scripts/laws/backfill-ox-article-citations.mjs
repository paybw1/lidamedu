// 정오문제 조문 매칭 — 명시 인용 결정적 백필 (civil-ox-article-backfill-s1 범용화).
// 대상: OX 적격(ox_truth 有·ox_ineligible=false)·related_article 미연결 지문.
// 규칙(보수적): 지문+해설에서 "제N조(의M)" 추출, 유일 1개일 때만 연결.
//   타법명 접두 인용 제외 · "같은/동/위/이/그 법" 간접 지칭 제외 ·
//   타법 언급 텍스트에서 대상법 명시 접두가 없으면 스킵 · 조문 실재 확인.
//
//   node scripts/laws/backfill-ox-article-citations.mjs --law trademark [--apply]
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const lawIdx = process.argv.indexOf("--law");
const LAW = lawIdx >= 0 ? process.argv[lawIdx + 1] : null;
const LAW_NAMES = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  civil: "민법",
  "civil-procedure": "민사소송법",
};
if (!LAW || !LAW_NAMES[LAW]) {
  console.error("--law <patent|trademark|design|civil|civil-procedure> 필요");
  process.exit(1);
}
const LAW_NAME = LAW_NAMES[LAW];
// 수험 텍스트에 등장하는 법령명 풀 — 대상법 제외한 나머지가 '타법'.
const ALL_LAW_TOKENS = [
  "특허법", "실용신안법", "디자인보호법", "상표법", "민법", "민사소송법", "민사집행법",
  "상법", "행정소송법", "행정심판법", "헌법", "저작권법", "부정경쟁방지",
  "발명진흥법", "종자산업법", "농수산물품질관리법", "관세법", "형법",
  "파리협약", "마드리드", "특허협력조약", "헤이그", "TRIPs",
];
const otherLaws = ALL_LAW_TOKENS.filter((t) => t !== LAW_NAME);
const OTHER_LAW_RE = new RegExp(`(${otherLaws.join("|")})`);

const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: law } = await c.from("laws").select("law_id").eq("law_code", LAW).single();

const pids = [];
const tagOf = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c
    .from("problems")
    .select("problem_id, year, problem_number")
    .eq("law_id", law.law_id)
    .is("deleted_at", null)
    .range(from, from + 999);
  for (const p of data) {
    pids.push(p.problem_id);
    tagOf.set(p.problem_id, `${p.year}#${p.problem_number}`);
  }
  if (data.length < 1000) break;
}
const artMap = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c
    .from("articles")
    .select("article_id, article_number")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .range(from, from + 999);
  for (const a of data) artMap.set(a.article_number, a.article_id);
  if (data.length < 1000) break;
}
console.log(`${LAW_NAME} — 문제 ${pids.length} | 조문 ${artMap.size} | ${APPLY ? "APPLY" : "DRY-RUN"}`);

// 엄격 추출 — {num, explicitTarget} 목록
function strictArticles(text) {
  const arts = [];
  const re = /제(\d+)조(?:의(\d+))?/g;
  let m;
  while ((m = re.exec(text))) {
    const prefix = text.slice(Math.max(0, m.index - 20), m.index);
    if (/(같은|동|위|이|그)\s*법\s*$/.test(prefix) && !new RegExp(`${LAW_NAME}\\s*$`).test(prefix))
      continue;
    const pm = prefix.match(/([가-힣]+(?:법|법률)|법률|시행령|시행규칙|규칙|협약|조약)\s*$/);
    if (pm && pm[1] !== LAW_NAME) continue;
    arts.push({
      num: m[2] ? `${m[1]}의${m[2]}` : m[1],
      explicitTarget: new RegExp(`${LAW_NAME}\\s*$`).test(prefix),
    });
  }
  return arts;
}

const toLink = [];
const skipped = { none: 0, multi: 0, otherLawBare: 0, notInDb: 0 };
async function scan(table, idCol) {
  for (let i = 0; i < pids.length; i += 150) {
    const { data: rows } = await c
      .from(table)
      .select(
        `${idCol}, problem_id, body_md, explanation_md, ox_truth, ox_ineligible, related_article_id, related_article_number`,
      )
      .in("problem_id", pids.slice(i, i + 150))
      .limit(10000);
    for (const r of rows ?? []) {
      if (r.ox_ineligible || !r.ox_truth) continue;
      if (r.related_article_id || r.related_article_number) continue;
      const text = `${r.body_md ?? ""}\n${r.explanation_md ?? ""}`;
      const found = strictArticles(text);
      if (found.length === 0) { skipped.none++; continue; }
      const uniq = [...new Set(found.map((f) => f.num))];
      if (uniq.length > 1) { skipped.multi++; continue; }
      const num = uniq[0];
      if (OTHER_LAW_RE.test(text) && !found.some((f) => f.explicitTarget)) {
        skipped.otherLawBare++;
        continue;
      }
      if (!artMap.has(num)) { skipped.notInDb++; continue; }
      toLink.push({
        table,
        idCol,
        id: r[idCol],
        tag: tagOf.get(r.problem_id),
        num,
        snippet: text.replace(/\s+/g, " ").slice(0, 100),
      });
    }
  }
}
await scan("problem_choices", "choice_id");
await scan("problem_box_items", "box_item_id");

console.log("연결 대상:", toLink.length, "| 스킵:", JSON.stringify(skipped));
for (const t of toLink.slice(0, 30))
  console.log(` [${t.table === "problem_choices" ? "선지" : "박스"}] ${t.tag} → 제${t.num}조 | ${t.snippet}`);
if (toLink.length > 30) console.log(` … 외 ${toLink.length - 30}건 (plan 파일 참조)`);

mkdirSync("tmp/laws", { recursive: true });
writeFileSync(`tmp/laws/${LAW}-ox-citation-plan.json`, JSON.stringify(toLink, null, 1));
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
