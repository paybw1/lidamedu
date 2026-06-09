// 조문에 업로드된 강의노트 중 CASE STUDY 슬라이드를, 인용 사건번호와 일치하는
// 특허법 판례(cases)에 동일 PDF·동일 제목으로 연결한다.
//   - 제목/pdf_url 은 이미 업로드된 조문 note 행에서 그대로 읽어 재사용(완전 동일).
//   - 슬라이드 인용 사건번호(정제 정규식) ↔ cases.case_number 정확일치.
//   - --apply: 특허법 판례 기존 lecture_note 전부 soft-delete 후 연결 insert.
// 사용: node scripts/lecture-notes/import-case-notes.mjs [--apply]
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: resolve(ROOT, ".env") });
const APPLY = process.argv.includes("--apply");
const SRC_DIR = resolve(ROOT, "source/특허법 강의노트");
const SOURCE_PDF_ID = "d568c53f-a316-5014-bbbc-1fb555435917"; // import-all 과 동일 배치

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ART_RE = /제\s*\d+\s*조(?:\s*의\s*\d+)?/;
// 정제: 법원 사건부호로 한정 (긴 것 우선) → "대법원/선고/판결" 오탐 제거.
const DESIG = "(?:가합|구합|카합|가단|구단|고합|고단|가소|느합|드합|허|후|다|두|도|나|마|머|모|바|사|자|차|카|타|파|하|노|고|초|재|누|르|므|즈)";
const CASE_RE = new RegExp(`(\\d{2,4})\\s*${DESIG}\\s*(\\d{1,6})`, "g");
const CASE_RE_FULL = new RegExp(`\\d{2,4}\\s*${DESIG}\\s*\\d{1,6}`, "g");

