// 리담 특허법 조문 텍스트 → 구조화 JSON 파서
// input:  source/_converted/리담특허법 조문.utf8.txt
// output: source/_converted/parsed-articles.json
//
// 조문 헤더 규약 (리담 교재 형식):
//   제29조 【특허요건】(★★★)  法 62Ⅰ, 63의2, 132의2①Ⅰ, 133①Ⅰ
//   제29조의2 【...】(★★)
//   제31조 삭제 <2006.3.3.>
//
// 본문:
//   ① (산업상 이용가능성) 산업상 이용할 수 있는 발명으로서 ...
//     1. (신규성 상실사유) 특허출원 전에 ...
//
// 출력 JSON 구조:
//   { generatedAt, source, chapters: [{ number, label, articles: [{ number, branch, title, importance, headerRefs, blocks }] }] }

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const INPUT = resolve(ROOT, "source/_converted/리담특허법 조문.utf8.txt");
const OUTPUT = resolve(ROOT, "source/_converted/parsed-articles.json");

// 본문 시작점: 첫 chapter 헤더 위치를 동적으로 찾는다.
const CHAPTER_RE = /^제(\d+)장(?:의(\d+))?\s+(.+?)\s*$/;
// 특허법 본문 article 헤더 (사각괄호 + 옵션 중요도 + 옵션 法 ref)
const ARTICLE_RE = /^제(\d+)조(?:의(\d+))?\s+【(.+?)】\s*(?:\((★+)\))?\s*(.*)$/;
// 삭제된 조: "제N조 삭제 <2006.3.3.>"
const ARTICLE_DELETED_RE = /^제(\d+)조(?:의(\d+))?\s+삭제\s*<(.+?)>$/;
// 인용된 다른 법령 조문 (둥근괄호) — 부수 자료, 본 article 본문에 합침
const ARTICLE_FOREIGN_RE = /^제\d+조(?:의\d+)?\s*\(.+?\)/;
// 항: ① ② ...
const CLAUSE_RE = /^([①-⑳])\s*(.+)$/;
// 호: 들여쓰기 + N. 본문
const ITEM_RE = /^\s+(\d+)\.\s*(.+)$/;
// 부제 (괄호 안 짧은 라벨): "(산업상 이용가능성)"
const SUBTITLE_RE = /^\(([^)]{1,40})\)\s*(.*)$/;
// 약식 inline ref: 法 29 / 法 81의3 / 法 29① / 法 29①Ⅰ / 法 29①1.가
const INLINE_REF_RE =
  /法\s*(\d+(?:의\d+)?)([①-⑳])?(?:(\d+)(?:\.([가-하]))?)?/g;
// 개정 표시
const AMENDMENT_NOTE_RE = /<(?:개정|신설|시행|삭제|타법개정)\s+[\d.,\s]+>/g;
const FULL_AMENDMENT_RE = /\[전문개정\s+\d{4}\.\d+\.\d+\.?\]/g;

const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
function circledToNumber(ch) {
  const i = CIRCLED_DIGITS.indexOf(ch);
  return i >= 0 ? i + 1 : null;
}

const raw = readFileSync(INPUT, "utf8");
const lines = raw.split(/\r?\n/);

// 본문 시작: 첫 "제1장 " (header 형식) 이 본문 영역 시작.
// 목차에 등장하는 "제1장 총칙 · 1" 같은 라인은 끝에 페이지 번호가 있어 다른 패턴.
let bodyStart = -1;
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(CHAPTER_RE);
  if (m && m[1] === "1" && !lines[i].includes("·")) {
    bodyStart = i;
    break;
  }
}
if (bodyStart === -1) {
  console.error("본문 시작점 찾지 못함");
  process.exit(1);
}

const chapters = [];
let curChapter = null;
let curArticle = null;
let curArticleLines = [];

function flushArticle() {
  if (!curArticle) return;
  curArticle.blocks = parseBlocks(curArticleLines);
  curArticle.headerRefs = extractInlineRefs(curArticle.headerRest);
  delete curArticle.headerRest;
  curChapter.articles.push(curArticle);
  curArticle = null;
  curArticleLines = [];
}

function flushChapter() {
  flushArticle();
  if (curChapter) chapters.push(curChapter);
  curChapter = null;
}

for (let i = bodyStart; i < lines.length; i++) {
  const line = lines[i];

  // chapter 시작
  const cm = line.match(CHAPTER_RE);
  if (cm && !line.includes("·")) {
    flushChapter();
    curChapter = {
      number: parseInt(cm[1], 10),
      branch: cm[2] ? parseInt(cm[2], 10) : null,
      label: line.trim(),
      title: cm[3].trim(),
      articles: [],
    };
    continue;
  }

  if (!curChapter) continue;

  // 삭제된 article
  const dm = line.match(ARTICLE_DELETED_RE);
  if (dm) {
    flushArticle();
    curArticle = {
      number: parseInt(dm[1], 10),
      branch: dm[2] ? parseInt(dm[2], 10) : null,
      title: "(삭제)",
      importance: 0,
      deleted: dm[3].trim(),
      headerRest: "",
    };
    continue;
  }

  // 정식 article (사각괄호)
  const am = line.match(ARTICLE_RE);
  if (am) {
    flushArticle();
    curArticle = {
      number: parseInt(am[1], 10),
      branch: am[2] ? parseInt(am[2], 10) : null,
      title: am[3].trim(),
      importance: am[4] ? am[4].length : 0,
      headerRest: am[5] ?? "",
    };
    continue;
  }

  // 부칙 등 비조문 행으로 보이는 끝부분: chapter 안에 article 없으면 무시
  // 그 외 모든 라인은 현재 article 의 raw lines 누적
  if (curArticle) curArticleLines.push(line);
}
flushChapter();

