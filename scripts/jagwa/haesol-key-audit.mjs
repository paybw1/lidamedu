// feat-3-305 정답키 무결성 감사 (읽기 전용 · DB 수정 0).
// DB 정답키(problem_choices.is_correct) vs 한빛 공식 정답 전수 대조.
// 한빛 hwpx 는 .haesol-audit/txt 로 선덤프(PowerShell), pdf 는 pdfjs 로 직접 추출.
// 사용: node scripts/jagwa/haesol-key-audit.mjs
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");

async function dbQuery(q) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const CIRCLE = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
const circ = (c) => CIRCLE[c] ?? null;
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

// 과목 범위 lo..hi 의 공식 정답 파싱.
// 경계추론은 오정렬 위험 → 번호와 답이 붙은 "자체태깅" 우선(정렬 불요).
//  M1 번호태깅: "21. ③" / "11. 정답 ③" / "31번 정답 ③"  (번호+circled)
//  M2 순차:     "정답 1번"(물리) 또는 circled 정답 마커가 문항 순서대로 정확히 N개일 때만.
// 반환: { ans, method, parsed } — partial/혼합이면 emit 보류용으로 표시.
function parseAnswers(text, lo, hi) {
  const total = hi - lo + 1;
  const ans = {};
  const set = (n, a) => { if (n >= lo && n <= hi && a != null && ans[n] == null) ans[n] = a; };
  let m;
  // M1 정답앵커(번호+정답+답 인접, 신뢰): "11. 정답 ③" / "31번 정답 ③" / "1. 정답 2"
  // ※ 정답 키워드 필수 — 없으면 문제 재진술의 첫 보기(①)를 오인하므로.
  const reA = /(\d{1,2})\s*[.번]\s*(?:정답|해설|답)[은는:\s]*([①②③④⑤])/g;
  while ((m = reA.exec(text))) set(parseInt(m[1], 10), circ(m[2]));
  const reB = /(\d{1,2})\s*[.번]\s*(?:정답|답)\s*:?\s*([1-5])(?!\d)\s*번?/g;
  while ((m = reB.exec(text))) set(parseInt(m[1], 10), parseInt(m[2], 10));
  let have = 0;
  for (let n = lo; n <= hi; n++) if (ans[n] != null) have++;
  if (have > 0) return { ans, method: "M1", parsed: have };
  // 생물식 bare "21. ③"(정답 키워드 없음). 옵션열 오인 방지: 직후 동그라미 없음 + 정확히 total + 답분포 비편향.
  const bare = {};
  const reC = /(?<![0-9])(\d{1,2})\s*\.\s*([①②③④⑤])(?!\s*[①②③④⑤])/g;
  while ((m = reC.exec(text))) { const n = parseInt(m[1], 10); if (n >= lo && n <= hi && bare[n] == null) bare[n] = circ(m[2]); }
  if (Object.keys(bare).length === total) {
    const freq = {};
    for (const v of Object.values(bare)) freq[v] = (freq[v] || 0) + 1;
    if (Math.max(...Object.values(freq)) <= total * 0.5) {
      for (const n of Object.keys(bare)) ans[n] = bare[n];
      return { ans, method: "M1bare", parsed: total };
    }
  }
  // M3 답표: 상단 "문제 답 … 21 3 22 2 …"(번호+공백+한자리답) 형식.
  if (/문제\s*답/.test(text.slice(0, 300))) {
    const cut = text.indexOf("해설");
    const region = text.slice(0, cut > 0 ? cut : 600);
    const tbl = {};
    const reT = /(\d{1,2})\s+([1-5])(?!\d)/g;
    while ((m = reT.exec(region))) {
      const n = parseInt(m[1], 10);
      if (n >= lo && n <= hi && tbl[n] == null) tbl[n] = parseInt(m[2], 10);
    }
    if (Object.keys(tbl).length === total) {
      const freq = {};
      for (const v of Object.values(tbl)) freq[v] = (freq[v] || 0) + 1;
      if (Math.max(...Object.values(freq)) <= total * 0.6) {
        for (const n of Object.keys(tbl)) ans[n] = tbl[n];
        return { ans, method: "M3tbl", parsed: total };
      }
    }
  }
  // M2 순차(번호 앵커 없음): 마커가 문항 순서대로 정확히 N개일 때만.
  // "정답은 1번이다" / "답 ②" / "답: 5" / "해설: ③"(지학) 허용. 맨숫자는 콜론(답:N)일 때만.
  const seq = [];
  const re2 = /(?:정답|해설|(?<![가-힣])답)\s*:?\s*([①②③④⑤])|(?:정답|(?<![가-힣])답)\s*:?\s*([1-5])\s*번|(?:정답|(?<![가-힣])답)\s*:\s*([1-5])(?!\d)/g;
  while ((m = re2.exec(text))) seq.push(m[1] ? circ(m[1]) : m[2] ? parseInt(m[2], 10) : parseInt(m[3], 10));
  if (seq.length === total) {
    for (let i = 0; i < total; i++) ans[lo + i] = seq[i];
    return { ans, method: "M2", parsed: total };
  }
  return { ans: {}, method: "FAIL", parsed: 0 };
}

