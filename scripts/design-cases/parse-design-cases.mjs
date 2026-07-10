// 디자인 판례 파싱(Stage 1, dry-run) — hwpx-to-text 출력 JSON → 주제 16 + 판례 구조화.
//   주제 헤더 = 표 문단 `| N N |\n| --- |\n| 제목(체계도노드(法 조)) |`.
//   판례 = 글리프(󰋮)로 시작하는 문단(쟁점[..]+본문+인용). [관련판례]=인용만(전문 API 대상).
// 사용: node scripts/design-cases/parse-design-cases.mjs <extracted.json>
import { readFileSync, writeFileSync } from "node:fs";

const jsonPath = process.argv[2] ?? "tmp/design-cases/cases.extracted.json";
const j = JSON.parse(readFileSync(jsonPath, "utf8"));
const paras = (j.paragraphs || j).map((p) => (p.text || "").replace(/\r/g, ""));

const GLYPH = "\u{DB80}\u{DDEE}"; // 판례 시작 글리프(surrogate). 실제 매칭은 아래 정규식으로.
// 사건 인용: (대법원 YYYY. M. D. 선고 NNNN후NNNN 판결 [사건명]) — 법원/날짜/사건번호 추출.
const CITE_RE =
  /(대법원|특허법원|고등법원|지방법원|헌법재판소)\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(?:선고)?\s*([0-9]{2,4}[가-힣]{1,3}[0-9]{1,6}(?:,\s*[0-9]{2,4}[가-힣]{1,3}[0-9]{1,6})*)\s*(?:판결|결정|전원합의체)?/g;
const CASE_NO_RE = /[0-9]{2,4}[가-힣]{1,3}[0-9]{1,6}/g;
const isCaseLine = (p) => /^[-￿\u{F0000}-\u{FFFFD}]/u.test(p) || /^[󰋮◈▣◆]/.test(p);

// 1) 주제 표 문단 인덱스 수집
const topics = [];
for (let i = 0; i < paras.length; i++) {
  const m = /^\|\s*(\d{1,2})\s+\1\s*\|\s*\n\|\s*-+\s*\|\s*\n\|\s*(.+?)\s*\|\s*$/.exec(paras[i]);
  if (m) {
    const num = Number(m[1]);
    const content = m[2].trim();
    // 제목(노드명) — 첫 "(" 에서 분리, 마지막 ")" 제거.
    const pi = content.indexOf("(");
    const title = pi >= 0 ? content.slice(0, pi).trim() : content;
    const nodeRaw = pi >= 0 ? content.slice(pi + 1).replace(/\)\s*$/, "").trim() : "";
    // 노드명에서 (法 …) 제거한 순수 라벨(체계도 매칭용)
    const nodeLabel = nodeRaw.replace(/\s*\(?法[^)]*\)?\s*$/, "").trim();
    topics.push({ num, title, nodeRaw, nodeLabel, paraIndex: i, cases: [] });
  }
}

// 2) 각 주제 구간(다음 주제 표 전까지) 판례 수집
for (let t = 0; t < topics.length; t++) {
  const start = topics[t].paraIndex + 1;
  const end = t + 1 < topics.length ? topics[t + 1].paraIndex : paras.length;
  let relatedMode = false;
  for (let i = start; i < end; i++) {
    const p = paras[i].trim();
    if (!p || /^\|/.test(p) || /^\d{1,2}\D/.test(paras[i]) === false && /^\d{1,2}$/.test(p)) {
      // skip empty / stray table / lone number
    }
    if (/^\[관련판례\]/.test(p)) { relatedMode = true; continue; }
    if (isCaseLine(p)) {
      relatedMode = false;
      // 쟁점 = 첫 [..], 본문 = 나머지
      const body = p.replace(/^[^\[]*/, ""); // 글리프 제거
      const issueM = /^\[([^\]]+)\]/.exec(body);
      const cites = [];
      let cm;
      CITE_RE.lastIndex = 0;
      while ((cm = CITE_RE.exec(p))) {
        for (const cn of cm[5].split(/,\s*/)) cites.push({ court: cm[1], date: `${cm[2]}-${String(cm[3]).padStart(2,"0")}-${String(cm[4]).padStart(2,"0")}`, caseNo: cn });
      }
      topics[t].cases.push({ kind: "main", issue: issueM ? issueM[1] : null, bodyLen: p.length, caseNos: [...new Set((p.match(CASE_NO_RE)||[]))], primaryCite: cites[cites.length-1] ?? null });
    } else if (relatedMode || /^\(.*\)\s*(대법원|특허법원)/.test(p) || CASE_NO_RE.test(p)) {
      // 관련판례 인용 라인
      const nick = /^\(([^)]+)\)/.exec(p);
      const cites = []; let cm; CITE_RE.lastIndex = 0;
      while ((cm = CITE_RE.exec(p))) for (const cn of cm[5].split(/,\s*/)) cites.push({ court: cm[1], date: `${cm[2]}-${String(cm[3]).padStart(2,"0")}-${String(cm[4]).padStart(2,"0")}`, caseNo: cn });
      if (cites.length) topics[t].cases.push({ kind: "related", nickname: nick?nick[1]:null, caseNos: cites.map(c=>c.caseNo), primaryCite: cites[0] });
    }
  }
}

const allCaseNos = new Set();
for (const t of topics) for (const c of t.cases) for (const cn of c.caseNos) allCaseNos.add(cn);

writeFileSync("tmp/design-cases/parsed.json", JSON.stringify({ topics }, null, 1));
console.log(`주제 ${topics.length}개 · 총 판례 항목 ${topics.reduce((s,t)=>s+t.cases.length,0)} · 고유 사건번호 ${allCaseNos.size}\n`);
for (const t of topics) {
  const main = t.cases.filter(c=>c.kind==="main").length, rel = t.cases.filter(c=>c.kind==="related").length;
  console.log(`주제 ${t.num} ${t.title}`);
  console.log(`   → 체계도: "${t.nodeLabel}"  (원문: ${t.nodeRaw})`);
  console.log(`   판례: 본문 ${main} + 관련 ${rel}`);
}
