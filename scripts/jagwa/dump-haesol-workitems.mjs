// 해설 교정 작업 대상 전량을 JSON으로 덤프 (읽기 전용 · DB 수정 0).
// 대상: content_md 에 ⚠ 포함(플래그된 전건) + 명시 타깃(무경고 A/B/C).
// 출력: tmp/jagwa/haesol-work-items.json  [{year,subj,qno,key[],ai_answer,stem,choices,content_md}]
import "dotenv/config";
import fs from "node:fs";
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
// 무경고 명시 타깃(2016화q17=A 기호오기, 2012지q40·2016지q35=B, 2015물q2·2021물q4=C)
const extra = [
  [2016, "chemistry", 17], [2012, "earth_science", 40], [2016, "earth_science", 35],
  [2015, "physics", 2], [2021, "physics", 4],
];
const extraOr = extra.map(([y, s, q]) => `(p.year=${y} and p.science_subject='${s}' and p.problem_number=${q})`).join(" or ");
const rows = await dbQuery(
  `select p.year, p.science_subject as subj, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id and c.is_correct) as key,
     d.ai_answer, p.body_md as stem,
     (select string_agg(c.choice_index||'. '||c.body_md, ' | ' order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id) as choices,
     d.content_md
   from problems p join problem_explanation_drafts d on d.problem_id=p.problem_id
   where p.science_subject is not null and (position('⚠' in d.content_md) > 0 or ${extraOr})
   order by p.year, p.science_subject, p.problem_number;`,
);
fs.mkdirSync("tmp/jagwa", { recursive: true });
fs.writeFileSync("tmp/jagwa/haesol-work-items.json", JSON.stringify(rows, null, 2), "utf8");
const SUBJ_KO = { physics: "물리", chemistry: "화학", biology: "생물", earth_science: "지학" };
const SYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };
console.log(`총 ${rows.length}건 → tmp/jagwa/haesol-work-items.json`);
// 헤더 정답기호 vs 현재키 빠른 점검
const CIRCLE = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
for (const r of rows) {
  const m = r.content_md.match(/정답\s*([①②③④⑤])/);
  const hdr = m ? CIRCLE[m[1]] : null;
  const key = (r.key || [])[0];
  const multi = (r.key || []).length > 1;
  const tag = multi ? "복수" : hdr === key ? "헤더OK" : `헤더${SYM[hdr] || "?"}→키${SYM[key]}`;
  console.log(`${r.year} ${SUBJ_KO[r.subj]} q${String(r.qno).padStart(2)}: 키=${(r.key || []).map((n) => SYM[n]).join("")} ai=${r.ai_answer} [${tag}]`);
}
