// (c)-B 워크플로용 데이터 준비 — 단일키 pending 자연과학 해설 초안을 (과목·연도) 배치 JSON으로 덤프.
// 각 배치 파일: [{qno, problemId, key(①~⑤), choices, bodyMd, contentMd}] — 에이전트가 Read 로 읽어 검수.
// 복수키(전항/복수정답)는 제외(별도 개별 검수). 출력: manifest + args용 배열.
// 사용: node scripts/jagwa/fetch-review-batches.mjs
import "dotenv/config";
import fs from "node:fs";
const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
async function dbQuery(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}
const SYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };

const rows = await dbQuery(
  `select p.problem_id, p.science_subject as subj, p.year, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id and c.is_correct) as key,
     (select string_agg(c.choice_index || '. ' || c.body_md, ' | ' order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id) as choices,
     p.body_md, d.content_md
   from problems p join problem_explanation_drafts d on d.problem_id=p.problem_id
   where p.subject_type='science' and p.year is not null and d.status='pending'
   order by p.science_subject, p.year, p.problem_number;`,
);

const dir = "tmp/jagwa/review-batches";
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const batches = new Map(); // "subj|year" -> array
let skippedMulti = 0;
for (const r of rows) {
  const k = r.key || [];
  if (k.length !== 1) { skippedMulti++; continue; }
  const bk = `${r.subj}|${r.year}`;
  if (!batches.has(bk)) batches.set(bk, []);
  batches.get(bk).push({
    qno: r.qno,
    problemId: r.problem_id,
    key: SYM[k[0]],
    choices: r.choices,
    bodyMd: r.body_md,
    contentMd: r.content_md,
  });
}

const manifest = [];
for (const [bk, arr] of batches) {
  const [subject, year] = bk.split("|");
  const file = `${dir}/${subject}_${year}.json`;
  fs.writeFileSync(file, JSON.stringify(arr, null, 2), "utf8");
  manifest.push({ subject, year: Number(year), file: fs.realpathSync(file).replace(/\\/g, "/"), count: arr.length });
}
manifest.sort((a, b) => a.subject.localeCompare(b.subject) || a.year - b.year);
fs.writeFileSync(`${dir}/_manifest.json`, JSON.stringify(manifest, null, 2), "utf8");

const total = manifest.reduce((s, m) => s + m.count, 0);
console.log(`배치 ${manifest.length}개 · 단일키 pending ${total}건 · 복수키 제외 ${skippedMulti}건`);
console.log("과목별:", JSON.stringify(
  manifest.reduce((o, m) => ((o[m.subject] = (o[m.subject] || 0) + m.count), o), {}),
));
console.log(`manifest: ${dir}/_manifest.json`);
// args용 컴팩트 배열(파일 경로 포함)
console.log("ARGS=" + JSON.stringify(manifest.map((m) => ({ subject: m.subject, year: m.year, file: m.file, count: m.count }))));
