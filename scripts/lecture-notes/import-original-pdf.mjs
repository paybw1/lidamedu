// 통합 강의노트 PPTX(제10판) → 통짜 PDF 원본 변환·검증·적재 (feat: 원본 보관 토대).
//   ② LibreOffice headless 로 통째 PDF 변환 (조각화 X, sldNum 유지)
//   ③ 검증: V1 페이지수==슬라이드수(하드) · V2 표본 페이지 렌더(육안용 PNG) · V3 챕터 오프셋 교차검증(보고)
//   ④ --apply: 버킷 적재 + lecture_source_pdfs 메타 upsert (테이블은 사전 마이그 적용 전제)
// 사용: node scripts/lecture-notes/import-original-pdf.mjs [--apply] [--reconvert]
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";

import AdmZip from "adm-zip";
import { PDFDocument } from "pdf-lib";
import * as mupdf from "mupdf";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: resolve(ROOT, ".env") });
const APPLY = process.argv.includes("--apply");
const RECONVERT = process.argv.includes("--reconvert");

const SOFFICE = "C:/Program Files/LibreOffice/program/soffice.exe";
const LO_PROFILE = "file:///C:/project/lidamedu/tmp/lo_profile";
const SRC_DIR = resolve(ROOT, "source/특허법 강의노트");
const SRC_PPTX = resolve(SRC_DIR, "특허법 강의노트(제10판).pptx");
const OUT_DIR = resolve(ROOT, "tmp/lecture-notes/original");
const SHOT_DIR = resolve(ROOT, "tmp/lecture-notes/v2-shots");
const BUCKET = "lecture-notes";
const STORAGE_KEY = "original/patent-lecture-v10.pdf";
const BOOK_NAME = "리담특허법 강의노트 (제10판)";
const BUCKET_LIMIT = 52428800; // 50MB (현재 버킷 한도)

// import-all.mjs 와 동일한 결정적 UUID(v5 유사) 알고리즘
function deterministicUuid(name) {
  const h = createHash("sha1").update(name).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "5" + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}
const SOURCE_PDF_ID = deterministicUuid(BOOK_NAME);

const ART_NUM_RE = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/;
function artNum(s) {
  const m = (s || "").match(ART_NUM_RE);
  return m ? (m[2] ? `${m[1]}의${m[2]}` : m[1]) : null;
}

// PPTX 슬라이드별 제목(title/ctrTitle placeholder) 텍스트 배열
function slideTitles(pptxPath) {
  const zip = new AdmZip(pptxPath);
  const slides = zip
    .getEntries()
    .filter((e) => /ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort(
      (a, b) =>
        parseInt(a.entryName.match(/slide(\d+)/)[1]) -
        parseInt(b.entryName.match(/slide(\d+)/)[1]),
    );
  return slides.map((e) => {
    const xml = e.getData().toString("utf-8");
    const sps = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].map((m) => m[1]);
    for (const b of sps) {
      const ph = b.match(/<p:ph\b([^>]*)>/);
      const phType = ph ? (ph[1].match(/type="([^"]+)"/)?.[1] ?? "body") : null;
      if (phType === "title" || phType === "ctrTitle") {
        let s = "";
        for (const tm of b.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)) s += tm[1];
        return s
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();
      }
    }
    return "";
  });
}

function slug(fname) {
  return "ch" + (fname.match(/^(\d+)/)?.[1] ?? "x");
}

