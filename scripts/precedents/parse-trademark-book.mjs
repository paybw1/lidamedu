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

// ★판본마다 파일 경로·본문 섹션·주제 문단 스타일이 달라진다 —
//   제16판(0825)은 section0=목차(글상자), section1=본문. 상수로 박으면 개정판마다 깨진다.
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const HWPX = resolve(
  ROOT,
  argOf(
    "--hwpx",
    "source/상표법/상표법 판례(제16판)/[완0825+내지] 리담상표법 판례 (제16판).hwpx",
  ),
);
const OUT = resolve(ROOT, argOf("--out", "source/_converted/tm-precedents.json"));
const PUBLICATION = argOf("--publication", "리담상표법 판례 [제16판]");

// ── XML 로드 ──
const zip = new AdmZip(HWPX);
const sectionNames = zip
  .getEntries()
  .map((e) => e.entryName)
  .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
  .sort();
// 본문 섹션 = 판례 헤더("… 선고 …")가 가장 많은 섹션. 목차 섹션은 제목만 나열돼 탈락한다.
const bodyScore = (name) => {
  const s = zip.getEntry(name).getData().toString("utf8");
  return (s.match(/선고/g) ?? []).length;
};
const SECTION =
  argOf("--section", null) ??
  sectionNames.reduce((a, b) => (bodyScore(b) > bodyScore(a) ? b : a));
const xml = zip.getEntry(SECTION).getData().toString("utf8");
const headerXml = zip.getEntry("Contents/header.xml")?.getData().toString("utf8") ?? "";
const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: "@_",
  trimValues: false,
});
const tree = parser.parse(xml);

// ── 밑줄(underline) ──
// ★교재는 중요 문구에 밑줄을 그어 둔다. hwpx 에서 밑줄은 문자 자체가 아니라
//   hh:charPr(header.xml)의 속성이라, 본문만 읽으면 통째로 사라진다.
//   그래서 밑줄 charPr id 집합을 먼저 만들고, 본문 hp:run 의 charPrIDRef 로 대조한다.
const U_RE = /<\/?u>/g;
const stripU = (s) => String(s ?? "").replace(U_RE, "");
const ulIds = new Set();
for (const m of headerXml.matchAll(/<hh:charPr\s+([^>]*?)>([\s\S]*?)<\/hh:charPr>/g)) {
  const idM = /\bid="(\d+)"/.exec(m[1]);
  if (!idM) continue;
  const uM = /<hh:underline\s+type="([^"]+)"/.exec(m[2]);
  if (uM && uM[1] !== "NONE") ulIds.add(idM[1]);
}

// 마커 정리 — 빈 마커·연속 마커 병합 + 이미지 마커에 걸친 밑줄 분리.
// ★case-body.tsx 는 "![" 로 먼저 쪼갠 뒤 조각별로 밑줄을 푼다. 이미지를 감싼 <u>…</u>
//   는 그 시점에 짝이 어긋나 밑줄이 통째로 사라지거나 문장 끝까지 번진다.
function normalizeU(s) {
  if (!s.includes("<u>")) return s;
  let out = s;
  for (;;) {
    const next = out.replace(/<u>(\s*)<\/u>/g, "$1").replace(/<\/u>(\s*)<u>/g, "$1");
    if (next === out) break;
    out = next;
  }
  out = out.replace(/<u>([\s\S]*?)<\/u>/g, (whole, inner) => {
    if (!inner.includes("⟦IMG:")) return whole;
    return inner
      .split(/(⟦IMG:[^⟧]*⟧)/)
      .map((part) =>
        !part ? "" : part.startsWith("⟦IMG:") ? part : `<u>${part}</u>`,
      )
      .join("");
  });
  // ★줄머리 번호 마커([1]·(2)·가.)를 밑줄이 감싸면 case-body 의 층위 판정이 줄머리를
  //   못 알아봐 들여쓰기가 사라진다. 마커는 밑줄 밖으로 빼고 그 뒤부터 긋는다.
  out = out.replace(
    /(^|\n)<u>(\[\d+\]|\(\d+\)|\d+[.)]|[가-힣][.)]|[①-⑳])(\s*)/g,
    "$1$2$3<u>",
  );
  return out.replace(/<u>(\s*)<\/u>/g, "$1");
}

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
  if (tag === "hp:run" && s) {
    const cid = attrsOf(node)["@_charPrIDRef"];
    if (cid != null && ulIds.has(String(cid))) return `<u>${s}</u>`;
  }
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

