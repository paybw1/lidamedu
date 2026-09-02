// 기출이 인용한 조문의 **현행 원문**을 국가법령정보센터에서 받아 캐시한다.
//
// 자료집의 해설은 "검증 가능한 근거" 로 한정한다(법무부가 사례형 채점기준을 공개하지
// 않으므로 공식 해설이라는 것 자체가 없다). 그 근거의 뼈대가 조문 원문이다.
//
// ★search=1 필수 — 빼면 유사어 검색이라 정확 일치가 안 잡힌다(CLAUDE.md).
// ★현행법 기준이다 — 기출이라도 현행법으로 푼다는 원칙(essay-current-law-only)에 맞춘다.
//   조문이 개정돼 번호·내용이 달라졌으면 그 사실 자체가 자료집에 표시된다(미수록으로 남는다).
//
//   node scripts/bar-exam/fetch-cited-articles.mjs <기출텍스트디렉터리> <출력.json>
import fs from "node:fs";
import path from "node:path";

const OC = "test";
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** 문제 지문이 쓰는 법령 표기 → 정식 법령명. */
const LAW_ALIASES = [
  ["부정경쟁방지 및 영업비밀보호에 관한 법률", ["부정경쟁방지 및 영업비밀보호에 관한 법률", "부정경쟁방지법"]],
  ["디자인보호법", ["디자인보호법"]],
  ["실용신안법", ["실용신안법"]],
  ["저작권법", ["저작권법"]],
  ["상표법", ["상표법"]],
  ["특허법", ["특허법"]],
];

async function findLaw(name) {
  const url =
    `https://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=law&type=JSON` +
    `&display=100&search=1&query=${encodeURIComponent(name)}`;
  const json = await (await fetch(url)).json();
  const list = asArray(json?.LawSearch?.law).filter((x) => x.법령명한글 === name);
  return list.find((x) => x.현행연혁코드 === "현행") ?? list[0] ?? null;
}

function flattenArticle(a) {
  const lines = [String(a.조문내용 ?? "").trim()];
  for (const hang of asArray(a.항)) {
    const h = String(hang.항내용 ?? "").trim();
    if (h) lines.push(h);
    for (const ho of asArray(hang.호)) {
      const t = String(ho.호내용 ?? "").trim();
      if (t) lines.push(`  ${t}`);
      for (const mok of asArray(ho.목)) {
        const m = String(mok.목내용 ?? "").trim();
        if (m) lines.push(`    ${m}`);
      }
    }
  }
  return lines.filter(Boolean).join("\n");
}

const articleKey = (a) => {
  const main = String(a.조문번호 ?? "").trim();
  const branch = String(a.조문가지번호 ?? "").trim();
  return branch && branch !== "0" ? `${main}의${branch}` : main;
};

async function loadLaw(name) {
  const hit = await findLaw(name);
  if (!hit) throw new Error(`${name} — 법령 검색 실패`);
  const detail = await (
    await fetch(
      `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=law&type=JSON&MST=${hit.법령일련번호}`,
    )
  ).json();
  const units = asArray(detail?.법령?.조문?.조문단위).filter((a) => a.조문여부 === "조문");
  const map = {};
  for (const u of units) map[articleKey(u)] = flattenArticle(u);
  console.log(`  ✓ ${name.padEnd(34)} 조문 ${String(units.length).padStart(4)}개 · 시행 ${hit.시행일자}`);
  return { enforcedAt: String(hit.시행일자), articles: map };
}

/**
 * 회차 본문에서 (법령, 조문번호) 쌍을 뽑는다.
 * ★조문번호만으로는 어느 법인지 알 수 없다 — 직전에 나온 법령명에 귀속시킨다.
 *   ("｢저작권법｣ 제28조와 제35조의5를 중심으로" → 둘 다 저작권법)
 */
export function citationsOf(text) {
  const lawRe = new RegExp(LAW_ALIASES.flatMap(([, al]) => al).join("|"), "g");
  const marks = [...text.matchAll(lawRe)].map((m) => {
    const canon = LAW_ALIASES.find(([, al]) => al.includes(m[0]))[0];
    return { at: m.index, law: canon };
  });
  const out = new Map();
  // ★가지번호(의N)는 **붙여 쓴 것만** 인정한다. "제5조의 2차적 저작물" 처럼 뒤 낱말이
  //   숫자로 시작하면 "제5조의2" 로 잘못 읽는다(10회 실제 오탐).
  for (const m of text.matchAll(/제\s*(\d+)\s*조(?:의(\d+))?/g)) {
    const prior = marks.filter((x) => x.at < m.index).pop();
    if (!prior) continue; // 법령명이 앞에 없으면 어느 법인지 단정하지 않는다
    const num = m[2] ? `${m[1]}의${m[2]}` : m[1];
    const key = `${prior.law}|${num}`;
    if (!out.has(key)) out.set(key, { law: prior.law, article: num });
  }
  return [...out.values()];
}

const [, , inDir, outFile] = process.argv;
if (!inDir || !outFile) {
  console.error("사용: node scripts/bar-exam/fetch-cited-articles.mjs <기출텍스트디렉터리> <출력.json>");
  process.exit(1);
}

// ── 회차별 인용 수집 ────────────────────────────────────────────────────
const byRound = {};
const needed = new Map();
for (const f of fs.readdirSync(inDir).filter((f) => /^\d+\.txt$/.test(f)).sort()) {
  const round = Number(f.replace(".txt", ""));
  const cites = citationsOf(fs.readFileSync(path.join(inDir, f), "utf8"));
  byRound[round] = cites;
  for (const c of cites) {
    if (!needed.has(c.law)) needed.set(c.law, new Set());
    needed.get(c.law).add(c.article);
  }
}
console.log("인용 법령:", [...needed].map(([l, s]) => `${l}(${s.size})`).join(" · "), "\n");

// ── 법령 본문 수집 ──────────────────────────────────────────────────────
const laws = {};
for (const name of needed.keys()) {
  try {
    laws[name] = await loadLaw(name);
  } catch (e) {
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

// ── 인용분만 추려 저장 ──────────────────────────────────────────────────
const resolved = {};
let hit = 0;
let miss = 0;
for (const [law, set] of needed) {
  resolved[law] = { enforcedAt: laws[law]?.enforcedAt ?? null, articles: {} };
  for (const num of [...set].sort((a, b) => parseFloat(a) - parseFloat(b))) {
    const body = laws[law]?.articles?.[num];
    if (body) {
      resolved[law].articles[num] = body;
      hit += 1;
    } else {
      miss += 1;
      console.log(`  · 미수록: ${law} 제${num}조 (현행법에 없음 — 개정·삭제 가능)`);
    }
  }
}
fs.writeFileSync(outFile, JSON.stringify({ byRound, laws: resolved }, null, 2), "utf8");
console.log(`\n조문 원문 확보 ${hit}건 · 미수록 ${miss}건 → ${outFile}`);
