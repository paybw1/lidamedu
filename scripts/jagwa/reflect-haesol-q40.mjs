// 2012 지학 q40 해설 반영 (그림 (가) 확정 = D가 암맥을 덮음 → 키 ①).
//   node scripts/jagwa/reflect-haesol-q40.mjs            (dry-run)
//   node scripts/jagwa/reflect-haesol-q40.mjs --apply
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

const it = {
  year: 2012, subj: "earth_science", subjKo: "지학", qno: 40,
  explanation: `**정답 ①** · 지구과학(지사학의 법칙으로 형성 순서 해석)

지사학의 법칙(지층 누중·관입·절단 관계)으로 단면의 사건을 오래된 것부터 배열한다.
- **A → B → C층 퇴적**: 수평으로 쌓인 퇴적층은 아래일수록 오래되므로(누중의 법칙) A가 가장 먼저, 이어 B·C가 쌓였다.
- **단층**: 단층면이 A·B·C층을 함께 끊고 있으므로, 단층은 C층까지 쌓인 뒤에 일어났다(절단 관계).
- **부정합**: 단층까지 잘린 지층을 깎아낸 침식면(부정합면)이 그 위를 덮으므로, 부정합은 단층 다음이다.
- **암맥**: 부정합면 아래의 지층을 뚫고 올라온 맥상 관입체다. 부정합면을 자르고 들어갔으므로 부정합 이후의 사건이다.
- **D층**: 단면 최상부의 D층이 암맥의 상단을 덮고 있고 암맥은 D층을 관통하지 못한다. 즉 암맥이 먼저 굳은 뒤 그 위에 D층이 쌓였으므로 D층이 가장 나중이다.

따라서 순서는 **A → B → C → 단층 → 부정합 → 암맥 → D층** → **①**.`,
};

const row = (await dbQuery(
  `select p.problem_id, (select array_agg(c.choice_index order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id and c.is_correct) as key,
     (p.explanation_md is not null and length(trim(p.explanation_md))>0) as has_live
   from problems p where p.year=${it.year} and p.science_subject='${it.subj}' and p.problem_number=${it.qno};`,
))[0];
if (!row) throw new Error("문제 없음");
const hm = it.explanation.match(/\*\*정답\s*([①②③④⑤])\*\*/);
const headerKey = hm ? CIRCLE[hm[1]] : null;
const k = row.key || [];
const ok = k.length === 1 && k[0] === headerKey;
console.log(`2012 지학 q40 | 현재키 ${k.map((n) => SYM[n]).join("")} | 교정헤더 ${SYM[headerKey]} | ${ok ? "OK" : "✗"} | live기존 ${row.has_live ? "있음" : "-"}`);
if (!ok) throw new Error("헤더≠키 — 중단");

if (!APPLY) {
  console.log("[dry-run] DB 무변경. 반영하려면 --apply");
} else {
  const bk = await dbQuery(`select problem_id, explanation_md from problems where problem_id='${row.problem_id}';`);
  fs.writeFileSync(`tmp/jagwa/backup-explanation-q40-20260616.json`, JSON.stringify(bk, null, 2), "utf8");
  const md1 = sqlStr(it.explanation);
  await dbQuery(`begin;
    update public.problem_explanation_drafts set content_md = ${md1}, status='approved', reviewed_at=now() where problem_id='${row.problem_id}';
    update public.problems set explanation_md = ${md1}, updated_at=now() where problem_id='${row.problem_id}';
    commit;`);
  console.log("✅ 반영 완료: 2012 지학 q40. 정답키 무변경.");
}
