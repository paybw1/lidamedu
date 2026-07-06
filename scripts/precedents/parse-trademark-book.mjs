// 리담상표법 판례 [제16판] hwpx → tm-precedents.json
//
//   node scripts/precedents/parse-trademark-book.mjs
//
// 문서 규약 (분석 결과):
//   - 주제: paraPrIDRef=27, "…주제N제목(부모체계도라벨(法 refs))" (러닝헤더가 앞에 붙음)
//   - 판례 헤더: "(닉네임) 법원 YYYY. M. D. 선고|자 사건번호 [전원합의체] 판결|결정 [사건명](확정)?"
//     — 같은 텍스트가 연속 2회(개요선+본문) 등장 → dedup
//   - 도표: hp:tbl (구분/등록·출원상표/지정상품/출원일·등록일/권리자) — 상표 도형 이미지 포함
//   - 섹션: [사안의 쟁점] [사실관계] [원심의 판단] [특허법원의 판단] [관련 법리] [대법원의 판단] [Index]
//   - 평석: "ㅇㅌㅍ" 마커 이후 다음 판례/주제 전까지
//
// 출력: source/_converted/tm-precedents.json
//   { publication, topics: [{no,title,parentLabel,parentRef,cases:[…]}], stats }

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const HWPX = resolve(ROOT, "source/상표업로드/판례.hwpx");
const OUT = resolve(ROOT, "source/_converted/tm-precedents.json");

// ── XML 로드 ──
const zip = new AdmZip(HWPX);
const xml = zip.getEntry("Contents/section0.xml").getData().toString("utf8");
const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: "@_",
  trimValues: false,
});
const tree = parser.parse(xml);

const childrenOf = (node) => {
  const keys = Object.keys(node).filter((k) => k !== ":@");
  if (keys.length !== 1) return [];
  const v = node[keys[0]];
  return Array.isArray(v) ? v : [];
};
const tagOf = (node) => Object.keys(node).filter((k) => k !== ":@")[0] ?? null;
const attrsOf = (node) => node[":@"] ?? {};

// 텍스트 추출 — hp:tbl 서브트리 제외(표는 별도 파싱), 그림 캡션(hp:shapeComment) 제외,
// 중첩 hp:p(글상자 내부 문단 — 별도 문단으로 펼침) 제외.
// ★본문 인라인 이미지(문장 속 표장 그림)는 위치 마커 ⟦IMG:binId⟧ 로 남긴다 —
//   백필이 ![](url) 마크다운으로 변환해 원 위치에 렌더(사실관계 "" 사이 표장 등).
function textOf(node, { skipTables = true, root = true } = {}) {
  const tag = tagOf(node);
  if (tag === "#text") return String(node["#text"] ?? "");
  if (tag === "hp:shapeComment") return "";
  if (skipTables && tag === "hp:tbl") return "";
  if (!root && tag === "hp:p") return "";
  const ref = attrsOf(node)["@_binaryItemIDRef"] ?? attrsOf(node)["@_BinaryItemIDRef"];
  if (ref) return `⟦IMG:${ref}⟧`;
  let s = "";
  for (const c of childrenOf(node)) s += textOf(c, { skipTables, root: false });
  return s;
}
const IMG_MARKER_RE = /⟦IMG:[^⟧]*⟧/g;

// 글상자 등 컨테이너 내부의 중첩 문단 (표 내부 제외) — 앵커 문단 뒤에 순서대로 펼친다
function boxParasOf(pNode) {
  const out = [];
  (function walk(n, root) {
    const tag = tagOf(n);
    if (tag === "hp:tbl") return;
    if (!root && tag === "hp:p") {
      out.push(n);
      return; // 이중 중첩은 재귀 수집 시 다시 펼쳐짐
    }
    for (const c of childrenOf(n)) walk(c, false);
  })(pNode, true);
  return out;
}

// 셀 내부 이미지 ref (dedup)
function cellImages(node) {
  const refs = [];
  (function walk(n) {
    const attrs = attrsOf(n);
    const ref = attrs["@_binaryItemIDRef"] ?? attrs["@_BinaryItemIDRef"];
    if (ref && !refs.includes(ref)) refs.push(ref);
    for (const c of childrenOf(n)) walk(c);
  })(node);
  return refs;
}

