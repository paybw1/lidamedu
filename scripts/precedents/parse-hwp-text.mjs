// 리담특허법 판례 [제9판] HWP 텍스트 → JSON 파서.
// 입력: HWP 를 Hancom COM 으로 TEXT 저장 + iconv CP949→UTF-8 한 파일.
// 출력: 판례 객체 배열 JSON.
//
// 규칙 (사용자 정의):
//   - 사건번호 줄 위에 등장한 "기출 YYYY" = 1차 시험 기출
//   - 사건번호 줄 아래에 등장한 "기출 YYYY" = 2차 시험 기출
//   - 사건번호 줄: "{seq} {법원} {YYYY. M. D.} 선고 {사건번호} 판결|결정 【사건유형】"
//   - 요지: 사건번호 다음 본문. "제목: 내용" 또는 [N] 마커.
//   - 비고: "비고" 라인 이후의 ▪(&#9642;) 단락들.
//   - 판시이유: "판시이유" 라인 이후의 ▪ 단락들.
//   - 섹션 헤더: "^제N절 ...", "^제N장$", "^제N편$" — 본문 영역에서만 추적.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const RE_EXAM = /^기출\s+(\d{4})\s*$/;
const RE_SECTION = /^(제\d+(?:절|장|편)\b.*?)\s*(?:\d+)?\s*$/;
const RE_CASE_HEAD = new RegExp(
  String.raw`^(?<seq>\d+)\s+` +
  String.raw`(?<court>대법원|특허법원|헌법재판소|서울고등법원|서울중앙지방법원|` +
  String.raw`서울행정법원|광주고등법원|부산고등법원|대구고등법원|대전고등법원)\s+` +
  String.raw`(?<y>\d{4})\.\s*(?<m>\d{1,2})\.\s*(?<d>\d{1,2})\.\s*` +
  String.raw`(?:선고|자)?\s*` +
  String.raw`(?<caseNo>\d{2,4}[가-힣]+\d+(?:,\s*\d{2,4}[가-힣]+\d+)*)\s*` +
  String.raw`(?:판결|결정|심결|선고)?` +
  String.raw`\s*【(?<caseType>[^】]+)】`,
);
const RE_BLOCK_ITEM = /^\[\s*(\d+)\s*\]\s*(.*)$/;
const LOZENGE_ENTITY = "&#9642;";
const LOZENGE_GLYPH = "▪";

function normalize(line) {
  return line.replace(LOZENGE_ENTITY, LOZENGE_GLYPH).trim();
}

function splitTitleBody(text) {
  // 첫 콜론으로 제목/내용 분리. 너무 늦은 콜론은 본문 — 200 char 제한.
  for (const sep of [": ", " : "]) {
    const idx = text.indexOf(sep);
    if (idx !== -1 && idx < 200) {
      return [text.slice(0, idx).trim(), text.slice(idx + sep.length).trim()];
    }
  }
  const idx = text.indexOf(":");
  if (idx > 0 && idx < 200) {
    return [text.slice(0, idx).trim(), text.slice(idx + 1).trim()];
  }
  return [null, text];
}

