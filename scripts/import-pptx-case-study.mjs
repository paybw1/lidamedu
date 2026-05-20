// feat-4-A-117 — PPT 슬라이드 본문 사건번호 → cases 자료 자동 import (7편 일괄).
//
// 흐름:
//   1. 각 PPT 슬라이드의 본문 텍스트에서 사건번호 패턴 추출
//      정규식: (\d{2,4})([가-힣]{1,3})(\d{1,8}) - "조|항|호|목|의" 포함 한글 제외
//   2. cases.case_number 정확 일치 매칭
//   3. 매칭된 사건번호 ≥ 1 슬라이드 → case study 자료 후보
//   4. dry-run: 결과 표 + 통계
//   5. --apply: 변환 PDF 에서 슬라이드 1장씩 추출 → Storage 업로드 →
//      매칭된 각 case 마다 lecture_resource insert (같은 pdf_url 공유)
//
// 사용: node scripts/import-pptx-case-study.mjs --dry-run | --apply
//
// 같은 책의 case 자료는 source_pdf_id + target_type='case' 로 식별,
// 재실행 시 soft-delete 후 재 import (idempotent).

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import AdmZip from "adm-zip";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
dotenv.config({ path: resolve(ROOT, ".env") });

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const MODE = flag("--apply") ? "apply" : "dry-run";

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function deterministicUuid(seed) {
  const h = createHash("sha1").update(seed).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "5" + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

// 7편 매니페스트 — book_name 은 import-pptx-lecture.mjs 와 일치 (같은 source_pdf_id)
const BOOKS = [
  { ch: 1, slug: "patent-lecture-ch1", name: "리담특허법 강의노트 — 제1편 총칙·보칙 (PPT)",
    input: { type: "pptx", path: "source/1. 총칙 및 보칙_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch1.pdf" },
  { ch: 2, slug: "patent-lecture-ch2", name: "리담특허법 강의노트 — 제2편 특허요건 (PPT)",
    input: { type: "pptx", path: "source/2. 특허요건_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch2.pdf" },
  { ch: 3, slug: "patent-lecture-ch3", name: "리담특허법 강의노트 — 제3편 이익제도 (PPT)",
    input: { type: "json", path: "tmp/ch3-slides.json" },
    pdf: "tmp/converted-pptx-ch3.pdf" },
  { ch: 4, slug: "patent-lecture-ch4", name: "리담특허법 강의노트 — 제4편 심사·제도 (PPT)",
    input: { type: "pptx", path: "source/4. 심사(제도)_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch4.pdf" },
  { ch: 5, slug: "patent-lecture-ch5", name: "리담특허법 강의노트 — 제5편 특허권 (PPT)",
    input: { type: "pptx", path: "source/5. 특허권_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch5.pdf" },
  { ch: 6, slug: "patent-lecture-ch6", name: "리담특허법 강의노트 — 제6편 심판·소송 (PPT)",
    input: { type: "pptx", path: "source/6. 심판 및 소송_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch6.pdf" },
  { ch: 7, slug: "patent-lecture-ch7", name: "리담특허법 강의노트 — 제7편 PCT (PPT)",
    input: { type: "pptx", path: "source/7. PCT_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch7.pdf" },
];

const CASE_NUMBER_RE = /(\d{2,4})([가-힣]{1,3})(\d{1,8})/g;

function extractShapesFromXml(xml) {
  const shapes = [];
  const spRegex = /<p:sp[^>]*>([\s\S]*?)<\/p:sp>/g;
  let m;
  while ((m = spRegex.exec(xml)) !== null) {
    const block = m[1];
    const off = block.match(/<a:off\s+x="(\-?\d+)"\s+y="(\-?\d+)"\s*\/>/);
    if (!off) continue;
    const texts = [];
    const tRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    let tm;
    while ((tm = tRegex.exec(block)) !== null) {
      texts.push(
        tm[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
      );
    }
    if (texts.length === 0) continue;
    shapes.push({ x: parseInt(off[1]), y: parseInt(off[2]), text: texts.join("") });
  }
  return shapes;
}

function loadSlidesFor(book) {
  const path = resolve(ROOT, book.input.path);
  if (book.input.type === "json") {
    const j = JSON.parse(readFileSync(path, "utf-8").replace(/^﻿/, ""));
    return j.slides;
  }
  const zip = new AdmZip(path);
  const slideEntries = zip
    .getEntries()
    .filter((e) => e.entryName.startsWith("ppt/slides/slide") && e.entryName.endsWith(".xml"))
    .sort((a, b) => parseInt(a.entryName.match(/slide(\d+)/)[1]) - parseInt(b.entryName.match(/slide(\d+)/)[1]));
  return slideEntries.map((e, i) => ({ idx: i + 1, shapes: extractShapesFromXml(e.getData().toString("utf-8")) }));
}

function extractCaseCandidates(slide) {
  const allText = slide.shapes.map((sh) => sh.text).join(" ");
  const candidates = new Set();
  let m;
  CASE_NUMBER_RE.lastIndex = 0;
  while ((m = CASE_NUMBER_RE.exec(allText)) !== null) {
    const [whole, yearStr, kor] = m;
    if (yearStr.length !== 2 && yearStr.length !== 4) continue;
    if (/조|항|호|목|의/.test(kor)) continue;
    candidates.add(whole);
  }
  return [...candidates];
}

async function resolveCases(caseNumbers) {
  if (caseNumbers.length === 0) return new Map();
  // chunked IN — 1000개씩
  const map = new Map();
  for (let i = 0; i < caseNumbers.length; i += 1000) {
    const chunk = caseNumbers.slice(i, i + 1000);
    const { data, error } = await supa
      .from("cases")
      .select("case_id, case_number, court")
      .in("case_number", chunk);
    if (error) throw error;
    for (const r of data ?? []) map.set(r.case_number, r);
  }
  return map;
}

async function extractSlidePdf(srcDoc, idx) {
  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(srcDoc, [idx - 1]);
  for (const p of copied) newDoc.addPage(p);
  return Buffer.from(await newDoc.save());
}

async function softDeleteExistingCaseForBook(sourcePdfId) {
  const { data, error } = await supa
    .from("lecture_resources")
    .update({ deleted_at: new Date().toISOString() })
    .eq("source_pdf_id", sourcePdfId)
    .eq("target_type", "case")
    .is("deleted_at", null)
    .select("resource_id");
  if (error) throw error;
  return data?.length ?? 0;
}

async function main() {
  console.log(`[info] mode: ${MODE}`);
  console.log();

  // 1) 모든 책의 후보 사건번호 모음
  const perBook = [];
  const allCandidates = new Set();
  for (const b of BOOKS) {
    const ipath = resolve(ROOT, b.input.path);
    if (!existsSync(ipath)) { console.log(`[skip] ch${b.ch}: ${ipath} 없음`); continue; }
    const slides = loadSlidesFor(b);
    const rows = [];
    for (const s of slides) {
      const cands = extractCaseCandidates(s);
      if (cands.length === 0) continue;
      rows.push({ idx: s.idx, candidates: cands });
      for (const c of cands) allCandidates.add(c);
    }
    perBook.push({ book: b, rows });
  }

  // 2) DB 매칭 (한 번에)
  const caseMap = await resolveCases([...allCandidates]);
  console.log(`[info] 후보 사건번호 ${allCandidates.size} / DB 매칭 ${caseMap.size}`);

  // 3) 책별 매칭 결과 출력 + apply 데이터 준비
  let totalRows = 0;
  for (const { book, rows } of perBook) {
    let bookRows = 0;
    console.log(`========== ch${book.ch} ${book.name} ==========`);
    for (const r of rows) {
      const matched = r.candidates.filter((c) => caseMap.has(c)).map((c) => ({ caseNumber: c, ...caseMap.get(c) }));
      r.matched = matched;
      bookRows += matched.length;
      if (matched.length > 0) {
        console.log(`  s.${String(r.idx).padStart(3)} → ${matched.map((m) => `${m.case_number}(${m.court ?? "?"})`).join(", ")}`);
      }
    }
    console.log(`  → ${bookRows} 자료`);
    totalRows += bookRows;
  }
  console.log();
  console.log(`[stats] 총 추가 자료 row: ${totalRows}`);

  if (MODE === "dry-run") {
    console.log("\n[done] dry-run — DB/Storage 무변경. --apply 로 적용.");
    return;
  }

  // 4) apply
  for (const { book, rows } of perBook) {
    const sourcePdfId = deterministicUuid(book.name);
    const pdfPath = resolve(ROOT, book.pdf);
    if (!existsSync(pdfPath)) { console.log(`[skip-apply] ch${book.ch}: PDF 없음 (${pdfPath})`); continue; }

    console.log(`\n========== ch${book.ch} APPLY ==========`);
    const wiped = await softDeleteExistingCaseForBook(sourcePdfId);
    console.log(`[apply] soft-deleted ${wiped} existing case rows`);

    const srcDoc = await PDFDocument.load(readFileSync(pdfPath), { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    let ord = 0;
    for (const r of rows) {
      if (!r.matched || r.matched.length === 0) continue;
      if (r.idx > totalPages) {
        console.error(`  ❌ s.${r.idx}: slide > PDF pages ${totalPages}`);
        continue;
      }
      const objectKey = `${book.slug}/cs_s${String(r.idx).padStart(4, "0")}.pdf`;
      const buf = await extractSlidePdf(srcDoc, r.idx);
      const up = await supa.storage
        .from("lecture-notes")
        .upload(objectKey, buf, { contentType: "application/pdf", upsert: true });
      if (up.error) { console.error(`  ❌ s.${r.idx} upload: ${up.error.message}`); continue; }

      for (const m of r.matched) {
        const title = `${book.name} ${m.case_number} (슬라이드 ${r.idx})`;
        const ins = await supa
          .from("lecture_resources")
          .insert({
            target_type: "case",
            target_id: m.case_id,
            kind: "lecture_note",
            title,
            pdf_url: objectKey,
            source_pdf_id: sourcePdfId,
            source_page_start: r.idx,
            source_page_end: r.idx,
            ord: ord++,
          })
          .select("resource_id")
          .single();
        if (ins.error) console.error(`  ❌ s.${r.idx} → ${m.case_number}: ${ins.error.message}`);
      }
      console.log(`  ✅ s.${r.idx} ${objectKey} → ${r.matched.length} cases`);
    }
  }
  console.log("\n[done] apply complete.");
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
