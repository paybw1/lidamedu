// feat-4-A-117 — 강의노트 매핑 CSV 기반 자동 import 스크립트.
// docs/features/feat-4-A-117-csv-format.md
//
// 사용법:
//   node scripts/import-lecture-note.mjs --dry-run             # 검증만 (DB/Storage 무변경)
//   node scripts/import-lecture-note.mjs --apply               # 실제 적용
//   node scripts/import-lecture-note.mjs --csv path/to.csv     # CSV 경로 override
//   node scripts/import-lecture-note.mjs --pdf path/to.pdf     # PDF 경로 override
//
// 동작:
//   1. CSV 파싱 (시작/끝/종류/식별자/제목 컬럼)
//   2. 각 row 검증 + DB 매칭 (article: identifier 파싱 → law_id+article_number / case: case_number 정확)
//   3. dry-run: 결과 표만 출력
//   4. --apply: pdf-lib 로 페이지 분할 → Storage 업로드 → lecture_resources insert
//      같은 source_pdf_id 의 기존 자료는 soft-delete 후 재import (idempotent)

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
// cwd 무관하게 프로젝트 .env 로드 — 사용자가 임의 디렉토리에서 실행해도 OK
dotenv.config({ path: resolve(ROOT, ".env") });

// ── 인자 파싱 ──
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

const MODE = flag("--apply") ? "apply" : "dry-run";
const CSV_PATH = opt("--csv") ?? resolve(ROOT, "tmp/lecture-note-mapping.csv");
const PDF_PATH =
  opt("--pdf") ?? resolve(ROOT, "source/리담특허법 강의노트(제10판).pdf");

// 책 정보 — 첫 강의노트
const BOOK_NAME = "리담특허법 강의노트(제10판)";
const BOOK_SLUG = "lidam-patent-v10";

// source_pdf_id — 책 이름 hash 로 deterministic UUID (v5 like).
function deterministicUuid(seed) {
  const hash = createHash("sha1").update(seed).digest("hex");
  // UUID v5 format: xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "5" + hash.slice(13, 16),
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}
const SOURCE_PDF_ID = deterministicUuid(BOOK_NAME);

// ── ENV ──
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[error] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── 조문 식별자 파서 (app/features/laws/lib/identifier.ts 로직 복제) ──
const DISPLAY_RE =
  /^(특허법|상표법|디자인보호법|민법|민사소송법)\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*제\s*(\d+)\s*항)?(?:\s*제\s*(\d+)\s*호)?(?:\s*([가-하])\s*목)?$/;
const LAW_NAME_TO_CODE = {
  특허법: "patent",
  상표법: "trademark",
  디자인보호법: "design",
  민법: "civil",
  민사소송법: "civil-procedure",
};

function parseArticleDisplay(input) {
  const m = DISPLAY_RE.exec(input.trim());
  if (!m) return null;
  const [, lawName, article, branch, clause, item, sub] = m;
  const lawCode = LAW_NAME_TO_CODE[lawName];
  if (!lawCode) return null;
  return {
    lawCode,
    article: Number(article),
    branch: branch ? Number(branch) : undefined,
    clause: clause ? Number(clause) : undefined,
    item: item ? Number(item) : undefined,
    subItem: sub ?? undefined,
    raw: input.trim(),
  };
}

function articleNumberText(ident) {
  return ident.branch
    ? `${ident.article}의${ident.branch}`
    : String(ident.article);
}

// 항/호/목 까지 포함한 표시 라벨 (title 보강용)
function articleSubLabel(ident) {
  let s = "";
  if (ident.clause) s += ` 제${ident.clause}항`;
  if (ident.item) s += ` 제${ident.item}호`;
  if (ident.subItem) s += ` ${ident.subItem}목`;
  return s;
}

// ── CSV 파서 (단순 구현 — 헤더 + 주석 + escape 없음) ──
function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  let header = null;
  for (let lineNo = 1; lineNo <= lines.length; lineNo++) {
    const raw = lines[lineNo - 1];
    if (raw == null) continue;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const cols = line.split(",").map((c) => c.trim());
    if (!header) {
      header = cols;
      continue;
    }
    const row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    row.__line = lineNo;
    rows.push(row);
  }
  if (!header) throw new Error("CSV 헤더가 없습니다.");
  return rows;
}

