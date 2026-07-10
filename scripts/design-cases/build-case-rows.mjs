// 디자인 판례 카드 분해(Stage 2b) — 카드(글리프 시작 ~ 다음 글리프/관련판례/주제 경계)로 묶어
//   {issue, body, court, decidedAt, caseNo} 산출. 인용 순서 2형식 모두 처리.
import { readFileSync, writeFileSync } from "node:fs";

const j = JSON.parse(readFileSync("tmp/design-cases/cases.extracted.json", "utf8"));
const paras = (j.paragraphs || j).map((p) => (p.text || "").replace(/\r/g, ""));

const COURT = { 대법원: "supreme", 특허법원: "patent_court", 고등법원: "high_court", 지방법원: "district_court", 헌법재판소: "supreme" };
const isCardStart = (p) => { const c = p.trimStart().codePointAt(0); return c != null && (c > 0xffff || "◈▣◆".includes(String.fromCodePoint(c))); };
const isTopicTable = (p) => /^\|\s*\d{1,2}\s+\d{1,2}\s*\|/.test(p);
const isRelated = (p) => /^\[관련판례\]/.test(p.trim());
const stripGlyph = (p) => p.replace(/^\s*[^\[가-힣]*/u, "").trim();

// 사건번호 접미(한글)로 법원 추정 — 허=특허법원, 그 외(후/다/도/므/재/카)=대법원 등.
const courtByNo = (no) => (/[0-9]+허[0-9]/.test(no) ? "patent_court" : "supreme");
// 인용 파싱 — (A) 법원 날짜 선고 번호  (B) 법원 번호 …, 날짜  (C) 법원 날짜.자 번호(결정)
//   (D) 폴백: 괄호 안 맨 뒤 사건번호만(법원·날짜 없음) → 법원 추정·날짜 null(Stage3 API 보완).
function parseCite(text) {
  const courtRe = "(대법원|특허법원|고등법원|지방법원|헌법재판소)";
  const dateRe = "(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})";
  const noRe = "([0-9]{2,4}[가-힣]{1,3}[0-9]{1,6})";
  const mk = (court, y, mo, d, no) => ({ court: COURT[court], date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, caseNo: no });
  const hits = [];
  let x;
  let m = new RegExp(`${courtRe}\\s*${dateRe}\\.?\\s*(?:선고|자)\\s*${noRe}`, "g"); // A+C(선고/자)
  while ((x = m.exec(text))) hits.push(mk(x[1], x[2], x[3], x[4], x[5]));
  let m2 = new RegExp(`${courtRe}\\s*${noRe}\\s*(?:판결|결정)?[,\\s]*${dateRe}`, "g"); // B
  while ((x = m2.exec(text))) if (!hits.some((h) => h.caseNo === x[2])) hits.push(mk(x[1], x[3], x[4], x[5], x[2]));
  if (hits.length === 0) {
    // D 폴백 — 괄호 안 사건번호(들). 날짜 미상 → null.
    const bare = [...new Set((text.match(new RegExp(noRe, "g")) || []))];
    for (const no of bare) hits.push({ court: courtByNo(no), date: null, caseNo: no });
  }
  return hits;
}

// 주제 표 위치
const topicIdx = [];
paras.forEach((p, i) => { if (isTopicTable(p)) topicIdx.push(i); });

const cards = [];
for (let t = 0; t < topicIdx.length; t++) {
  const start = topicIdx[t] + 1;
  const end = t + 1 < topicIdx.length ? topicIdx[t + 1] : paras.length;
  const topicNum = t + 1;
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const cites = parseCite(cur.text);
    // 관련판례 라인이 사건번호 0개면 = 다음 주제 헤더 등 오검출 → 버림.
    if (cur.related && cites.length === 0) { cur = null; return; }
    const prim = cites[cites.length - 1] ?? null;
    cards.push({ topicNum, kind: cur.related ? "related" : "main", issue: cur.related ? null : (/^\s*\[([^\]]+)\]/.exec(stripGlyph(cur.text))?.[1] ?? null), body: cur.text.trim(), court: prim?.court ?? null, decidedAt: prim?.date ?? null, caseNo: prim?.caseNo ?? null, needsDate: prim ? prim.date === null : true, allCaseNos: [...new Set(cites.map((c) => c.caseNo))] });
    cur = null;
  };
  let related = false;
  for (let i = start; i < end; i++) {
    const p = paras[i]; const pt = p.trim();
    if (!pt || isTopicTable(p) || /^\|/.test(pt)) continue;
    if (isRelated(p)) { flush(); related = true; continue; }
    if (isCardStart(p)) { flush(); cur = { text: p, related: false }; related = false; continue; }
    if (related) { // 관련판례 인용 라인(글리프 없음)
      flush(); cur = { text: p, related: true }; flush(); continue;
    }
    if (cur) cur.text += "\n" + p; // 본문 이어붙임
  }
  flush();
}

const mains = cards.filter((c) => c.kind === "main");
const rels = cards.filter((c) => c.kind === "related");
const noCaseNo = cards.filter((c) => !c.caseNo);
writeFileSync("tmp/design-cases/cards.json", JSON.stringify({ cards }, null, 1));
console.log(`카드 ${cards.length} = 본문 ${mains.length} + 관련 ${rels.length} | 사건번호 없음 ${noCaseNo.length}`);
console.log("고유 사건번호:", new Set(cards.flatMap((c) => c.allCaseNos)).size);
console.log("\n=== 사건번호 미검출 카드(본문) ===");
noCaseNo.filter((c) => c.kind === "main").forEach((c) => console.log(`  주제${c.topicNum} [${c.issue ?? "?"}] ${c.body.slice(0, 70).replace(/\n/g, " ")}`));
console.log("\n=== 본문 카드 샘플(주제1·4) ===");
for (const c of mains.filter((c) => c.topicNum === 1 || c.topicNum === 4).slice(0, 6)) console.log(`  주제${c.topicNum} | ${c.caseNo} ${c.court} ${c.decidedAt} | [${c.issue?.slice(0, 40)}] (${c.body.length}자)`);