// 셀 내부 이미지 ref (dedup) — 중첩 표 내부는 제외(중첩 표의 자기 셀에서 수집)
function cellImages(node) {
  const refs = [];
  (function walk(n, root) {
    if (!root && tagOf(n) === "hp:tbl") return;
    const attrs = attrsOf(n);
    const ref = attrs["@_binaryItemIDRef"] ?? attrs["@_BinaryItemIDRef"];
    if (ref && !refs.includes(ref)) refs.push(ref);
    for (const c of childrenOf(n)) walk(c, false);
  })(node, true);
  return refs;
}

// 셀 내부의 중첩 표(1단계) — 평석 박스 속 비교표 등을 구조 보존.
function cellNestedTables(node) {
  const out = [];
  (function walk(n, root) {
    if (!root && tagOf(n) === "hp:tbl") {
      out.push(n);
      return;
    }
    for (const c of childrenOf(n)) walk(c, false);
  })(node, true);
  return out;
}

// 셀 텍스트 — 내부 문단들을 줄바꿈으로 연결 (중첩 p 포함, 캡션 제외).
// ★중첩 표는 텍스트로 흡수하지 않고 위치 마커 ⟦TBL⟧ 라인으로 남긴다(구조는 cellNestedTables 로).
function cellText(node) {
  const parts = [];
  (function walk(n) {
    const tag = tagOf(n);
    if (tag === "hp:shapeComment") return;
    if (tag === "hp:tbl") {
      parts.push("⟦TBL⟧");
      return;
    }
    if (tag === "hp:p") {
      let s = "";
      const tWalk = (m) => {
        const t = tagOf(m);
        if (t === "#text") {
          s += String(m["#text"] ?? "");
          return;
        }
        if (t === "hp:shapeComment" || t === "hp:tbl" || t === "hp:p") return;
        // 셀 본문 속 인라인 이미지(평석 문장 안 표장 등) — 위치 마커 보존
        const ref = attrsOf(m)["@_binaryItemIDRef"] ?? attrsOf(m)["@_BinaryItemIDRef"];
        if (ref) {
          s += `⟦IMG:${ref}⟧`;
          return;
        }
        // 밑줄 run — 본문과 같은 규칙(표 셀에도 밑줄이 그어져 있다)
        if (t === "hp:run") {
          const cid = attrsOf(m)["@_charPrIDRef"];
          const on = cid != null && ulIds.has(String(cid));
          const before = s.length;
          for (const c of childrenOf(m)) tWalk(c);
          if (on && s.length > before) s = `${s.slice(0, before)}<u>${s.slice(before)}</u>`;
          return;
        }
        for (const c of childrenOf(m)) tWalk(c);
      };
      for (const c of childrenOf(n)) tWalk(c);
      // 문단 내 중첩 p (드묾)
      for (const c of childrenOf(n)) walk(c);
      const line = normalizeU(s.replace(/\s+/g, " ").trim());
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
          // 실제 셀 병합(colSpan/rowSpan) — 표 렌더 정합의 근거 (hp:cellSpan)
          let colSpan = 1, rowSpan = 1;
          (function findSpan(x) {
            if (tagOf(x) === "hp:cellSpan") {
              const a = attrsOf(x);
              colSpan = Number(a["@_colSpan"] ?? 1) || 1;
              rowSpan = Number(a["@_rowSpan"] ?? 1) || 1;
              return;
            }
            if (tagOf(x) === "hp:subList") return; // 셀 내용 안까지 내려가지 않음
            for (const ch of childrenOf(x)) findSpan(ch);
          })(m);
          cells.push(text);
          rich.push({
            text,
            imgs: cellImages(m),
            colSpan,
            rowSpan,
            // 중첩 표(평석 박스 속 비교표 등) — 구조 보존, ⟦TBL⟧ 마커 위치에 배치
            tables: cellNestedTables(m).map(parseTable),
          });
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
    text: normalizeU(textOf(p).replace(/\s+/g, " ").trim()),
    tables: tablesOf(p).map(parseTable),
    images: imagesOf(p),
  });
  // 글상자 내부 문단 펼침 (재귀적으로 — 내부의 내부까지)
  const queue = boxParasOf(p);
  while (queue.length) {
    const bp = queue.shift();
    paras.push({
      style: String(attrsOf(bp)["@_paraPrIDRef"] ?? ""),
      text: normalizeU(textOf(bp).replace(/\s+/g, " ").trim()),
      tables: tablesOf(bp).map(parseTable),
      images: [],
    });
    queue.unshift(...boxParasOf(bp));
  }
}
console.log(`paragraphs: ${paras.length}`);

// 판본이 바뀌면 문단 스타일·라벨 표기가 달라져 파싱이 조용히 빗나간다 —
// 원문 문단 스트림을 그대로 떨궈 눈으로 대조할 수 있게 한다.
const DUMP = argOf("--dump", null);
if (DUMP) {
  writeFileSync(
    resolve(ROOT, DUMP),
    paras
      .map((p, i) => `${i}\t${p.style}\ttbl=${p.tables.length}\timg=${p.images.length}\t${p.text}`)
      .join("\n"),
    "utf8",
  );
  console.log(`✓ dump ${DUMP}`);
}

// 주제 문단 스타일 — 판본마다 paraPrIDRef 가 달라진다(제16판 0825 는 27 이 아니다).
// "주제N …(부모라벨)" 꼴 문단이 가장 많이 쓰는 스타일을 주제 스타일로 본다.
const TOPIC_STYLE =
  argOf("--topic-style", null) ??
  (() => {
    const tally = new Map();
    for (const p of paras) {
      const t = stripU(p.text).replace(IMG_MARKER_RE, "").trim();
      if (/^주제\s*\d+\s*\S/.test(t) && /\(.*\)\s*$/.test(t))
        tally.set(p.style, (tally.get(p.style) ?? 0) + 1);
    }
    let best = "27";
    let bestN = 0;
    for (const [k, v] of tally) if (v > bestN) [best, bestN] = [k, v];
    return best;
  })();
console.log(`topic style: paraPrIDRef=${TOPIC_STYLE}`);


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
// 닉네임은 1단계 중첩 괄호 허용 — "(일사부재리 (3))"
const NICK = `\\(((?:[^()]|\\([^()]*\\))+)\\)`;
const HEADER_RE = new RegExp(
  `^(?:${NICK}\\s*)?(${COURTS})\\s+(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.?\\s*(?:선고|자)\\.?\\s+([0-9가-힣,·\\s의]+?)\\s*(전원합의체)?\\s*(판결|결정|사건)?\\s*(?:\\[([^\\]]*)\\]?)?((?:\\s*\\([^)]*\\)|[\\]\\)\\s])*)$`,
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
  const caseNumber = m[6].trim().replace(/\s*(판결|결정|사건)$/, "");
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
// 닉네임이 괄호 없이 붙는 변형("백남준 미술관(취소심판) 대법원 2011. …") 허용 —
// 짧은(≤25자) 평문 접두를 닉네임으로 분리해 재파싱. "[관련판례 N]" 은 참고 인용이라 제외.
const PLAIN_PREFIX_RE = new RegExp(
  `^([^\\[\\(\\s][^\\[]{0,24}?)\\s+((?:${COURTS})\\s+\\d{4}\\..*)$`,
);
function parseHeaderLoose(raw) {
  const text = raw.replace(/[\s\\]+$/, ""); // 후행 공백·역슬래시 잔재 제거
  const direct = parseHeader(text);
  if (direct) return direct;
  const pm = PLAIN_PREFIX_RE.exec(text);
  if (!pm) return null;
  const h = parseHeader(pm[2]);
  if (!h) return null;
  return { ...h, nickname: h.nickname ?? pm[1].trim() };
}
const HEADER_START_RE = new RegExp(
  `^(?:${NICK}\\s*)?(?:[^\\[\\(\\s][^\\[]{0,24}?\\s+)?(${COURTS})\\s+\\d{4}\\.`,
);
// "판결/결정" 단어가 생략된 헤더 변형("(GS HOBBY) 특허법원 … 선고 2019허6747 [등록무효(상)]")
// 도 잡는다 — 최종 판정은 parseHeaderLoose 의 $-앵커 정규식이 하므로 여기선 과포함 허용.
const isHeaderLine = (p) =>
  HEADER_START_RE.test(p.text) && /(선고|자)\.?\s/.test(p.text);

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

// 닉네임 문단 스타일 — ★제16판(0825)은 판례 별칭을 헤더 괄호에서 빼내
//   헤더 바로 다음 줄로 옮겼다("(라이트리움) 대법원 …" → "대법원 …" + "라이트리움").
//   구판에는 이런 줄이 없으므로, 판례 절반 이상이 같은 스타일의 짧은 줄을 달고 있을 때만 인정한다.
const NICK_STYLE = (() => {
  const clean = (s) => stripU(s).replace(IMG_MARKER_RE, "").replace(/\s+/g, " ").trim();
  const tally = new Map();
  let headers = 0;
  for (let i = 0; i < paras.length; i++) {
    if (!isHeaderLine({ text: clean(paras[i].text) })) continue;
    headers++;
    for (let j = i + 1; j < paras.length; j++) {
      const nx = clean(paras[j].text);
      if (!nx) continue;
      if (nx.length <= 40 && !/^[[【]/.test(nx))
        tally.set(paras[j].style, (tally.get(paras[j].style) ?? 0) + 1);
      break;
    }
  }
  let best = null;
  let bestN = 0;
  for (const [k, v] of tally) if (v > bestN) [best, bestN] = [k, v];
  return bestN >= headers * 0.5 ? best : null;
})();
console.log(`nickname style: ${NICK_STYLE ?? "(없음 — 헤더 괄호형)"}`);

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
  // 구조 판정(주제/헤더/섹션라벨)은 밑줄 마커도 제거한 텍스트로 — 교재가 헤더에도
  // 밑줄을 긋는 경우가 있어, 마커가 남으면 정규식이 통째로 빗나간다.
  const plain = stripU(p.text).replace(IMG_MARKER_RE, "").replace(/\s+/g, " ").trim();

  // 주제 마커
  // ★제16판(0825)은 주제 제목이 여러 스타일(623·624·625·653)로 흩어져 있어 스타일만으로는
  //   못 가른다. 대신 두 가지로 판정한다 —
  //   ① 러닝헤더("주제N 제목 ·")는 가운뎃점으로 끝난다(쪽번호 구분자) → 제외.
  //   ② 주제 번호는 1부터 빠짐없이 올라간다 → 다음 번호일 때만 새 주제로 연다.
  //   ②가 없으면 주제 본문에서 되풀이되는 러닝헤더가 주제를 덧연다.
  // ★구판은 번호와 제목이 붙어 있다("주제1등록요건으로서의…") — 번호 뒤 구분자를 요구하면 안 된다.
  const topicM = /^주제\s*(\d+)/.exec(plain);
  if (
    topicM &&
    !/·\s*$/.test(plain) &&
    Number(topicM[1]) === topics.length + 1 &&
    (p.style === TOPIC_STYLE || !/^\d+\)/.test(plain))
  ) {
    // ★제16판은 주제 제목과 부모 체계도 라벨이 두 문단으로 갈라졌다.
    //   "주제1 등록요건으로서의 사용 또는 사용의사" / "(상표등록을 받을 수 있는 자 및 없는 자(法 3))"
    let headText = plain;
    if (!/\)\s*$/.test(headText)) {
      for (let j = i + 1; j < paras.length; j++) {
        const nx = stripU(paras[j].text).replace(IMG_MARKER_RE, "").replace(/\s+/g, " ").trim();
        if (!nx) continue;
        if (paras[j].style === p.style && /^\(.*\)$/.test(nx)) {
          headText = `${headText} ${nx}`;
          i = j; // 소비 — 부모 라벨 문단이 본문으로 새지 않게
        }
        break;
      }
    }
    const t = parseTopic(headText);
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
    const h = parseHeaderLoose(plain);
    if (!h) {
      // 본문 속 판례 인용은 헤더가 아님 — 현재 섹션 본문으로 유지 (내용 유실 금지).
      pushText(curCase ?? { sections: {} }, curSection, p.text);
      if (plain.length <= 140) {
        warnings.push({ type: "header_like_kept_as_body", text: plain.slice(0, 120) });
      }
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
  // ★판정은 이미지 마커 제거본으로 — 라벨(로고 이미지) 셀이 마커 때문에 길어 보이면 안 됨.
  if (p.tables.length > 0) {
    for (const { rows, cellRows } of p.tables) {
      const cleanCell = (c) =>
        stripU(c).replace(IMG_MARKER_RE, "").replace(/⟦TBL⟧/g, "").trim();
      const flat = rows.flat().map(cleanCell);
      // 평석 박스: ≤2행, 라벨(이미지/특수글자 → 빈 값 또는 ≤6자) 셀들 + 긴 본문 셀
      const firstRowShort = (rows[0] ?? []).every((c) => cleanCell(c).length <= 6);
      const hasLong = flat.some((c) => c.length > 80);
      const isCommentBox =
        flat.some((c) => c === "ㅇㅌㅍ") || (rows.length <= 2 && firstRowShort && hasLong);
      if (isCommentBox) {
        for (const row of cellRows) {
          for (const cell of row) {
            const clean = cleanCell(cell.text ?? "");
            // 본문 셀만 push (라벨 글자·로고 이미지 셀 제외). 원문 텍스트(마커 포함) 유지 —
            // 평석 문장 속 표장 이미지가 제자리에 렌더되게.
            if (clean && clean !== "ㅇㅌㅍ" && clean.length > 6) {
              pushText(curCase, "comment", cell.text.trim());
            }
            // 박스 속 중첩 표(비교표) — comment 섹션 표로 보존, ⟦TBL⟧ 마커 위치에 배치
            for (const nt of cell.tables ?? []) {
              curCase.infoTables.push({ section: "comment", rows: nt.rows, cellRows: nt.cellRows });
            }
          }
        }
      } else {
        curCase.infoTables.push({ section: curSection, rows, cellRows });
        // 위치 마커 — 섹션 본문 흐름에서 표가 등장한 자리(문단 [1]과 [2] 사이 등)에
        // 백필(spliceTables)이 표 블록을 삽입할 수 있게 한다.
        pushText(curCase, curSection, "⟦TBL⟧");
      }
    }
    for (const img of p.images) if (!curCase.images.includes(img)) curCase.images.push(img);
    // 표 anchor 문단의 잔여 직접 텍스트는 보통 없음 — 있으면 섹션에 추가
    if (p.text) pushText(curCase, curSection, p.text);
    continue;
  }
  // 닉네임 줄 — 헤더 바로 뒤, 쟁점상표 표 앞. 본문으로 새면 preamble 에 이름만 덩그러니 남는다.
  if (
    NICK_STYLE &&
    p.style === NICK_STYLE &&
    curSection === "preamble" &&
    !curCase.nickname &&
    plain &&
    plain.length <= 40
  ) {
    // ★"[관련판례 N]" 은 별칭이 아니라 **앞 판례의 참고**다. 신판이 이 블록을 판례 헤더처럼
    //   조판해 놓아(구판은 "[관련판례 1] 대법원 … 판결" 한 줄) 그대로 두면 없는 판례가 하나 생긴다.
    //   구판 표기로 되돌려 앞 판례의 인덱스에 넣으면 기존 백필이 '관련판례' 섹션으로 갈라낸다.
    if (/^\[관련\s*판례/.test(plain)) {
      const demoted = curTopic.cases.pop();
      const prev = curTopic.cases[curTopic.cases.length - 1] ?? null;
      if (!prev) {
        curTopic.cases.push(demoted); // 주제 첫 항목이면 되돌릴 앞 판례가 없다
        curCase.nickname = plain;
        continue;
      }
      for (const img of demoted.images) if (!prev.images.includes(img)) prev.images.push(img);
      prev.infoTables.push(...demoted.infoTables);
      curCase = prev;
      curSection = "index";
      pushText(prev, "index", `${plain} ${demoted.headerText}`);
      for (const arr of Object.values(demoted.sections))
        for (const s of arr) pushText(prev, "index", s);
      continue;
    }
    curCase.nickname = plain;
    continue;
  }

  // 섹션 라벨 — ★제16판(0825)부터 표기가 [사실관계] → 【사실관계】 로 바뀌었고,
  //   라벨 앞에 장식용 불릿 그림이 한 장 붙는다. 라벨 판정을 이미지 수집보다
  //   먼저 해야 그 불릿이 판례 이미지 목록에 섞이지 않는다.
  const secM = /^[[【]([^\]】]{1,20})[\]】]$/.exec(plain);
  const isSectionLabel = !!(secM && SECTION_KEYS[secM[1]]);

  if (p.images.length > 0 && !isSectionLabel) {
    for (const img of p.images) if (!curCase.images.includes(img)) curCase.images.push(img);
  }

  if (!p.text) continue;

  if (isSectionLabel) {
    curSection = SECTION_KEYS[secM[1]];
    // 원래 명칭 보존(첫 등장) — 백필이 lower/holding 을 "전심/본심의 판단" 으로
    // 정규화하므로, 워크북 원문 헤딩(특허법원의 판단·대법원의 판단·심판원의 판단 등)을 별도 기록.
    (curCase.sectionLabels ??= {})[curSection] ??= secM[1].replace(/\s+/g, " ").trim();
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
// ★개요선/본문 중복 수록분은 **밑줄을 뺀 글자**로 같은지 본다 —
//   두 번 실린 같은 문단이 한쪽만 밑줄이 그어진 경우가 있어, 마커째 비교하면 둘 다 남는다.
//   남길 쪽은 밑줄이 있는 사본(교재가 강조한 정보를 버리지 않는다).
function dedupeAdjacent(arr) {
  const out = [];
  for (const s of arr) {
    const prev = out.length ? out[out.length - 1] : null;
    if (prev != null && stripU(prev) === stripU(s)) {
      if ((s.match(/<u>/g) ?? []).length > (prev.match(/<u>/g) ?? []).length)
        out[out.length - 1] = s;
      continue;
    }
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
      c.sections.preamble = c.sections.preamble.filter(
        (s) => stripU(s).replace(IMG_MARKER_RE, "").trim() !== c.headerText,
      );
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
  underlineCharPrIds: ulIds.size,
  casesWithUnderline: topics
    .flatMap((t) => t.cases)
    .filter((c) =>
      Object.values(c.sections).some((arr) => arr.some((s) => s.includes("<u>"))),
    ).length,
  underlineSpans: topics
    .flatMap((t) => t.cases)
    .reduce(
      (n, c) =>
        n +
        Object.values(c.sections).reduce(
          (m, arr) => m + arr.reduce((k, s) => k + (s.match(/<u>/g) ?? []).length, 0),
          0,
        ),
      0,
    ),
  warnings: warnings.length,
};

writeFileSync(
  OUT,
  JSON.stringify(
    {
      publication: PUBLICATION,
      source: HWPX.slice(HWPX.indexOf("source")),
      section: SECTION,
      stats,
      warnings,
      topics,
    },
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