function spJoined(xml) {
  const sps = [];
  const re = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const ph = b.match(/<p:ph\b([^>]*)>/);
    const phType = ph ? (ph[1].match(/type="([^"]+)"/)?.[1] ?? "body") : null;
    const tr = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    let tm, s = "";
    while ((tm = tr.exec(b))) s += tm[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    sps.push({ phType, text: s.trim() });
  }
  return sps;
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".pptx") && !f.startsWith("~$")).sort();

  // 슬라이드별 인용 사건번호 (조문 슬라이드만): key = "chN:slide"
  const slideCases = new Map();
  for (const f of files) {
    const slug = "ch" + (f.match(/^(\d+)/)?.[1] ?? "x");
    const zip = new AdmZip(`${SRC_DIR}/${f}`);
    const slides = zip.getEntries().filter((e) => /ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => parseInt(a.entryName.match(/slide(\d+)/)[1]) - parseInt(b.entryName.match(/slide(\d+)/)[1]));
    slides.forEach((e, i) => {
      const sps = spJoined(e.getData().toString("utf-8"));
      const title = sps.find((s) => s.phType === "title" || s.phType === "ctrTitle");
      const jomun = (title?.text ?? "").trim();
      if (!ART_RE.test(jomun) || /참고\s*노트/.test(jomun)) return; // 조문 슬라이드만
      const joined = sps.map((s) => s.text).join(" ");
      if (!/CASE|선고|판결|대법원|특허법원/i.test(joined)) return;
      const cm = joined.match(CASE_RE_FULL);
      if (!cm) return;
      const nums = [...new Set(cm.map((x) => {
        const mm = x.match(CASE_RE); CASE_RE.lastIndex = 0;
        return x.replace(/\s+/g, "");
      }))];
      if (nums.length) slideCases.set(`${slug}:${i + 1}`, nums);
    });
  }
  console.log(`CASE 인용 조문슬라이드: ${slideCases.size}`);

  // 이미 업로드된 조문 note → key "chN:slide" 로 title/pdf_url 매핑
  const artNotes = [];
  { let from = 0; for (;;) {
    const { data } = await supa.from("lecture_resources")
      .select("pdf_url,title,source_page_start")
      .eq("source_pdf_id", SOURCE_PDF_ID).eq("target_type", "article").eq("kind", "lecture_note").is("deleted_at", null)
      .range(from, from + 999);
    artNotes.push(...(data ?? [])); if (!data || data.length < 1000) break; from += 1000;
  } }
  const noteByKey = new Map();
  for (const n of artNotes) {
    const mm = (n.pdf_url ?? "").match(/(ch\d+)-s(\d+)\.pdf$/);
    if (mm) noteByKey.set(`${mm[1]}:${parseInt(mm[2], 10)}`, n);
  }
  console.log(`업로드된 조문 note: ${artNotes.length}`);

  // 특허법 판례 case_number → [case_id]
  const caseByNum = new Map();
  { let from = 0; for (;;) {
    const { data } = await supa.from("cases").select("case_id,case_number,subject_laws")
      .contains("subject_laws", ["patent"]).is("deleted_at", null).range(from, from + 999);
    for (const c of data ?? []) { if (!c.case_number) continue; const a = caseByNum.get(c.case_number) ?? []; a.push(c.case_id); caseByNum.set(c.case_number, a); }
    if (!data || data.length < 1000) break; from += 1000;
  } }
  console.log(`특허법 판례(case_number 보유): ${caseByNum.size}`);

  // 연결 후보 생성
  const links = []; // {case_id, pdf_url, title, slide, slug}
  const dedup = new Set();
  let slidesNoNote = 0, casesMatched = new Set(), numsMissed = new Set();
  for (const [key, nums] of slideCases) {
    const note = noteByKey.get(key);
    if (!note) { slidesNoNote++; continue; }
    const [slug, slideStr] = key.split(":");
    for (const num of nums) {
      const ids = caseByNum.get(num);
      if (!ids) { numsMissed.add(num); continue; }
      for (const cid of ids) {
        const dk = `${cid}|${note.pdf_url}`;
        if (dedup.has(dk)) continue; dedup.add(dk);
        casesMatched.add(cid);
        links.push({ case_id: cid, pdf_url: note.pdf_url, title: note.title, slide: parseInt(slideStr, 10), slug });
      }
    }
  }
  const patentCaseIds = [...new Set([...caseByNum.values()].flat())];

  console.log(`\n===== 요약 =====`);
  console.log(`생성될 연결: ${links.length} | 대상 판례: ${casesMatched.size}`);
  console.log(`조문note 없는 슬라이드: ${slidesNoNote} | 미매칭 사건번호: ${numsMissed.size}`);
  if (numsMissed.size) console.log(`  미매칭 예시: ${[...numsMissed].slice(0, 15).join(", ")}`);
  console.log(`\n샘플:`);
  for (const l of links.slice(0, 8)) console.log(`  [${l.slug} s${l.slide}] "${l.title}" → case ${l.case_id.slice(0, 8)}`);

  if (!APPLY) { console.log(`\n(dry-run — DB 무변경. --apply 로 적용)`); return; }

  // 삭제: 특허법 판례 기존 lecture_note 전부
  let wiped = 0;
  for (let i = 0; i < patentCaseIds.length; i += 300) {
    const { data, error } = await supa.from("lecture_resources")
      .update({ deleted_at: new Date().toISOString() })
      .eq("target_type", "case").eq("kind", "lecture_note").is("deleted_at", null)
      .in("target_id", patentCaseIds.slice(i, i + 300)).select("resource_id");
    if (error) { console.error("삭제 실패:", error.message); process.exit(1); }
    wiped += data?.length ?? 0;
  }
  console.log(`\n[apply] 기존 특허법 판례 강의노트 soft-delete: ${wiped}건`);

  // insert
  let ord = 0, ok = 0, fail = 0;
  for (let i = 0; i < links.length; i += 200) {
    const rows = links.slice(i, i + 200).map((l) => ({
      target_type: "case", target_id: l.case_id, kind: "lecture_note",
      title: l.title, pdf_url: l.pdf_url, source_pdf_id: SOURCE_PDF_ID,
      source_page_start: l.slide, source_page_end: l.slide, ord: ord++,
    }));
    const { error } = await supa.from("lecture_resources").insert(rows);
    if (error) { console.error(`insert batch ${i} 실패:`, error.message); fail += rows.length; }
    else ok += rows.length;
  }
  console.log(`\n[done] 판례 연결 ${ok} / 실패 ${fail}`);
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