export function parse(lines) {
  const out = [];
  let bodyStarted = false;
  let currentPart = null;
  let currentChapter = null;
  let currentSection = null;
  let preExamYears = [];

  let cur = null;
  let mode = null; // summary | reasoning | note | null
  let paraBuf = [];
  let curBlockTitle = null;
  let blankCount = 0;
  // 직전(이전 비-빈 라인 처리 직전) 의 빈 줄 누적값 — 기출 분류 휴리스틱용.
  let lastBlankCount = 0;

  function flush() {
    if (!paraBuf.length || cur == null) {
      paraBuf = [];
      return;
    }
    const text = paraBuf.join(" ").trim();
    paraBuf = [];
    if (!text) return;
    if (mode === "summary") {
      if (curBlockTitle != null) {
        const [title, body] = splitTitleBody(text);
        if (title == null) {
          cur.summaryItems.push({ title: `[${curBlockTitle}]`, body: text });
        } else {
          cur.summaryItems.push({
            title: `[${curBlockTitle}] ${title}`,
            body,
          });
        }
        curBlockTitle = null;
      } else {
        const [title, body] = splitTitleBody(text);
        if (title == null) {
          if (cur.summaryItems.length) {
            const last = cur.summaryItems[cur.summaryItems.length - 1];
            last.body = (last.body + "\n\n" + text).trim();
          } else {
            cur.summaryItems.push({ title: "", body: text });
          }
        } else {
          cur.summaryItems.push({ title, body });
        }
      }
    } else if (mode === "reasoning") {
      cur.reasoningMd = cur.reasoningMd
        ? cur.reasoningMd + "\n\n" + text
        : text;
    } else if (mode === "note") {
      cur.noteMd = cur.noteMd ? cur.noteMd + "\n\n" + text : text;
    }
  }

  function closeCurrent() {
    if (cur != null) flush();
    cur = null;
    mode = null;
    paraBuf = [];
    curBlockTitle = null;
  }

  for (const raw of lines) {
    const s = normalize(raw);

    if (!s) {
      blankCount += 1;
      continue;
    }
    lastBlankCount = blankCount;
    blankCount = 0;

    // 섹션 헤더 (본문 모드)
    const mSec = s.match(RE_SECTION);
    if (mSec) {
      const head = mSec[1].trim();
      if (head.startsWith("제") && /절/.test(head.slice(0, 6))) {
        closeCurrent();
        currentSection = head;
        continue;
      }
      if (
        head.startsWith("제") &&
        /장/.test(head.slice(0, 6)) &&
        !/\s/.test(head)
      ) {
        closeCurrent();
        currentChapter = head;
        currentSection = null;
        continue;
      }
      if (
        head.startsWith("제") &&
        /편/.test(head.slice(0, 6)) &&
        !/\s/.test(head)
      ) {
        closeCurrent();
        currentPart = head;
        currentChapter = null;
        currentSection = null;
        continue;
      }
    }

    const mExam = s.match(RE_EXAM);
    if (mExam) {
      const year = Number(mExam[1]);
      // 직전 빈 줄이 2개 이상이면 case 종료 신호로 보고 다음 case 의 pre 로 분류.
      // 같은 case 안에서 "비고"/"판시이유" 단락 사이 빈 줄은 보통 1개라 가짜 트리거 위험 낮음.
      if (cur != null && lastBlankCount >= 2) closeCurrent();
      if (cur == null) preExamYears.push(year);
      else cur.exam2ndYears.push(year);
      continue;
    }

    const mCase = s.match(RE_CASE_HEAD);
    if (mCase) {
      closeCurrent();
      const { seq, court, y, m, d, caseNo, caseType } = mCase.groups;
      cur = {
        seqInSection: Number(seq),
        court,
        decisionDate: `${y}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`,
        caseNumber: caseNo.split(",")[0].trim(),
        caseType: caseType.trim(),
        sectionPath: [currentPart, currentChapter, currentSection].filter(Boolean),
        bookPart: currentPart,
        chapter: currentChapter,
        section: currentSection,
        summaryItems: [],
        reasoningMd: null,
        noteMd: null,
        exam1stYears: preExamYears.slice(),
        exam2ndYears: [],
      };
      preExamYears = [];
      mode = "summary";
      out.push(cur);
      continue;
    }

    if (cur != null) {
      if (s === "비고") {
        flush();
        mode = "note";
        continue;
      }
      if (s === "판시이유") {
        flush();
        mode = "reasoning";
        continue;
      }
      const mBlock = s.match(RE_BLOCK_ITEM);
      if (mBlock && mode === "summary") {
        flush();
        curBlockTitle = mBlock[1];
        const rest = mBlock[2].trim();
        if (rest) paraBuf.push(rest);
        continue;
      }

      if (s.startsWith(LOZENGE_GLYPH)) {
        flush();
        const stripped = s.slice(LOZENGE_GLYPH.length).trimStart();
        if (stripped) paraBuf.push(stripped);
        continue;
      }
      paraBuf.push(s);
    }
  }

  closeCurrent();
  return out;
}

function main() {
  const src = resolve(
    process.argv[2] ?? "source/_converted/precedents_raw.txt",
  );
  const dst = resolve(
    process.argv[3] ?? "source/_converted/precedents.json",
  );

  const text = readFileSync(src, "utf-8");
  const lines = text.split(/\r?\n/);
  const parsed = parse(lines);

  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, JSON.stringify(parsed, null, 2), "utf-8");

  console.log(`parsed ${parsed.length} precedents → ${dst}`);

  const byCourt = {};
  let withReason = 0,
    withNote = 0,
    withExam1 = 0,
    withExam2 = 0,
    multiSummary = 0,
    noSummary = 0;
  for (const p of parsed) {
    byCourt[p.court] = (byCourt[p.court] ?? 0) + 1;
    if (p.reasoningMd) withReason++;
    if (p.noteMd) withNote++;
    if (p.exam1stYears.length) withExam1++;
    if (p.exam2ndYears.length) withExam2++;
    if (p.summaryItems.length >= 2) multiSummary++;
    if (p.summaryItems.length === 0) noSummary++;
  }
  console.log("by court:", byCourt);
  console.log(
    `with reasoning: ${withReason}, with note: ${withNote}`,
  );
  console.log(
    `with 1st exam: ${withExam1}, with 2nd exam: ${withExam2}`,
  );
  console.log(
    `multi summary: ${multiSummary}, no summary: ${noSummary}`,
  );
}

main();
