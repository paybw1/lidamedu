// 통합본 제10판 PPTX → 조문/판례 "전역 페이지" 위치 추출 + 기존 조각·오프셋 교차검증.
//   - article: 제목 placeholder 제N조 → articles.article_number 정확일치 → (article, page=슬라이드idx)
//   - case: 본문 CASE 표시 슬라이드의 사건번호 → cases.case_number 정확일치 → (case, page)
//   - 교차검증: 기존 활성 조각(chN, source_page_start) → 챕터오프셋 적용 예상페이지 와 대조(보고).
//   - 기본 dry-run(무변경). --apply 시 lecture_pdf_locations 의 source_pdf_id 행 전삭 후 재insert.
// 사용: node scripts/lecture-notes/extract-pdf-locations.mjs [--apply]
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: resolve(ROOT, ".env") });
const APPLY = process.argv.includes("--apply");
const SRC_DIR = resolve(ROOT, "source/특허법 강의노트");
const MASTER = resolve(SRC_DIR, "특허법 강의노트(제10판).pptx");
const BOOK_NAME = "리담특허법 강의노트 (제10판)";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ART_RE = /제\s*\d+\s*조(?:\s*의\s*\d+)?/;
const ART_NUM_RE_G = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;
// 사건번호 — 법원 사건부호 한정(import-case-notes 와 동일)
const DESIG = "(?:가합|구합|카합|가단|구단|고합|고단|가소|느합|드합|허|후|다|두|도|나|마|머|모|바|사|자|차|카|타|파|하|노|고|초|재|누|르|므|즈)";
const CASE_RE_FULL = new RegExp(`\\d{2,4}\\s*${DESIG}\\s*\\d{1,6}`, "g");

