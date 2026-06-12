// 민법(civil) 1차 기출 문제 파서 v2.
//   입력: source/기출모음(2010~2026)/1차/문제/{year}_{round}_1_민법{A|B}.hwpx (17개년)
//   출력: source/_converted/civil-problems-parsed.json
//
// 포맷 변이 처리:
//   - 문제 헤더: `^(\d{1,2})[.,)] {stem}` (마침표/쉼표 변이, 1~40 순차+재동기화)
//   - 선지 마커: ①②③④⑤ / ➀➁➂➃➄(딩벳) / ❶❷❸❹❺ 모두 인식
//   - 마커리스 선지(2021 일부): 마커 없는 평문 — 블록 끝 5문단을 선지로
//   - 보기 박스: kind:"table" 또는 ㄱ/ㄴ/ㄷ 개별문단 → stem 에 부착
//   - 중복 문단(2016 hwpx 산출 quirk) dedup
//
// seed 호환 출력: {lawCode:"civil", year, round, problemNumber, stem, choices:[{index,body}], scope}
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROB_DIR = resolve(ROOT, "source/기출모음(2010~2026)/1차/문제");
const TMP = resolve(ROOT, "source/_converted/.civil-extract");
const OUT = resolve(ROOT, "source/_converted/civil-problems-parsed.json");
mkdirSync(TMP, { recursive: true });

const MARK = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "➀": 1, "➁": 2, "➂": 3, "➃": 4, "➄": 5, "❶": 1, "❷": 2, "❸": 3, "❹": 4, "❺": 5, "ⓐ": 1, "ⓑ": 2, "ⓒ": 3, "ⓓ": 4, "ⓔ": 5 };
const MCLS = "①②③④⑤➀➁➂➃➄❶❷❸❹❺ⓐⓑⓒⓓⓔ";
const RE_HEADER = /^(\d{1,2})\s*[.,)]\s*(\S.*)$/;
const RE_MARK_START = new RegExp(`^[${MCLS}]`);
const RE_MARK_ANY = new RegExp(`[${MCLS}]`);
const RE_MARK_SPLIT = new RegExp(`(?=[${MCLS}])`);
const RE_MARK_ONE = new RegExp(`^([${MCLS}])\\s*(.*)$`);
const RE_BOGI_ITEM = /^[ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊ]\.\s/;

function formatBox(tableMd) {
  const firstRow = (tableMd ?? "").split("\n")[0] ?? "";
  const cell = firstRow.replace(/^\|\s*/, "").replace(/\s*\|\s*$/, "").trim();
  const parts = cell.split(/\s+(?=(?:[ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊ]|[㉠㉡㉢㉣㉤])\.?\s)/);
  return parts.length >= 2 ? parts.map((s) => s.trim()).join("\n") : cell;
}

function parseFile(paragraphs, year, round) {
  // dedup 연속 동일 문단
  const paras = [];
  for (const p of paragraphs) {
    const t = (p.text ?? "").trim();
    const prev = paras[paras.length - 1];
    if (p.kind !== "table" && prev && prev.kind !== "table" && (prev.text ?? "").trim() === t && t) continue;
    paras.push(p);
  }
  // 헤더 인덱스 수집(순차+재동기화)
  const heads = [];
  let last = 0;
  for (let i = 0; i < paras.length; i++) {
    if (paras[i].kind === "table") continue;
    const t = (paras[i].text ?? "").trim();
    if (!t || RE_MARK_START.test(t)) continue;
    const m = RE_HEADER.exec(t);
    if (!m) continue;
    const num = Number(m[1]);
    if (num === last + 1 || (num > last && num <= last + 3 && num <= 40)) {
      heads.push({ idx: i, num, stemFirst: m[2].trim() });
      last = num;
    }
  }
  const out = [];
  for (let h = 0; h < heads.length; h++) {
    const start = heads[h].idx;
    const end = h + 1 < heads.length ? heads[h + 1].idx : paras.length;
    const cur = { lawCode: "civil", year, round, origin: "past_exam", problemNumber: heads[h].num, stem: heads[h].stemFirst, box: null, choices: [], scope: "past_exam" };
    const rest = paras.slice(start + 1, end);
    const hasMarks = rest.some((p) => p.kind !== "table" && RE_MARK_ANY.test(p.text ?? ""));
    if (hasMarks) {
      for (const p of rest) {
        if (p.kind === "table") { if (cur.choices.length === 0) cur.box = (cur.box ? cur.box + "\n" : "") + formatBox(p.text); continue; }
        const t = (p.text ?? "").trim();
        if (!t) continue;
        if (RE_MARK_ANY.test(t)) {
          const parts = t.split(RE_MARK_SPLIT).filter((s) => s.trim());
          let added = 0;
          for (const part of parts) {
            const mm = RE_MARK_ONE.exec(part.trim());
            if (mm) { cur.choices.push({ index: MARK[mm[1]], body: mm[2].trim() }); added++; }
          }
          if (added > 0) continue;
        }
        if (cur.choices.length === 0) cur.stem += " " + t;
        else cur.choices[cur.choices.length - 1].body += " " + t;
      }
    } else {
      // 마커리스: 표는 보기, 평문 마지막 5개를 선지로
      const plains = [];
      for (const p of rest) {
        if (p.kind === "table") { cur.box = (cur.box ? cur.box + "\n" : "") + formatBox(p.text); continue; }
        const t = (p.text ?? "").trim();
        if (t) plains.push(t);
      }
      if (plains.length >= 5) {
        const choices = plains.slice(plains.length - 5);
        for (const s of plains.slice(0, plains.length - 5)) cur.stem += " " + s;
        choices.forEach((b, k) => cur.choices.push({ index: k + 1, body: b }));
      } else {
        for (const s of plains) cur.stem += " " + s;
      }
    }
    if (cur.box) cur.stem = `${cur.stem}\n\n${cur.box}`;
    delete cur.box;
    // 공백만 정리(줄바꿈 보존) + 보기 항목(ㄱ. ㄴ. …)을 줄바꿈으로 분리
    cur.stem = cur.stem
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/ (?=[ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊ]\.\s)/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    cur.choices.forEach((c) => { c.body = c.body.replace(/[ \t]+/g, " ").trim(); });
    if (cur.stem && cur.choices.length >= 2) out.push(cur);
  }
  return out;
}

