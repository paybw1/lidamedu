// §2 검증 — 스토리지 권한 / signed URL 발급 / 만료 / public 차단.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL!;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPA_ANON = process.env.SUPABASE_ANON_KEY!;
const ADMIN = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const ANON = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } });

// 4건 case 의 path 조회.
const { data: rows } = await ADMIN
  .from("cases")
  .select("case_id, case_number, official_text_pdf_path")
  .not("official_text_pdf_path", "is", null)
  .in("case_number", ["2025마6304", "2024후10108", "2023후11340", "2012후726"]);

process.stdout.write(`\n=== ① signed URL 발급 (service_role, TTL 60s 테스트용) ===\n`);
for (const r of rows ?? []) {
  if (!r.official_text_pdf_path) continue;
  const t0 = Date.now();
  const { data, error } = await ADMIN.storage
    .from("case-fulltext")
    .createSignedUrl(r.official_text_pdf_path, 60);
  const ms = Date.now() - t0;
  if (error) {
    process.stdout.write(`  ✗ ${r.case_number}  ${error.message}\n`);
    continue;
  }
  const resp = await fetch(data!.signedUrl, { method: "HEAD" });
  process.stdout.write(
    `  ✓ ${r.case_number}  status=${resp.status} ct=${resp.headers.get("content-type")} bytes=${resp.headers.get("content-length")} t=${ms}ms\n`,
  );
}

process.stdout.write(`\n=== ② anon 직접 다운로드 차단 ===\n`);
const samplePath = rows?.[0]?.official_text_pdf_path;
if (samplePath) {
  // (a) anon client 로 직접 download — 거부되어야 함.
  const { data: dlData, error: dlErr } = await ANON.storage
    .from("case-fulltext")
    .download(samplePath);
  if (dlErr) {
    process.stdout.write(`  ✓ anon download 차단: ${dlErr.message}\n`);
  } else {
    process.stdout.write(`  ✗ anon download 성공 (보안 실패) — bytes=${dlData?.size}\n`);
  }
  // (b) anon createSignedUrl — 거부되어야 함.
  const { data: anonSigned, error: anonSignErr } = await ANON.storage
    .from("case-fulltext")
    .createSignedUrl(samplePath, 60);
  if (anonSignErr) {
    process.stdout.write(`  ✓ anon signed URL 발급 차단: ${anonSignErr.message}\n`);
  } else {
    process.stdout.write(`  ✗ anon signed URL 발급 성공 (보안 실패) — ${anonSigned?.signedUrl?.slice(0, 60)}…\n`);
  }
  // (c) 추정 public URL 직접 fetch — 차단되어야 함.
  const publicUrl = `${SUPA_URL}/storage/v1/object/public/case-fulltext/${samplePath}`;
  const publicResp = await fetch(publicUrl);
  process.stdout.write(`  public URL 직접 fetch status=${publicResp.status} ${publicResp.status >= 400 ? "✓ 차단" : "✗ 노출"}\n`);
}

process.stdout.write(`\n=== ③ signed URL 만료 (3초 TTL → 5초 대기 → 401) ===\n`);
if (samplePath) {
  const { data: shortUrl } = await ADMIN.storage
    .from("case-fulltext")
    .createSignedUrl(samplePath, 3);
  process.stdout.write(`  발급. 5초 대기 중…\n`);
  await new Promise((r) => setTimeout(r, 5000));
  const r1 = await fetch(shortUrl!.signedUrl, { method: "HEAD" });
  process.stdout.write(`  만료 후 status=${r1.status} ${r1.status >= 400 ? "✓ 차단" : "✗ 여전히 접근 가능"}\n`);
}