// ── 각 row 검증 + DB 매칭 ──
async function resolveArticleId(ident, lawIdByCode) {
  const lawId = lawIdByCode.get(ident.lawCode);
  if (!lawId) return null;
  const numText = articleNumberText(ident);
  const { data, error } = await supa
    .from("articles")
    .select("article_id, display_label, article_number")
    .eq("law_id", lawId)
    .eq("article_number", numText)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function resolveCaseId(caseNumber) {
  const { data, error } = await supa
    .from("cases")
    .select("case_id, case_number, court, decided_at")
    .eq("case_number", caseNumber)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function loadLawIdMap() {
  const { data, error } = await supa
    .from("laws")
    .select("law_id, law_code");
  if (error) throw error;
  const m = new Map();
  for (const r of data ?? []) m.set(r.law_code, r.law_id);
  return m;
}

// ── 페이지 분할 + 업로드 (apply 모드) ──
async function loadSourcePdf() {
  const buf = readFileSync(PDF_PATH);
  console.log(`[info] PDF: ${PDF_PATH} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  return { doc, totalPages: doc.getPageCount() };
}

async function extractPagePdf(srcDoc, pageStart, pageEnd) {
  const newDoc = await PDFDocument.create();
  // pdf-lib 는 0-based 인덱스
  const indices = [];
  for (let p = pageStart; p <= pageEnd; p++) indices.push(p - 1);
  const copied = await newDoc.copyPages(srcDoc, indices);
  for (const page of copied) newDoc.addPage(page);
  const out = await newDoc.save();
  return Buffer.from(out);
}

async function softDeleteExistingForBook() {
  // 같은 source_pdf_id 의 기존 자료 soft delete (재실행 안전)
  const { data, error } = await supa
    .from("lecture_resources")
    .update({ deleted_at: new Date().toISOString() })
    .eq("source_pdf_id", SOURCE_PDF_ID)
    .is("deleted_at", null)
    .select("resource_id");
  if (error) throw error;
  return data?.length ?? 0;
}

// ── 메인 ──
async function main() {
  console.log(`[info] mode: ${MODE}`);
  console.log(`[info] CSV: ${CSV_PATH}`);
  console.log(`[info] PDF: ${PDF_PATH}`);
  console.log(`[info] book: "${BOOK_NAME}" / slug=${BOOK_SLUG}`);
  console.log(`[info] source_pdf_id: ${SOURCE_PDF_ID}`);

  if (!existsSync(CSV_PATH)) {
    console.error(`[error] CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }
  if (!existsSync(PDF_PATH)) {
    console.error(`[error] PDF not found: ${PDF_PATH}`);
    process.exit(1);
  }

  // UTF-8 BOM 제거 (Excel/PowerShell Set-Content -Encoding UTF8 등에서 저장 시 추가됨)
  const csvText = readFileSync(CSV_PATH, "utf-8").replace(/^﻿/, "");
  const rows = parseCsv(csvText);
  console.log(`[info] CSV rows: ${rows.length}`);

  if (rows.length === 0) {
    console.log("[info] no rows — nothing to do.");
    return;
  }

  const lawIdByCode = await loadLawIdMap();

  // 검증 + 매칭
  const resolved = [];
  for (const r of rows) {
    const result = { row: r, ok: false, error: null, targetType: null, targetId: null, label: null };
    const startN = Number(r["시작"]);
    const endN = Number(r["끝"]);
    if (!Number.isInteger(startN) || startN < 1) {
      result.error = `시작 페이지 무효: "${r["시작"]}"`;
      resolved.push(result);
      continue;
    }
    if (!Number.isInteger(endN) || endN < startN) {
      result.error = `끝 페이지 무효: "${r["끝"]}" (시작=${startN})`;
      resolved.push(result);
      continue;
    }

    const kind = (r["종류"] ?? "").trim();
    const key = (r["식별자"] ?? "").trim();
    const userTitle = (r["제목"] ?? "").trim();

    if (kind === "조문") {
      const ident = parseArticleDisplay(key);
      if (!ident) {
        result.error = `조문 식별자 파싱 실패: "${key}"`;
        resolved.push(result);
        continue;
      }
      const article = await resolveArticleId(ident, lawIdByCode);
      if (!article) {
        result.error = `조문 DB 매칭 실패: ${key} (article_number=${articleNumberText(ident)})`;
        resolved.push(result);
        continue;
      }
      result.ok = true;
      result.targetType = "article";
      result.targetId = article.article_id;
      const subLabel = articleSubLabel(ident);
      result.label = userTitle ||
        `${BOOK_NAME} ${article.display_label}${subLabel} p.${startN}${endN > startN ? `-${endN}` : ""}`;
      result.matchInfo = `${article.display_label}${subLabel}`;
    } else if (kind === "판례") {
      const kase = await resolveCaseId(key);
      if (!kase) {
        result.error = `판례 DB 매칭 실패: "${key}" (cases.case_number 정확 일치 필요)`;
        resolved.push(result);
        continue;
      }
      result.ok = true;
      result.targetType = "case";
      result.targetId = kase.case_id;
      result.label = userTitle ||
        `${BOOK_NAME} ${kase.case_number} p.${startN}${endN > startN ? `-${endN}` : ""}`;
      result.matchInfo = `${kase.case_number} (${kase.court ?? "?"})`;
    } else {
      result.error = `종류는 "조문" 또는 "판례" 만 허용: "${kind}"`;
      resolved.push(result);
      continue;
    }
    resolved.push(result);
  }

  const ok = resolved.filter((r) => r.ok);
  const fail = resolved.filter((r) => !r.ok);

  console.log(`\n========== 매칭 결과 (${MODE}) ==========`);
  console.log(`총 ${resolved.length} / 성공 ${ok.length} / 실패 ${fail.length}\n`);

  for (const r of resolved) {
    const start = Number(r.row["시작"]);
    const end = Number(r.row["끝"]);
    const pgLabel = end > start ? `p.${start}-${end}` : `p.${start}`;
    if (r.ok) {
      console.log(`  ✅ line ${r.row.__line}: ${pgLabel} → ${r.targetType} ${r.matchInfo}`);
    } else {
      console.log(`  ❌ line ${r.row.__line}: ${r.error}`);
    }
  }

  if (fail.length > 0) {
    console.log(`\n[warn] 실패 ${fail.length}건 — CSV 를 수정하고 다시 dry-run 하세요.`);
  }

  if (MODE === "dry-run") {
    console.log("\n[done] dry-run — DB/Storage 변경 없음. `--apply` 로 실제 적용하세요.");
    return;
  }

  // ── apply 모드 ──
  if (fail.length > 0) {
    console.error(`[abort] 실패 row 가 있어 apply 를 중단합니다. 먼저 dry-run 으로 모두 ✅ 되도록 CSV 를 수정하세요.`);
    process.exit(1);
  }

  console.log("\n========== APPLY ==========");
  const wiped = await softDeleteExistingForBook();
  console.log(`[apply] soft-deleted ${wiped} existing rows (same source_pdf_id)`);

  const { doc: srcDoc, totalPages } = await loadSourcePdf();
  console.log(`[apply] source PDF pages: ${totalPages}`);

  let ord = 0;
  for (const r of ok) {
    const start = Number(r.row["시작"]);
    const end = Number(r.row["끝"]);
    if (end > totalPages) {
      console.error(`  ❌ line ${r.row.__line}: 끝 페이지 ${end} > PDF 총 ${totalPages}`);
      continue;
    }

    const pageRangeStr = `p${String(start).padStart(4, "0")}-${String(end).padStart(4, "0")}`;
    const objectKey = `${BOOK_SLUG}/${pageRangeStr}.pdf`;

    // PDF 페이지 추출
    const buf = await extractPagePdf(srcDoc, start, end);

    // Storage 업로드 (같은 key 가 있으면 upsert)
    const up = await supa.storage
      .from("lecture-notes")
      .upload(objectKey, buf, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (up.error) {
      console.error(`  ❌ Storage upload 실패 line ${r.row.__line}: ${up.error.message}`);
      continue;
    }

    // lecture_resources insert
    const ins = await supa
      .from("lecture_resources")
      .insert({
        target_type: r.targetType,
        target_id: r.targetId,
        kind: "lecture_note",
        title: r.label,
        pdf_url: objectKey,
        source_pdf_id: SOURCE_PDF_ID,
        source_page_start: start,
        source_page_end: end,
        ord: ord++,
      })
      .select("resource_id")
      .single();
    if (ins.error) {
      console.error(`  ❌ DB insert 실패 line ${r.row.__line}: ${ins.error.message}`);
      // 업로드한 객체 정리
      await supa.storage.from("lecture-notes").remove([objectKey]).catch(() => {});
      continue;
    }
    console.log(
      `  ✅ line ${r.row.__line}: ${objectKey} (${(buf.length / 1024).toFixed(0)} KB) → ${r.matchInfo}`,
    );
  }

  console.log("\n[done] apply complete.");
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
