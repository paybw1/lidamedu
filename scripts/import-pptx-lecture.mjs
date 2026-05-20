// feat-4-A-117 — PPTX 강의노트 자동 import.
// PDF 와 달리 PPTX 는 슬라이드 텍스트가 객체로 보존되어 OCR 불필요.
//
// 흐름:
//   1. PPTX 슬라이드 XML 좌상단 텍스트 추출 (adm-zip)
//   2. 자동 패턴 매칭 — 조문(제○○조) 추출
//   3. 자동 그룹핑 — 연속된 같은 조문 슬라이드 + 빈/참고노트/기타 흡수
//   4. dry-run: 그룹 표 출력 (DB/Storage 무변경)
//   5. --apply: 변환 PDF 의 슬라이드 묶음 추출 → Storage 업로드 → DB insert
//
// 전제: PPTX → PDF 변환 PDF 는 별도로 미리 만든 상태 (PowerPoint COM 등).
//   변환 명령 (PowerShell):
//     $pp = New-Object -ComObject PowerPoint.Application
//     $pres = $pp.Presentations.Open($pptxPath, 1, 0, 0)
//     $pres.SaveAs($pdfPath, 32)
//     $pres.Close(); $pp.Quit()
//
// 사용:
//   node scripts/import-pptx-lecture.mjs --dry-run
//   node scripts/import-pptx-lecture.mjs --apply
//   node scripts/import-pptx-lecture.mjs --pptx <path> --pdf <path> --book-slug <slug> --book-name <name>

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import AdmZip from "adm-zip";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
dotenv.config({ path: resolve(ROOT, ".env") });

// ── 인자 ──
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

const MODE = flag("--apply") ? "apply" : "dry-run";
const PPTX_PATH =
  opt("--pptx") ??
  resolve(ROOT, "source/1. 총칙 및 보칙_특허법 강의노트.pptx");
const PDF_PATH = opt("--pdf") ?? resolve(ROOT, "tmp/converted-pptx-ch1.pdf");
// 비표준 PPTX(OLE2 형식 등 zip 파서 거부) 용 fallback: PowerPoint COM 으로 추출한 JSON.
// 형식: { slideW, slideH, slides: [{ idx, shapes: [{ x, y, text }] }] } (좌표 EMU)
const SLIDES_JSON = opt("--slides-json");
// Storage object key 는 한글 등 non-ASCII 허용 안 함 — book_slug 는 ASCII 만.
// book_name(한글)은 title 표시에 그대로 사용.
const BOOK_SLUG = opt("--book-slug") ?? "patent-lecture-ch1";
const BOOK_NAME =
  opt("--book-name") ?? "리담특허법 강의노트 — 제1편 총칙·보칙 (PPT)";

