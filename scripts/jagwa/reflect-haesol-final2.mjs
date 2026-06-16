// 2015 화학 q16(⑤) · 2021 물리 q4(②) 해설 반영 (사용자 검수·승인 완료).
//   node scripts/jagwa/reflect-haesol-final2.mjs            (dry-run)
//   node scripts/jagwa/reflect-haesol-final2.mjs --apply
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
const CIRCLE = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
const SYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const items = [
  {
    year: 2015, subj: "chemistry", subjKo: "화학", qno: 16,
    explanation: `**정답 ⑤** · 화학(반응 속도 — 반응 메커니즘·속도 결정 단계)

3단계 메커니즘과 전체 속도 법칙 v = k[Cl₂][H₂S]를 분석한다.
- **ㄱ.** 중간체는 생성됐다가 이후 단계에서 소비되는 화학종이다. Cl(단계 Ⅰ에서 생성 → Ⅱ·Ⅲ에서 소비)·HS(단계 Ⅱ에서 생성 → Ⅲ에서 소비) = **2종류** → 옳음. (HCl·S는 최종 생성물)
- **ㄴ.** 에너지 그림에서 활성화 에너지가 E_a1 < E_a2 < E_a3 으로 단계 Ⅲ의 에너지 장벽이 가장 크다. 가장 큰 장벽을 넘는 단계가 가장 느리므로 **속도 결정 단계는 단계 Ⅲ** → 옳음.
- **ㄷ.** 주어진 속도 법칙 v = k[Cl₂][H₂S]에서 H₂S에 대한 반응 차수는 **1** → 옳음.
- 따라서 ㄱ, ㄴ, ㄷ 모두 옳음 → **⑤**.`,
  },
  {
    year: 2021, subj: "physics", subjKo: "물리", qno: 4,
    explanation: `**정답 ②** · 물리(회전운동 — 일·운동에너지 정리와 관성모멘트)

같은 토크를 같은 각도까지 가하므로 두 강체에 한 일이 같다: W = τθ = ½Iω².
- (가) 균일한 구: I = (2/5)MR², 각속도 2ω.
- (나) **(가)의 구(질량 M)** 에 가는 고리(질량 m)를 수평으로 끼운 강체. 고리가 수평을 유지하며 회전하므로 회전축은 고리면에 수직인 중심축이고, 이때 고리의 관성모멘트는 mR²이다. 따라서 I = (2/5)MR² + mR², 각속도 ω.
- 한 일이 같으므로 ½·(2/5)MR²·(2ω)² = ½·[(2/5)MR² + mR²]·ω² → 4 × (2/5)M = (2/5)M + m → (8/5)M = (2/5)M + m → (6/5)M = m → **M/m = 5/6** → ②.`,
  },
];

const orC = items.map((it) => `(p.year=${it.year} and p.science_subject='${it.subj}' and p.problem_number=${it.qno})`).join(" or ");
const rows = await dbQuery(
  `select p.problem_id, p.year, p.science_subject as subj, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id and c.is_correct) as key,
     (p.explanation_md is not null and length(trim(p.explanation_md))>0) as has_live
   from problems p where ${orC};`,
);
const keyMap = {};
for (const r of rows) keyMap[`${r.year}|${r.subj}|${r.qno}`] = r;

let bad = 0;
console.log("연도 과목 문항 | 현재키 | 교정헤더 | 일치 | live기존");
for (const it of items) {
  const r = keyMap[`${it.year}|${it.subj}|${it.qno}`];
  if (!r) { console.log(`${it.year} ${it.subjKo} q${it.qno}: ✗ 문제 없음`); bad++; continue; }
  it.problem_id = r.problem_id;
  const hm = it.explanation.match(/\*\*정답\s*([①②③④⑤])\*\*/);
  it.headerKey = hm ? CIRCLE[hm[1]] : null;
  const k = r.key || [];
  const single = k.length === 1 ? k[0] : null;
  const ok = single != null && single === it.headerKey;
  if (!ok) bad++;
  console.log(`${it.year} ${it.subjKo} q${it.qno} | ${k.map((n) => SYM[n]).join("") || "(없음)"} | ${it.headerKey ? SYM[it.headerKey] : "?"} | ${ok ? "OK" : "✗ 불일치"} | ${r.has_live ? "있음" : "-"}`);
}
if (bad) throw new Error("헤더 불일치/문제 없음 — 반영 중단");
console.log("✅ 2건 헤더=정정키 일치.");

if (!APPLY) {
  console.log("\n[dry-run] DB 무변경. 반영하려면 --apply");
} else {
  const bk = await dbQuery(
    `select p.problem_id, p.year, p.science_subject as subj, p.problem_number as qno, p.explanation_md,
       d.draft_id, d.status, d.content_md
     from problems p left join problem_explanation_drafts d on d.problem_id=p.problem_id where ${orC};`,
  );
  fs.writeFileSync(`tmp/jagwa/backup-explanation-final2-20260616.json`, JSON.stringify(bk, null, 2), "utf8");
  console.log(`백업: tmp/jagwa/backup-explanation-final2-20260616.json (${bk.length}행)`);
  let done = 0;
  for (const it of items) {
    const md1 = sqlStr(it.explanation);
    await dbQuery(`begin;
      update public.problem_explanation_drafts set content_md = ${md1}, status='approved', reviewed_at=now() where problem_id='${it.problem_id}';
      update public.problems set explanation_md = ${md1}, updated_at=now() where problem_id='${it.problem_id}';
      commit;`);
    done++;
  }
  console.log(`✅ 반영 완료: ${done}건. 정답키 무변경.`);
}
