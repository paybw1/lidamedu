// feat-4-A-117 — CASE STUDY 슬라이드 중 자동 매칭 실패한 장표를 슬라이드별 PDF 로 추출.
// 사용자가 수동 매칭할 수 있도록 + 인덱스 CSV 템플릿 생성.
//
// 사용: node scripts/export-unmatched-case-study.mjs
// 출력:
//   tmp/unmatched-case-study/{book_slug}/s{NNNN}.pdf
//   tmp/unmatched-case-study/manual-mapping.csv  (사용자 채울 매핑 템플릿)
//   tmp/unmatched-case-study/INDEX.md            (요약 + 각 슬라이드 본문 미리보기)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument } from "pdf-lib";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
dotenv.config({ path: resolve(ROOT, ".env") });

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const OUT_DIR = resolve(ROOT, "tmp/unmatched-case-study");
mkdirSync(OUT_DIR, { recursive: true });

const BOOKS = [
  { ch: 1, slug: "patent-lecture-ch1", name: "총칙·보칙",
    input: { type: "pptx", path: "source/1. 총칙 및 보칙_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch1.pdf" },
  { ch: 2, slug: "patent-lecture-ch2", name: "특허요건",
    input: { type: "pptx", path: "source/2. 특허요건_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch2.pdf" },
  { ch: 3, slug: "patent-lecture-ch3", name: "이익제도",
    input: { type: "ch3", path: "tmp/ch3-slides.json", csCsv: "tmp/ch3-case-study.csv" },
    pdf: "tmp/converted-pptx-ch3.pdf" },
  { ch: 4, slug: "patent-lecture-ch4", name: "심사·제도",
    input: { type: "pptx", path: "source/4. 심사(제도)_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch4.pdf" },
  { ch: 5, slug: "patent-lecture-ch5", name: "특허권",
    input: { type: "pptx", path: "source/5. 특허권_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch5.pdf" },
  { ch: 6, slug: "patent-lecture-ch6", name: "심판·소송",
    input: { type: "pptx", path: "source/6. 심판 및 소송_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch6.pdf" },
  { ch: 7, slug: "patent-lecture-ch7", name: "PCT",
    input: { type: "pptx", path: "source/7. PCT_특허법 강의노트.pptx" },
    pdf: "tmp/converted-pptx-ch7.pdf" },
];

const CASE_STUDY_RE = /CASE\s*STUDY/i;
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

// PPTX (zip) — layout 기반 case study slide 식별
function loadPptxWithLayoutCaseStudy(pptxPath) {
  const zip = new AdmZip(pptxPath);
  const entries = zip.getEntries();
  // 1) layouts 중 "CASE STUDY" 포함
  const caseStudyLayouts = new Set();
  for (const e of entries) {
    if (!e.entryName.startsWith("ppt/slideLayouts/slideLayout") || !e.entryName.endsWith(".xml")) continue;
    const xml = e.getData().toString("utf-8");
    if (CASE_STUDY_RE.test(xml)) {
      const n = e.entryName.match(/slideLayout(\d+)/)[1];
      caseStudyLayouts.add(parseInt(n));
    }
  }
  // 2) slides + rels
  const slideEntries = entries
    .filter((e) => e.entryName.startsWith("ppt/slides/slide") && e.entryName.endsWith(".xml"))
    .sort((a, b) => parseInt(a.entryName.match(/slide(\d+)/)[1]) - parseInt(b.entryName.match(/slide(\d+)/)[1]));
  const slides = slideEntries.map((e, i) => {
    const slideNum = parseInt(e.entryName.match(/slide(\d+)/)[1]);
    const relsEntry = entries.find((r) => r.entryName === `ppt/slides/_rels/slide${slideNum}.xml.rels`);
    let layoutNum = null;
    if (relsEntry) {
      const m = relsEntry.getData().toString("utf-8").match(/slideLayout(\d+)\.xml/);
      if (m) layoutNum = parseInt(m[1]);
    }
    return {
      idx: i + 1,
      isCaseStudy: layoutNum != null && caseStudyLayouts.has(layoutNum),
      shapes: extractShapesFromXml(e.getData().toString("utf-8")),
    };
  });
  return { slides };
}

// ch3 JSON + CSV (PowerShell 추출 결과)
function loadCh3WithCaseStudy(jsonPath, csvPath) {
  const j = JSON.parse(readFileSync(jsonPath, "utf-8").replace(/^﻿/, ""));
  const csvText = readFileSync(csvPath, "utf-8").replace(/^﻿/, "");
  const csMap = new Map(); // idx → boolean
  for (const line of csvText.split(/\r?\n/).slice(1)) {
    const t = line.trim();
    if (!t) continue;
    const [idx, val] = t.split(",");
    csMap.set(parseInt(idx), val === "true");
  }
  return {
    slides: j.slides.map((s) => ({
      idx: s.idx,
      isCaseStudy: csMap.get(s.idx) === true,
      shapes: s.shapes,
    })),
  };
}

function extractCaseNumbers(slide) {
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
  return { candidates: [...candidates], allText };
}

async function resolveCases(caseNumbers) {
  if (caseNumbers.length === 0) return new Set();
  const found = new Set();
  for (let i = 0; i < caseNumbers.length; i += 1000) {
    const chunk = caseNumbers.slice(i, i + 1000);
    const { data, error } = await supa.from("cases").select("case_number").in("case_number", chunk);
    if (error) throw error;
    for (const r of data ?? []) found.add(r.case_number);
  }
  return found;
}

async function extractSlidePdf(srcDoc, idx) {
  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(srcDoc, [idx - 1]);
  for (const p of copied) newDoc.addPage(p);
  return Buffer.from(await newDoc.save());
}

async function main() {
  console.log("[info] CASE STUDY 미매칭 슬라이드 PDF 추출");
  console.log(`[info] out: ${OUT_DIR}`);

  // 1) 각 책의 layout 식별 case study + 본문 사건번호 후보
  const perBook = [];
  const allCandidates = new Set();
  for (const b of BOOKS) {
    const ipath = resolve(ROOT, b.input.path);
    if (!existsSync(ipath)) { console.log(`[skip] ch${b.ch}: ${ipath} 없음`); continue; }
    const loaded = b.input.type === "ch3"
      ? loadCh3WithCaseStudy(ipath, resolve(ROOT, b.input.csCsv))
      : loadPptxWithLayoutCaseStudy(ipath);
    const csSlides = loaded.slides.filter((s) => s.isCaseStudy);
    const enriched = csSlides.map((s) => {
      const { candidates, allText } = extractCaseNumbers(s);
      for (const c of candidates) allCandidates.add(c);
      return { idx: s.idx, candidates, allText };
    });
    perBook.push({ book: b, csSlides: enriched, totalCaseStudy: csSlides.length });
  }

  // 2) DB 매칭
  const dbCases = await resolveCases([...allCandidates]);

  // 3) 미매칭 = case study layout 슬라이드 - (DB 매칭된 사건번호 ≥ 1 슬라이드)
  let totalUnmatched = 0, totalCaseStudy = 0;
  const indexLines = [`# CASE STUDY 미매칭 슬라이드 인덱스`, ``, `자동 매칭은 슬라이드 본문에 \`(\\d{2,4})([가-힣]{1,3})(\\d{1,8})\` 패턴 매칭 + \`cases.case_number\` 정확 일치 시 성공으로 간주합니다.`, ``];
  const csvLines = [`book_slug,slide_idx,extracted_candidates,case_numbers_manual,note`];

  for (const { book, csSlides, totalCaseStudy: totalCS } of perBook) {
    totalCaseStudy += totalCS;
    const unmatched = csSlides.filter((s) => !s.candidates.some((c) => dbCases.has(c)));
    totalUnmatched += unmatched.length;
    indexLines.push(`## ch${book.ch} ${book.name} — case study layout ${totalCS} / 미매칭 ${unmatched.length}`);
    indexLines.push(``);
    if (unmatched.length === 0) {
      indexLines.push(`> 미매칭 없음 (모두 자동 매칭됨)`);
      indexLines.push(``);
      continue;
    }

    // PDF 추출
    const bookOutDir = resolve(OUT_DIR, book.slug);
    mkdirSync(bookOutDir, { recursive: true });
    const pdfPath = resolve(ROOT, book.pdf);
    const srcDoc = await PDFDocument.load(readFileSync(pdfPath), { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    indexLines.push(`| 슬라이드 | 본문 추출 사건번호 후보 | PDF |`);
    indexLines.push(`|---:|---|---|`);
    for (const s of unmatched) {
      if (s.idx > totalPages) {
        indexLines.push(`| s.${s.idx} | (PDF 페이지 ${totalPages} 초과) | — |`);
        continue;
      }
      const outName = `s${String(s.idx).padStart(4, "0")}.pdf`;
      const outPath = resolve(bookOutDir, outName);
      const buf = await extractSlidePdf(srcDoc, s.idx);
      writeFileSync(outPath, buf);

      const cand = s.candidates.length > 0
        ? s.candidates.map((c) => dbCases.has(c) ? `~~${c}~~` : c).join(", ")
        : `(0건)`;
      const preview = s.allText.slice(0, 60).replace(/\|/g, "/").replace(/\n/g, " ");
      indexLines.push(`| s.${s.idx} | ${cand} | [${book.slug}/${outName}](${book.slug}/${outName}) |`);
      csvLines.push(`${book.slug},${s.idx},"${s.candidates.join("|")}",,"${preview}"`);
    }
    indexLines.push(``);
    console.log(`  ch${book.ch} ${book.name}: case-study ${totalCS} / 미매칭 ${unmatched.length} PDF 추출`);
  }

  // 4) INDEX.md + CSV 저장
  writeFileSync(resolve(OUT_DIR, "INDEX.md"), indexLines.join("\n"), "utf-8");
  writeFileSync(resolve(OUT_DIR, "manual-mapping.csv"), csvLines.join("\n"), "utf-8");

  console.log();
  console.log(`[stats] 총 case-study layout 슬라이드: ${totalCaseStudy} / 미매칭: ${totalUnmatched}`);
  console.log(`[ok] INDEX.md + manual-mapping.csv saved to ${OUT_DIR}`);
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
