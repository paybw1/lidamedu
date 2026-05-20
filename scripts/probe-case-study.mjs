// CASE STUDY 슬라이드 진단 — 7편 PPT 전체에서 좌상단 "CASE STUDY" 라벨 식별 +
// 슬라이드 본문에서 판례 사건번호 추출 + cases DB 매칭 dry-run.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import AdmZip from "adm-zip";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
dotenv.config({ path: resolve(ROOT, ".env") });

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// PPT 매니페스트 — ch3 는 JSON fallback 사용
const BOOKS = [
  { ch: 1, name: "총칙·보칙", input: { type: "pptx", path: "source/1. 총칙 및 보칙_특허법 강의노트.pptx" } },
  { ch: 2, name: "특허요건", input: { type: "pptx", path: "source/2. 특허요건_특허법 강의노트.pptx" } },
  { ch: 3, name: "이익제도", input: { type: "json", path: "tmp/ch3-slides.json" } },
  { ch: 4, name: "심사·제도", input: { type: "pptx", path: "source/4. 심사(제도)_특허법 강의노트.pptx" } },
  { ch: 5, name: "특허권", input: { type: "pptx", path: "source/5. 특허권_특허법 강의노트.pptx" } },
  { ch: 6, name: "심판·소송", input: { type: "pptx", path: "source/6. 심판 및 소송_특허법 강의노트.pptx" } },
  { ch: 7, name: "PCT", input: { type: "pptx", path: "source/7. PCT_특허법 강의노트.pptx" } },
];

function loadPptxSlides(pptxPath) {
  const zip = new AdmZip(pptxPath);
  const entries = zip.getEntries();
  const slideEntries = entries
    .filter((e) => e.entryName.startsWith("ppt/slides/slide") && e.entryName.endsWith(".xml"))
    .sort((a, b) => parseInt(a.entryName.match(/slide(\d+)/)[1]) - parseInt(b.entryName.match(/slide(\d+)/)[1]));
  const presEntry = entries.find((e) => e.entryName === "ppt/presentation.xml");
  let slideW = 9144000, slideH = 6858000;
  if (presEntry) {
    const m = presEntry.getData().toString("utf-8").match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
    if (m) { slideW = parseInt(m[1]); slideH = parseInt(m[2]); }
  }

  // 1) slideLayout 들 중 "CASE STUDY" 텍스트 포함 layout 번호 식별
  const layoutEntries = entries.filter(
    (e) => e.entryName.startsWith("ppt/slideLayouts/slideLayout") && e.entryName.endsWith(".xml"),
  );
  const caseStudyLayouts = new Set();
  for (const le of layoutEntries) {
    const xml = le.getData().toString("utf-8");
    if (CASE_STUDY_RE.test(xml)) {
      const n = le.entryName.match(/slideLayout(\d+)/)[1];
      caseStudyLayouts.add(parseInt(n));
    }
  }

  // 2) 각 슬라이드의 .rels 에서 참조 slideLayout 추출
  const slideToLayout = new Map();
  for (const se of slideEntries) {
    const slideNum = parseInt(se.entryName.match(/slide(\d+)/)[1]);
    const relsEntry = entries.find((e) => e.entryName === `ppt/slides/_rels/slide${slideNum}.xml.rels`);
    if (!relsEntry) continue;
    const rels = relsEntry.getData().toString("utf-8");
    const m = rels.match(/slideLayout(\d+)\.xml/);
    if (m) slideToLayout.set(slideNum, parseInt(m[1]));
  }

  return {
    slideW, slideH,
    caseStudyLayouts: [...caseStudyLayouts],
    slides: slideEntries.map((e, i) => {
      const slideNum = parseInt(e.entryName.match(/slide(\d+)/)[1]);
      return {
        idx: i + 1,
        layoutNum: slideToLayout.get(slideNum) ?? null,
        shapes: extractShapesFromXml(e.getData().toString("utf-8")),
      };
    }),
  };
}

