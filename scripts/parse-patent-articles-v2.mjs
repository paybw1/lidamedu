// HTML 기반 v2 파서. v1 (txt) 의 chapter/article 메타를 유지하고 body_json 만
// HTML 에서 풍부하게 재추출.
//
// 추출 항목:
//   - 항/호/목 (HStyle13 본문) + 부제목 (KoPubWorld돋움체 Bold + 괄호)
//   - inline 토큰: text / underline / ref_article / amendment_note
//   - 시행령·규칙 부속 블록 (HStyle5 헤더 + HStyle4 article + HStyle6 본문)

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HTML_PATH = resolve(ROOT, "source/_converted/리담특허법 조문.utf8.html");
const V1_JSON = resolve(ROOT, "source/_converted/parsed-articles.json");
const OUT = resolve(ROOT, "source/_converted/parsed-articles-v2.json");

const v1 = JSON.parse(readFileSync(V1_JSON, "utf8"));
const html = readFileSync(HTML_PATH, "utf8");
const $ = cheerio.load(html);

// ───────── helpers ─────────
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const SUB_LETTERS = "가나다라마바사아자차카타파하";

function circledToNumber(ch) {
  const i = CIRCLED.indexOf(ch);
  return i >= 0 ? i + 1 : null;
}

// 단일 span 의 텍스트와 스타일을 분석해 inline 토큰 생성
function classifySpan($el) {
  const style = ($el.attr("style") || "").replace(/\s+/g, " ").toLowerCase();
  const text = $el.text();
  if (!text) return null;
  // 약식 ref 박스 — background-color:#486b52
  if (/background-color:\s*#486b52/i.test(style)) {
    return { kind: "ref_box", text };
  }
  // 개정 표시 — 서울남산 장체 M 폰트 (작은 사이즈)
  if (/서울남산 장체 M|font-size:\s*7\b/i.test(style) && /[\d. ,]+/.test(text)) {
    // 본문 라인 끝에 붙는 작은 글씨 (개정/신설/시행 등)
    if (/^[<\(]?(개정|신설|삭제|시행|타법개정)/.test(text.trim())) {
      return { kind: "amendment", text: text.trim() };
    }
  }
  // 서울남산 장체 M 폰트로 [xxx ...] 형태 — amendment 마커
  // (예: [종전 제132조의2는 제132조의16으로 이동 <2016.2.29.>])
  // 돋움체 Bold + 7pt 의 [xxx] 는 강사 보강 라벨이므로 별도 — 아래 bold 분기에서 처리됨
  if (
    /서울남산 장체 M/i.test(style) &&
    /^\s*\[[^\]]+\]\s*$/.test(text.trim())
  ) {
    return { kind: "amendment", text: text.trim() };
  }
  // 돋움체 Bold span 은 일단 'bold' 로 분류 — 인접 bold 들을 후처리에서 병합 후 subtitle 판정
  // (HWP 변환 시 한 부제목이 여러 span 으로 쪼개지는 경우 대응)
  if (/KoPubWorld돋움체 Bold|돋움체 Bold/i.test(style)) {
    return { kind: "bold", text };
  }
  // 밑줄
  if (/text-decoration:\s*underline/.test(style)) {
    return { kind: "underline", text };
  }
  // [전문개정/본조신설/시행일/시행일자/제목개정/타법개정] 같은 메타 표시는 폰트와 무관하게 amendment 로
  // (\b 는 한글에서 작동 안 하므로 사용하지 않음)
  if (/^\s*\[(전문개정|본조신설|시행일자?|본문개정|제목개정|타법개정|개정)/.test(text)) {
    return { kind: "amendment", text: text.trim() };
  }
  return { kind: "text", text };
}

// 인접 bold span 들을 합쳐서 (...) 는 subtitle, [...] 는 강사 보강 annotation, 그 외 text 로 변환.
// (Bold 출처는 강사 의도가 있는 강조 — Light 본문에서 우연히 [...] 가 등장하는 케이스와 구별.)
function mergeAdjacentBold(tokens) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t && t.kind === "bold") {
      let merged = t.text;
      let j = i + 1;
      while (j < tokens.length && tokens[j] && tokens[j].kind === "bold") {
        merged += tokens[j].text;
        j++;
      }
      const subtitleM = /^(\s*)\((.+)\)(\s*)$/.exec(merged);
      const annotM = /^(\s*)\[(.+)\](\s*)$/.exec(merged);
      if (subtitleM) {
        out.push({ kind: "subtitle", text: subtitleM[2] });
      } else if (annotM) {
        out.push({ kind: "annotation", text: annotM[2] });
      } else {
        out.push({ kind: "text", text: merged });
      }
      i = j;
    } else {
      out.push(t);
      i++;
    }
  }
  return out;
}