// 셀 텍스트 — 내부 문단들을 줄바꿈으로 연결 (중첩 p 포함, 캡션 제외)
function cellText(node) {
  const parts = [];
  (function walk(n) {
    const tag = tagOf(n);
    if (tag === "hp:shapeComment") return;
    if (tag === "hp:p") {
      let s = "";
      const tWalk = (m) => {
        const t = tagOf(m);
        if (t === "#text") {
          s += String(m["#text"] ?? "");
          return;
        }
        if (t === "hp:shapeComment" || t === "hp:tbl" || t === "hp:p") return;
        for (const c of childrenOf(m)) tWalk(c);
      };
      for (const c of childrenOf(n)) tWalk(c);
      // 문단 내 중첩 p (드묾)
      for (const c of childrenOf(n)) walk(c);
      const line = s.replace(/\s+/g, " ").trim();
      if (line) parts.push(line);
      return;
    }
    for (const c of childrenOf(n)) walk(c);
  })(node);
  return parts.join("\n");
}

// 표 파싱 — hp:tbl → rows[][] (셀 텍스트) + cellRows[][] ({text, imgs} — 도형 셀 렌더용)
function parseTable(tblNode) {
  const rows = [];
  const cellRows = [];
  (function walk(n) {
    if (tagOf(n) === "hp:tr") {
      const cells = [];
      const rich = [];
      (function cw(m) {
        if (tagOf(m) === "hp:tc") {
          const text = cellText(m);
          cells.push(text);
          rich.push({ text, imgs: cellImages(m) });
          return;
        }
        for (const c of childrenOf(m)) cw(c);
      })(n);
      rows.push(cells);
      cellRows.push(rich);
      return;
    }
    for (const c of childrenOf(n)) walk(c);
  })(tblNode);
  return { rows, cellRows };
}

// 이미지 ref 수집 (표 포함, dedup)
function imagesOf(node) {
  const refs = [];
  (function walk(n) {
    const attrs = attrsOf(n);
    const ref = attrs["@_binaryItemIDRef"] ?? attrs["@_BinaryItemIDRef"];
    if (ref && !refs.includes(ref)) refs.push(ref);
    for (const c of childrenOf(n)) walk(c);
  })(node);
  return refs;
}

function tablesOf(node) {
  const out = [];
  (function walk(n, root) {
    const tag = tagOf(n);
    if (tag === "hp:tbl") {
      out.push(n);
      return; // 중첩 표는 셀 텍스트로만
    }
    if (!root && tag === "hp:p") return; // 글상자 내부 문단의 표는 그 문단에서 수집
    for (const c of childrenOf(n)) walk(c, false);
  })(node, true);
  return out;
}

// ── 문단 수집 ──
let section = null;
for (const n of tree) if (tagOf(n) === "hs:sec") section = n;
const paragraphs = [];
(function collectP(n) {
  if (tagOf(n) === "hp:p") {
    paragraphs.push(n);
    return;
  }
  for (const c of childrenOf(n)) collectP(c);
})(section);

const paras = [];
for (const p of paragraphs) {
  paras.push({
    style: String(attrsOf(p)["@_paraPrIDRef"] ?? ""),
    text: textOf(p).replace(/\s+/g, " ").trim(),
    tables: tablesOf(p).map(parseTable),
    images: imagesOf(p),
  });
  // 글상자 내부 문단 펼침 (재귀적으로 — 내부의 내부까지)
  const queue = boxParasOf(p);
  while (queue.length) {
    const bp = queue.shift();
    paras.push({
      style: String(attrsOf(bp)["@_paraPrIDRef"] ?? ""),
      text: textOf(bp).replace(/\s+/g, " ").trim(),
      tables: tablesOf(bp).map(parseTable),
      images: [],
    });
    queue.unshift(...boxParasOf(bp));
  }
}
console.log(`paragraphs: ${paras.length}`);

// ── 주제 파싱 ──
function parseTopic(text) {
  const m = /주제\s*(\d+)\s*(.+)$/.exec(text);
  if (!m) return null;
  const rest = m[2].trim();
  // 마지막 최상위 괄호 그룹 = 부모 라벨(내부에 (法 …) 가능)
  let depth = 0;
  let lastOpen = -1;
  const groups = [];
  for (let k = 0; k < rest.length; k++) {
    if (rest[k] === "(") {
      if (depth === 0) lastOpen = k;
      depth++;
    } else if (rest[k] === ")") {
      depth--;
      if (depth === 0) groups.push([lastOpen, k]);
    }
  }
  if (groups.length === 0) return { no: +m[1], title: rest, parentLabel: null, parentRef: null };
  const [go, gc] = groups[groups.length - 1];
  const title = rest.slice(0, go).trim();
  const parentRaw = rest.slice(go + 1, gc).trim();
  const refM = /\((法[^)]*)\)\s*$/.exec(parentRaw);
  return {
    no: +m[1],
    title,
    parentLabel: refM ? parentRaw.slice(0, refM.index).trim() : parentRaw,
    parentRef: refM ? refM[1] : null,
  };
}

// ── 판례 헤더 파싱 ──
const COURTS =
  "대법원|특허법원|헌법재판소|서울고등법원|광주고등법원|부산고등법원|대구고등법원|대전고등법원|수원고등법원|서울중앙지방법원|서울지방법원|서울행정법원|서울민사지방법원";