function deterministicUuid(seed) {
  const hash = createHash("sha1").update(seed).digest("hex");
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

// ── PPTX 슬라이드 텍스트 추출 ──
function loadSlides(pptxPath) {
  const zip = new AdmZip(pptxPath);
  const entries = zip.getEntries();
  const slideEntries = entries
    .filter(
      (e) =>
        e.entryName.startsWith("ppt/slides/slide") &&
        e.entryName.endsWith(".xml"),
    )
    .sort((a, b) => {
      const an = parseInt(a.entryName.match(/slide(\d+)\.xml/)[1], 10);
      const bn = parseInt(b.entryName.match(/slide(\d+)\.xml/)[1], 10);
      return an - bn;
    });

  // 슬라이드 크기
  const presEntry = entries.find((e) => e.entryName === "ppt/presentation.xml");
  let slideW = 9144000;
  let slideH = 6858000;
  if (presEntry) {
    const xml = presEntry.getData().toString("utf-8");
    const m = xml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
    if (m) {
      slideW = parseInt(m[1], 10);
      slideH = parseInt(m[2], 10);
    }
  }

  return {
    slideW,
    slideH,
    slides: slideEntries.map((e, i) => ({
      idx: i + 1,
      xml: e.getData().toString("utf-8"),
    })),
  };
}

function extractShapes(xml) {
  const shapes = [];
  const spRegex = /<p:sp[^>]*>([\s\S]*?)<\/p:sp>/g;
  let m;
  while ((m = spRegex.exec(xml)) !== null) {
    const block = m[1];
    const off = block.match(/<a:off\s+x="(\-?\d+)"\s+y="(\-?\d+)"\s*\/>/);
    if (!off) continue;
    const x = parseInt(off[1], 10);
    const y = parseInt(off[2], 10);
    const texts = [];
    const tRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    let tm;
    while ((tm = tRegex.exec(block)) !== null) {
      texts.push(
        tm[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'"),
      );
    }
    if (texts.length === 0) continue;
    shapes.push({ x, y, text: texts.join("") });
  }
  return shapes;
}

// 좌상단 텍스트만 모아 패턴 매칭. 한 글자 텍스트(페이지 번호)는 무시.
const ARTICLE_RE = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/;

function categorize(shapes, slideW, slideH) {
  const topLeft = shapes
    .filter((s) => s.x < slideW * 0.35 && s.y < slideH * 0.25)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const joined = topLeft
    .map((s) => s.text)
    .filter((t) => t.length > 1)
    .join(" ");

  const m = ARTICLE_RE.exec(joined);
  if (m) {
    const article = m[1];
    const branch = m[2];
    return {
      kind: "article",
      key: branch ? `특허법 제${article}조의${branch}` : `특허법 제${article}조`,
      articleNumber: branch ? `${article}의${branch}` : article,
      joined: joined.slice(0, 80),
    };
  }
  return { kind: "other", key: "", joined: joined.slice(0, 80) };
}

// ── 자동 그룹핑 ──
// "article" 슬라이드는 새 그룹 시작 (key 가 직전과 같으면 합침)
// "other" 슬라이드는 직전 그룹에 흡수 (직전 그룹이 article 일 때만; 표지·목차는 매핑 없음)
function groupSlides(categorized) {
  const groups = [];
  let current = null;
  for (const s of categorized) {
    if (s.kind === "article") {
      if (current && current.kind === "article" && current.key === s.key) {
        current.slides.push(s.idx);
      } else {
        if (current && current.kind === "article") groups.push(current);
        current = {
          kind: "article",
          key: s.key,
          articleNumber: s.articleNumber,
          slides: [s.idx],
        };
      }
    } else {
      if (current && current.kind === "article") {
        current.slides.push(s.idx);
      }
      // else: 매핑 없는 표지/목차 — 무시
    }
  }
  if (current && current.kind === "article") groups.push(current);
  // first/last 정규화
  for (const g of groups) {
    g.slides.sort((a, b) => a - b);
    g.first = g.slides[0];
    g.last = g.slides[g.slides.length - 1];
  }
  return groups;
}

// ── DB 매칭 ──
async function loadPatentLawId() {
  const { data, error } = await supa
    .from("laws")
    .select("law_id")
    .eq("law_code", "patent")
    .single();
  if (error || !data) throw new Error("patent law 미적재");
  return data.law_id;
}

async function resolveArticleId(lawId, articleNumber) {
  const { data } = await supa
    .from("articles")
    .select("article_id, display_label, article_number")
    .eq("law_id", lawId)
    .eq("article_number", articleNumber)
    .maybeSingle();
  return data;
}

// ── PDF 슬라이드 묶음 추출 ──
async function loadConvertedPdf() {
  const buf = readFileSync(PDF_PATH);
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  return { doc, totalPages: doc.getPageCount() };
}

async function extractSlideRange(srcDoc, first, last) {
  const newDoc = await PDFDocument.create();
  const indices = [];
  for (let p = first; p <= last; p++) indices.push(p - 1);
  const copied = await newDoc.copyPages(srcDoc, indices);
  for (const page of copied) newDoc.addPage(page);
  return Buffer.from(await newDoc.save());
}

async function softDeleteExistingForBook() {
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
  console.log(`[info] PPTX: ${PPTX_PATH}`);
  console.log(`[info] PDF:  ${PDF_PATH}`);
  console.log(`[info] book: "${BOOK_NAME}" / slug=${BOOK_SLUG}`);
  console.log(`[info] source_pdf_id: ${SOURCE_PDF_ID}`);

  if (!SLIDES_JSON && !existsSync(PPTX_PATH)) {
    console.error(`[error] PPTX not found: ${PPTX_PATH}`);
    process.exit(1);
  }
  if (!existsSync(PDF_PATH)) {
    console.error(
      `[error] 변환된 PDF 가 없습니다: ${PDF_PATH}\n         먼저 PowerPoint COM 으로 PPTX → PDF 변환을 실행하세요.`,
    );
    process.exit(1);
  }

  // PPTX zip 파싱 (기본) 또는 JSON fallback (비표준 PPTX 우회)
  let slideW, slideH, categorized;
  if (SLIDES_JSON) {
    const j = JSON.parse(readFileSync(SLIDES_JSON, "utf-8").replace(/^﻿/, ""));
    slideW = j.slideW;
    slideH = j.slideH;
    console.log(
      `[info] (JSON fallback) slides: ${j.slides.length} / size: ${(slideW / 914400).toFixed(2)}" x ${(slideH / 914400).toFixed(2)}"`,
    );
    categorized = j.slides.map((s) => ({
      idx: s.idx,
      ...categorize(s.shapes, slideW, slideH),
    }));
  } else {
    const loaded = loadSlides(PPTX_PATH);
    slideW = loaded.slideW;
    slideH = loaded.slideH;
    console.log(
      `[info] slides: ${loaded.slides.length} / size: ${(slideW / 914400).toFixed(2)}" x ${(slideH / 914400).toFixed(2)}"`,
    );
    categorized = loaded.slides.map((s) => ({
      idx: s.idx,
      ...categorize(extractShapes(s.xml), slideW, slideH),
    }));
  }

  // 자동 그룹핑
  const groups = groupSlides(categorized);
  console.log(`\n[info] 자동 그룹: ${groups.length}개`);

  // DB 매칭
  const lawId = await loadPatentLawId();
  const enriched = [];
  for (const g of groups) {
    const article = await resolveArticleId(lawId, g.articleNumber);
    enriched.push({ ...g, article });
  }

  // dry-run 표 출력
  console.log("\n========== 그룹 매칭 결과 ==========");
  const fail = [];
  for (const g of enriched) {
    const range = g.first === g.last ? `s.${g.first}` : `s.${g.first}-${g.last}`;
    const slidesStr = g.slides.length > 1 ? `(${g.slides.length}장)` : "";
    if (g.article) {
      console.log(
        `  ✅ ${range} ${slidesStr} → ${g.article.display_label} (${g.key})`,
      );
    } else {
      console.log(`  ❌ ${range} ${slidesStr} → ${g.key} (article DB 매칭 실패)`);
      fail.push(g);
    }
  }
  // 매핑 없는 슬라이드 (표지/목차)
  const unmapped = categorized.filter((s) => s.kind !== "article");
  const grouped = new Set(groups.flatMap((g) => g.slides));
  const skipped = unmapped
    .filter((s) => !grouped.has(s.idx))
    .map((s) => s.idx);
  if (skipped.length > 0) {
    console.log(`\n[info] 매핑 없는 슬라이드 (표지/목차): ${skipped.join(", ")}`);
  }

  console.log(
    `\n[stats] 총 그룹 ${enriched.length} / 매칭 ${enriched.length - fail.length} / 실패 ${fail.length} / 표지·목차 ${skipped.length}`,
  );

  if (MODE === "dry-run") {
    console.log(`\n[done] dry-run — DB/Storage 변경 없음. \`--apply\` 로 실제 적용하세요.`);
    return;
  }

  // ── apply ──
  if (fail.length > 0) {
    console.error(`[abort] DB 매칭 실패 그룹이 있어 apply 중단. dry-run 으로 모두 ✅ 되도록 확인 후 다시 실행.`);
    process.exit(1);
  }

  console.log("\n========== APPLY ==========");
  const wiped = await softDeleteExistingForBook();
  console.log(`[apply] soft-deleted ${wiped} existing rows (same source_pdf_id)`);

  const { doc: srcDoc, totalPages } = await loadConvertedPdf();
  console.log(`[apply] PDF pages: ${totalPages}`);

  let ord = 0;
  for (const g of enriched) {
    if (g.last > totalPages) {
      console.error(`  ❌ ${g.key}: last slide ${g.last} > PDF pages ${totalPages}`);
      continue;
    }
    const objectKey = `${BOOK_SLUG}/s${String(g.first).padStart(4, "0")}-${String(g.last).padStart(4, "0")}.pdf`;
    const buf = await extractSlideRange(srcDoc, g.first, g.last);

    const up = await supa.storage
      .from("lecture-notes")
      .upload(objectKey, buf, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (up.error) {
      console.error(`  ❌ Storage 업로드 실패 ${g.key}: ${up.error.message}`);
      continue;
    }

    const slidesLabel =
      g.first === g.last ? `슬라이드 ${g.first}` : `슬라이드 ${g.first}-${g.last}`;
    const title = `${BOOK_NAME} ${g.article.display_label} (${slidesLabel})`;
    const ins = await supa
      .from("lecture_resources")
      .insert({
        target_type: "article",
        target_id: g.article.article_id,
        kind: "lecture_note",
        title,
        pdf_url: objectKey,
        source_pdf_id: SOURCE_PDF_ID,
        source_page_start: g.first,
        source_page_end: g.last,
        ord: ord++,
      })
      .select("resource_id")
      .single();
    if (ins.error) {
      console.error(`  ❌ DB insert 실패 ${g.key}: ${ins.error.message}`);
      await supa.storage.from("lecture-notes").remove([objectKey]).catch(() => {});
      continue;
    }
    console.log(
      `  ✅ ${objectKey} (${(buf.length / 1024).toFixed(0)} KB) → ${g.article.display_label}`,
    );
  }

  console.log("\n[done] apply complete.");
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
