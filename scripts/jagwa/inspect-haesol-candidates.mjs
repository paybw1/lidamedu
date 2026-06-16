// B/C 판정용 본문 정독 덤프 (읽기 전용 · DB 수정 0).
// (1) ai_answer 가 단일 ①~⑤ 가 아닌 모든 science 드래프트 목록(= 계산불가/선지불일치 → C 의심)
// (2) 지정 타깃의 content_md(AI 초안) + body_md(문제 본문) 전문 덤프
// 사용: node scripts/jagwa/inspect-haesol-candidates.mjs
import "dotenv/config";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
async function dbQuery(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
const SUBJ_KO = { physics: "물리", chemistry: "화학", biology: "생물", earth_science: "지학" };
const SYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };

// (1) ai_answer 비정형 목록
const messy = await dbQuery(
  `select p.year, p.science_subject as subj, p.problem_number as qno, d.ai_answer
   from problems p join problem_explanation_drafts d on d.problem_id=p.problem_id
   where p.science_subject is not null
     and trim(d.ai_answer) !~ '^[①②③④⑤]$'
   order by p.year, p.science_subject, p.problem_number;`,
);
console.log(`===== ai_answer 비정형(단일 동그라미 아님) ${messy.length}건 — C(본문 OCR) 1차 의심 =====`);
for (const r of messy) console.log(`${r.year} ${SUBJ_KO[r.subj]} q${r.qno}: ai_answer="${r.ai_answer}"`);

// (2) 본문 정독 타깃: 7 still-mismatch + 2015물리q2 + 2021물리q4
const targets = [
  [2010, "earth_science", 35], [2012, "earth_science", 40], [2014, "biology", 28],
  [2014, "earth_science", 40], [2016, "chemistry", 17], [2016, "earth_science", 35],
  [2017, "physics", 4], [2015, "physics", 2], [2021, "physics", 4],
];
const orClauses = targets
  .map(([y, s, q]) => `(p.year=${y} and p.science_subject='${s}' and p.problem_number=${q})`)
  .join(" or ");
const rows = await dbQuery(
  `select p.year, p.science_subject as subj, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c
        where c.problem_id=p.problem_id and c.is_correct) as dbkeys,
     d.ai_answer, p.body_md,
     (select string_agg(c.choice_index || '. ' || c.body_md, '  |  ' order by c.choice_index)
        from problem_choices c where c.problem_id=p.problem_id) as choices,
     d.content_md
   from problems p join problem_explanation_drafts d on d.problem_id=p.problem_id
   where ${orClauses}
   order by p.year, p.science_subject, p.problem_number;`,
);
for (const r of rows) {
  const key = (r.dbkeys || []).map((n) => SYM[n] || n).join(",");
  console.log(`\n${"=".repeat(80)}`);
  console.log(`■ ${r.year} ${SUBJ_KO[r.subj]} q${r.qno}  정정키=${key}  AI=${r.ai_answer}`);
  console.log(`${"-".repeat(80)}`);
  console.log(`[본문 body_md]\n${r.body_md}`);
  console.log(`\n[선지]\n${r.choices}`);
  console.log(`\n[AI 초안 content_md]\n${r.content_md}`);
}
