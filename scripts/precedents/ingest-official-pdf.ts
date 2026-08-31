// 로컬 PDF 를 판례 전문(원문)으로 적재 — 화면 업로드(/admin/cases/pdf-missing)와 같은 일을
// 파일 경로로 한다. 원장이 판결문 PDF 를 폴더로 넘겨 주는 경우가 반복돼 스크립트로 둔다.
//
// 화면 경로(`admin/api/case-official-pdf.tsx`)와 **같은 규칙**:
//   Storage `case-fulltext` 버킷 저장 → `official_text_pdf_path`
//   텍스트 추출(게이트 통과 시) → `official_text_md`
//   `official_text_unavailable = true` (수동 적재 완료 → 재확인 크론 제외)
// ★기존 원문은 덮지 않는다. 덮어야 하면 그건 사람이 판단할 일이다.
//
//   npx tsx scripts/precedents/ingest-official-pdf.ts --case 2019다225255 --file "source/…/대법원_2019다225255.pdf"
//   ... --apply
//
// RAG 색인은 별도다 — 적재 후 임베딩 cron 이 dirty 로 재처리한다.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { extractOfficialTextFromPdf } from "../../app/features/cases/lib/official-text-from-pdf.server";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const argOf = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const CASE_NUMBER = argOf("--case");
const FILE = argOf("--file");

const BUCKET = "case-fulltext";

if (!CASE_NUMBER || !FILE) {
  console.error("사용: --case <사건번호> --file <PDF 경로> [--apply]");
  process.exit(1);
}

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const { data: kase, error } = await sb
  .from("cases")
  .select("case_id, case_number, official_text_md, official_text_pdf_path")
  .eq("case_number", CASE_NUMBER)
  .is("deleted_at", null)
  .maybeSingle();
if (error) throw new Error(error.message);
if (!kase) throw new Error(`판례를 찾을 수 없습니다: ${CASE_NUMBER}`);
if ((kase.official_text_md ?? "").trim()) {
  console.log(
    `${CASE_NUMBER}: 이미 원문이 있습니다(${kase.official_text_md!.length}자). 덮지 않습니다.`,
  );
  process.exit(0);
}

const bytes = new Uint8Array(fs.readFileSync(path.resolve(FILE)));
const r = await extractOfficialTextFromPdf(bytes);
console.log(
  `${CASE_NUMBER} ← ${path.basename(FILE)}  ${(bytes.length / 1024).toFixed(0)}KB · ${r.pageCount}쪽 · ${r.text.length}자`,
);
if (!r.text) {
  console.log(`  ✗ ${r.warning}`);
  console.log("  텍스트가 없는 PDF 는 적재하지 않습니다 — OCR 본문이 필요합니다.");
  process.exit(1);
}
console.log(`  ${r.text.slice(0, 160).replace(/\n/g, " / ")}`);

if (!APPLY) {
  console.log("\n[dry-run] --apply 를 붙이면 적재합니다.");
  process.exit(0);
}

const objectPath = `${kase.case_id}.pdf`;
const up = await sb.storage
  .from(BUCKET)
  .upload(objectPath, bytes, { contentType: "application/pdf", upsert: true });
if (up.error) throw new Error(`업로드 실패: ${up.error.message}`);

const now = new Date().toISOString();
const { error: upd } = await sb
  .from("cases")
  .update({
    official_text_pdf_path: objectPath,
    official_text_md: r.text,
    official_text_unavailable: true,
    official_text_checked_at: now,
    updated_at: now,
  })
  .eq("case_id", kase.case_id);
if (upd) throw new Error(upd.message);

console.log(`\n✓ 적재 완료 — ${r.text.length}자 · ${BUCKET}/${objectPath}`);
