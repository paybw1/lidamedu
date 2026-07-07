// feat-9-010 후속 — 아카이브 답변의 인라인 넘버링("… 입니다. 2. 이는 …")을 문단 분리.
// 날짜("2015. 10. 15. 선고")는 직전 토큰이 숫자.인지로 판별해 보존. dry-run 기본, --apply.
// 멱등: 이미 줄 시작인 넘버링은 건드리지 않음.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 문장 종결 뒤에 오는 "N. " / "(N) " / "[N] " 넘버링 앞에 빈 줄 삽입.
export function breakNumbering(text) {
  if (!text) return text;
  let out = "";
  let last = 0;
  const re = /(?:(\d{1,2})\.|\((\d{1,2})\)|\[(\d{1,2})\])\s+/g;
  let m;
  while ((m = re.exec(text))) {
    const i = m.index;
    // 뒤가 숫자면(날짜 연쇄 "10. 15.") 제외
    const next = text[i + m[0].length];
    if (next !== undefined && /\d/.test(next) && m[1] !== undefined) continue;
    // 앞의 비공백 문자 — 문장 종결 부호일 때만 (줄 시작·이미 개행이면 skip)
    let j = i - 1;
    while (j >= 0 && (text[j] === " " || text[j] === "\t")) j--;
    if (j < 0) continue; // 문자열 시작
    const prev = text[j];
    if (prev === "\n") continue; // 이미 줄 시작
    if (!/[.?!~)”"']/.test(prev)) continue;
    // 날짜 가드 — 직전 토큰이 "숫자." 이면 날짜 연쇄의 일부 ("2015. 10. |15. 선고")
    const before = text.slice(Math.max(0, i - 12), i);
    if (m[1] !== undefined && /\d{1,4}\.\s*$/.test(before)) continue;
    out += text.slice(last, j + 1) + "\n\n";
    last = i;
  }
  out += text.slice(last);
  return out;
}

// 간단 자가 테스트
const t1 = "1. 전제조건. 둘 다 출원. 2. 이는 판례의 문제. 다만 해결.";
const t2 = "대법원 2015. 10. 15. 선고 2014다216522 판결 참조. 2. 다음 논점.";
console.log("[test1]", JSON.stringify(breakNumbering(t1)));
console.log("[test2]", JSON.stringify(breakNumbering(t2)));

// 아카이브 답변 전량
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("qna_threads")
    .select("thread_id, answer_md")
    .eq("archive_source", "cafe-archive")
    .not("answer_md", "is", null)
    .range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
const changed = rows
  .map((r) => ({ ...r, next: breakNumbering(r.answer_md) }))
  .filter((r) => r.next !== r.answer_md);
console.log(`스레드 답변: ${rows.length}건 중 변경 ${changed.length}건`);

// 재답변(instructor 메시지)
const { data: msgs, error: me } = await sb
  .from("qna_messages")
  .select("message_id, body_md")
  .eq("role", "instructor")
  .is("deleted_at", null);
if (me) throw me;
const changedMsgs = (msgs ?? [])
  .map((r) => ({ ...r, next: breakNumbering(r.body_md) }))
  .filter((r) => r.next !== r.body_md);
console.log(`재답변 메시지: ${(msgs ?? []).length}건 중 변경 ${changedMsgs.length}건`);

if (!APPLY) {
  for (const r of changed.slice(0, 3)) {
    console.log("\n--- 예시", r.thread_id);
    console.log(JSON.stringify(r.next.slice(0, 300)));
  }
  console.log("\n--apply 로 실행하세요.");
  process.exit(0);
}
let n = 0;
for (const r of changed) {
  const { error } = await sb.from("qna_threads").update({ answer_md: r.next }).eq("thread_id", r.thread_id);
  if (error) throw error;
  if (++n % 500 === 0) console.log(`  ${n}/${changed.length}`);
}
for (const r of changedMsgs) {
  const { error } = await sb.from("qna_messages").update({ body_md: r.next }).eq("message_id", r.message_id);
  if (error) throw error;
}
console.log(`완료 — 답변 ${changed.length}건, 재답변 ${changedMsgs.length}건 갱신`);
