// feat-9-010 ③ — 아카이브 → qna_threads/qna_messages 소급 적재 (dry-run 기본, --apply)
// 멱등: archive_key(sha1) unique — 재실행 시 기존 행 skip.
// 답변자=관리자(임병웅), 질문자=수강생(아카이브) 가상 계정 (원장 지시 2026-07-07).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const ROOT = resolve(import.meta.dirname, "../..");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ANSWERER = "e20ac99a-bfa6-4862-94dd-23c063189463"; // 관리자(임병웅)
const ASKER = "c2608845-f5d9-42e9-b9a4-fbe7ef936029"; // 수강생(아카이브)
const ARCHIVE_SOURCE = "cafe-archive";

const { entries } = JSON.parse(
  readFileSync(resolve(ROOT, "source/_converted/qna-archive-enriched.json"), "utf8"),
);

// 제목 정리 — 카페 크롤링 잔재("?댓글수1", "?사진첨부") 제거
const cleanTitle = (t) =>
  (t ?? "")
    .replace(/\?*(댓글수\s*\d+|사진첨부|동영상첨부|파일첨부)/g, "")
    .replace(/\s+/g, " ")
    .trim();
// 답변 문두 인사·서명 제거 ("안녕하세요? 박종태입니다." 등). 본문·꼬리 인사는 보존.
function stripGreeting(a) {
  let t = a.trimStart();
  t = t.replace(/^안녕하세요[?!.~,^\s]*/u, "");
  t = t.replace(/^[가-힣A-Za-z·\s]{0,14}(?:변리사)?입니다[.!?~,\s]*/u, "");
  return t.trimStart() || a; // 과잉 제거로 비면 원문 유지
}
const sha1 = (s) => createHash("sha1").update(s).digest("hex");

const threads = [];
for (const e of entries) {
  const title =
    cleanTitle(e.title) || cleanTitle(e.question.split("\n")[0]).slice(0, 60) || "(제목 없음)";
  let answer = stripGreeting(e.answer);
  if (e.preRevision && e.askedAt)
    answer += `\n\n(답변 시점 ${e.askedAt} 당시 법령 기준입니다.)`;
  // 배치 insert 는 누락 키를 DEFAULT 가 아닌 NULL 로 넣으므로 항상 명시(날짜 결측=현재).
  // 원본 오기록(월>12 등) 방어 — 유효하지 않으면 결측 취급.
  const validDate =
    e.askedAt && /^\d{4}-(\d{2})-(\d{2})$/.test(e.askedAt) &&
    +e.askedAt.slice(5, 7) >= 1 && +e.askedAt.slice(5, 7) <= 12 &&
    +e.askedAt.slice(8, 10) >= 1 && +e.askedAt.slice(8, 10) <= 31
      ? e.askedAt
      : null;
  const ts = validDate ? `${validDate}T09:00:00+09:00` : new Date().toISOString();
  // 체크 제약: 1 ≤ length ≤ 10000. 질문이 비면(제목만 있는 원글) 제목으로 대체.
  const clamp = (s) =>
    s.length > 10000 ? s.slice(0, 9950) + "\n\n…(원문이 길어 일부 생략)" : s;
  threads.push({
    row: {
      target_type: e.target_type,
      target_id: e.target_id,
      subject: e.subject,
      asker_id: ASKER,
      answerer_id: ANSWERER,
      title: title.slice(0, 200),
      question_md: clamp(e.question || title),
      answer_md: clamp(answer),
      status: "answered",
      quality_grade: "high",
      archive_source: ARCHIVE_SOURCE,
      archive_key: sha1(`${e.subject}|${e.question}|${e.answer}`),
      created_at: ts,
      answered_at: ts,
      updated_at: ts,
    },
    followupQ: e.followupQ,
    followupA: e.followupA,
    askedAt: validDate,
  });
}
// archive_key 충돌(동일 질문+답변) 내부 dedupe
const byKey = new Map();
for (const t of threads) if (!byKey.has(t.row.archive_key)) byKey.set(t.row.archive_key, t);
const uniq = [...byKey.values()];
console.log(`적재 대상 ${uniq.length}건 (내부 중복 ${threads.length - uniq.length})`);
console.log(`멀티턴 ${uniq.filter((t) => t.followupQ).length}건`);

if (!APPLY) {
  console.log("\n[dry-run] 샘플 3건:");
  for (const t of uniq.slice(0, 3))
    console.log(JSON.stringify({ ...t.row, question_md: t.row.question_md.slice(0, 60), answer_md: t.row.answer_md.slice(0, 60) }, null, 1));
  console.log("\n--apply 로 실행하세요.");
  process.exit(0);
}

// 기존 archive_key 조회 (멱등)
const existing = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("qna_threads")
    .select("archive_key")
    .eq("archive_source", ARCHIVE_SOURCE)
    .not("archive_key", "is", null)
    .range(from, from + 999);
  if (error) throw error;
  data.forEach((r) => existing.add(r.archive_key));
  if (data.length < 1000) break;
}
const todo = uniq.filter((t) => !existing.has(t.row.archive_key));
console.log(`기존 ${existing.size} skip → 신규 ${todo.length}`);

let inserted = 0, msgs = 0;
for (let i = 0; i < todo.length; i += 200) {
  const batch = todo.slice(i, i + 200);
  const { data, error } = await sb
    .from("qna_threads")
    .insert(batch.map((t) => t.row))
    .select("thread_id, archive_key");
  if (error) throw error;
  inserted += data.length;
  const idByKey = new Map(data.map((r) => [r.archive_key, r.thread_id]));
  // 멀티턴 메시지
  const msgRows = [];
  for (const t of batch) {
    if (!t.followupQ) continue;
    const threadId = idByKey.get(t.row.archive_key);
    if (!threadId) continue;
    const base = t.askedAt ? Date.parse(`${t.askedAt}T10:00:00+09:00`) : Date.now();
    msgRows.push({
      thread_id: threadId,
      role: "student",
      author_id: ASKER,
      body_md: t.followupQ,
      created_at: new Date(base).toISOString(),
    });
    if (t.followupA)
      msgRows.push({
        thread_id: threadId,
        role: "instructor",
        author_id: ANSWERER,
        body_md: stripGreeting(t.followupA),
        created_at: new Date(base + 3600_000).toISOString(),
      });
  }
  if (msgRows.length) {
    const { error: e2 } = await sb.from("qna_messages").insert(msgRows);
    if (e2) throw e2;
    msgs += msgRows.length;
  }
  console.log(`  ${inserted}/${todo.length}`);
}
console.log(`완료 — 스레드 ${inserted}건, 멀티턴 메시지 ${msgs}건`);
