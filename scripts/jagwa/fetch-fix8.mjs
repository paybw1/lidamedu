// 교정 대상 8건(신규플래그 5 + 복수정답 3) 전문 덤프 + 그림 URL 추출.
import "dotenv/config";
import fs from "node:fs";
const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
async function dbQuery(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(t);
  return JSON.parse(t);
}
const targets = [
  [2017, "biology", 22], [2017, "chemistry", 20], [2022, "chemistry", 12],
  [2018, "earth_science", 32], [2022, "earth_science", 37],
  [2014, "physics", 7], [2023, "chemistry", 16], [2010, "earth_science", 32],
];
const orC = targets.map(([y, s, q]) => `(p.year=${y} and p.science_subject='${s}' and p.problem_number=${q})`).join(" or ");
const SYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };
const rows = await dbQuery(
  `select p.problem_id, p.year, p.science_subject as subj, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id and c.is_correct) as key,
     p.body_md,
     (select string_agg(c.choice_index||'. '||c.body_md, ' | ' order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id) as choices,
     d.content_md
   from problems p join problem_explanation_drafts d on d.problem_id=p.problem_id
   where ${orC} order by p.year, p.science_subject, p.problem_number;`,
);
fs.mkdirSync("tmp/jagwa/fix8", { recursive: true });
for (const r of rows) {
  const fig = (r.body_md.match(/!\[\]\(([^)]+)\)/) || [])[1] || null;
  const obj = { year: r.year, subj: r.subj, qno: r.qno, problemId: r.problem_id, key: (r.key || []).map((n) => SYM[n]).join(""), figure: fig, bodyMd: r.body_md, choices: r.choices, contentMd: r.content_md };
  fs.writeFileSync(`tmp/jagwa/fix8/${r.year}_${r.subj}_${r.qno}.json`, JSON.stringify(obj, null, 2), "utf8");
  console.log(`${r.year} ${r.subj} q${r.qno} | 키 ${obj.key} | 그림 ${fig ? "Y: " + fig.split("/").pop() : "-"}`);
}
