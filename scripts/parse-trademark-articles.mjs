// 리담상표법 조문정리 HTML → parsed-articles JSON (parsed-articles-v2 스키마 호환).
//
// 입력: source/_converted/trademark-articles.utf8.html (Hancom HTML → UTF-8)
// 출력: source/_converted/parsed-articles-trademark.json
//
// 문서 규약 (분석 결과):
//   - 조 헤더: <p class=HStyle4|HStyle5> "제N조(의M)?(제목) (★★★)?"  — ★ 개수 = 중요도
//   - 항: "① ..." (부제목은 선두 굵은 (...))
//   - 호: "1. ...", 목: "가. ..."
//   - 밑줄: text-decoration:underline span
//   - 개정표시: 서울남산 장체 폰트 또는 [개정/신설/...] / <개정 ...>
//   - 부제목: KoPubWorld돋움체 Bold 의 (...) 선두 라벨
//   - 장(章): 본문에 없고 목차(상단)에만 → 목차에서 조→장 매핑 추출
//   - cf/주의(HStyle26): para 로 보존
//   - 참조(제N조 등)는 평문 유지 — 렌더러가 자동 인식

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HTML = resolve(ROOT, "source/_converted/trademark-articles.utf8.html");
const OUT = resolve(ROOT, "source/_converted/parsed-articles-trademark.json");

const $ = cheerio.load(readFileSync(HTML, "utf8"));
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const circledToNum = (ch) => (CIRCLED.indexOf(ch) >= 0 ? CIRCLED.indexOf(ch) + 1 : null);

const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

// 원문 오타 보정 — 리담 상표법 교재가 특허법 템플릿에서 복제되며 생긴 장 제목 오기.
const CHAPTER_TITLE_OVERRIDES = {
  2: "상표등록요건 및 상표등록출원",
};

// ── span 분류 ────────────────────────────────────────────────────────────
function classifySpan($el) {
  const style = ($el.attr("style") || "").replace(/\s+/g, " ").toLowerCase();
  const text = $el.text();
  if (!text) return null;
  const fontM = /font-family:\s*"?([^";]+)/.exec(style);
  const font = fontM ? fontM[1] : "";
  // 개정표시 — 서울남산 장체(작은 글씨) 또는 [개정...]/<개정...>
  if (/서울남산\s*장체/.test(font)) {
    return { kind: "amendment", text: text.trim() };
  }
  if (/^\s*[[<](개정|신설|삭제|전문개정|본조신설|본문개정|제목개정|타법개정|시행)/.test(text)) {
    return { kind: "amendment", text: text.trim() };
  }
  // 굵은 돋움체 → 부제목 후보(bold)
  if (/돋움체/.test(font) && (/bold/.test(style) || /font-weight:\s*(bold|[6-9]00)/.test(style))) {
    return { kind: "bold", text };
  }
  // 밑줄
  if (/text-decoration[^;]*underline/.test(style)) {
    return { kind: "underline", text };
  }
  return { kind: "text", text };
}

// 인접 bold 병합 → (...) 부제목 / [...] 강조 / 그 외 text
function mergeBold(tokens) {
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
      const sub = /^\s*\((.+)\)\s*$/.exec(merged);
      const ann = /^\s*\[(.+)\]\s*$/.exec(merged);
      if (sub) out.push({ kind: "subtitle", text: sub[1] });
      else if (ann) out.push({ kind: "annotation", text: ann[1] });
      else out.push({ kind: "text", text: merged });
      i = j;
    } else {
      out.push(t);
      i++;
    }
  }
  return out;
}

function paragraphTokens($p) {
  const raw = [];
  $p.children().each((_, el) => {
    if (el.name === "br") {
      raw.push({ kind: "text", text: " " });
      return;
    }
    if (el.name !== "span") {
      const t = $(el).text();
      if (t) raw.push({ kind: "text", text: t });
      return;
    }
    const $el = $(el);
    if (($el.attr("class") || "").includes("hnc_page_break")) return;
    const c = classifySpan($el);
    if (c) raw.push(c);
  });
  return mergeBold(raw)
    .map((t) => {
      if (!t) return null;
      if (t.kind === "text") return { type: "text", text: t.text };
      if (t.kind === "underline") return { type: "underline", text: t.text };
      if (t.kind === "subtitle") return { type: "subtitle", text: t.text };
      if (t.kind === "annotation") return { type: "annotation", text: t.text };
      if (t.kind === "amendment") return { type: "amendment_note", text: t.text };
      return null;
    })
    .filter(Boolean);
}

