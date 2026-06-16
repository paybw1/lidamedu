// (c) 자연과학 해설 배치 승인 — pending AI 초안(content_md)을 explanation_md 로 승인 복사.
// 안전검사: 초안 헤더('정답 X')가 현재 단일 정답키와 일치하는 pending 만 대상(불일치는 스킵·보고).
// 정답키(is_correct)·본문(body_md) 무변경. answer_match=true 세트 가정(미스매치 40건은 별도 처리됨).
//   node scripts/jagwa/approve-haesol-batch.mjs --subject physics --year 2023            (dry-run)
//   node scripts/jagwa/approve-haesol-batch.mjs --subject physics --year 2023 --apply
//   node scripts/jagwa/approve-haesol-batch.mjs --subject physics                        (전 연도)
import "dotenv/config";
import fs from "node:fs";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const subject = argv[argv.indexOf("--subject") + 1];
const yearArg = argv.includes("--year") ? parseInt(argv[argv.indexOf("--year") + 1], 10) : null;
if (!subject) throw new Error("usage: --subject <physics|chemistry|biology|earth_science> [--year Y] [--apply]");

async function dbQuery(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}
const CIRCLE = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
const SYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const yearClause = yearArg ? `and p.year = ${yearArg}` : "";
const rows = await dbQuery(
  `select p.problem_id, p.year, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id and c.is_correct) as key,
     d.ai_answer, d.answer_match, d.content_md
   from problems p join problem_explanation_drafts d on d.problem_id=p.problem_id
   where p.subject_type='science' and p.science_subject='${subject}' and p.year is not null
     and d.status='pending' ${yearClause}
   order by p.year, p.problem_number;`,
);

const okIds = [];
let mismatch = 0, multi = 0;
console.log(`배치: ${subject}${yearArg ? ` ${yearArg}` : " (전 연도)"} · pending ${rows.length}건`);
console.log("연도 q | 키 | 헤더 | answer_match | 판정");
for (const r of rows) {
  const k = r.key || [];
  const m = r.content_md.match(/\*\*정답\s*([①②③④⑤])\*\*/);
  const hdr = m ? CIRCLE[m[1]] : null;
  let verdict;
  if (k.length > 1) { verdict = "복수정답 — 스킵"; multi++; }
  else if (k.length === 1 && hdr === k[0]) { verdict = "승인대상"; okIds.push(r.problem_id); }
  else { verdict = `✗ 헤더≠키 — 스킵`; mismatch++; }
  console.log(`${r.year} q${String(r.qno).padStart(2)} | ${k.map((n) => SYM[n]).join("") || "(없음)"} | ${hdr ? SYM[hdr] : "?"} | ${r.answer_match} | ${verdict}`);
}
console.log(`\n승인대상 ${okIds.length} · 헤더≠키 스킵 ${mismatch} · 복수정답 스킵 ${multi}`);

if (!APPLY) {
  console.log("\n[dry-run] DB 무변경. 승인하려면 --apply");
} else if (okIds.length === 0) {
  console.log("승인대상 0 — 변경 없음.");
} else {
  // 백업
  const inList = okIds.map((id) => `'${id}'`).join(",");
  const bk = await dbQuery(
    `select p.problem_id, p.year, p.problem_number, p.explanation_md, d.status
     from problems p join problem_explanation_drafts d on d.problem_id=p.problem_id
     where p.problem_id in (${inList});`,
  );
  const stamp = `${subject}${yearArg ? `-${yearArg}` : "-all"}`;
  fs.mkdirSync("tmp/jagwa/approve-backups", { recursive: true });
  fs.writeFileSync(`tmp/jagwa/approve-backups/backup-${stamp}.json`, JSON.stringify(bk, null, 2), "utf8");
  console.log(`백업: tmp/jagwa/approve-backups/backup-${stamp}.json (${bk.length}행)`);
  // 승인: content_md → explanation_md, status=approved
  await dbQuery(`begin;
    update public.problems p set explanation_md = d.content_md, updated_at = now()
      from public.problem_explanation_drafts d
      where d.problem_id = p.problem_id and p.problem_id in (${inList});
    update public.problem_explanation_drafts d set status='approved', reviewed_at=now()
      where d.problem_id in (${inList});
    commit;`);
  console.log(`✅ 승인 완료: ${okIds.length}건 (explanation_md ← content_md, status=approved). 정답키·본문 무변경.`);
}