// 블록 파서 — 단순화: 라인 단위로 clause / item / paragraph 식별
function parseBlocks(rawLines) {
  const out = [];
  let curClause = null;

  function pushClause(c) {
    out.push(c);
    curClause = c;
  }

  for (const raw of rawLines) {
    const trimRight = raw.replace(/\s+$/, "");
    if (!trimRight) continue;

    // 호: 들여쓰기 N.
    const im = trimRight.match(ITEM_RE);
    if (im && curClause) {
      const text = im[2];
      const { subtitle, body } = splitSubtitle(text);
      curClause.children.push({
        kind: "item",
        number: parseInt(im[1], 10),
        label: `${im[1]}.`,
        subtitle,
        inline: extractInline(body),
        children: [],
      });
      continue;
    }

    // 항: 시작이 ① 등
    const clm = trimRight.match(CLAUSE_RE);
    if (clm) {
      const number = circledToNumber(clm[1]);
      if (number !== null) {
        const { subtitle, body } = splitSubtitle(clm[2]);
        pushClause({
          kind: "clause",
          number,
          label: clm[1],
          subtitle,
          inline: extractInline(body),
          children: [],
        });
        continue;
      }
    }

    // 그 외: 일반 단락 또는 헤더 우측의 약식 ref 라인 (法 N...)
    const text = trimRight.trim();
    // 단독 ref 라인 — 직전 clause 의 inline 끝에 붙이기
    if (/^法\s/.test(text) && curClause) {
      curClause.inline.push(...extractInline(text));
      continue;
    }
    // [전문개정 ...] / [본조신설 ...] 메타
    if (FULL_AMENDMENT_RE.test(text)) {
      out.push({ kind: "para", inline: [{ type: "amendment_note", text }] });
      continue;
    }
    out.push({ kind: "para", inline: extractInline(text) });
  }

  return out;
}

function splitSubtitle(text) {
  const m = text.match(SUBTITLE_RE);
  if (!m) return { subtitle: null, body: text };
  return { subtitle: m[1], body: m[2] };
}

// inline 토큰화: ref_article + amendment_note + text
function extractInline(text) {
  if (!text) return [];
  const tokens = [];
  let cursor = 0;

  // 모든 매칭 위치 수집 (개정 표시 + ref)
  const matches = [];
  AMENDMENT_NOTE_RE.lastIndex = 0;
  for (const m of text.matchAll(AMENDMENT_NOTE_RE)) {
    matches.push({ start: m.index, end: m.index + m[0].length, kind: "amendment", raw: m[0] });
  }
  INLINE_REF_RE.lastIndex = 0;
  for (const m of text.matchAll(INLINE_REF_RE)) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: "ref",
      raw: m[0],
      article: m[1],
      circled: m[2] ?? null,
      item: m[3] ?? null,
      sub: m[4] ?? null,
    });
  }
  matches.sort((a, b) => a.start - b.start);

  // 겹침 제거 (간단 우선순위: 먼저 매칭된 것)
  const filtered = [];
  for (const m of matches) {
    if (filtered.length > 0 && filtered[filtered.length - 1].end > m.start) continue;
    filtered.push(m);
  }

  for (const m of filtered) {
    if (cursor < m.start) {
      tokens.push({ type: "text", text: text.slice(cursor, m.start) });
    }
    if (m.kind === "amendment") {
      tokens.push({ type: "amendment_note", text: m.raw });
    } else {
      // article 번호 분리: "29의3" → article: 29, branch: 3
      const [base, branch] = m.article.split("의");
      const target = {
        law_code: "patent",
        article: parseInt(base, 10),
      };
      if (branch) target.branch = parseInt(branch, 10);
      if (m.circled) target.clause = circledToNumber(m.circled);
      if (m.item) target.item = parseInt(m.item, 10);
      if (m.sub) target.sub_item = m.sub;
      tokens.push({ type: "ref_article", raw: m.raw, target });
    }
    cursor = m.end;
  }
  if (cursor < text.length) {
    tokens.push({ type: "text", text: text.slice(cursor) });
  }
  return tokens;
}

function extractInlineRefs(text) {
  return extractInline(text).filter((t) => t.type === "ref_article");
}

// 통계
const articleCount = chapters.reduce((sum, ch) => sum + ch.articles.length, 0);
const articlesWithBody = chapters.reduce(
  (sum, ch) => sum + ch.articles.filter((a) => !a.deleted && a.blocks.length > 0).length,
  0,
);

const result = {
  generatedAt: new Date().toISOString(),
  source: "리담특허법 조문 정리 (제5판)",
  publication: "[시행 2025.11.11] [법률 제21134호, 2025.11.11, 타법개정]",
  stats: {
    chapters: chapters.length,
    articles: articleCount,
    articlesWithBody,
  },
  chapters,
};

writeFileSync(OUTPUT, JSON.stringify(result, null, 2), "utf8");
console.log(
  `OK → chapters=${chapters.length}, articles=${articleCount}, withBody=${articlesWithBody}`,
);
console.log(`output: ${OUTPUT}`);