// inline 토큰 배열 선두에서 마커 문자열 제거 (첫 text 토큰만)
function stripMarker(tokens, markerLen) {
  const out = tokens.map((t) => ({ ...t }));
  for (const t of out) {
    if (t.type === "text") {
      t.text = t.text.replace(/^\s+/, "");
      t.text = t.text.slice(markerLen).replace(/^\s+/, "");
      break;
    }
    break;
  }
  // 선두 빈 text 제거
  while (out.length && out[0].type === "text" && out[0].text === "") out.shift();
  return out;
}

// 선두 subtitle 토큰 추출 → {subtitle, inline}
function splitSubtitle(tokens) {
  let subtitle = null;
  const rest = tokens.slice();
  if (rest.length && rest[0].type === "subtitle") {
    subtitle = rest.shift().text;
  }
  // subtitle 이 inline 으로 남으면 안 되므로, 중간 subtitle 토큰은 text 로 강등(드묾)
  const inline = rest.map((t) => (t.type === "subtitle" ? { type: "text", text: `(${t.text})` } : t));
  return { subtitle, inline: cleanInline(inline) };
}

// 빈 text 병합/제거
function cleanInline(tokens) {
  const out = [];
  for (const t of tokens) {
    if (t.type === "text") {
      if (t.text === "") continue;
      const last = out[out.length - 1];
      if (last && last.type === "text") last.text += t.text;
      else out.push({ ...t });
    } else out.push({ ...t });
  }
  return out;
}

// ── 본문 paragraph 목록 ────────────────────────────────────────────────────
const pList = [];
$("p").each((_, el) => {
  const $p = $(el);
  pList.push({ $p, cls: norm($p.attr("class")) || "", text: norm($p.text()) });
});

// 본문 시작: HStyle4|HStyle5 의 첫 "제1조(" 헤더
let bodyStart = pList.findIndex(
  (p) => /^HStyle[45]$/.test(p.cls) && /^제1조\s*\(/.test(p.text),
);
if (bodyStart < 0) throw new Error("본문 시작점(제1조 헤더)을 찾지 못함");

// ── 목차에서 조 → 장 매핑 ──────────────────────────────────────────────────
const chapterMeta = []; // {number, label, title}
const chapterByArticle = new Map(); // "N" | "N의M" -> chapterNumber
{
  let cur = null;
  for (let i = 0; i < bodyStart; i++) {
    const t = pList[i].text;
    const chM = /^제\s*(\d+)\s*장\s+(.+?)(?:\s*[·∙ㆍ.]\s*\d+)?$/.exec(t);
    if (chM) {
      const num = +chM[1];
      const rawTitle = norm(chM[2]).replace(/\s*[·∙ㆍ]\s*\d+$/, "");
      cur = { number: num, title: CHAPTER_TITLE_OVERRIDES[num] ?? rawTitle };
      cur.label = `제${cur.number}장 ${cur.title}`;
      chapterMeta.push(cur);
      continue;
    }
    const aM = /^제\s*(\d+)\s*조(?:의(\d+))?/.exec(t);
    if (aM && cur) {
      const key = aM[2] ? `${aM[1]}의${aM[2]}` : aM[1];
      if (!chapterByArticle.has(key)) chapterByArticle.set(key, cur.number);
    }
  }
}
if (chapterMeta.length === 0) {
  // 목차에 장이 없으면 단일 장으로
  chapterMeta.push({ number: 1, title: "전문", label: "제1장 전문" });
}

// ── 본문 walk → articles ───────────────────────────────────────────────────
const HEADER_RE = /^제(\d+)조(?:의(\d+))?\s*\(([^)]*)\)/;
const articles = [];
let curArticle = null;
let curClause = null;
let curItem = null;

function pushBlock(block) {
  if (block.kind === "clause") {
    curArticle.blocks.push(block);
    curClause = block;
    curItem = null;
  } else if (block.kind === "item") {
    if (curClause) curClause.children.push(block);
    else curArticle.blocks.push(block);
    curItem = block;
  } else if (block.kind === "sub") {
    if (curItem) curItem.children.push(block);
    else if (curClause) curClause.children.push(block);
    else curArticle.blocks.push(block);
  } else {
    // para
    curArticle.blocks.push(block);
  }
}