// 서식 변형 허용: 판결/결정 단어 생략, [사건명] 뒤 (전합)/(확정)/(상고취하 확정)/괄호 오탈자([등록취소](상)], ]] 등)
const HEADER_RE = new RegExp(
  `^(?:\\(([^)]+)\\)\\s*)?(${COURTS})\\s+(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.?\\s*(?:선고|자)\\s+([0-9가-힣,·\\s의]+?)\\s*(전원합의체)?\\s*(판결|결정)?\\s*(?:\\[([^\\]]*)\\]?)?((?:\\s*\\([^)]*\\)|[\\]\\)\\s])*)$`,
);
// 병합 수록(두 사건 한 항목): "… 2005후1356 판결, 2006. 4. 27. 선고 2004후3454 판결 [—]"
const MERGED_RE = new RegExp(
  `^(?:\\(([^)]+)\\)\\s*)?(${COURTS})\\s+(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.?\\s*선고\\s+(\\S+)\\s*판결\\s*,\\s*\\d{4}\\.\\s*\\d{1,2}\\.\\s*\\d{1,2}\\.?\\s*선고\\s+(\\S+)\\s*판결\\s*(?:\\[([^\\]]*)\\]?)?\\s*$`,
);
function parseHeader(text) {
  const mm = MERGED_RE.exec(text);
  if (mm) {
    return {
      nickname: mm[1]?.trim() || null,
      court: mm[2],
      decidedAt: `${mm[3]}-${String(+mm[4]).padStart(2, "0")}-${String(+mm[5]).padStart(2, "0")}`,
      caseNumber: `${mm[6]}, ${mm[7]}`,
      isEnBanc: false,
      decisionKind: "판결",
      caseName: mm[8]?.trim() || null,
      confirmed: false,
    };
  }
  const m = HEADER_RE.exec(text);
  if (!m) return null;
  const caseNumber = m[6].trim().replace(/\s*판결$/, "");
  if (!/\d{2,4}[가-힣]+\d+/.test(caseNumber)) return null; // 사건번호 형태 검증
  const tail = m[10] ?? "";
  return {
    nickname: m[1]?.trim() || null,
    court: m[2],
    decidedAt: `${m[3]}-${String(+m[4]).padStart(2, "0")}-${String(+m[5]).padStart(2, "0")}`,
    caseNumber,
    isEnBanc: !!m[7] || /전합/.test(tail),
    decisionKind: m[8] ?? "판결",
    caseName: m[9]?.trim() || null,
    confirmed: /확정/.test(tail),
  };
}
const HEADER_START_RE = new RegExp(`^(?:\\([^)]+\\)\\s*)?(${COURTS})\\s+\\d{4}\\.`);
const isHeaderLine = (p) =>
  HEADER_START_RE.test(p.text) && /(선고|자)\s/.test(p.text) && /(판결|결정)/.test(p.text);

// ── 섹션 라벨 ──
const SECTION_KEYS = {
  "사안의 쟁점": "issues",
  사실관계: "facts",
  "원심의 판단": "lower",
  "특허법원의 판단": "lower",
  "법원의 판단": "lower",
  "관련 법리": "doctrine",
  "관련 쟁점": "doctrine",
  기본법리: "doctrine",
  "대법원의 판단": "holding",
  판결요지: "holding",
  "사안의 경우": "holding",
  Index: "index",
};

// ── 본문 walk ──
const topics = [];
let curTopic = null;
let curCase = null;
let curSection = "preamble"; // 헤더 직후(도표 구간)
const warnings = [];

function pushText(kase, section, text) {
  if (!text) return;
  (kase.sections[section] ??= []).push(text);
}

