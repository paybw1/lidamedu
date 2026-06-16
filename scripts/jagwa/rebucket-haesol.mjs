// 해설 교정 재버킷팅 (읽기 전용 · DB 수정 0).
// 정정된 정답키(problem_choices.is_correct) 기준으로 AI 초안(content_md/ai_answer)을 재대조.
//  - now_match = AI 답 == 정정 키  → A류(헤더/⚠️만, 본문은 이미 정답 지지)
//  - !now_match                    → B(실해설오류) 또는 C(본문 OCR 의심) 후보 → 본문 정독 필요
// 사용: node scripts/jagwa/rebucket-haesol.mjs
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

const CIRCLE = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
const SYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };
const sym = (n) => SYM[n] ?? String(n);
const SUBJ_KO = { physics: "물리", chemistry: "화학", biology: "생물", earth_science: "지학" };
// ai_answer 문자열에서 첫 동그라미 또는 1~5 숫자 추출
function aiNum(s) {
  if (!s) return null;
  const t = String(s).trim();
  for (const ch of t) if (CIRCLE[ch]) return CIRCLE[ch];
  const m = t.match(/[1-5]/);
  return m ? parseInt(m[0], 10) : null;
}

const rows = await dbQuery(
  `select p.year, p.science_subject as subj, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c
        where c.problem_id=p.problem_id and c.is_correct) as dbkeys,
     d.ai_answer, d.answer_match,
     length(d.content_md) as clen,
     (position('⚠' in d.content_md) > 0) as has_warn,
     (position('불일치' in d.content_md) > 0) as has_mismatch_word,
     (p.explanation_md is not null and length(trim(p.explanation_md)) > 0) as has_live_expl
   from problems p
   join problem_explanation_drafts d on d.problem_id=p.problem_id
   where p.science_subject is not null and p.year is not null
   order by p.year, p.science_subject, p.problem_number;`,
);

let aMatch = 0, aMatchWarn = 0, multi = 0, noAi = 0, liveExpl = 0;
const stillMismatch = []; // now_match false, 단일키 → B/C 후보
const staleA = []; // answer_match=false 였는데 now_match=true → A류(스테일/키정정)
for (const r of rows) {
  if (r.has_live_expl) liveExpl++;
  const keys = r.dbkeys || [];
  const ai = aiNum(r.ai_answer);
  if (keys.length > 1) { multi++; continue; } // 복수정답/전항정답 — 정상 처리분, 제외
  if (ai == null) { noAi++; continue; }
  const key = keys[0];
  const now = ai === key;
  if (now) {
    aMatch++;
    if (r.has_warn) aMatchWarn++;
    if (r.answer_match === false) staleA.push(r); // 과거 미매칭 → 현재 매칭(스테일 or 키정정)
  } else {
    stillMismatch.push({ ...r, ai, key });
  }
}

console.log(`===== 재버킷팅 요약 (science 드래프트 ${rows.length}건) =====`);
console.log(`now_match=true (A류 후보, 본문이 정정키 지지): ${aMatch}  [그중 ⚠️/경고헤더 보유: ${aMatchWarn}]`);
console.log(`  └ 과거 answer_match=false 였다가 현재 일치(스테일+키정정): ${staleA.length}`);
console.log(`now_match=false (B/C 후보, 본문 정독 필요): ${stillMismatch.length}`);
console.log(`복수정답/전항정답(정상, 제외): ${multi}`);
console.log(`AI답 파싱불가(제외): ${noAi}`);
console.log(`live explanation_md 보유 문항: ${liveExpl}`);

console.log(`\n===== A류: 과거 미매칭 → 현재 일치 (${staleA.length}) =====`);
console.log(`(키정정 15건 + 순수 스테일. 본문은 정정키를 이미 지지 → 헤더/⚠️ 정정 + 표현 신작)`);
for (const r of staleA) {
  console.log(`${r.year} ${SUBJ_KO[r.subj]} q${r.qno}: 정정키=${sym((r.dbkeys || [])[0])} AI=${r.ai_answer} ⚠️헤더=${r.has_warn ? "Y" : "-"} clen=${r.clen}`);
}

console.log(`\n===== B/C 후보: now_match=false (${stillMismatch.length}) — 본문 정독 대상 =====`);
for (const r of stillMismatch) {
  console.log(`${r.year} ${SUBJ_KO[r.subj]} q${r.qno}: 정정키=${sym(r.key)} AI=${sym(r.ai)}(${r.ai_answer}) ⚠️헤더=${r.has_warn ? "Y" : "-"} 불일치어=${r.has_mismatch_word ? "Y" : "-"} clen=${r.clen}`);
}