for (let i = bodyStart; i < pList.length; i++) {
  const { cls, text, $p } = pList[i];
  if (!text) continue;

  // 조 헤더
  const hM = HEADER_RE.exec(text);
  if (/^HStyle[45]$/.test(cls) && hM) {
    const number = +hM[1];
    const branch = hM[2] ? +hM[2] : null;
    const title = norm(hM[3]);
    // 중요도 = 헤더의 ★ 개수. 별 표시 없으면 0 (일반 조문).
    const stars = (text.match(/★/g) || []).length;
    const importance = Math.min(3, stars);
    curArticle = { number, branch, title, importance, blocks: [], headerRefs: [] };
    articles.push(curArticle);
    curClause = null;
    curItem = null;
    continue;
  }
  if (!curArticle) continue; // 헤더 이전 잡문 skip

  const tokens = paragraphTokens($p);
  if (tokens.length === 0) continue;
  const firstText = tokens[0].type === "text" ? tokens[0].text.replace(/^\s+/, "") : "";

  // 항/호/목 마커
  let m;
  if ((m = /^([①-⑳])/.exec(firstText))) {
    const stripped = stripMarker(tokens, firstText.indexOf(m[1]) + m[1].length);
    const { subtitle, inline } = splitSubtitle(stripped);
    pushBlock({ kind: "clause", number: circledToNum(m[1]), label: m[1], subtitle, inline, children: [] });
  } else if ((m = /^(\d+)\.\s*/.exec(firstText))) {
    const stripped = stripMarker(tokens, m[0].length);
    const { subtitle, inline } = splitSubtitle(stripped);
    pushBlock({ kind: "item", number: +m[1], label: `${m[1]}.`, subtitle, inline, children: [] });
  } else if ((m = /^([가-하])\.\s*/.exec(firstText))) {
    const stripped = stripMarker(tokens, m[0].length);
    const { subtitle, inline } = splitSubtitle(stripped);
    pushBlock({ kind: "sub", letter: m[1], label: `${m[1]}.`, subtitle, inline, children: [] });
  } else {
    // para (lead text, cf/주의, 개정 단독 등)
    const { subtitle, inline } = splitSubtitle(tokens);
    if (inline.length === 0) continue;
    const para = { kind: "para", inline };
    if (subtitle) para.inline.unshift({ type: "subtitle", text: subtitle }); // para 엔 subtitle 필드 없음 → 다시 inline 으로
    // 위 unshift 는 schema 상 para subtitle 불가라 text 로 변환
    if (subtitle) {
      para.inline.shift();
      para.inline.unshift({ type: "text", text: `(${subtitle}) ` });
    }
    curArticle.blocks.push(para);
  }
}

// ── chapters[] 구성 ────────────────────────────────────────────────────────
const chById = new Map(chapterMeta.map((c) => [c.number, { ...c, branch: null, articles: [] }]));
let lastChapter = chapterMeta[0].number;
for (const a of articles) {
  const key = a.branch ? `${a.number}의${a.branch}` : String(a.number);
  const chNum = chapterByArticle.get(key) ?? lastChapter;
  lastChapter = chNum;
  const ch = chById.get(chNum) ?? chById.get(chapterMeta[0].number);
  ch.articles.push(a);
}
const chapters = chapterMeta.map((c) => chById.get(c.number)).filter((c) => c.articles.length > 0);

const articlesWithBody = articles.filter((a) => a.blocks.length > 0).length;
const out = {
  generatedAt: new Date().toISOString(),
  source: "[내지] 리담상표법 조문정리 [제1판].hwp",
  publication: "리담 상표법 조문정리 제1판",
  stats: { chapters: chapters.length, articles: articles.length, articlesWithBody },
  chapters,
  parserVersion: "trademark-1",
};
writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
console.log(
  `✓ ${OUT}\n  chapters=${chapters.length} articles=${articles.length} withBody=${articlesWithBody}`,
);
console.log(
  "  chapters: " + chapters.map((c) => `${c.label}(${c.articles.length})`).join(" / "),
);
