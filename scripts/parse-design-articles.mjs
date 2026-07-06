// 리담 디자인보호법 조문정리 HTML → parsed-articles JSON (parsed-articles-v2 스키마 호환).
//
// 입력: source/_converted/design-articles.utf8.html (Hancom HTML → UTF-8)
// 출력: source/_converted/parsed-articles-design.json
//
// 문서 규약 (분석 결과 — 상표 교재와 다름):
//   - 조 헤더: <p class=HStyle4> "제N조(의M)? 【제목】(★★★)?" — ★ 개수 = 중요도, 삭제 조문 없음
//   - 항: HStyle3 "① ..." / 호: HStyle2 "1. ..." (가지호 "2의2." 존재) / 목: "가. ..."
//   - 단일문단 본문: HStyle16
//   - 부제목: KoPubWorld돋움체 Bold span 의 (...) 선두 라벨 (font-family 에 Bold 포함)
//   - 밑줄: text-decoration:underline span
//   - 개정표시: "[개정 ...]" "[시행일 ...]" 선두 span
//   - ※ cf/주의: "※" 선두 문단 → 강사 메모(content_comments)
//   - 함께 공부할 조문(시행령/규칙/구법/민소법): **표(table) 내부** — HStyle19 출처 라벨 +
//     HStyle4 "제N조(제목)" 헤더(괄호형) + 본문(HStyle3/2/16). HStyle19 없는 표는 장식/판권 → skip
//   - 장(章): 본문에 없고 목차(상단)에만 → 목차의 【】 조 항목에서 조→장 매핑 추출
//   - 절(節): 제8장 내 HStyle17 — 트리 미사용, skip
//   - 후미 판권면: "리담디자인보호법 조문정리" 문단에서 본문 종료

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HTML = resolve(ROOT, "source/_converted/design-articles.utf8.html");
const OUT = resolve(ROOT, "source/_converted/parsed-articles-design.json");

const $ = cheerio.load(readFileSync(HTML, "utf8"));
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const circledToNum = (ch) => (CIRCLED.indexOf(ch) >= 0 ? CIRCLED.indexOf(ch) + 1 : null);

const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

