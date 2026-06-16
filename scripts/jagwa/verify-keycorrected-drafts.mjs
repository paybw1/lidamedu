// 키정정 15건 + q33 의 AI 본문이 '새 키(공단)'를 지지하는지 검증 (읽기 전용).
// 헤더 정답기호 + ai_answer + 현재키 비교. A(본문→새키) vs 잠복 B(본문→옛키) 판별.
import "dotenv/config";
const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
async function dbQuery(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
const SYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };
const targets = [
  [2019, "chemistry", 11], [2019, "chemistry", 13], [2019, "chemistry", 14], [2019, "chemistry", 15],
  [2019, "biology", 29], [2019, "earth_science", 31], [2019, "earth_science", 33], [2019, "earth_science", 34],
  [2019, "earth_science", 37], [2019, "earth_science", 39], [2022, "chemistry", 11], [2022, "chemistry", 18],
  [2022, "biology", 29], [2022, "biology", 30], [2022, "earth_science", 39],
];
const orC = targets.map(([y, s, q]) => `(p.year=${y} and p.science_subject='${s}' and p.problem_number=${q})`).join(" or ");
const rows = await dbQuery(
  `select p.year, p.science_subject as subj, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id and c.is_correct) as key,
     d.ai_answer, left(d.content_md, 90) as header, d.content_md
   from problems p join problem_explanation_drafts d on d.problem_id=p.problem_id
   where ${orC} order by p.year, p.science_subject, p.problem_number;`,
);
const CIRCLE = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
for (const r of rows) {
  const key = (r.key || [])[0];
  // 본문 마지막 결론부의 동그라미(마지막 등장) 추출
  const all = [...r.content_md.matchAll(/[①②③④⑤]/g)].map((m) => CIRCLE[m[0]]);
  const lastSym = all.length ? all[all.length - 1] : null;
  const aiC = CIRCLE[String(r.ai_answer).trim()[0]] ?? null;
  const verdict = aiC === key ? "A(ai=새키)" : "⚠️확인(ai≠새키)";
  console.log(`${r.year} ${r.subj} q${r.qno}: 새키=${SYM[key]} ai=${r.ai_answer}(${aiC}) 본문末기호=${SYM[lastSym] || "?"} → ${verdict}`);
  console.log(`   헤더: ${r.header.replace(/\n/g, " ")}`);
}
