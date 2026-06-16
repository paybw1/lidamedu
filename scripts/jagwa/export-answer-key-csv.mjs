// 자연과학 680문항 정답키 → 공단 대조용 CSV (읽기 전용, DB 수정 0).
// 현재DB정답(①~⑤) 채움 / 공단정답·일치여부 빈칸 / 비고에 감사 정보 매핑.
// 비고: 오답키후보(AI=한빛공식≠DB) · 3자불일치(DB=AI≠한빛) · 복수정답/전항정답 ·
//       비전의심(OCR 저신뢰) · 미감사(자동 대조 밖) · AI본문=N(참고).
// 사용: node scripts/jagwa/export-answer-key-csv.mjs
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
async function dbQuery(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const CSYM = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };
const CIRCLE = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
const circ = (c) => CIRCLE[c] ?? null;
const sym = (n) => CSYM[n] ?? String(n);
const SUBJ_RANGE = { physics: [1, 10], chemistry: [11, 20], biology: [21, 30], earth_science: [31, 40] };
const SUBJ_KO = { physics: "물리", chemistry: "화학", biology: "생물", earth_science: "지학" };
const HANBIT = "source/1차 해설모음/한빛";
const TXT = ".haesol-audit/txt";

async function pdfText(p) {
  const data = new Uint8Array(fs.readFileSync(p));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map((it) => it.str).join(" ") + " ";
  }
  return out.replace(/\s+/g, " ");
}
function findSource(year, subj) {
  const txt = path.join(TXT, `${year}_${subj}.txt`);
  if (fs.existsSync(txt)) return { type: "hwpx", path: txt };
  const round = year - 1963;
  const pdf = path.join(HANBIT, `${year}_${round}`, `${year}_${round}_${SUBJ_KO[subj]}.pdf`);
  if (fs.existsSync(pdf)) return { type: "pdf", path: pdf };
  return null;
}
// 한빛 공식 정답 파싱 (haesol-key-audit 와 동일 로직)
function parseAnswers(text, lo, hi) {
  const total = hi - lo + 1;
  const ans = {};
  const set = (n, a) => { if (n >= lo && n <= hi && a != null && ans[n] == null) ans[n] = a; };
  let m;
  const reA = /(\d{1,2})\s*[.번]\s*(?:정답|해설|답)[은는:\s]*([①②③④⑤])/g;
  while ((m = reA.exec(text))) set(parseInt(m[1], 10), circ(m[2]));
  const reB = /(\d{1,2})\s*[.번]\s*(?:정답|답)\s*:?\s*([1-5])(?!\d)\s*번?/g;
  while ((m = reB.exec(text))) set(parseInt(m[1], 10), parseInt(m[2], 10));
  let have = 0;
  for (let n = lo; n <= hi; n++) if (ans[n] != null) have++;
  if (have > 0) return { ans, method: "M1" };
  const bare = {};
  const reC = /(?<![0-9])(\d{1,2})\s*\.\s*([①②③④⑤])(?!\s*[①②③④⑤])/g;
  while ((m = reC.exec(text))) { const n = parseInt(m[1], 10); if (n >= lo && n <= hi && bare[n] == null) bare[n] = circ(m[2]); }
  if (Object.keys(bare).length === total) {
    const f = {}; for (const v of Object.values(bare)) f[v] = (f[v] || 0) + 1;
    if (Math.max(...Object.values(f)) <= total * 0.5) { for (const n of Object.keys(bare)) ans[n] = bare[n]; return { ans, method: "M1bare" }; }
  }
  if (/문제\s*답/.test(text.slice(0, 300))) {
    const cut = text.indexOf("해설");
    const region = text.slice(0, cut > 0 ? cut : 600);
    const tbl = {};
    const reT = /(\d{1,2})\s+([1-5])(?!\d)/g;
    while ((m = reT.exec(region))) { const n = parseInt(m[1], 10); if (n >= lo && n <= hi && tbl[n] == null) tbl[n] = parseInt(m[2], 10); }
    if (Object.keys(tbl).length === total) {
      const f = {}; for (const v of Object.values(tbl)) f[v] = (f[v] || 0) + 1;
      if (Math.max(...Object.values(f)) <= total * 0.6) { for (const n of Object.keys(tbl)) ans[n] = tbl[n]; return { ans, method: "M3tbl" }; }
    }
  }
  const seq = [];
  const re2 = /(?:정답|해설|(?<![가-힣])답)\s*:?\s*([①②③④⑤])|(?:정답|(?<![가-힣])답)\s*:?\s*([1-5])\s*번|(?:정답|(?<![가-힣])답)\s*:\s*([1-5])(?!\d)/g;
  while ((m = re2.exec(text))) seq.push(m[1] ? circ(m[1]) : m[2] ? parseInt(m[2], 10) : parseInt(m[3], 10));
  if (seq.length === total) { for (let i = 0; i < total; i++) ans[lo + i] = seq[i]; return { ans, method: "M2" }; }
  return { ans: {}, method: "FAIL" };
}

