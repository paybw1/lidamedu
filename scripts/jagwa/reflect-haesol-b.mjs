// B 2건(2014 생물 q28·2016 지학 q35) 해설 반영 (feat-3-305).
// 사용자가 검수·확정한 본문 그대로 명시. dry-run(기본) 헤더=키 확인 → --apply 시 트랜잭션 반영.
//   node scripts/jagwa/reflect-haesol-b.mjs            (dry-run)
//   node scripts/jagwa/reflect-haesol-b.mjs --apply
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
    year: 2014, subj: "biology", subjKo: "생물", qno: 28,
    explanation: `**정답 ②** · 생물(생체에너지 — ATP 합성효소/화학삼투)

양성자펌프 C-P-Q가 빛에너지로 H⁺를 막 한쪽으로 능동수송해 양성자 기울기를 만들고, 그 기울기를 따라 H⁺가 ATP 합성효소를 통과하며 ATP가 합성되는 인공 재구성 실험이다.
- **ㄱ.** ATP 합성효소의 F₀ 통로로 H⁺가 지나가며 F₀(회전자, c-고리)가 회전하고, 이 회전이 F₁의 촉매 자리를 바꿔 ATP가 만들어진다. H⁺ 흐름에 의한 F₀ 회전이 ATP 생성의 전제 → **옳음**.
- **ㄴ.** C-P-Q는 카로틴·포르피린·나프토퀴논을 가진 인공 삼합체로, 엽록소의 빛 흡수(안테나) 장치를 모방한 것 → **옳음**.
- **ㄷ.** 합성효소를 반대 방향으로 뒤집어 꽂으면, 주어진 양성자 기울기의 방향이 H⁺를 ATP 합성 쪽으로 흐르게 하지 못하므로 ATP가 생성되지 않는다 → **옳음**.
- 따라서 옳은 것은 ㄱ, ㄴ, ㄷ → **②**.`,
  },
  {
    year: 2016, subj: "earth_science", subjKo: "지학", qno: 35,
    explanation: `**정답 ③** · 지구과학(지질 단면 해석 + 방사성 동위원소 연대 측정)

붕괴 곡선(나)에서 X의 함량이 처음의 50%가 되는 시간이 1억 년이므로 **반감기 = 1억 년**이다(2억 년이면 25%).
- **ㄱ.** A(화강암)에 남은 X가 처음의 1/8 = (1/2)³ → 반감 3회 → 절대 연령 **3억 년** → **옳음**.
- **ㄴ.** B(석회암)는 화강암 A·C가 뚫고 들어간 모암이다. 관입의 법칙상 뚫린 쪽(B)이 뚫은 쪽(A·C)보다 먼저 있었으므로 **B가 가장 오래된 지층** → **옳음**.
- **ㄷ.** D(셰일)는 화강암 C의 관입을 받았으므로 C보다 **먼저** 퇴적됐다. C에 남은 X가 1/4 = (1/2)² → 반감 2회 → C는 **2억 년**. 따라서 D는 그보다 오래된 2억 년 이전(중생대 이전) 지층이고, 신생대 제3기(약 6,550만 년 전 이후)일 수 없다 → **옳지 않음**.
- 따라서 옳은 것은 ㄱ, ㄴ → **③**.`,
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
  fs.writeFileSync(`tmp/jagwa/backup-explanation-b-20260616.json`, JSON.stringify(bk, null, 2), "utf8");
  console.log(`백업: tmp/jagwa/backup-explanation-b-20260616.json (${bk.length}행)`);
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
  console.log(`✅ 반영 완료: ${done}건. 정답키 무변경.`);
}