// 약식 ref 박스 텍스트를 콤마로 쪼개 다중 ref 토큰 생성
// 끝에 "단/단서/본/본문/전단/후단" 한글 suffix 허용 (예: "20단" → 제20조 단서, "47②후단" → 제47조 제2항 후단)
// 호 가지번호 지원: "92의2④Ⅱ의Ⅱ" → 제92조의2 제4항 제2호의2
// 호-목 사이 점(.) 은 optional — 작성자에 따라 "②Ⅲ.가" / "②Ⅲ가" 둘 다 허용
const REF_PIECE_RE =
  /^\s*(\d+(?:의\d+)?)([①-⑳])?(?:\s*([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|\d+)(?:의([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|\d+))?(?:\s*\.?\s*([가-하]))?)?(전단|후단|단서?|본문?)?\s*$/;
const ROMAN_TO_INT = { Ⅰ: 1, Ⅱ: 2, Ⅲ: 3, Ⅳ: 4, Ⅴ: 5, Ⅵ: 6, Ⅶ: 7, Ⅷ: 8, Ⅸ: 9, Ⅹ: 10 };

// piece 형식: "186", "186③", "186③④⑤", "186의2②", "186③.가", "29단", "29의2②Ⅰ.가", "47②후단", "92의2④Ⅱ의Ⅱ", "2Ⅲ나"
// 다중 circled (③④⑤) 는 같은 조의 여러 항을 동시 참조 — 각 항을 별개 ref 로 분할
const REF_FULL_RE =
  /^(\d+(?:의\d+)?)([①-⑳]+)?(?:\s*([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|\d+)(?:의([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|\d+))?(?:\s*\.?\s*([가-하]))?)?(전단|후단|단서?|본문?)?$/;
// 범위 표현 "N-M" 또는 "N의X-N의Y" — 같은 base 조의 가지조 범위 또는 동일계열 조 범위
const REF_RANGE_RE = /^(\d+)(?:의(\d+))?-(\d+)(?:의(\d+))?$/;

function romanOrDigitToInt(s) {
  if (!s) return null;
  const v = ROMAN_TO_INT[s] || parseInt(s, 10);
  return Number.isFinite(v) ? v : null;
}

function expandRangePiece(piece) {
  // "112-113" → ["112", "113"]
  // "224의3-224의5" → ["224의3", "224의4", "224의5"]
  // "224의3-225" or 다른 base → null (범위 의미 모호 — 파서 호출자가 fallback)
  const r = piece.match(REF_RANGE_RE);
  if (!r) return null;
  const [, baseA, branchA, baseB, branchB] = r;
  const aBase = parseInt(baseA, 10);
  const bBase = parseInt(baseB, 10);
  // 같은 base 의 가지조 범위 (224의3-224의5)
  if (branchA && branchB && aBase === bBase) {
    const start = parseInt(branchA, 10);
    const end = parseInt(branchB, 10);
    if (end < start || end - start > 50) return null;
    const out = [];
    for (let i = start; i <= end; i++) out.push(`${aBase}의${i}`);
    return out;
  }
  // 평이한 조 범위 (112-113, 170-172)
  if (!branchA && !branchB) {
    if (bBase < aBase || bBase - aBase > 50) return null;
    const out = [];
    for (let i = aBase; i <= bBase; i++) out.push(String(i));
    return out;
  }
  return null;
}

function parseRefBox(boxText) {
  const body = boxText.replace(/^法\s*/, "").trim();
  // piece 구분자: 콤마(+/-공백), 슬래시(+/-공백)
  const rawPieces = body.split(/\s*[,\/]\s*/).filter(Boolean);
  // 범위 piece 는 개별 piece 로 확장
  const pieces = [];
  for (const p of rawPieces) {
    const expanded = expandRangePiece(p.trim());
    if (expanded) pieces.push(...expanded);
    else pieces.push(p);
  }
  const out = [];

  for (const piece of pieces) {
    const m = piece.trim().match(REF_FULL_RE);
    if (!m) continue;
    const [, articleStr, circledSeq, itemRaw, itemBranchRaw, sub, suffix] = m;
    const [base, branch] = articleStr.split("의");
    const baseTarget = { law_code: "patent", article: parseInt(base, 10) };
    if (branch) baseTarget.branch = parseInt(branch, 10);

    const itemNum = romanOrDigitToInt(itemRaw);
    const itemBranchNum = romanOrDigitToInt(itemBranchRaw);

    const buildRef = (clauseChar, rawOverride) => {
      const target = { ...baseTarget };
      if (clauseChar) target.clause = circledToNumber(clauseChar);
      if (itemNum) target.item = itemNum;
      if (itemBranchNum) target.item_branch = itemBranchNum;
      if (sub) target.sub_item = sub;
      // 단일 piece 는 원본 표기 보존, 다중 circled 분할 / 범위 확장은 재구성
      const rawText =
        rawOverride ??
        `法 ${articleStr}${clauseChar ?? ""}${itemRaw ?? ""}${itemBranchRaw ? "의" + itemBranchRaw : ""}${sub ? "." + sub : ""}${suffix ?? ""}`;
      return { type: "ref_article", raw: rawText, target };
    };

    if (circledSeq && circledSeq.length > 1) {
      // "186③④⑤" → 제186조 ③, ④, ⑤ 각각의 ref 로 분할 (raw 재구성)
      for (const ch of circledSeq) out.push(buildRef(ch));
    } else {
      // 단일 piece — 원본 trim 결과를 raw 로 보존 (작성자의 점 사용 여부, 공백 그대로)
      out.push(buildRef(circledSeq ?? null, `法 ${piece.trim()}`));
    }
  }
  return out;
}

function parsePieceMatch(m) {
  const [, articleStr, circled, itemRaw, itemBranchRaw, sub, suffix] = m;
  const target = { law_code: "patent" };
  const [base, branch] = articleStr.split("의");
  target.article = parseInt(base, 10);
  if (branch) target.branch = parseInt(branch, 10);
  if (circled) target.clause = circledToNumber(circled);
  const itemNum = romanOrDigitToInt(itemRaw);
  if (itemNum) target.item = itemNum;
  const itemBranchNum = romanOrDigitToInt(itemBranchRaw);
  if (itemBranchNum) target.item_branch = itemBranchNum;
  if (sub) target.sub_item = sub;
  const rawText = `法 ${articleStr}${circled ?? ""}${itemRaw ?? ""}${itemBranchRaw ? "의" + itemBranchRaw : ""}${sub ? "." + sub : ""}${suffix ?? ""}`;
  return { type: "ref_article", raw: rawText, target };
}

// 한 <p> 의 children span 들을 하나씩 분석해 1차 토큰(kind 필드) 수집 후
// mergeAdjacentBold 로 인접 bold span 들을 부제목으로 합쳐 최종 토큰(type 필드) 반환.
function paragraphTokens($p) {
  const raw = [];
  $p.children().each((_, el) => {
    if (el.name !== "span" && el.name !== "br") {
      if (el.name) {
        const $el = $(el);
        const t = $el.text();
        if (t) raw.push({ kind: "text", text: t });
      }
      return;
    }
    if (el.name === "br") {
      raw.push({ kind: "text", text: "\n" });
      return;
    }
    const $el = $(el);
    if (($el.attr("class") || "").includes("hnc_page_break")) return;
    const c = classifySpan($el);
    if (!c) return;
    if (c.kind === "ref_box") {
      const refs = parseRefBox(c.text);
      if (refs.length === 0) {
        raw.push({ kind: "text", text: c.text });
      } else {
        for (let i = 0; i < refs.length; i++) {
          if (i > 0) raw.push({ kind: "text", text: ", " });
          // ref_article 형식 그대로 push (target 보존). final 단계에서 type 으로 변환.
          raw.push({ kind: "ref_article", raw: refs[i].raw, target: refs[i].target });
        }
      }
    } else {
      raw.push(c);
    }
  });

  const merged = mergeAdjacentBold(raw);

  return merged
    .map((t) => {
      if (!t) return null;
      if (t.kind === "text") return { type: "text", text: t.text };
      if (t.kind === "underline") return { type: "underline", text: t.text };
      if (t.kind === "subtitle") return { type: "subtitle", text: t.text };
      if (t.kind === "annotation") return { type: "annotation", text: t.text };
      if (t.kind === "amendment") return { type: "amendment_note", text: t.text };
      if (t.kind === "ref_article") return { type: "ref_article", raw: t.raw, target: t.target };
      return null;
    })
    .filter((t) => t !== null);
}

// ───────── 본문 영역 식별 + article 별 paragraph 묶기 ─────────
const allP = $("p");
const pList = [];
allP.each((i, el) => {
  const $p = $(el);
  const cls = ($p.attr("class") || "").trim();
  // 모든 <table> 조상 (innermost → outermost) — 중첩 sub_article_group 경계 식별용
  const tableEls = $p.parents("table").toArray();
  const tableEl = tableEls[0] ?? null;
  pList.push({
    idx: i,
    $p,
    cls,
    text: $p.text().replace(/\s+/g, " ").trim(),
    tableEl,
    tableEls,
  });
});

// 본문 영역 시작점: HStyle11 또는 HStyle8 의 첫 번째 article 헤더 (제1조)
const ARTICLE_HEADER_RE = /^제(\d+)조(?:의(\d+))?\s+【(.+?)】/;
// 삭제된 article: "제26조 삭제 <2011.12.2.>" — 옛 본문(구특허법) 박스가 뒤따를 수 있음
const ARTICLE_DELETED_HEADER_RE = /^제(\d+)조(?:의(\d+))?\s+삭제/;
const SUB_DECREE_HEADER_RE = /^시행령\s+제\d+조|^시행규칙\s+제\d+조|^민사소송법\s+제[\d편장조절]/;
const SUB_DECREE_ARTICLE_RE = /^제(\d+)조(?:의(\d+))?\s*\(/;

// article 헤더 인덱스 수집 (정상 + 삭제)
const articleHeaderIdx = [];
for (const p of pList) {
  if (p.cls !== "HStyle11" && p.cls !== "HStyle8") continue;
  if (
    ARTICLE_HEADER_RE.test(p.text) ||
    ARTICLE_DELETED_HEADER_RE.test(p.text)
  ) {
    articleHeaderIdx.push(p);
  }
}
console.log(`HTML article headers: ${articleHeaderIdx.length}`);

// article number → start/end 인덱스 + 헤더 paragraph 참조
const articleBodyByKey = new Map();
for (let i = 0; i < articleHeaderIdx.length; i++) {
  const head = articleHeaderIdx[i];
  const next = articleHeaderIdx[i + 1];
  const start = head.idx + 1;
  const end = next ? next.idx : pList.length;
  const m =
    head.text.match(ARTICLE_HEADER_RE) ||
    head.text.match(ARTICLE_DELETED_HEADER_RE);
  if (!m) continue;
  const key = `${m[1]}${m[2] ? `_${m[2]}` : ""}`;
  articleBodyByKey.set(key, {
    start,
    end,
    headerText: head.text,
    headerP: head.$p,
  });
}

// 헤더 paragraph 의 ref_box 들만 추출 — article 헤더 옆에 붙은 약식 ref (法 N…) 들
function extractHeaderRefs($p) {
  const refs = [];
  $p.children().each((_, el) => {
    if (el.name !== "span") return;
    const $el = $(el);
    const c = classifySpan($el);
    if (c && c.kind === "ref_box") {
      const parsed = parseRefBox(c.text);
      for (const r of parsed) {
        refs.push({ type: "ref_article", raw: r.raw, target: r.target });
      }
    }
  });
  return refs;
}

// ───────── block 파서 ─────────
const CLAUSE_RE = /^([①-⑳])\s*(.*)$/s;
// 호: "1." 또는 가지호 "5의2."
const ITEM_RE = /^\s*(\d+)(?:의(\d+))?\.\s*(.*)$/s;
const SUB_RE = /^\s*([가-하])\.\s*(.*)$/s;

function tokenizeFirstChars(tokens) {
  // 첫 N 글자 추출 (헤더 라벨 제거용)
  let s = "";
  for (const t of tokens) {
    if (t.type === "text" || t.type === "underline") s += t.text;
    if (s.length >= 30) break;
  }
  return s;
}

function stripPrefixFromTokens(tokens, prefixLen) {
  // 토큰 시퀀스 앞에서 prefixLen 글자 제거
  let remaining = prefixLen;
  const out = [];
  let started = false;
  for (const t of tokens) {
    if (started) {
      out.push(t);
      continue;
    }
    if (t.type === "text" || t.type === "underline") {
      if (t.text.length <= remaining) {
        remaining -= t.text.length;
        if (remaining === 0) started = true;
      } else {
        out.push({ ...t, text: t.text.slice(remaining) });
        remaining = 0;
        started = true;
      }
    } else {
      out.push(t);
      started = true;
    }
  }
  return out;
}

function classifyAndStripParagraph(tokens) {
  const head = tokenizeFirstChars(tokens);

  // 부제목이 첫 토큰일 가능성: ① (subtitle) 본문... 또는 1. (subtitle) 본문...
  // 일단 라벨 prefix (①/N./가.) 식별
  // ① 시작
  const cm = head.match(CLAUSE_RE);
  if (cm) {
    const number = circledToNumber(cm[1]);
    const stripped = stripPrefixFromTokens(tokens, 1); // ① 한 글자 제거
    // 다음 토큰이 subtitle 이면 추출
    return { kind: "clause", number, label: cm[1], rest: stripWhitespaceLeft(stripped) };
  }
  const im = head.match(ITEM_RE);
  if (im) {
    const number = parseInt(im[1], 10);
    const branchText = im[2] ? `의${im[2]}` : "";
    // "  1. " 또는 "  5의2. " prefix 길이
    const prefixMatch = head.match(/^\s*\d+(?:의\d+)?\.\s*/);
    const stripped = stripPrefixFromTokens(tokens, prefixMatch[0].length);
    return {
      kind: "item",
      number,
      label: `${number}${branchText}.`,
      rest: stripped,
    };
  }
  const sm = head.match(SUB_RE);
  if (sm) {
    const letter = sm[1];
    const prefixMatch = head.match(/^\s*[가-하]\.\s*/);
    const stripped = stripPrefixFromTokens(tokens, prefixMatch[0].length);
    return { kind: "sub", letter, label: `${letter}.`, rest: stripped };
  }
  return { kind: "para", rest: tokens };
}

function stripWhitespaceLeft(tokens) {
  // 처음에 등장하는 빈/공백-only text|underline 토큰을 모두 건너뛰고,
  // 첫 의미 있는 토큰부터 시작하는 새 배열을 돌려준다.
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "text" || t.type === "underline") {
      const trimmed = t.text.replace(/^\s+/, "");
      if (trimmed === "") {
        i++; // 빈 토큰은 버림
        continue;
      }
      return [{ ...t, text: trimmed }, ...tokens.slice(i + 1)];
    }
    return tokens.slice(i);
  }
  return [];
}

// 첫 토큰이 subtitle 이면 분리
function extractSubtitle(tokens) {
  const stripped = stripWhitespaceLeft(tokens);
  if (stripped.length > 0 && stripped[0].type === "subtitle") {
    return { subtitle: stripped[0].text, inline: stripWhitespaceLeft(stripped.slice(1)) };
  }
  return { subtitle: null, inline: stripped };
}

function tokensToInline(tokens) {
  // 본문 중간 subtitle 은 inline subtitle 토큰으로 보존 (단서·예외 부제목 등 한 단락에 둘 이상의 부제목)
  const out = [];
  for (const t of tokens) {
    if (t.type === "text" && t.text === "") continue;
    out.push(t);
  }
  return out;
}

// ───────── article 별 body 구성 ─────────
function buildBody(start, end) {
  const blocks = [];
  let curClause = null;
  let curItem = null;
  // sub_article_group 스택 — HStyle5 박스가 다른 박스 안에 중첩될 수 있으므로
  // (예: 시행령 제5조 박스 안의 "구시행령 제5조제3항" 박스).
  // 각 항목: { group, table }.
  const subStack = [];
  function topSub() {
    return subStack.length > 0 ? subStack[subStack.length - 1].group : null;
  }
  function topSubTable() {
    return subStack.length > 0 ? subStack[subStack.length - 1].table : null;
  }

  function setClause(c) {
    curClause = c;
    curItem = null;
  }
  function setItem(it) {
    curItem = it;
  }

  for (let k = start; k < end; k++) {
    const p = pList[k];
    if (!p) continue;
    const text = p.text;
    if (!text) continue;

    // sub_article_group 경계: 현재 그룹의 table 이 더 이상 ancestor 가 아니면 한 단계씩 pop.
    // p.tableEls 는 innermost→outermost. 스택 top 의 table 이 ancestor 목록에 없으면 그룹을 벗어난 것.
    while (subStack.length > 0 && !p.tableEls.includes(topSubTable())) {
      subStack.pop();
    }

    // 시행령/규칙 헤더 (HStyle5) — 외부 박스 안에서 등장하면 중첩 그룹으로 부착
    if (p.cls === "HStyle5") {
      const newGroup = {
        kind: "sub_article_group",
        source: text,
        preface: [],
        articles: [],
      };
      const parent = topSub();
      if (parent) {
        if (parent.articles.length > 0) {
          parent.articles[parent.articles.length - 1].blocks.push(newGroup);
        } else {
          parent.preface.push(newGroup);
        }
      } else {
        blocks.push(newGroup);
      }
      subStack.push({ group: newGroup, table: p.tableEl });
      curClause = null;
      curItem = null;
      continue;
    }
    // 시행령 article 헤더 (HStyle4) — "제2조(미생물의 기탁)"
    if (p.cls === "HStyle4") {
      const m = text.match(/^제(\d+)조(?:의(\d+))?\s*\((.+?)\)/);
      const cur = topSub();
      if (m && cur) {
        cur.articles.push({
          number: parseInt(m[1], 10),
          branch: m[2] ? parseInt(m[2], 10) : null,
          title: m[3].trim(),
          blocks: [],
        });
        curClause = null;
        curItem = null;
        continue;
      }
    }
    // 시행령 본문 (HStyle6)
    if (p.cls === "HStyle6") {
      const tokens = paragraphTokens(p.$p);
      if (tokens.length === 0) continue;
      const cls = classifyAndStripParagraph(tokens);
      const { subtitle, inline } = extractSubtitle(cls.rest);
      const block = {
        kind: cls.kind,
        number: cls.number,
        label: cls.label,
        letter: cls.letter,
        subtitle,
        inline: tokensToInline(inline),
        children: [],
      };
      // 시행령 안의 항/호/목 트리 (간소화: 평면 push)
      const cur = topSub();
      if (cur) {
        if (cur.articles.length > 0) {
          cur.articles[cur.articles.length - 1].blocks.push(block);
        } else {
          // article 헤더(HStyle4) 보다 먼저 등장한 코멘트/머리말 — preface 로 보존
          // 작성자가 본인 조 prefix 를 반복한 경우 ("제N조(제목)…") 제거
          for (const t of block.inline) {
            if (t.type === "text") {
              t.text = t.text.replace(/제\d+조\(([^)]+)\)/g, "$1");
            }
          }
          cur.preface.push(block);
        }
      }
      continue;
    }

    // 그 외 일반 본문 (HStyle13, HStyle0) — 경계는 위 table 비교에서 이미 처리됨
    // HStyle0 은 일부 조문에서 [전문개정/제목개정/본조신설] 마커 표기에 사용됨 (작성자 inconsistency 보정)
    if (p.cls === "HStyle13" || p.cls === "HStyle0") {
      const tokens = paragraphTokens(p.$p);
      if (tokens.length === 0) continue;
      const cls = classifyAndStripParagraph(tokens);
      const { subtitle, inline } = extractSubtitle(cls.rest);

      if (cls.kind === "clause") {
        const block = {
          kind: "clause",
          number: cls.number,
          label: cls.label,
          subtitle,
          inline: tokensToInline(inline),
          children: [],
        };
        const cur = topSub();
        if (cur && cur.articles.length > 0) {
          cur.articles[cur.articles.length - 1].blocks.push(block);
        } else {
          blocks.push(block);
        }
        setClause(block);
      } else if (cls.kind === "item") {
        const block = {
          kind: "item",
          number: cls.number,
          label: cls.label,
          subtitle,
          inline: tokensToInline(inline),
          children: [],
        };
        if (curClause) curClause.children.push(block);
        else blocks.push(block);
        setItem(block);
      } else if (cls.kind === "sub") {
        const block = {
          kind: "sub",
          letter: cls.letter,
          label: cls.label,
          subtitle,
          inline: tokensToInline(inline),
          children: [],
        };
        if (curItem) curItem.children.push(block);
        else if (curClause) curClause.children.push(block);
        else blocks.push(block);
      } else {
        // para — 라벨 없는 단락 (단일 항 조문 또는 부수 ref/개정 표시).
        // ParaBlock 은 block.subtitle 필드가 없으므로 첫 부제목도 inline 에 보존.
        const block = {
          kind: "para",
          inline: tokensToInline(cls.rest),
        };
        // ref_article / amendment_note 만 있는 단독 라인은 직전 clause/item 의 inline 에 병합
        const onlyRefOrAmend = block.inline.every(
          (t) =>
            t.type === "ref_article" || t.type === "amendment_note" || (t.type === "text" && /^\s*$/.test(t.text)),
        );
        if (onlyRefOrAmend && (curItem || curClause)) {
          (curItem ?? curClause).inline.push(...block.inline);
        } else if (block.inline.length > 0) {
          const cur = topSub();
          if (cur && cur.articles.length > 0) {
            cur.articles[cur.articles.length - 1].blocks.push(block);
          } else {
            blocks.push(block);
          }
        }
      }
    }
  }

  return blocks;
}

// ───────── 결과 빌드 ─────────
const output = JSON.parse(JSON.stringify(v1));
let updatedCount = 0;
let withSubArticle = 0;
let underlineCount = 0;
let refCount = 0;

function countTokens(blocks) {
  for (const b of blocks) {
    if (b.kind === "sub_article_group") {
      withSubArticle++;
      for (const sa of b.articles) countTokens(sa.blocks);
      continue;
    }
    if (b.inline) {
      for (const t of b.inline) {
        if (t.type === "underline") underlineCount++;
        if (t.type === "ref_article") refCount++;
      }
    }
    if (b.children) countTokens(b.children);
  }
}

for (const ch of output.chapters) {
  for (const a of ch.articles) {
    const key = `${a.number}${a.branch ? `_${a.branch}` : ""}`;
    const range = articleBodyByKey.get(key);
    if (!range) continue;
    const newBlocks = buildBody(range.start, range.end);
    // 헤더 옆 ref_box → 본문 시작에 header_refs 블록 prepend
    const headerRefs = extractHeaderRefs(range.headerP);
    if (headerRefs.length > 0) {
      newBlocks.unshift({ kind: "header_refs", refs: headerRefs });
    }
    // 삭제 헤더 ("제N조 삭제 <YYYY.M.D.>") 의 날짜를 본문 첫 줄에 표시
    const delMatch = range.headerText.match(/삭제\s*<\s*([^>]+?)\s*>/);
    if (delMatch) {
      newBlocks.unshift({
        kind: "para",
        inline: [
          { type: "amendment_note", text: `삭제 <${delMatch[1]}>` },
        ],
      });
    }
    if (newBlocks.length > 0) {
      a.blocks = newBlocks;
      updatedCount++;
      countTokens(newBlocks);
    }
  }
}

output.generatedAt = new Date().toISOString();
output.parserVersion = 2;

writeFileSync(OUT, JSON.stringify(output, null, 2), "utf8");
console.log(
  `OK → updated articles=${updatedCount}, sub-article groups=${withSubArticle}, underlines=${underlineCount}, refs=${refCount}`,
);
console.log(`output: ${OUT}`);