// ── span 분류 ────────────────────────────────────────────────────────────
function classifySpan($el) {
  const style = ($el.attr("style") || "").replace(/\s+/g, " ").toLowerCase();
  const text = $el.text();
  if (!text) return null;
  const fontM = /font-family:\s*"?([^";]+)/.exec(style);
  const font = fontM ? fontM[1] : "";
  if (/^\s*[[<](개정|신설|삭제|전문개정|본조신설|본문개정|제목개정|타법개정|시행)/.test(text)) {
    return { kind: "amendment", text: text.trim() };
  }
  // 돋움체 Bold(부제목·참조칩) — font-family 자체에 bold 포함
  if (/돋움체/.test(font) && /bold/.test(style)) {
    return { kind: "bold", text };
  }
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

// ── 본문 paragraph 목록 (임베드 표 소속 여부 포함) ───────────────────────────
// 표 중 HStyle19(출처 라벨) 문단을 가진 것만 임베드 — 나머지 표(장식/판권)는 skip.
const pList = [];
$("p").each((_, el) => {
  const $p = $(el);
  let tableEl = null;
  let cur = el.parent;
  while (cur) {
    if (cur.name === "table") {
      tableEl = cur;
      break;
    }
    cur = cur.parent;
  }
  pList.push({ $p, cls: norm($p.attr("class")) || "", text: norm($p.text()), tableEl });
});
const embedTables = new Set();
for (const p of pList) {
  if (p.tableEl && p.cls === "HStyle19" && p.text) embedTables.add(p.tableEl);
}
for (const p of pList) {
  p.inEmbed = p.tableEl ? embedTables.has(p.tableEl) : false;
  p.skipTable = p.tableEl ? !embedTables.has(p.tableEl) : false;
}

// 본문 시작: HStyle4 의 첫 "제1조 【" 헤더
const HEADER_RE = /^제(\d+)조(?:의(\d+))?\s*【([^】]*)】/;
let bodyStart = pList.findIndex((p) => p.cls === "HStyle4" && /^제1조\s*【/.test(p.text));
if (bodyStart < 0) throw new Error("본문 시작점(제1조 【목적】 헤더)을 찾지 못함");

// ── 목차에서 조 → 장 매핑 (【】 항목만 — 괄호형은 임베드 시행령·규칙) ──────────
const chapterMeta = []; // {number, label, title}
const chapterByArticle = new Map(); // "N" | "N의M" -> chapterNumber
{
  let cur = null;
  for (let i = 0; i < bodyStart; i++) {
    const t = pList[i].text;
    const chM = /^제\s*(\d+)\s*장\s+(.+?)(?:\s*[·∙ㆍ.]\s*\d+)?$/.exec(t);
    if (chM) {
      const num = +chM[1];
      const title = norm(chM[2]).replace(/\s*[·∙ㆍ]\s*\d+$/, "");
      cur = { number: num, title };
      cur.label = `제${cur.number}장 ${cur.title}`;
      chapterMeta.push(cur);
      continue;
    }
    const aM = /^제\s*(\d+)\s*조(?:의(\d+))?\s*【/.exec(t);
    if (aM && cur) {
      const key = aM[2] ? `${aM[1]}의${aM[2]}` : aM[1];
      if (!chapterByArticle.has(key)) chapterByArticle.set(key, cur.number);
    }
  }
}
if (chapterMeta.length === 0) {
  chapterMeta.push({ number: 1, title: "전문", label: "제1장 전문" });
}

// ── 본문 walk → articles ───────────────────────────────────────────────────
const SUB_HEADER_RE = /^제(\d+)조(?:의(\d+))?\s*(?:\(([^)]*)\))?/; // 임베드 조 헤더(괄호형)
const articles = [];
let curArticle = null;
let curGroup = null; // sub_article_group (임베드 표)
let curSub = null;
let curGroupTable = null; // 현재 그룹의 table 엘리먼트 — 표를 벗어나면 그룹 종료
const mainCtx = { clause: null, item: null };
const subCtx = { clause: null, item: null };

function pushBlock(block) {
  const top = curSub ? curSub.blocks : curArticle.blocks;
  const ctx = curSub ? subCtx : mainCtx;
  if (block.kind === "clause") {
    top.push(block);
    ctx.clause = block;
    ctx.item = null;
  } else if (block.kind === "item") {
    if (ctx.clause) ctx.clause.children.push(block);
    else top.push(block);
    ctx.item = block;
  } else if (block.kind === "sub") {
    if (ctx.item) ctx.item.children.push(block);
    else if (ctx.clause) ctx.clause.children.push(block);
    else top.push(block);
  } else {
    top.push(block); // para
  }
}

function openSubFromSource() {
  const sn = /제(\d+)조(?:의(\d+))?/.exec(curGroup.source);
  curSub = {
    number: sn ? +sn[1] : curGroup.articles.length + 1,
    branch: sn && sn[2] ? +sn[2] : null,
    title: "",
    blocks: [],
  };
  curGroup.articles.push(curSub);
  subCtx.clause = null;
  subCtx.item = null;
}