// 마커리스+번호누락(2단컬럼 추출 등) 폴백: 발문(?종결)+선지5 단위로 그룹 분할.
//   헤더 번호가 있으면 재동기화, 없으면 직전 문제가 선지 5개를 채우면 새 문제 시작.
function parseGroups(paragraphs, year, round) {
  const paras = [];
  for (const p of paragraphs) {
    const t = (p.text ?? "").trim();
    const prev = paras[paras.length - 1];
    if (p.kind !== "table" && prev && prev.kind !== "table" && (prev.text ?? "").trim() === t && t) continue;
    paras.push(p);
  }
  const stemDone = (s) => /[?？]/.test(s ?? "");
  const out = [];
  let cur = null, num = 0;
  const flush = () => {
    if (cur) {
      if (cur.box) cur.stem = `${cur.stem}\n\n${cur.box}`;
      delete cur.box;
      cur.stem = cur.stem.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/ (?=[ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊ]\.\s)/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      cur.choices.forEach((c) => { c.body = c.body.replace(/[ \t]+/g, " ").trim(); });
      if (cur.stem && cur.choices.length >= 2) out.push(cur);
    }
    cur = null;
  };
  const start = (n, stem) => { cur = { lawCode: "civil", year, round, origin: "past_exam", problemNumber: n, stem, box: null, choices: [], scope: "past_exam" }; };
  for (const p of paras) {
    if (p.kind === "table") { if (cur && cur.choices.length === 0) cur.box = (cur.box ? cur.box + "\n" : "") + formatBox(p.text); continue; }
    const t = (p.text ?? "").trim();
    if (!t) continue;
    const mh = RE_HEADER.exec(t);
    if (mh && !RE_MARK_START.test(t) && Number(mh[1]) <= 40 && (Number(mh[1]) === num + 1 || Number(mh[1]) > num)) {
      flush(); num = Number(mh[1]); start(num, mh[2].trim()); continue;
    }
    if (!cur) continue;
    if (cur.choices.length >= 5) { flush(); num += 1; start(num, t); continue; }
    if (cur.choices.length === 0 && !stemDone(cur.stem) && !RE_MARK_ANY.test(t)) { cur.stem += " " + t; continue; }
    if (RE_MARK_ANY.test(t)) {
      const parts = t.split(RE_MARK_SPLIT).filter((s) => s.trim());
      let added = 0;
      for (const part of parts) { const mm = RE_MARK_ONE.exec(part.trim()); if (mm) { cur.choices.push({ index: MARK[mm[1]], body: mm[2].trim() }); added++; } }
      if (added > 0) continue;
    }
    cur.choices.push({ index: cur.choices.length + 1, body: t });
  }
  flush();
  return out;
}

const files = readdirSync(PROB_DIR).filter((f) => /_1_민법[AB]?\.hwpx$/i.test(f)).sort();
const all = [];
const perYear = {};
for (const f of files) {
  const m = f.match(/^(\d{4})_(\d+)_1_민법/);
  if (!m) continue;
  const year = Number(m[1]);
  const round = Number(m[2]);
  const tmpJson = resolve(TMP, `${year}.json`);
  execFileSync("node", [resolve(ROOT, "scripts/hwpx-to-text.mjs"), resolve(PROB_DIR, f), "-o", tmpJson], { stdio: "ignore" });
  const { paragraphs } = JSON.parse(readFileSync(tmpJson, "utf8"));
  let probs = parseFile(paragraphs, year, round);
  // 헤더 누락 많은 연도(2단컬럼/번호누락) → 그룹 폴백
  if (probs.length < 35) {
    const grouped = parseGroups(paragraphs, year, round);
    if (grouped.length > probs.length) probs = grouped;
  }
  all.push(...probs);
  perYear[year] = probs.length;
}

const stats = { total: all.length, perYear, choiceDist: {}, withFive: 0, notFive: 0 };
for (const p of all) {
  stats.choiceDist[p.choices.length] = (stats.choiceDist[p.choices.length] ?? 0) + 1;
  if (p.choices.length === 5) stats.withFive++; else stats.notFive++;
}
writeFileSync(OUT, JSON.stringify({ problems: all, stats }, null, 2), "utf8");
console.log(`✓ ${OUT}`);
console.log(`  total=${stats.total} withFive=${stats.withFive} notFive=${stats.notFive}`);
console.log(`  choiceDist=${JSON.stringify(stats.choiceDist)}`);
console.log(`  perYear=${JSON.stringify(stats.perYear)}`);