// chapTitles 가 masterTitles 안에서 가장 잘 정렬되는 오프셋(정확 일치 최대)
function findOffset(masterTitles, chapTitles) {
  let best = { offset: -1, matched: -1 };
  const maxO = masterTitles.length - chapTitles.length;
  for (let o = 0; o <= Math.max(0, maxO); o++) {
    let s = 0;
    for (let i = 0; i < chapTitles.length; i++) {
      if (chapTitles[i] && masterTitles[o + i] === chapTitles[i]) s++;
    }
    if (s > best.matched) best = { offset: o, matched: s };
  }
  return { ...best, total: chapTitles.length };
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`source_pdf_id(제10판) = ${SOURCE_PDF_ID}`);
  if (!existsSync(SRC_PPTX)) throw new Error(`원본 PPTX 없음: ${SRC_PPTX}`);

  // ── 슬라이드 수 ──
  const masterTitles = slideTitles(SRC_PPTX);
  const slideCount = masterTitles.length;

  // ── ② 변환 (캐시) ──
  mkdirSync(OUT_DIR, { recursive: true });
  const outPdf = resolve(OUT_DIR, basename(SRC_PPTX).replace(/\.pptx$/i, ".pdf"));
  if (!existsSync(outPdf) || RECONVERT) {
    console.log(`[convert] LibreOffice 변환 중... (슬라이드 ${slideCount})`);
    execFileSync(
      SOFFICE,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=${LO_PROFILE}`,
        "--convert-to",
        "pdf",
        "--outdir",
        OUT_DIR,
        SRC_PPTX,
      ],
      { stdio: ["ignore", "ignore", "inherit"], timeout: 480000 },
    );
  } else {
    console.log(`[convert] 캐시 사용: ${outPdf}`);
  }
  if (!existsSync(outPdf)) throw new Error("변환 PDF 없음");

  const pdfBytes = readFileSync(outPdf);
  const sizeBytes = statSync(outPdf).size;
  const pageCount = (await PDFDocument.load(pdfBytes, { ignoreEncryption: true })).getPageCount();

  // ── ③ V1: 페이지수 == 슬라이드수 ──
  const v1 = pageCount === slideCount;
  console.log(`\n===== V1 (페이지수==슬라이드수) =====`);
  console.log(`슬라이드 ${slideCount} | PDF 페이지 ${pageCount} → ${v1 ? "PASS ✅" : "FAIL ❌ (애니메이션/빌드 분할 의심 — 중단)"}`);
  console.log(`PDF 크기: ${(sizeBytes / 1048576).toFixed(2)} MB ${sizeBytes > BUCKET_LIMIT ? `(버킷 한도 50MB 초과 — ④에서 상향 필요)` : "(≤50MB)"}`);

  // ── ③ V2: 표본 페이지 렌더(PNG) ──
  mkdirSync(SHOT_DIR, { recursive: true });
  const sampleSlides = [...new Set([1, 100, 300, 500, slideCount])].filter((n) => n >= 1 && n <= pageCount);
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  console.log(`\n===== V2 (슬라이드↔페이지 제목 표본; PNG 렌더) =====`);
  for (const n of sampleSlides) {
    const page = doc.loadPage(n - 1);
    const pix = page.toPixmap(mupdf.Matrix.scale(1.3, 1.3), mupdf.ColorSpace.DeviceRGB, false);
    const p = resolve(SHOT_DIR, `slide-${String(n).padStart(3, "0")}.png`);
    writeFileSync(p, pix.asPNG());
    console.log(`  슬라이드 ${n}: 예상 제목="${masterTitles[n - 1]}"  → ${p}`);
  }

  // ── ③ V3: 챕터 오프셋 교차검증 (보고) ──
  console.log(`\n===== V3 (챕터 오프셋 / 기존 조각 교차검증) =====`);
  const fs2 = await import("node:fs");
  const chapterFiles = fs2
    .readdirSync(SRC_DIR)
    .filter((f) => /\.pptx$/i.test(f) && !f.startsWith("~$") && !f.includes("제10판"))
    .sort();
  const chapterOffset = {}; // slug -> {offset(0-based), matched, total}
  for (const f of chapterFiles) {
    const ct = slideTitles(resolve(SRC_DIR, f));
    const off = findOffset(masterTitles, ct);
    chapterOffset[slug(f)] = off;
    console.log(
      `  ${slug(f).padEnd(4)} "${f.slice(0, 18)}" 슬라이드 ${off.total} → 제10판 오프셋 ${off.offset} (정렬일치 ${off.matched}/${off.total}, ${((off.matched / off.total) * 100).toFixed(0)}%)`,
    );
  }

  // 기존 활성 조각 표본 → 예상 제10판 페이지 → 제목 조문 일치
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: frags } = await supa
    .from("lecture_resources")
    .select("title,pdf_url,source_page_start")
    .eq("target_type", "article")
    .eq("kind", "lecture_note")
    .is("deleted_at", null)
    .like("pdf_url", "patent-lecture/ch%")
    .order("pdf_url");
  // 챕터별 1건씩 표본
  const byChap = {};
  for (const r of frags ?? []) {
    const m = (r.pdf_url || "").match(/patent-lecture\/(ch\d+)-s(\d+)\.pdf/);
    if (!m) continue;
    const ch = m[1];
    if (!byChap[ch]) byChap[ch] = [];
    byChap[ch].push({ ...r, ch, slide: r.source_page_start });
  }
  const samples = [];
  for (const ch of Object.keys(byChap).sort()) {
    const arr = byChap[ch];
    samples.push(arr[Math.floor(arr.length / 2)]); // 중앙 표본
  }
  console.log(`\n  [기존 조각 표본 → 제10판 페이지 매핑]`);
  let hit = 0;
  for (const s of samples) {
    const off = chapterOffset[s.ch];
    const expectedSlide = off ? off.offset + s.slide : null; // 1-based 제10판 슬라이드(=페이지)
    const masterTitle = expectedSlide ? masterTitles[expectedSlide - 1] : "";
    const fragNum = artNum(s.title);
    const masterNum = artNum(masterTitle);
    const ok = fragNum && masterNum && fragNum === masterNum;
    if (ok) hit++;
    console.log(
      `  ${s.ch} s${s.slide} 조문=${fragNum ?? "?"} → 제10판 p${expectedSlide} 제목조문=${masterNum ?? "?"} ${ok ? "✅" : "⚠️"}  ("${(s.title || "").slice(0, 22)}" ↔ "${masterTitle.slice(0, 22)}")`,
    );
  }
  console.log(`  표본 일치 ${hit}/${samples.length}`);

  // ── ④ 적재 (--apply) ──
  if (!APPLY) {
    console.log(`\n(dry-run — 스토리지/DB 무변경. V1/V2/V3 확인 후 --apply)`);
    return;
  }
  if (!v1) {
    console.error(`\n[중단] V1 실패 — 적재하지 않음.`);
    process.exit(1);
  }
  console.log(`\n[apply] 스토리지 업로드: ${BUCKET}/${STORAGE_KEY} (${(sizeBytes / 1048576).toFixed(2)}MB)`);
  const up = await supa.storage.from(BUCKET).upload(STORAGE_KEY, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) throw new Error(`storage upload 실패: ${up.error.message}`);
  const meta = {
    source_pdf_id: SOURCE_PDF_ID,
    subject_law: "patent",
    title: BOOK_NAME,
    edition: "제10판",
    source_filename: basename(SRC_PPTX),
    storage_bucket: BUCKET,
    storage_path: STORAGE_KEY,
    total_pages: pageCount,
    slide_count: slideCount,
    updated_at: new Date().toISOString(),
  };
  const ins = await supa.from("lecture_source_pdfs").upsert(meta, { onConflict: "source_pdf_id" });
  if (ins.error) throw new Error(`메타 upsert 실패: ${ins.error.message}`);
  // 열람 검증용 signed URL (1h)
  const signed = await supa.storage.from(BUCKET).createSignedUrl(STORAGE_KEY, 3600);
  console.log(`[apply] 메타 upsert 완료. signed URL(1h): ${signed.data?.signedUrl ? "발급 OK" : "발급 실패"}`);
  console.log(signed.data?.signedUrl ?? "");
}
main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