// ── 비전(수동) 매핑 ──
const VISION_OK_FILE = new Set(["2017|chemistry"]); // 스캔본 비전으로 q11-20 전부 DB 일치 확인
const VISION_SUSPECT_FILE = new Set(["2025|biology", "2026|earth_science"]); // 글리프/변스 비전 저신뢰
const VISION_MISMATCH = { "2026|earth_science|33": "①", "2026|earth_science|37": "②", "2026|earth_science|40": "①" };

// ── DB ──
const rows = await dbQuery(
  `select p.year, p.science_subject as subj, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id and c.is_correct) as dbkeys,
     d.ai_answer
   from problems p left join problem_explanation_drafts d on d.problem_id=p.problem_id
   where p.science_subject is not null and p.year is not null
   order by p.year, p.problem_number;`,
);
const dbMap = {};
for (const r of rows) dbMap[`${r.year}|${r.subj}|${r.qno}`] = { dbkeys: r.dbkeys || [], ai: r.ai_answer };

// ── 한빛 official 추출 ──
const official = {};
for (let year = 2010; year <= 2026; year++) {
  for (const subj of Object.keys(SUBJ_RANGE)) {
    const [lo, hi] = SUBJ_RANGE[subj];
    const src = findSource(year, subj);
    if (!src) continue;
    const text = src.type === "hwpx" ? fs.readFileSync(src.path, "utf8") : await pdfText(src.path);
    const { ans, method } = parseAnswers(text, lo, hi);
    if (!["M1", "M1bare", "M2", "M3tbl"].includes(method)) continue;
    for (let n = lo; n <= hi; n++) if (ans[n] != null) official[`${year}|${subj}|${n}`] = ans[n];
  }
}

// ── 분류 + CSV ──
const shorten = (s) => { s = String(s).trim(); return s.length > 22 ? s.slice(0, 22) + "…" : s; };
const counts = { 오답키후보: 0, "3자불일치": 0, 복수: 0, 비전의심: 0, 비전확인: 0, 미감사: 0, 정상: 0, 불일치기타: 0 };

function bigo(year, subj, qno, dbkeys, ai) {
  const key = `${year}|${subj}|${qno}`, fkey = `${year}|${subj}`;
  const tags = [];
  const aiTag = ai ? `AI본문=${shorten(ai)}` : null;
  if (dbkeys.length > 1) { tags.push(dbkeys.length === 5 ? "전항정답" : `복수정답[${dbkeys.map(sym).join("")}]`); counts.복수++; }
  const off = official[key];
  if (off != null) {
    const dk = dbkeys.length === 1 ? dbkeys[0] : null;
    if (dk != null && off !== dk) {
      const aiNum = circ((ai || "").trim()[0]);
      if (aiNum === off) { tags.push(`오답키후보(한빛=${sym(off)})`); counts.오답키후보++; }
      else if (aiNum === dk) { tags.push(`3자불일치(한빛=${sym(off)})`); counts["3자불일치"]++; }
      else { tags.push(`불일치(한빛=${sym(off)})`); counts.불일치기타++; }
      if (aiTag) tags.push(aiTag);
    } else if (tags.length === 0) counts.정상++;
  } else {
    if (VISION_OK_FILE.has(fkey)) { tags.push("비전확인=일치(스캔)"); counts.비전확인++; }
    else if (VISION_SUSPECT_FILE.has(fkey)) {
      if (VISION_MISMATCH[key]) tags.push(`비전의심·불일치(OCR ${VISION_MISMATCH[key]})`);
      else tags.push("비전의심(OCR 불확실)");
      counts.비전의심++;
      if (aiTag) tags.push(aiTag);
    } else { tags.push("미감사"); counts.미감사++; if (aiTag) tags.push(aiTag); }
  }
  return tags.join(";");
}

function csvCell(s) {
  s = s == null ? "" : String(s);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const recs = rows
  .slice()
  .sort((a, b) => a.year - b.year || a.problem_number - b.problem_number)
  .map((r) => {
    const d = dbMap[`${r.year}|${r.subj}|${r.qno}`];
    const dbsym = d.dbkeys.length ? d.dbkeys.map(sym).join("") : "(없음)";
    return [r.year, SUBJ_KO[r.subj] || r.subj, r.qno, dbsym, "", "", bigo(r.year, r.subj, r.qno, d.dbkeys, d.ai)];
  });

const header = ["연도", "과목", "문항", "현재DB정답", "공단정답", "일치여부", "비고"];
const lines = [header, ...recs].map((row) => row.map(csvCell).join(",")).join("\r\n");
const outDir = "tmp/jagwa";
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "natural-science-answer-key-audit.csv");
fs.writeFileSync(outPath, "﻿" + lines, "utf8"); // UTF-8 BOM

console.log(`CSV: ${outPath}`);
console.log(`행수(헤더 제외): ${recs.length}`);
console.log("비고 건수:", JSON.stringify(counts, null, 0));
