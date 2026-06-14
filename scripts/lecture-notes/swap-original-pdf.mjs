// 통합본 PDF "파일만" 교체 (폰트 정상본). 페이지 대응 동일 → 위치 링크 무변경.
// 단계별 서브커맨드 (게이트):
//   node scripts/lecture-notes/swap-original-pdf.mjs backup    # ② 현재 스토리지 원본 백업(버킷+로컬)
//   node scripts/lecture-notes/swap-original-pdf.mjs replace   # ③ 새 PDF 덮어쓰기 + 메타 갱신 (되돌리기 어려움)
//   node scripts/lecture-notes/swap-original-pdf.mjs verify    # ④ 라이브 객체 재검증(페이지수·Producer·표본 토큰·signed URL)
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: resolve(ROOT, ".env") });

const BUCKET = "lecture-notes";
const KEY = "original/patent-lecture-v10.pdf"; // 위치 링크/메타가 가리키는 경로 — 불변
const BACKUP_KEY = "original/_backup/patent-lecture-v10-libreoffice-pre-pptx.pdf";
const LOCAL_BACKUP = resolve(ROOT, "tmp/lecture-notes/backup/patent-lecture-v10-pre-pptx.pdf");
const NEW_PDF = resolve(ROOT, "source/특허법 강의노트/특허법 강의노트(제10판).pdf");
const SOURCE_PDF_ID = "66dee2d2-f211-5cc7-8590-64b744f335cd";

const cmd = process.argv[2];
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요(.env)");
const supa = createClient(url, key, { auth: { persistSession: false } });

const STD_FONTS =
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", "pdfjs-dist", "standard_fonts") + "/";
const SAMPLES = [
  { page: 300, expect: "제83조" },
  { page: 445, expect: "제148조" },
  { page: 448, expect: "제139조" },
  { page: 495, expect: "제136조" },
  { page: 583, expect: "제204조" },
];

async function backup() {
  console.log(`② 백업`);
  // 1) 라이브 객체 다운로드 → 로컬 백업
  const { data: dl, error: dErr } = await supa.storage.from(BUCKET).download(KEY);
  if (dErr) throw new Error(`현재 객체 download 실패: ${dErr.message}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  mkdirSync(dirname(LOCAL_BACKUP), { recursive: true });
  writeFileSync(LOCAL_BACKUP, bytes);
  console.log(`  로컬 백업: ${LOCAL_BACKUP} (${(bytes.length / 1048576).toFixed(2)} MB)`);

  // 2) 버킷 내 백업 — 이미 있으면 보존(최초 pristine 본 유지)
  const { data: list } = await supa.storage.from(BUCKET).list("original/_backup");
  const exists = (list ?? []).some((f) => f.name === basename(BACKUP_KEY));
  if (exists) {
    console.log(`  버킷 백업: 이미 존재 → 보존(${BACKUP_KEY})`);
  } else {
    const up = await supa.storage.from(BUCKET).upload(BACKUP_KEY, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (up.error) throw new Error(`버킷 백업 upload 실패: ${up.error.message}`);
    console.log(`  버킷 백업: ${BUCKET}/${BACKUP_KEY}`);
  }
  console.log(`  ✅ 백업 완료(롤백: 이 파일을 ${KEY} 로 다시 upload)`);
}

async function replace() {
  console.log(`③ 교체(덮어쓰기) + 메타 갱신`);
  const bytes = readFileSync(NEW_PDF);
  console.log(`  새 PDF: ${NEW_PDF} (${(statSync(NEW_PDF).size / 1048576).toFixed(2)} MB)`);
  const up = await supa.storage.from(BUCKET).upload(KEY, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) throw new Error(`upload(덮어쓰기) 실패: ${up.error.message}`);
  console.log(`  스토리지 덮어쓰기 완료: ${BUCKET}/${KEY}`);
  const { error: mErr } = await supa
    .from("lecture_source_pdfs")
    .update({
      source_filename: basename(NEW_PDF),
      total_pages: 603,
      slide_count: 603,
      updated_at: new Date().toISOString(),
    })
    .eq("source_pdf_id", SOURCE_PDF_ID);
  if (mErr) throw new Error(`메타 갱신 실패: ${mErr.message}`);
  console.log(`  메타 갱신 완료(source_pdf_id·storage_path 불변, total_pages=603).`);
  console.log(`  위치 링크(lecture_pdf_locations) 무변경.`);
}

async function verify() {
  console.log(`④ 라이브 객체 재검증`);
  const { data: dl, error } = await supa.storage.from(BUCKET).download(KEY);
  if (error) throw new Error(`download 실패: ${error.message}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  console.log(`  라이브 크기: ${(bytes.length / 1048576).toFixed(2)} MB`);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: STD_FONTS,
    disableFontFace: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  console.log(`  pages: ${pdf.numPages} ${pdf.numPages === 603 ? "✅" : "❌"}`);
  const meta = await pdf.getMetadata();
  console.log(`  Producer: ${meta.info?.Producer ?? "?"}`);
  let hit = 0;
  for (const s of SAMPLES) {
    const page = await pdf.getPage(s.page);
    const tc = await page.getTextContent();
    const norm = tc.items.map((it) => ("str" in it ? it.str : "")).join("").replace(/\s+/g, "");
    const ok = norm.includes(s.expect);
    if (ok) hit++;
    console.log(`  p${s.page} ${ok ? "✅" : "❌"} ${s.expect}`);
    page.cleanup?.();
  }
  await pdf.destroy();
  const { data: signed } = await supa.storage.from(BUCKET).createSignedUrl(KEY, 600);
  console.log(`  signed URL(10m): ${signed?.signedUrl ? "발급 OK" : "발급 실패"}`);
  console.log(`  표본 토큰 ${hit}/${SAMPLES.length} ${hit === SAMPLES.length ? "✅" : "❌"}`);
}

const fns = { backup, replace, verify };
if (!fns[cmd]) throw new Error("usage: swap-original-pdf.mjs backup|replace|verify");
fns[cmd]().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
