// feat-9-010 ① — 강사 Q&A 아카이브 파싱·정규화 (source/Q&A → source/_converted/qna-archive.json)
// CSV(UTF-8/CP949 자동판별) 13개 + xlsx 3개 → 통합 스키마. 리포트 출력, DB 무접촉.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import iconv from "iconv-lite";
import AdmZip from "adm-zip";

const ROOT = resolve(import.meta.dirname, "../..");
const SRC = resolve(ROOT, "source/Q&A");
const OUT = resolve(ROOT, "source/_converted/qna-archive.json");

// ── CSV ──────────────────────────────────────────────────────────────────────
function decodeSmart(buf) {
  // UTF-8 BOM 우선, 아니면 UTF-8 디코드 후 대체문자 비율로 CP949 판별
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)
    return { text: buf.slice(3).toString("utf8"), enc: "utf8-bom" };
  const utf8 = buf.toString("utf8");
  const bad = (utf8.match(/�/g) || []).length;
  if (bad > 3) return { text: iconv.decode(buf, "cp949"), enc: "cp949" };
  return { text: utf8, enc: "utf8" };
}
function parseCsv(text) {
  const rows = [];
  let cur = [""], ci = 0, q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur[ci] += '"'; i++; }
        else q = false;
      } else cur[ci] += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { cur.push(""); ci++; }
    else if (ch === "\n") { rows.push(cur); cur = [""]; ci = 0; }
    else if (ch !== "\r") cur[ci] += ch;
  }
  if (cur.length > 1 || cur[0].trim()) rows.push(cur);
  return rows;
}

// ── xlsx (sheet1 + sharedStrings) ────────────────────────────────────────────
const XENT = (s) =>
  s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
function parseXlsx(path) {
  const zip = new AdmZip(path);
  const ssXml = zip.readAsText("xl/sharedStrings.xml") || "";
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => XENT(m[1]));
  const sheet = zip.readAsText("xl/worksheets/sheet1.xml");
  const rows = [];
  for (const rm of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = cm[1];
      const attrs = cm[3] ?? "";
      const inner = cm[4] ?? "";
      let v = "";
      const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
      const ism = /<is>([\s\S]*?)<\/is>/.exec(inner);
      if (vm) v = /t="s"/.test(attrs) ? (shared[+vm[1]] ?? "") : XENT(vm[1]);
      else if (ism) v = XENT(ism[1]);
      cells[col] = v;
    }
    rows.push(cells);
  }
  return rows;
}
const colLetters = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