const rows = await dbQuery(
  `select p.year, p.science_subject as subj, p.problem_number as qno,
     (select array_agg(c.choice_index order by c.choice_index) from problem_choices c
        where c.problem_id=p.problem_id and c.is_correct) as dbkeys,
     d.ai_answer
   from problems p
   left join problem_explanation_drafts d on d.problem_id=p.problem_id
   where p.science_subject is not null and p.year is not null
   order by p.year, p.science_subject, p.problem_number;`,
);
const dbMap = {};
for (const r of rows) dbMap[`${r.year}|${r.subj}|${r.qno}`] = { dbkeys: r.dbkeys || [], ai: r.ai_answer };

const subjects = ["physics", "chemistry", "biology", "earth_science"];
const mism = [];
const multi = []; // is_correct 복수 행(전항정답/복수정답)
const nokey = []; // 정답키 없음
const cov = [];
const reprocess = []; // 신뢰 불가(실패/무출처) — emit 보류, 재처리 대상
let audited = 0; // 신뢰 파싱된 문항 수
for (let year = 2010; year <= 2026; year++) {
  for (const subj of subjects) {
    const [lo, hi] = SUBJ_RANGE[subj];
    const total = hi - lo + 1;
    const src = findSource(year, subj);
    if (!src) { reprocess.push(`${year} ${subj}: 무출처(한빛)`); continue; }
    const text = src.type === "hwpx" ? fs.readFileSync(src.path, "utf8") : await pdfText(src.path);
    const { ans, method, parsed } = parseAnswers(text, lo, hi);
    if (!["M1", "M1bare", "M2", "M3tbl"].includes(method)) {
      reprocess.push(`${year} ${subj}: ${src.type} ${method} ${parsed}/${total}`);
      continue;
    }
    const missing = [];
    for (let n = lo; n <= hi; n++) if (ans[n] == null) missing.push(n);
    audited += parsed;
    cov.push(`${year} ${subj}: ${src.type} ${method} ${parsed}/${total}${missing.length ? ` ·미파싱 q[${missing}]` : ""}`);
    for (let n = lo; n <= hi; n++) {
      const off = ans[n];
      if (off == null) continue;
      const db = dbMap[`${year}|${subj}|${n}`];
      if (!db) continue;
      const keys = db.dbkeys;
      if (keys.length === 0) { nokey.push({ year, subj, qno: n, official: off }); continue; }
      if (keys.length > 1) { multi.push({ year, subj, qno: n, keys, official: off, ai: db.ai }); continue; }
      const dbkey = keys[0];
      if (off !== dbkey) {
        const aiNum = circ((db.ai || "").trim()[0]);
        const cls = aiNum === off ? "AI=공식(DB오류유력)"
          : aiNum === dbkey ? "DB=AI≠공식(공단확인)"
          : "기타(AI불명)";
        mism.push({ year, subj, qno: n, dbkey, official: off, ai: db.ai, cls });
      }
    }
  }
}

console.log(`===== 신뢰 감사: ${audited}/680 문항 (${cov.length} subject-file 기여) =====`);
for (const c of cov) console.log(c);
console.log(`\n===== ⚠️ 재처리 필요 ${reprocess.length} (emit 보류) =====`);
for (const c of reprocess) console.log(c);
console.log(`\n===== MISMATCHES (${mism.length}) — 신뢰 파일만 =====`);
for (const m of mism) {
  console.log(`${m.year} ${m.subj} q${m.qno}: DB=${m.dbkey} 공식=${m.official} AI=${m.ai} | ${m.cls}`);
}
const byCls = {};
for (const m of mism) byCls[m.cls] = (byCls[m.cls] || 0) + 1;
console.log("\n===== 분류 =====");
for (const [k, v] of Object.entries(byCls)) console.log(`${k}: ${v}`);

console.log(`\n===== 복수 is_correct (${multi.length}) =====`);
for (const m of multi) console.log(`${m.year} ${m.subj} q${m.qno}: DB키=[${m.keys}] 공식=${m.official} AI=${m.ai}`);
console.log(`\n===== 정답키 없음 (${nokey.length}) =====`);
for (const m of nokey) console.log(`${m.year} ${m.subj} q${m.qno}: 공식=${m.official}`);
