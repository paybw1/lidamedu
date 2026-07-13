// 시험 공고 2건 시드 — 공식 한국산업인력공단 PDF 를 exam-notices 버킷에 올리고 행 생성.
//   출처: 한국산업인력공단(HRDKorea) 공식 공고문(HWP→PDF, 학원 브랜딩 없음 검증 완료).
//   멱등: 같은 제목 미삭제 행이 있으면 건너뜀. 운영 DB(.env supabase-js) 대상.
//
//   node scripts/seed-exam-notices.mjs
import { readFileSync } from "node:fs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SCRATCH =
  "C:/Users/paybw/AppData/Local/Temp/claude/C--project-lidamedu/7a39b930-ef42-4ceb-a3db-cbeb084a64b0/scratchpad";
const BUCKET = "exam-notices";

const NOTICES = [
  {
    title: "2026년도 제63회 변리사 제1차 시험 합격자 공고",
    published_at: "2026-03-25T09:00:00+09:00",
    file: {
      local: `${SCRATCH}/pass_notice.pdf`,
      name: "2026년도 제63회 변리사 제1차 시험 합격자 공고.pdf",
    },
  },
  {
    title: "2026년도 제63회 변리사 국가자격시험 시행계획 공고",
    published_at: "2025-11-21T09:00:00+09:00",
    file: {
      local: `${SCRATCH}/plan_notice.pdf`,
      name: "2026년도 제63회 변리사 국가자격시험 시행계획 공고.pdf",
    },
  },
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정(.env)");
  process.exit(1);
}
const db = createClient(url, key);
console.log(`target: ${url}`);

for (const n of NOTICES) {
  // 멱등 — 같은 제목 미삭제 행 존재 시 건너뜀.
  const { data: existing } = await db
    .from("exam_notices")
    .select("notice_id")
    .eq("title", n.title)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    console.log(`skip (이미 존재): ${n.title}`);
    continue;
  }

  const { data: row, error: insErr } = await db
    .from("exam_notices")
    .insert({ title: n.title, published_at: n.published_at, published: true })
    .select("notice_id")
    .single();
  if (insErr) {
    console.error(`insert 실패: ${n.title}`, insErr.message);
    continue;
  }
  const id = row.notice_id;

  const bytes = readFileSync(n.file.local);
  const path = `${id}/${Date.now()}.pdf`;
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (upErr) {
    console.error(`upload 실패: ${n.title}`, upErr.message);
    await db.from("exam_notices").delete().eq("notice_id", id);
    continue;
  }

  const { error: updErr } = await db
    .from("exam_notices")
    .update({
      attachments: [{ name: n.file.name, path, size: bytes.length }],
    })
    .eq("notice_id", id);
  if (updErr) {
    console.error(`attachments 갱신 실패: ${n.title}`, updErr.message);
    continue;
  }
  console.log(`OK: ${n.title}  (${(bytes.length / 1024).toFixed(0)}KB)`);
}
console.log("done.");
