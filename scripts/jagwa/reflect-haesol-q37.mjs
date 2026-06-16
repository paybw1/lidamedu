// 2014 지학 q37: 선지 ② 본문 정정("ㄱ, ㄴ"→"ㄱ, ㄷ", 전사 오류) + 해설 반영.
// 정답키(is_correct) 무변경 — ②가 정답인 것은 그대로, 선지 텍스트만 교정.
//   node scripts/jagwa/reflect-haesol-q37.mjs            (dry-run)
//   node scripts/jagwa/reflect-haesol-q37.mjs --apply
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
const SYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const OLD_CHOICE2 = "ㄱ, ㄴ";
const NEW_CHOICE2 = "ㄱ, ㄷ";
const EXPL = `**정답 ②** · 지구과학(지질도 해석 — 관입·절단 관계)

A(편마암)를 기반으로 B(역암)·C(사암)·D(이암)가 차례로 퇴적되고, 화강암 E가 이들을 관입했으며, 단층 F–F'가 지역을 가로지른다.
- **ㄱ.** B·C·D의 주향·경사 기호로 보아 지층은 남동(SE)으로 기울어 있다 → **옳음**.
- **ㄷ.** 화강암 E는 주변 퇴적층을 뚫고 들어간 관입체이며 단층보다도 나중에 자리 잡았으므로, 이 지역에서 **가장 젊은 암석**이다 → **옳음**.
- **ㄴ.** 단층 F–F'와 E의 관계는 '단층을 가로질러 E가 관입'한 것이어서 순서가 단층 → 관입이다. '화강암 관입 후 단층 형성'은 그 반대이므로 → **틀림**.
- **ㄹ.** 가장 오래된 암석은 기반의 편마암 A이고 퇴적층은 B → C → D 순으로 쌓였으므로 'D층이 가장 오래된 지층'은 → **틀림**.
- 따라서 옳은 것은 ㄱ, ㄷ → **②**.`;

const pid = (await dbQuery(`select problem_id from problems where year=2014 and science_subject='earth_science' and problem_number=37;`))[0].problem_id;
const choices = await dbQuery(`select choice_index, body_md, is_correct from problem_choices where problem_id='${pid}' order by choice_index;`);
console.log("현재 선지:");
for (const c of choices) console.log(`  ${SYM[c.choice_index]} "${c.body_md}"${c.is_correct ? " ✓정답" : ""}`);
const c2 = choices.find((c) => c.choice_index === 2);
if (c2.body_md !== OLD_CHOICE2) throw new Error(`선지 ② 가 예상('${OLD_CHOICE2}')과 다름: '${c2.body_md}' — 중단`);
if (!c2.is_correct) throw new Error("선지 ②가 정답이 아님 — 중단(키 가정 위반)");
console.log(`\n정정 예정: 선지 ② "${OLD_CHOICE2}" → "${NEW_CHOICE2}" (is_correct=true 유지)`);
console.log(`해설 헤더: 정답 ② (키 ②와 일치)`);

if (!APPLY) {
  console.log("\n[dry-run] DB 무변경. 반영하려면 --apply");
} else {
  const bk = await dbQuery(`select c.choice_index, c.body_md, c.is_correct, p.explanation_md
    from problem_choices c join problems p on p.problem_id=c.problem_id where c.problem_id='${pid}' order by c.choice_index;`);
  fs.writeFileSync(`tmp/jagwa/backup-q37-choice-expl-20260616.json`, JSON.stringify(bk, null, 2), "utf8");
  console.log(`백업: tmp/jagwa/backup-q37-choice-expl-20260616.json`);
  await dbQuery(`begin;
    update public.problem_choices set body_md = ${sqlStr(NEW_CHOICE2)}
      where problem_id='${pid}' and choice_index=2;
    update public.problem_explanation_drafts set content_md = ${sqlStr(EXPL)}, status='approved', reviewed_at=now()
      where problem_id='${pid}';
    update public.problems set explanation_md = ${sqlStr(EXPL)}, updated_at=now()
      where problem_id='${pid}';
    commit;`);
  // 검증
  const after = await dbQuery(`select choice_index, body_md, is_correct from problem_choices where problem_id='${pid}' order by choice_index;`);
  const a2 = after.find((c) => c.choice_index === 2);
  const keyRows = after.filter((c) => c.is_correct).map((c) => c.choice_index);
  console.log(`✅ 선지 ② = "${a2.body_md}" (정답 ${a2.is_correct}), 정답 인덱스 = [${keyRows}]`);
  console.log("✅ 해설 반영 완료 (explanation_md + drafts approved). 정답키 무변경.");
}