function spList(xml) {
  const out = [];
  for (const m of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
    const b = m[1];
    const ph = b.match(/<p:ph\b([^>]*)>/);
    const phType = ph ? (ph[1].match(/type="([^"]+)"/)?.[1] ?? "body") : null;
    let s = "";
    for (const tm of b.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g))
      s += tm[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    out.push({ phType, text: s.trim() });
  }
  return out;
}
function slides(pptxPath) {
  const zip = new AdmZip(pptxPath);
  return zip
    .getEntries()
    .filter((e) => /ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => parseInt(a.entryName.match(/slide(\d+)/)[1]) - parseInt(b.entryName.match(/slide(\d+)/)[1]))
    .map((e) => e.getData().toString("utf-8"));
}
function metaOf(xml) {
  const sps = spList(xml);
  const title = sps.find((s) => s.phType === "title" || s.phType === "ctrTitle");
  const jomun = (title?.text ?? "").trim();
  const joined = sps.map((s) => s.text).join(" ");
  // 다중 조문 제목("제148조, 제149조")은 모든 조문에 링크. 범위(제3조~제5조)는 표기된 양끝만.
  const articleNumbers = [];
  if (ART_RE.test(jomun) && !/참고\s*노트/.test(jomun)) {
    for (const m of jomun.matchAll(ART_NUM_RE_G))
      articleNumbers.push(m[2] ? `${m[1]}의${m[2]}` : m[1]);
  }
  let caseNums = [];
  if (/CASE|선고|판결|대법원|특허법원/i.test(joined)) {
    const cm = joined.match(CASE_RE_FULL);
    if (cm) caseNums = [...new Set(cm.map((x) => x.replace(/\s+/g, "")))];
  }
  return { jomun, articleNumbers: [...new Set(articleNumbers)], caseNums };
}
function titlesOf(pptxPath) {
  return slides(pptxPath).map((xml) => {
    const sps = spList(xml);
    return (sps.find((s) => s.phType === "title" || s.phType === "ctrTitle")?.text ?? "").trim();
  });
}
function findOffset(master, chap) {
  let best = { offset: -1, matched: -1 };
  for (let o = 0; o <= Math.max(0, master.length - chap.length); o++) {
    let s = 0;
    for (let i = 0; i < chap.length; i++) if (chap[i] && master[o + i] === chap[i]) s++;
    if (s > best.matched) best = { offset: o, matched: s };
  }
  return best;
}
function slug(f) {
  return "ch" + (f.match(/^(\d+)/)?.[1] ?? "x");
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  // source_pdf_id (제10판) — lecture_source_pdfs 에서 조회
  const { data: src } = await supa.from("lecture_source_pdfs").select("source_pdf_id,total_pages").eq("title", BOOK_NAME).maybeSingle();
  if (!src) throw new Error("lecture_source_pdfs 에 제10판 행 없음 (먼저 import-original-pdf --apply)");
  const SOURCE_PDF_ID = src.source_pdf_id;
  console.log(`source_pdf_id=${SOURCE_PDF_ID} total_pages=${src.total_pages}`);

  // patent law + maps
  const { data: law } = await supa.from("laws").select("law_id").eq("law_code", "patent").single();
  const artMap = new Map();
  for (let from = 0; ; from += 1000) {
    const { data } = await supa.from("articles").select("article_id,article_number").eq("law_id", law.law_id).is("deleted_at", null).range(from, from + 999);
    for (const a of data ?? []) if (a.article_number) artMap.set(a.article_number, a.article_id);
    if (!data || data.length < 1000) break;
  }
  const caseMap = new Map();
  for (let from = 0; ; from += 1000) {
    const { data } = await supa.from("cases").select("case_id,case_number,subject_laws").contains("subject_laws", ["patent"]).is("deleted_at", null).range(from, from + 999);
    for (const c of data ?? []) { if (!c.case_number) continue; const a = caseMap.get(c.case_number) ?? []; a.push(c.case_id); caseMap.set(c.case_number, a); }
    if (!data || data.length < 1000) break;
  }
  console.log(`patent articles=${artMap.size} cases(번호)=${caseMap.size}`);

  // ── 추출: master 슬라이드별 (page = idx+1) ──
  const masterSlides = slides(MASTER);
  const locs = new Map(); // key target_type|target_id|page -> {target_type,target_id,page,label}
  let artHit = 0, artMiss = new Set(), caseHit = 0, caseMiss = new Set();
  masterSlides.forEach((xml, i) => {
    const page = i + 1;
    const m = metaOf(xml);
    for (const an of m.articleNumbers) {
      const aid = artMap.get(an);
      if (aid) { locs.set(`article|${aid}|${page}`, { target_type: "article", target_id: aid, page, label: m.jomun.slice(0, 80) }); artHit++; }
      else artMiss.add(an);
    }
    for (const cn of m.caseNums) {
      const ids = caseMap.get(cn);
      if (ids) { for (const cid of ids) locs.set(`case|${cid}|${page}`, { target_type: "case", target_id: cid, page, label: cn }); caseHit++; }
      else caseMiss.add(cn);
    }
  });
  const extracted = [...locs.values()];
  const extSet = new Set(extracted.map((l) => `${l.target_type}|${l.target_id}|${l.page}`));
  console.log(`\n===== 추출 =====`);
  console.log(`위치 ${extracted.length} (article ${extracted.filter(l=>l.target_type==="article").length} · case ${extracted.filter(l=>l.target_type==="case").length})`);
  console.log(`article 매칭슬라이드 ${artHit} · 미매칭조문 ${artMiss.size}${artMiss.size?` (${[...artMiss].slice(0,8).join(",")}…)`:""}`);
  console.log(`case 매칭 ${caseHit} · 미매칭사건번호 ${caseMiss.size}${caseMiss.size?` (${[...caseMiss].slice(0,8).join(",")}…)`:""}`);

  // ── 교차검증: 기존 조각(chN, source_page_start) → 오프셋 예상페이지 ──
  const chapterFiles = readdirSync(SRC_DIR).filter((f) => /\.pptx$/i.test(f) && !f.startsWith("~$") && !f.includes("제10판")).sort();
  const masterTitles = titlesOf(MASTER);
  const offset = {};
  for (const f of chapterFiles) offset[slug(f)] = findOffset(masterTitles, titlesOf(resolve(SRC_DIR, f))).offset;
  console.log(`\n===== 교차검증 (기존 조각 ↔ 추출) =====`);
  console.log(`챕터 오프셋: ${Object.entries(offset).map(([k,v])=>`${k}=${v}`).join(" · ")}`);

  const { data: frags } = await supa.from("lecture_resources")
    .select("target_type,target_id,source_page_start,pdf_url,title")
    .is("deleted_at", null).like("pdf_url", "patent-lecture/ch%");
  const fragPairs = []; // {target_type,target_id,expPage,ch,s,title}
  for (const r of frags ?? []) {
    const mm = (r.pdf_url || "").match(/patent-lecture\/(ch\d+)-s(\d+)\.pdf/);
    if (!mm || r.source_page_start == null) continue;
    const off = offset[mm[1]];
    if (off == null) continue;
    fragPairs.push({ target_type: r.target_type, target_id: r.target_id, expPage: off + r.source_page_start, ch: mm[1], s: r.source_page_start, title: r.title });
  }
  const report = (tt) => {
    const fp = fragPairs.filter((p) => p.target_type === tt);
    const matched = fp.filter((p) => extSet.has(`${tt}|${p.target_id}|${p.expPage}`));
    const fragOnly = fp.filter((p) => !extSet.has(`${tt}|${p.target_id}|${p.expPage}`));
    const fragKeys = new Set(fp.map((p) => `${tt}|${p.target_id}|${p.expPage}`));
    const extOnly = extracted.filter((l) => l.target_type === tt && !fragKeys.has(`${tt}|${l.target_id}|${l.page}`));
    const rate = fp.length ? ((matched.length / fp.length) * 100).toFixed(1) : "—";
    console.log(`\n[${tt}] 조각 ${fp.length}쌍 중 추출일치 ${matched.length} (${rate}%) · 조각-only ${fragOnly.length} · 추출-only ${extOnly.length}`);
    if (fragOnly.length) {
      console.log(`  조각-only 표본(추출이 그 페이지에 이 ${tt}를 안 넣음 — 제목 편집/미매칭 의심):`);
      for (const p of fragOnly.slice(0, 8)) console.log(`   ${p.ch} s${p.s}→p${p.expPage} "${(p.title||"").slice(0,30)}"`);
    }
    if (extOnly.length) {
      console.log(`  추출-only 표본(조각엔 없던 위치 — 신설/원래 미매칭 슬라이드 의심):`);
      for (const l of extOnly.slice(0, 8)) console.log(`   p${l.page} "${l.label}"`);
    }
    return { fp: fp.length, matched: matched.length, rate };
  };
  report("article");
  report("case");

  if (!APPLY) { console.log(`\n(dry-run — lecture_pdf_locations 무변경. 보고 확인 후 --apply)`); return; }
  // ── --apply: source_pdf_id 행 전삭 후 재insert ──
  await supa.from("lecture_pdf_locations").delete().eq("source_pdf_id", SOURCE_PDF_ID);
  let ok = 0;
  for (let i = 0; i < extracted.length; i += 500) {
    const rows = extracted.slice(i, i + 500).map((l) => ({ target_type: l.target_type, target_id: l.target_id, source_pdf_id: SOURCE_PDF_ID, page: l.page, label: l.label }));
    const { error } = await supa.from("lecture_pdf_locations").insert(rows);
    if (error) throw new Error(`insert 실패: ${error.message}`);
    ok += rows.length;
  }
  console.log(`\n[apply] lecture_pdf_locations 적재 ${ok}건 (source_pdf_id=${SOURCE_PDF_ID})`);
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