function extractShapesFromXml(xml) {
  const shapes = [];
  const spRegex = /<p:sp[^>]*>([\s\S]*?)<\/p:sp>/g;
  let m;
  while ((m = spRegex.exec(xml)) !== null) {
    const block = m[1];
    const off = block.match(/<a:off\s+x="(\-?\d+)"\s+y="(\-?\d+)"\s*\/>/);
    if (!off) continue;
    const x = parseInt(off[1]), y = parseInt(off[2]);
    const texts = [];
    const tRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    let tm;
    while ((tm = tRegex.exec(block)) !== null) {
      texts.push(
        tm[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
      );
    }
    if (texts.length === 0) continue;
    shapes.push({ x, y, text: texts.join("") });
  }
  return shapes;
}

function loadJsonSlides(jsonPath) {
  const j = JSON.parse(readFileSync(jsonPath, "utf-8").replace(/^﻿/, ""));
  return { slideW: j.slideW, slideH: j.slideH, slides: j.slides };
}

// CASE STUDY 식별 — 좌상단에 "CASE STUDY" 텍스트 (공백/대소문자 변형 허용)
const CASE_STUDY_RE = /CASE\s*STUDY/i;
// 사건번호 — N년 + 한글(후/다/허/도/두/카/마/머/누/바/구/타) + 번호
// 정확 매칭을 위해 길이 제한: 연도 4자리 + 한글 1~3자 + 번호 1~8자리
const CASE_NUMBER_RE = /(\d{2,4})([가-힣]{1,3})(\d{1,8})/g;

// 본문에 사건번호 ≥ 1 추출되는 슬라이드 모두 후보. cases DB 매칭으로 최종 필터.
function findCaseStudySlides(slides, slideW, slideH) {
  const result = [];
  for (const s of slides) {
    const allText = s.shapes.map((sh) => sh.text).join(" ");
    const candidates = new Set();
    let m;
    CASE_NUMBER_RE.lastIndex = 0;
    while ((m = CASE_NUMBER_RE.exec(allText)) !== null) {
      const [whole, yearStr, kor] = m;
      if (yearStr.length !== 2 && yearStr.length !== 4) continue;
      // 조문 표기 false positive 제외: "29조제1", "28의5", "67의3" 등
      if (/조|항|호|목|의/.test(kor)) continue;
      candidates.add(whole);
    }
    if (candidates.size === 0) continue;
    const topLeftJoin = s.shapes
      .filter((sh) => sh.x < slideW * 0.35 && sh.y < slideH * 0.25)
      .map((sh) => sh.text)
      .join(" ");
    result.push({
      idx: s.idx,
      topLeft: topLeftJoin.slice(0, 80),
      caseNumbers: [...candidates],
    });
  }
  return result;
}

async function resolveCases(caseNumbers) {
  if (caseNumbers.length === 0) return new Map();
  const { data, error } = await supa
    .from("cases")
    .select("case_id, case_number, court")
    .in("case_number", caseNumbers);
  if (error) throw error;
  const map = new Map();
  for (const r of data ?? []) map.set(r.case_number, r);
  return map;
}

async function main() {
  console.log("[info] CASE STUDY 슬라이드 진단 (7편)");
  console.log();
  const allCandidates = new Set();
  const perBookResults = [];

  for (const b of BOOKS) {
    const path = resolve(ROOT, b.input.path);
    if (!existsSync(path)) {
      console.log(`[skip] ch${b.ch} ${b.name}: ${path} 없음`);
      continue;
    }
    const loaded = b.input.type === "json" ? loadJsonSlides(path) : loadPptxSlides(path);
    const { slideW, slideH, slides } = loaded;
    const studies = findCaseStudySlides(slides, slideW, slideH);
    perBookResults.push({ b, studies });
    for (const s of studies) for (const c of s.caseNumbers) allCandidates.add(c);
  }

  // 한 번에 DB 매칭
  const caseMap = await resolveCases([...allCandidates]);

  console.log(`총 case-study 슬라이드: ${perBookResults.reduce((acc, r) => acc + r.studies.length, 0)}`);
  console.log(`추출된 후보 사건번호: ${allCandidates.size} / DB 매칭: ${caseMap.size}`);
  console.log();

  let totalRows = 0, totalUnmatched = 0;
  for (const { b, studies } of perBookResults) {
    console.log(`========== ch${b.ch} ${b.name} (${studies.length} 슬라이드) ==========`);
    for (const s of studies) {
      const matched = s.caseNumbers.filter((c) => caseMap.has(c));
      const unmatched = s.caseNumbers.filter((c) => !caseMap.has(c));
      totalRows += matched.length;
      totalUnmatched += unmatched.length;
      let line = `  s.${String(s.idx).padStart(3)}: `;
      if (matched.length > 0) {
        line += matched.map((c) => `✅ ${c}(${caseMap.get(c).court ?? "?"})`).join(", ");
      }
      if (unmatched.length > 0) {
        line += (matched.length > 0 ? " | " : "") + unmatched.map((c) => `❌ ${c}`).join(", ");
      }
      if (s.caseNumbers.length === 0) {
        line += `(사건번호 0 추출) "${s.topLeft}"`;
      }
      console.log(line);
    }
    console.log();
  }

  console.log(`[stats] 추가 등록될 case 자료 row: ${totalRows} / DB 미존재 사건번호: ${totalUnmatched}`);
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