for (let i = 0; i < paras.length; i++) {
  const p = paras[i];
  // 구조 판정(주제/헤더/섹션라벨)은 이미지 마커 제거본으로 — 본문 push 는 마커 보존.
  const plain = p.text.replace(IMG_MARKER_RE, "").replace(/\s+/g, " ").trim();

  // 주제 마커
  if (p.style === "27" && /주제\s*\d+/.test(plain)) {
    const t = parseTopic(plain);
    if (t) {
      curTopic = { ...t, cases: [] };
      topics.push(curTopic);
      curCase = null;
      continue;
    }
  }
  if (!curTopic) continue; // 머리말 등 서두

  // 판례 헤더 — 직전 케이스 헤더와 동일 텍스트면(중복 수록) skip
  if (isHeaderLine({ text: plain }) && plain) {
    if (curCase && curCase.headerText === plain) continue; // 연속 중복
    const h = parseHeader(plain);
    if (!h) {
      // 본문 속 판례 인용(긴 문장)은 헤더가 아님 — 현재 섹션 본문으로 유지
      if (plain.length > 140) {
        pushText(curCase ?? { sections: {} }, curSection, p.text);
        continue;
      }
      warnings.push({ type: "header_parse_fail", text: plain.slice(0, 120) });
      continue;
    }
    curCase = {
      headerText: plain,
      seqInTopic: curTopic.cases.length + 1,
      ...h,
      infoTables: [], // [{rows, images}]
      images: [],
      sections: {},
      commentMd: null,
    };
    curTopic.cases.push(curCase);
    curSection = "preamble";
    continue;
  }
  if (!curCase) {
    // 주제 러닝헤더 반복 등 잡문
    continue;
  }

  // 표 — 평석 박스(라벨+본문 2셀) vs 도표(구분/등록상표/…)/도식
  if (p.tables.length > 0) {
    for (const { rows, cellRows } of p.tables) {
      const flat = rows.flat();
      // 평석 박스: ≤2행, 라벨(이미지/특수글자 → 빈 값 또는 ≤6자) 셀들 + 긴 본문 셀
      const firstRowShort = (rows[0] ?? []).every((c) => c.trim().length <= 6);
      const hasLong = flat.some((c) => c.trim().length > 80);
      const isCommentBox =
        flat.some((c) => c.trim() === "ㅇㅌㅍ") || (rows.length <= 2 && firstRowShort && hasLong);
      if (isCommentBox) {
        for (const cell of flat) {
          const t = cell.trim();
          if (t && t !== "ㅇㅌㅍ" && t.length > 6) pushText(curCase, "comment", t);
        }
      } else {
        curCase.infoTables.push({ section: curSection, rows, cellRows });
      }
    }
    for (const img of p.images) if (!curCase.images.includes(img)) curCase.images.push(img);
    // 표 anchor 문단의 잔여 직접 텍스트는 보통 없음 — 있으면 섹션에 추가
    if (p.text) pushText(curCase, curSection, p.text);
    continue;
  }
  if (p.images.length > 0) {
    for (const img of p.images) if (!curCase.images.includes(img)) curCase.images.push(img);
  }

  if (!p.text) continue;

  // 섹션 라벨
  const secM = /^\[([^\]]{1,20})\]$/.exec(plain);
  if (secM && SECTION_KEYS[secM[1]]) {
    curSection = SECTION_KEYS[secM[1]];
    continue;
  }

  // 평석 마커
  if (/^ㅇㅌㅍ/.test(plain)) {
    curSection = "comment";
    const rest = p.text.replace(/^ㅇㅌㅍ\s*/, "").trim();
    if (rest) pushText(curCase, "comment", rest);
    continue;
  }

  pushText(curCase, curSection, p.text);
}

// ── 후처리: 중복 문단 제거(개요선 중복 수록분), md 조립 ──
function dedupeAdjacent(arr) {
  const out = [];
  for (const s of arr) {
    if (out.length && out[out.length - 1] === s) continue;
    out.push(s);
  }
  return out;
}

let totalCases = 0;
for (const t of topics) {
  for (const c of t.cases) {
    totalCases++;
    for (const k of Object.keys(c.sections)) c.sections[k] = dedupeAdjacent(c.sections[k]);
    // preamble 에 헤더 재등장 등 잡문 제거
    if (c.sections.preamble) {
      c.sections.preamble = c.sections.preamble.filter((s) => s !== c.headerText);
      if (c.sections.preamble.length === 0) delete c.sections.preamble;
    }
  }
}

const stats = {
  topics: topics.length,
  cases: totalCases,
  uniqueCaseNumbers: new Set(topics.flatMap((t) => t.cases.map((c) => c.caseNumber))).size,
  withIssues: topics.flatMap((t) => t.cases).filter((c) => c.sections.issues).length,
  withDoctrine: topics.flatMap((t) => t.cases).filter((c) => c.sections.doctrine).length,
  withHolding: topics.flatMap((t) => t.cases).filter((c) => c.sections.holding).length,
  withComment: topics.flatMap((t) => t.cases).filter((c) => c.sections.comment).length,
  withImages: topics.flatMap((t) => t.cases).filter((c) => c.images.length > 0).length,
  warnings: warnings.length,
};

writeFileSync(
  OUT,
  JSON.stringify(
    { publication: "리담상표법 판례 [제16판]", source: "source/상표업로드/판례.hwpx", stats, warnings, topics },
    null,
    2,
  ),
  "utf8",
);
console.log(`✓ ${OUT}`);
console.log(JSON.stringify(stats, null, 1));
for (const w of warnings.slice(0, 15)) console.log("  !", w.type, w.text ?? "");
console.log(
  topics
    .map((t) => `주제${t.no}(${t.cases.length})`)
    .join(" "),
);