for (let i = bodyStart; i < pList.length; i++) {
  const { cls, text, $p, inEmbed, skipTable, tableEl } = pList[i];
  if (skipTable) continue;
  if (!text) continue;

  // 임베드 표를 벗어나면 그룹 종료
  if (curGroup && (!inEmbed || tableEl !== curGroupTable)) {
    curGroup = null;
    curSub = null;
    curGroupTable = null;
  }

  // 후미 판권면 → 본문 종료
  if (!inEmbed && /^리담\s*디자인보호법/.test(text)) break;

  // 절(節) 헤더 skip
  if (/^제\d+절\s/.test(text)) continue;

  if (inEmbed) {
    // 임베드 표 내부 — 출처 라벨 / 조 헤더(괄호형) / 본문
    if (cls === "HStyle19") {
      curGroup = { kind: "sub_article_group", source: text, articles: [] };
      curGroupTable = tableEl;
      if (curArticle) curArticle.blocks.push(curGroup);
      curSub = null;
      subCtx.clause = null;
      subCtx.item = null;
      continue;
    }
    if (!curGroup || !curArticle) continue; // 출처 라벨 이전 잡문
    if (cls === "HStyle4") {
      const sm = SUB_HEADER_RE.exec(text);
      curSub = {
        number: sm ? +sm[1] : curGroup.articles.length + 1,
        branch: sm && sm[2] ? +sm[2] : null,
        title: sm && sm[3] ? norm(sm[3]) : norm(text.replace(/^제\d+조(?:의\d+)?\s*/, "")),
        blocks: [],
      };
      curGroup.articles.push(curSub);
      subCtx.clause = null;
      subCtx.item = null;
      continue;
    }
    if (!curSub) openSubFromSource();
  } else {
    // 메인 조 헤더 (HStyle4 + 【】)
    const hM = cls === "HStyle4" ? HEADER_RE.exec(text) : null;
    if (hM) {
      const stars = (text.match(/★/g) || []).length;
      curArticle = {
        number: +hM[1],
        branch: hM[2] ? +hM[2] : null,
        title: norm(hM[3]),
        importance: Math.min(3, stars),
        blocks: [],
        headerRefs: [],
        notes: [], // ※ cf/주의 — 강사 메모(content_comments)
      };
      articles.push(curArticle);
      mainCtx.clause = null;
      mainCtx.item = null;
      curGroup = null;
      curSub = null;
      curGroupTable = null;
      continue;
    }
    if (!curArticle) continue;

    // ※ cf/주의 — 강사 메모
    if (text.startsWith("※")) {
      curArticle.notes.push(norm(text));
      continue;
    }
  }

  if (!curArticle) continue;

  const tokens = paragraphTokens($p);
  if (tokens.length === 0) continue;
  const firstText = tokens[0].type === "text" ? tokens[0].text.replace(/^\s+/, "") : "";

  let m;
  if ((m = /^([①-⑳])/.exec(firstText))) {
    const stripped = stripMarker(tokens, firstText.indexOf(m[1]) + m[1].length);
    const { subtitle, inline } = splitSubtitle(stripped);
    pushBlock({ kind: "clause", number: circledToNum(m[1]), label: m[1], subtitle, inline, children: [] });
  } else if ((m = /^(\d+)(?:의(\d+))?\.\s*/.exec(firstText))) {
    const stripped = stripMarker(tokens, m[0].length);
    const { subtitle, inline } = splitSubtitle(stripped);
    const label = m[2] ? `${m[1]}의${m[2]}.` : `${m[1]}.`;
    pushBlock({ kind: "item", number: +m[1], label, subtitle, inline, children: [] });
  } else if ((m = /^([가-하])\.\s*/.exec(firstText))) {
    const stripped = stripMarker(tokens, m[0].length);
    const { subtitle, inline } = splitSubtitle(stripped);
    pushBlock({ kind: "sub", letter: m[1], label: `${m[1]}.`, subtitle, inline, children: [] });
  } else {
    const { subtitle, inline } = splitSubtitle(tokens);
    if (inline.length === 0) continue;
    if (subtitle) inline.unshift({ type: "text", text: `(${subtitle}) ` });
    pushBlock({ kind: "para", inline });
  }
}

// ── 빈 함께-공부할-조문 정리 ──────────────────────────────────────────────────
for (const a of articles) {
  for (const b of a.blocks) {
    if (b.kind === "sub_article_group") {
      b.articles = b.articles.filter((sa) => sa.blocks.length > 0);
    }
  }
  a.blocks = a.blocks.filter(
    (b) => !(b.kind === "sub_article_group" && b.articles.length === 0),
  );
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
  source: "source/디자인업로드/조문.hwp",
  publication: "리담 디자인보호법 조문정리 제1판 (2026-07-01)",
  stats: { chapters: chapters.length, articles: articles.length, articlesWithBody },
  chapters,
  parserVersion: "design-1",
};
writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
console.log(
  `✓ ${OUT}\n  chapters=${chapters.length} articles=${articles.length} withBody=${articlesWithBody}`,
);
console.log(
  "  chapters: " + chapters.map((c) => `${c.label}(${c.articles.length})`).join(" / "),
);