// ── 날짜 정규화: "18.02.04" / "2018.02.04" / 엑셀 시리얼 → YYYY-MM-DD ────────
function normDate(s) {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (/^\d{5}$/.test(t)) {
    // 엑셀 시리얼(1900 기준)
    const d = new Date(Date.UTC(1899, 11, 30) + +t * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const m = /^(\d{2}|\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\.?$/.exec(t);
  if (!m) return null;
  let y = +m[1];
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2026) return null; // '27 등 오기록 → null(리포트 집계)
  return `${y}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`;
}
const SUBJECT_MAP = { 특허법: "patent", 실용신안법: "patent", 상표법: "trademark", 디자인보호법: "design" };
const CATEGORY_NORM = (s) => {
  const t = (s ?? "").trim().replace(/['\s]+$/g, "");
  if (["조문", "문제", "판례", "사례"].includes(t)) return t;
  return t ? t : null;
};

const entries = [];
const report = { files: [], enc: {}, badDate: 0, noAnswer: 0, noDate: 0, dup: 0, categoryRaw: {}, answerSig: {} };

function push(rec, sourceFile) {
  const subject = SUBJECT_MAP[(rec.subject ?? "").trim()] ?? null;
  const answer = (rec.answer ?? "").trim();
  const question = (rec.question ?? "").trim();
  if (!question && !answer) return; // 완전 빈 행
  const e = {
    subject,
    subjectRaw: (rec.subject ?? "").trim(),
    category: CATEGORY_NORM(rec.category),
    targetHint: (rec.targetHint ?? "").trim() || null,
    title: (rec.title ?? "").trim() || null,
    question,
    answer,
    followupQ: (rec.followupQ ?? "").trim() || null,
    followupA: (rec.followupA ?? "").trim() || null,
    askedAt: normDate(rec.date),
    dateRaw: (rec.date ?? "").trim() || null,
    sourceFile,
  };
  if (!e.askedAt && e.dateRaw) report.badDate++;
  if (!e.askedAt) report.noDate++;
  if (!answer) report.noAnswer++;
  report.categoryRaw[e.category ?? "(없음)"] = (report.categoryRaw[e.category ?? "(없음)"] || 0) + 1;
  // 답변 서명 집계 (원 답변자 추적)
  const sig = /^안녕하세요[?!.]?\s*([가-힣]{2,4})(?:입니다|\s*변리사)/.exec(answer);
  if (sig) report.answerSig[sig[1]] = (report.answerSig[sig[1]] || 0) + 1;
  entries.push(e);
}

// 특허 CSV
const patDir = resolve(SRC, "특허Q&A");
for (const f of readdirSync(patDir).filter((x) => x.endsWith(".csv")).sort()) {
  const { text, enc } = decodeSmart(readFileSync(resolve(patDir, f)));
  report.enc[f] = enc;
  const rows = parseCsv(text);
  const before = entries.length;
  for (const r of rows.slice(1)) {
    if (r.length < 6) continue;
    push(
      { subject: r[0], category: r[1], targetHint: r[2], title: r[3], question: r[4], answer: r[5], followupQ: r[6], followupA: r[7], date: r[8] },
      f,
    );
  }
  report.files.push(`${f} (${enc}): ${entries.length - before}`);
}
// xlsx 3개
const XLSX_FILES = [
  { path: resolve(patDir, "특허q&a_5장(87조~125조의2).xlsx"), cols: 9 },
  { path: resolve(SRC, "상표Q&A/상표법q&a.xlsx"), cols: 8 },
  { path: resolve(SRC, "디보Q&A/디자인보호법q&a.xlsx"), cols: 8 },
];
for (const { path, cols } of XLSX_FILES) {
  const rows = parseXlsx(path);
  const L = colLetters(cols);
  const before = entries.length;
  for (const cells of rows.slice(1)) {
    const v = L.map((c) => cells[c] ?? "");
    if (cols === 9)
      push({ subject: v[0], category: v[1], targetHint: v[2], title: v[3], question: v[4], answer: v[5], followupQ: v[6], followupA: v[7], date: v[8] }, basename(path));
    else
      push({ subject: v[0], category: v[1], title: v[2], question: v[3], answer: v[4], followupQ: v[5], followupA: v[6], date: v[7] }, basename(path));
  }
  report.files.push(`${basename(path)}: ${entries.length - before}`);
}

// 완전 중복 (질문+답변 동일)
const seen = new Map();
const unique = [];
for (const e of entries) {
  const key = `${e.subject}|${e.question}|${e.answer}`;
  if (seen.has(key)) { report.dup++; continue; }
  seen.set(key, 1);
  unique.push(e);
}

mkdirSync(resolve(ROOT, "source/_converted"), { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedAt: null, entries: unique }, null, 1));

// ── 리포트 ───────────────────────────────────────────────────────────────────
console.log("파일별 적재:");
report.files.forEach((x) => console.log("  " + x));
console.log(`\n총 ${entries.length}행 → 중복 제거 후 ${unique.length}건 (중복 ${report.dup})`);
const bySubject = {};
unique.forEach((e) => (bySubject[e.subject ?? e.subjectRaw] = (bySubject[e.subject ?? e.subjectRaw] || 0) + 1));
console.log("과목:", JSON.stringify(bySubject));
console.log("분류:", JSON.stringify(report.categoryRaw));
console.log(`답변 없음 ${report.noAnswer} / 날짜 없음 ${report.noDate} (형식불량 ${report.badDate})`);
const years = {};
unique.forEach((e) => { const y = e.askedAt?.slice(0, 4) ?? "없음"; years[y] = (years[y] || 0) + 1; });
console.log("연도:", JSON.stringify(years));
console.log("멀티턴(추가질문 有):", unique.filter((e) => e.followupQ).length);
console.log("targetHint 有:", unique.filter((e) => e.targetHint).length);
console.log("답변 서명 상위:", JSON.stringify(Object.fromEntries(Object.entries(report.answerSig).sort((a, b) => b[1] - a[1]).slice(0, 8))));
console.log(`\n✓ ${OUT}`);
