// feat-4-A-117 — 미매칭 case-study 슬라이드 PDF 를 Storage 에 업로드 + lecture_slide_candidates 메타 insert.
// 운영자 검토 화면(/admin/case-study-review) 에서 사용할 인프라.
//
// 사용: node scripts/upload-unmatched-candidates.mjs
// 전제: tmp/unmatched-case-study/{book_slug}/sNNNN.pdf 가 이미 생성됨 (export-unmatched-case-study.mjs 실행 후)

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
dotenv.config({ path: resolve(ROOT, ".env") });

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SRC_DIR = resolve(ROOT, "tmp/unmatched-case-study");
const CSV_PATH = resolve(SRC_DIR, "manual-mapping.csv");

function parseCsv(text) {
  const rows = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let header = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // 간단 CSV — quoted "..." 안의 쉼표 보존
    const cols = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === "," && !inQ) { cols.push(cur); cur = ""; continue; }
      cur += c;
    }
    cols.push(cur);
    if (!header) { header = cols; continue; }
    const r = {};
    header.forEach((h, i) => { r[h] = (cols[i] ?? "").trim(); });
    rows.push(r);
  }
  return rows;
}

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.error(`[error] ${CSV_PATH} 없음. 먼저 export-unmatched-case-study.mjs 실행하세요.`);
    process.exit(1);
  }
  const csvRows = parseCsv(readFileSync(CSV_PATH, "utf-8"));
  console.log(`[info] CSV rows: ${csvRows.length}`);

  // 기존 candidates 모두 삭제 (재실행 안전성)
  const { error: delErr } = await supa
    .from("lecture_slide_candidates")
    .delete()
    .neq("candidate_id", "00000000-0000-0000-0000-000000000000");
  if (delErr) console.warn(`[warn] 기존 candidates 삭제: ${delErr.message}`);

  let ok = 0, fail = 0;
  for (const r of csvRows) {
    const bookSlug = r.book_slug;
    const slideIdx = parseInt(r.slide_idx, 10);
    if (!bookSlug || !Number.isInteger(slideIdx)) { fail++; continue; }

    const pdfPath = resolve(SRC_DIR, bookSlug, `s${String(slideIdx).padStart(4, "0")}.pdf`);
    if (!existsSync(pdfPath)) {
      console.error(`  ❌ ${bookSlug} s.${slideIdx}: PDF 없음`);
      fail++; continue;
    }
    const buf = readFileSync(pdfPath);
    const objectKey = `${bookSlug}/cs_s${String(slideIdx).padStart(4, "0")}.pdf`;

    // Storage 업로드 (upsert: true — 같은 path 의 자동 매칭 슬라이드와 충돌 안 함, 미매칭 슬라이드는 새 path 라서 일반적으로 신규)
    const up = await supa.storage
      .from("lecture-notes")
      .upload(objectKey, buf, { contentType: "application/pdf", upsert: true });
    if (up.error) {
      console.error(`  ❌ ${bookSlug} s.${slideIdx}: Storage ${up.error.message}`);
      fail++; continue;
    }

    const candidates = (r.extracted_candidates || "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);

    const ins = await supa
      .from("lecture_slide_candidates")
      .insert({
        book_slug: bookSlug,
        slide_idx: slideIdx,
        pdf_url: objectKey,
        body_preview: r.note || null,
        auto_candidates: candidates,
      })
      .select("candidate_id")
      .single();
    if (ins.error) {
      console.error(`  ❌ ${bookSlug} s.${slideIdx}: DB ${ins.error.message}`);
      // Storage rollback
      await supa.storage.from("lecture-notes").remove([objectKey]).catch(() => {});
      fail++; continue;
    }
    ok++;
    console.log(`  ✅ ${objectKey} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  console.log(`\n[done] ok=${ok} / fail=${fail}`);
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
