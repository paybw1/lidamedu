// A류 해설 교정 반영 (feat-3-305). 핸드오프 .md 의 "# 1. A류" 섹션을 단일 출처로 파싱.
//  - dry-run(기본): 33건 파싱 + 각 교정 헤더('정답 X')가 현재 정답키와 일치하는지 검증. DB 무변경.
//  - --apply: 백업 후 problems.explanation_md = 교정본, drafts.content_md = 교정본·status=approved.
//             정답키(problem_choices.is_correct) 무변경.
// 사용: node scripts/jagwa/reflect-haesol-a.mjs            (dry-run)
//       node scripts/jagwa/reflect-haesol-a.mjs --apply    (반영)
import "dotenv/config";
import fs from "node:fs";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
const APPLY = process.argv.includes("--apply");
async function dbQuery(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}
const SUBJ = { "물리": "physics", "화학": "chemistry", "생물": "biology", "지학": "earth_science" };
const CIRCLE = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
const SYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ── .md 파싱 ──
const md = fs.readFileSync("tmp/jagwa/haesol-correction-handoff.md", "utf8");
const s1 = md.indexOf("# 1. A류");
const s2 = md.indexOf("# 2. B");
if (s1 < 0 || s2 < 0) throw new Error("섹션 경계(# 1. A류 / # 2. B)를 찾지 못함");
const section = md.slice(s1, s2);

// "### YYYY SUBJ qN — ..." 블록 분리
const items = [];
const headerRe = /^### (\d{4}) (물리|화학|생물|지학) q(\d+)\b.*$/gm;
const heads = [...section.matchAll(headerRe)];
for (let i = 0; i < heads.length; i++) {
  const h = heads[i];
  const blockStart = h.index;
  const blockEnd = i + 1 < heads.length ? heads[i + 1].index : section.length;
  const block = section.slice(blockStart, blockEnd);
  const year = parseInt(h[1], 10), subj = SUBJ[h[2]], qno = parseInt(h[3], 10);
  // "**교정 후**" 이후 ~ "**변경**" 이전의 인용블록 추출
  const afterMark = block.indexOf("**교정 후**");
  if (afterMark < 0) throw new Error(`${year} ${h[2]} q${qno}: '교정 후' 마커 없음`);
  const rest = block.slice(afterMark);
  const changeAt = rest.indexOf("**변경**");
  const quoteZone = changeAt > 0 ? rest.slice(0, changeAt) : rest;
  const lines = quoteZone.split("\n");
  const out = [];
  for (const ln of lines) {
    if (/^>\s?/.test(ln)) out.push(ln.replace(/^>\s?/, ""));
  }
  const explanation = out.join("\n").trim();
  if (!explanation) throw new Error(`${year} ${h[2]} q${qno}: 인용블록 비어있음`);
  const hm = explanation.match(/\*\*정답\s*([①②③④⑤])\*\*/);
  const headerKey = hm ? CIRCLE[hm[1]] : null;
  items.push({ year, subj, subjKo: h[2], qno, explanation, headerKey });
}

console.log(`파싱된 A류 항목: ${items.length}건 (기대 33)`);

// ── 현재 정답키 조회 + 헤더 일치 검증 ──
const orC = items.map((it) => `(p.year=${it.year} and p.science_subject='${it.subj}' and p.problem_number=${it.qno})`).join(" or ");
const keys = await dbQuery(
  `select p.problem_id, p.year, p.science_subject as subj, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id and c.is_correct) as key,
     (p.explanation_md is not null and length(trim(p.explanation_md))>0) as has_live
   from problems p where ${orC};`,
);
const keyMap = {};
for (const r of keys) keyMap[`${r.year}|${r.subj}|${r.qno}`] = r;

let mismatch = 0, missing = 0;
console.log("\n연도 과목 문항 | 현재키 | 교정헤더 | 일치 | live기존");
for (const it of items) {
  const r = keyMap[`${it.year}|${it.subj}|${it.qno}`];
  if (!r) { console.log(`${it.year} ${it.subjKo} q${it.qno}: ✗ 문제 없음`); missing++; continue; }
  it.problem_id = r.problem_id;
  const k = (r.key || []);
  const single = k.length === 1 ? k[0] : null;
  const ok = single != null && single === it.headerKey;
  if (!ok) mismatch++;
  console.log(`${it.year} ${it.subjKo} q${String(it.qno).padStart(2)} | ${k.map((n) => SYM[n]).join("") || "(없음)"} | ${it.headerKey ? SYM[it.headerKey] : "?"} | ${ok ? "OK" : "✗ 불일치"} | ${r.has_live ? "있음" : "-"}`);
}
console.log(`\n총 ${items.length} · 헤더불일치 ${mismatch} · 문제없음 ${missing}`);

if (items.length !== 33) throw new Error("33건이 아님 — 중단");
if (mismatch || missing) throw new Error("불일치/누락 존재 — 반영 중단");
console.log("✅ 33건 전부 헤더=정정키 일치.");

if (!APPLY) {
  console.log("\n[dry-run] DB 무변경. 반영하려면 --apply");
} else {
  // ── 반영 ──
  const bk = await dbQuery(
    `select p.problem_id, p.year, p.science_subject as subj, p.problem_number as qno, p.explanation_md,
       d.draft_id, d.status, d.content_md
     from problems p left join problem_explanation_drafts d on d.problem_id=p.problem_id where ${orC};`,
  );
  fs.writeFileSync(`tmp/jagwa/backup-explanation-a-20260616.json`, JSON.stringify(bk, null, 2), "utf8");
  console.log(`백업: tmp/jagwa/backup-explanation-a-20260616.json (${bk.length}행)`);
  let done = 0;
  for (const it of items) {
    const md1 = sqlStr(it.explanation);
    await dbQuery(`begin;
      update public.problem_explanation_drafts
        set content_md = ${md1}, status = 'approved', reviewed_at = now()
        where problem_id = '${it.problem_id}';
      update public.problems
        set explanation_md = ${md1}, updated_at = now()
        where problem_id = '${it.problem_id}';
      commit;`);
    done++;
  }
  console.log(`✅ 반영 완료: ${done}건 (problems.explanation_md + drafts.content_md/status=approved). 정답키 무변경.`);
}
