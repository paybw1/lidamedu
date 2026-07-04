// S1 strip 정규식 과탐욕으로 잘린 선지 해설을 백업 원본 불릿에서 복원 + 조문 식별 엄격 재계산.
// 안전 strip = /^정답[.,]\s*/ 만. ox_truth 는 보존(이미 검증·2025#37/38 수동 정정 포함).
// dry-run 기본, --apply 로 반영.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const backup = JSON.parse(readFileSync("tmp/jagwa/civil-choice-wiring/backup-problems.json", "utf8"));

const { data: law } = await c.from("laws").select("law_id").eq("law_code", "civil").single();
const artMap = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c.from("articles").select("article_id, article_number").eq("law_id", law.law_id).eq("level", "article").range(from, from + 999);
  for (const a of data) artMap.set(a.article_number, a.article_id);
  if (data.length < 1000) break;
}
const caseMap = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c.from("cases").select("case_id, case_number").range(from, from + 999);
  for (const x of data) caseMap.set(x.case_number.replace(/\s/g, ""), x.case_id);
  if (data.length < 1000) break;
}

const CIRC = "①②③④⑤";
const BULLET_RE = /^[-*]\s*([①②③④⑤])\s*([○✗×OX◯])?\s*(.+)$/;
function parseBullets(md) {
  const out = [];
  for (const line of (md || "").split("\n")) {
    const m = line.trim().match(BULLET_RE);
    if (m) out.push({ idx: CIRC.indexOf(m[1]) + 1, text: m[3].trim() });
  }
  return out;
}
function strictCivilArticles(text) {
  const arts = [];
  const re = /제(\d+)조(?:의(\d+))?/g;
  let m;
  while ((m = re.exec(text))) {
    const prefix = text.slice(Math.max(0, m.index - 20), m.index);
    if (/(같은|동|위|이|그)\s*법\s*$/.test(prefix) && !/민법\s*$/.test(prefix)) continue;
    const pm = prefix.match(/([가-힣]+(?:법|법률)|법률|시행령|시행규칙|규칙)\s*$/);
    if (pm && pm[1] !== "민법") continue;
    arts.push(m[2] ? `${m[1]}의${m[2]}` : m[1]);
  }
  return arts;
}
function extractCases(text) {
  const out = [];
  const re = /\b(\d{2,4}(?:다|므|그|마|스|카|두|누|도|후|허)\d{2,6})\b/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return [...new Set(out)];
}

let checked = 0, textFixed = 0, refFixed = 0;
const fixes = [];
for (const p of backup) {
  const bullets = parseBullets(p.explanation_md);
  if (bullets.length === 0) continue;
  const { data: chs } = await c
    .from("problem_choices")
    .select("choice_id, choice_index, explanation_md, choice_type, related_article_number, related_article_id, related_case_number, related_case_id")
    .eq("problem_id", p.problem_id)
    .order("choice_index");
  for (const ch of chs) {
    const b = bullets.find((x) => x.idx === ch.choice_index);
    if (!b || !ch.explanation_md) continue;
    checked++;
    // 안전 strip: "정답." / "정답," / "정답(…)." — 괄호는 닫힘까지만(과탐욕 금지).
    const restored = b.text.replace(/^정답\s*(?:\([^)]{0,20}\))?\s*[.,]?\s*/, "");
    const arts = strictCivilArticles(restored);
    const cases = extractCases(restored);
    const artNo = arts.find((a) => artMap.has(a)) ?? null;
    const caseNo = cases[0] ?? null;
    const next = {
      explanation_md: restored,
      choice_type: cases.length > 0 ? "precedent" : /제\d+조/.test(restored) ? "statute" : "theory",
      related_article_number: artNo,
      related_article_id: artNo ? (artMap.get(artNo) ?? null) : null,
      related_case_number: caseNo,
      related_case_id: caseNo ? (caseMap.get(caseNo) ?? null) : null,
    };
    const textDiff = next.explanation_md !== ch.explanation_md;
    const refDiff =
      next.related_article_number !== ch.related_article_number ||
      next.related_case_number !== ch.related_case_number ||
      next.choice_type !== ch.choice_type;
    if (!textDiff && !refDiff) continue;
    if (textDiff) textFixed++;
    if (refDiff) refFixed++;
    fixes.push({ choice_id: ch.choice_id, tag: `${p.year}#${p.problem_number} 선지${ch.choice_index}`, textDiff, refDiff, before: { exp: ch.explanation_md.slice(0, 40), art: ch.related_article_number }, after: { exp: restored.slice(0, 40), art: artNo }, patch: next });
  }
}
console.log("검사:", checked, "| 해설 복원:", textFixed, "| 식별 재계산 변경:", refFixed, "| 총 수정행:", fixes.length);
for (const f of fixes.slice(0, 25)) console.log(` ${f.tag} ${f.textDiff ? "[텍스트]" : ""}${f.refDiff ? "[식별]" : ""} art ${f.before.art}→${f.after.art} | "${f.before.exp}" → "${f.after.exp}"`);
writeFileSync("tmp/jagwa/civil-choice-wiring/restore-plan.json", JSON.stringify(fixes, null, 1));

if (!APPLY) { console.log("(dry-run — --apply 로 반영)"); process.exit(0); }
let err = 0;
for (const f of fixes) {
  const { error } = await c.from("problem_choices").update(f.patch).eq("choice_id", f.choice_id);
  if (error) { console.log("ERR", f.tag, error.message); err++; }
}
console.log("적용:", fixes.length - err, "| 오류:", err);
