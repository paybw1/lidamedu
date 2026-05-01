// 기간 빈칸 데이터 검토용 CSV 생성 — period-blanks.ts 의 computePeriodBlanks 알고리즘을 그대로 포팅.
// 입력: source/_converted/parsed-articles-v2.json (특허법 + 시행령/시행규칙 sub_article_group 포함)
// 출력: scripts/output/period-blanks-review.csv (UTF-8 BOM, Excel 호환)
//
// 사용:
//   node scripts/export-period-blanks.mjs
//
// 컬럼:
//   법 / 조문 / 출처 / 블록 / 본문 / 빈칸1 / 빈칸2 / 빈칸3 / 빈칸4 /
//   blockIndex / cumOffsets / 모호사유 / 의도(수정용) / 메모(수정용)

import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const INPUT = resolve(ROOT, "source/_converted/parsed-articles-v2.json");
const OUT_DIR = resolve(ROOT, "scripts/output");
const OUT_PATH = resolve(OUT_DIR, "period-blanks-review.csv");

const LAW_CODE = "patent";
const LAW_LABEL = "특허법";

// ── period-blanks.ts 와 동일 규칙 (포팅) ─────────────────────────────────────

const DURATION_UNIT = "(?:개월|년|월|주|일)";
const DURATION_RE = new RegExp(
  `\\d+\\s*${DURATION_UNIT}(?:\\s+\\d+\\s*${DURATION_UNIT})*`,
  "g",
);
const PARTICLE_RE = /(?:로부터|부터|이후|뒤에|후에|뒤|후|로)\s*$/;
const STRONG_BOUNDARY = new Set([
  ",", ".", "!", "?", "\n", "\r",
  "(", ")", "[", "]", "{", "}",
  "·", "ㆍ",
  ":", ";",
]);
const SUBJECT_PARTICLE = new Set(["은", "는", "이", "가"]);
const CLAUSE_PARTICLE = new Set(["여", "고", "며"]);
const REF_LIMIT = 50;
const POST_DURATION_VERBS = ["지난", "흐른", "경과한", "경과된", "있은", "산정한"];
const LEADING_DETERMINERS = ["그", "해당", "당해", "상기"];

const HANGUL_RE = /[가-힯]/;

function skipPostDurationPhrase(text, fromPos) {
  let pos = fromPos;
  if (pos >= text.length) return pos;
  if (text[pos] !== "후" && text[pos] !== "뒤") return pos;
  pos++;
  if (pos < text.length && text[pos] === "에") {
    pos++;
    if (pos < text.length && (text[pos] === "도" || text[pos] === "는")) pos++;
  }
  while (pos < text.length && /\s/.test(text[pos])) pos++;
  return pos;
}

function findReferenceStart(text, particleStart) {
  const minPos = Math.max(0, particleStart - REF_LIMIT);
  for (let i = particleStart - 1; i >= minPos; i--) {
    const c = text[i];
    if (STRONG_BOUNDARY.has(c)) return i + 1;
    if (/\s/.test(c)) {
      for (const v of POST_DURATION_VERBS) {
        if (i >= v.length && text.slice(i - v.length, i) === v) {
          return skipPostDurationPhrase(text, i + 1);
        }
      }
      if (i >= 2) {
        const prev1 = text[i - 1];
        const prev2 = text[i - 2];
        if (
          HANGUL_RE.test(prev2) &&
          (SUBJECT_PARTICLE.has(prev1) || CLAUSE_PARTICLE.has(prev1))
        ) {
          return i + 1;
        }
      }
    }
  }
  return null;
}

function extendShortReference(text, refStart, refEnd) {
  const refText = text.slice(refStart, refEnd);
  if (refText.length >= 10) return refStart;
  if (!/[날때]$/.test(refText)) return refStart;
  let i = refStart - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  const minPos = Math.max(0, refEnd - REF_LIMIT);
  while (i >= minPos) {
    const c = text[i];
    if (STRONG_BOUNDARY.has(c)) return i + 1;
    if (/\s/.test(c)) {
      for (const v of POST_DURATION_VERBS) {
        if (i >= v.length && text.slice(i - v.length, i) === v) {
          return skipPostDurationPhrase(text, i + 1);
        }
      }
      if (i >= 2) {
        const prev1 = text[i - 1];
        const prev2 = text[i - 2];
        if (HANGUL_RE.test(prev2) && (prev1 === "이" || prev1 === "가")) {
          return i + 1;
        }
        if (HANGUL_RE.test(prev2) && (prev1 === "을" || prev1 === "를")) {
          let j = i - 2;
          while (j >= minPos && HANGUL_RE.test(text[j])) j--;
          return j + 1;
        }
      }
    }
    i--;
  }
  return refStart;
}

function trimTrailingSpace(text, end) {
  let e = end;
  while (e > 0 && /\s/.test(text[e - 1])) e--;
  return e;
}
function trimLeadingSpace(text, start) {
  let s = start;
  while (s < text.length && /\s/.test(text[s])) s++;
  return s;
}

function skipLeadingDeterminers(text, refStart, refEnd) {
  let cur = refStart;
  while (true) {
    cur = trimLeadingSpace(text, cur);
    let advanced = false;
    for (const d of LEADING_DETERMINERS) {
      const after = cur + d.length;
      if (after >= refEnd) continue;
      if (text.slice(cur, after) !== d) continue;
      if (!/\s/.test(text[after])) continue;
      cur = after;
      advanced = true;
      break;
    }
    if (!advanced) break;
  }
  return cur;
}

function tryExtractElapseReference(text, particleStartInBefore, particleWord) {
  if (
    particleWord !== "후" &&
    particleWord !== "후에" &&
    particleWord !== "뒤" &&
    particleWord !== "뒤에"
  ) {
    return null;
  }
  let scan = particleStartInBefore - 1;
  while (scan >= 0 && /\s/.test(text[scan])) scan--;
  if (scan < 1 || text[scan] !== "과" || text[scan - 1] !== "경") return null;
  const elapseEnd = scan + 1;
  let i = scan - 2;
  while (i >= 0 && /\s/.test(text[i])) i--;
  while (i >= 0 && HANGUL_RE.test(text[i])) i--;
  const elapseStart = i + 1;
  if (elapseStart >= elapseEnd) return null;
  return { start: elapseStart, end: elapseEnd };
}

function findRangesInBlock(text) {
  const ranges = [];
  const ambiguous = [];
  DURATION_RE.lastIndex = 0;
  let m;
  while ((m = DURATION_RE.exec(text)) !== null) {
    const durationStart = m.index;
    const durationEnd = m.index + m[0].length;
    const durationText = text.slice(durationStart, durationEnd);
    ranges.push({ start: durationStart, end: durationEnd, answer: durationText });

    const beforeText = text.slice(0, durationStart);
    const particleMatch = beforeText.match(PARTICLE_RE);
    if (!particleMatch) continue;
    const particleStartInBefore = beforeText.length - particleMatch[0].length;
    const particleWord = particleMatch[0].trim();

    const elapse = tryExtractElapseReference(text, particleStartInBefore, particleWord);
    if (elapse) {
      const refTextElapse = text.slice(elapse.start, elapse.end).trim();
      if (refTextElapse.length > 0) {
        ranges.push({ start: elapse.start, end: elapse.end, answer: refTextElapse });
      }
      continue;
    }
    if (
      particleWord === "후" || particleWord === "후에" ||
      particleWord === "뒤" || particleWord === "뒤에"
    ) {
      const beforeTrimmed = beforeText.slice(0, particleStartInBefore).trimEnd();
      if (POST_DURATION_VERBS.some((v) => beforeTrimmed.endsWith(v))) continue;
    }

    const particleStart = particleStartInBefore;
    const refStartRaw = findReferenceStart(text, particleStart);
    if (refStartRaw === null) {
      ambiguous.push({
        durationText,
        candidate: text.slice(Math.max(0, particleStart - REF_LIMIT), particleStart),
        reason: "기준점 시작 boundary 미검출 (50자 안에 구두점/주격조사 없음)",
      });
      continue;
    }
    let refStart = trimLeadingSpace(text, refStartRaw);
    const refEnd = trimTrailingSpace(text, particleStart);
    if (refStart >= refEnd) {
      ambiguous.push({
        durationText,
        candidate: text.slice(refStartRaw, particleStart),
        reason: "기준점 길이 0",
      });
      continue;
    }
    refStart = skipLeadingDeterminers(text, refStart, refEnd);
    if (refStart >= refEnd) {
      ambiguous.push({
        durationText,
        candidate: text.slice(refStartRaw, particleStart),
        reason: "지시어 제외 후 기준점 길이 0",
      });
      continue;
    }
    refStart = trimLeadingSpace(text, extendShortReference(text, refStart, refEnd));
    refStart = skipLeadingDeterminers(text, refStart, refEnd);
    if (refStart >= refEnd) continue;
    const refText = text.slice(refStart, refEnd);
    const lastChar = refText[refText.length - 1];
    if (!HANGUL_RE.test(lastChar)) {
      ambiguous.push({
        durationText,
        candidate: refText,
        reason: "기준점 끝 글자가 한글 명사가 아님",
      });
      continue;
    }
    ranges.push({ start: refStart, end: refEnd, answer: refText });
  }
  return { ranges, ambiguous };
}

function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    const idx = out.findIndex((o) => o.start < r.end && o.end > r.start);
    if (idx === -1) out.push(r);
    else if (r.end - r.start > out[idx].end - out[idx].start) out[idx] = r;
  }
  return out.sort((a, b) => a.start - b.start);
}

// ── Block walking — period-blanks.ts 의 walkForPeriod 와 동일 ────────────────

function tokenBodyContent(t) {
  if (
    (t.type === "text" || t.type === "underline" || t.type === "subtitle" ||
     t.type === "annotation" || t.type === "amendment_note") &&
    typeof t.text === "string"
  ) return t.text;
  if ((t.type === "ref_article" || t.type === "ref_law") && typeof t.raw === "string") return t.raw;
  return "";
}

function blockCumulativeText(block) {
  if (block.kind === "title_marker") return block.text ?? "";
  if (block.kind === "header_refs") return "";
  if (block.kind === "sub_article_group") return "";
  const inline = Array.isArray(block.inline) ? block.inline : [];
  return inline.map(tokenBodyContent).join("");
}

// 각 block 의 "위치 라벨" 생성 — 사용자 검토 시 어디 블록인지 알 수 있게.
// 예: "본문" / "제1항" / "제1항 - 1." / "제1항 - 1. 가." / "본문 단락2"
function blockPathLabel(block, ancestors) {
  const parts = [];
  for (const a of ancestors) {
    if (a.kind === "clause") parts.push(`제${a.number}항`);
    else if (a.kind === "item") parts.push(`${a.number}.`);
    else if (a.kind === "sub") parts.push(`${a.letter}.`);
  }
  if (block.kind === "clause") return `제${block.number}항`;
  if (block.kind === "item") return [...parts, `${block.number}.`].join(" - ");
  if (block.kind === "sub") return [...parts, `${block.letter}.`].join(" - ");
  if (block.kind === "para") return parts.length > 0 ? parts.join(" - ") : "본문";
  if (block.kind === "title_marker") return "표제";
  return parts.join(" - ");
}

// 구조: walk 하면서 visit(block, source, pathLabel).
// source: "본문" or "시행령 제X조" 등.
function walkArticleBody(article, visit) {
  const articleLabel = `제${article.number}조${article.branch ? `의${article.branch}` : ""}`;
  const blocks = Array.isArray(article.blocks) ? article.blocks : [];

  const recurse = (blk, ancestors, source) => {
    visit({
      block: blk,
      source,
      pathLabel: blockPathLabel(blk, ancestors),
      articleLabel,
    });
    if (
      blk.kind === "clause" || blk.kind === "item" || blk.kind === "sub"
    ) {
      const children = Array.isArray(blk.children) ? blk.children : [];
      for (const c of children) recurse(c, [...ancestors, blk], source);
    } else if (blk.kind === "sub_article_group") {
      const groupSource = blk.source ?? "";
      // 본문 외에 시행령/시행규칙 만 포함 (period-blanks 의 정책과 동일).
      if (!/^(시행령|시행규칙)/.test(groupSource)) return;
      const preface = Array.isArray(blk.preface) ? blk.preface : [];
      for (const p of preface) recurse(p, [], groupSource);
      const subs = Array.isArray(blk.articles) ? blk.articles : [];
      for (const sa of subs) {
        const saBlocks = Array.isArray(sa.blocks) ? sa.blocks : [];
        for (const b of saBlocks) recurse(b, [], groupSource);
      }
    }
  };
  for (const b of blocks) recurse(b, [], "본문");
}

// CSV escaping — 콤마/따옴표/줄바꿈 처리.
function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function preview(text, max = 200) {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

async function main() {
  const raw = await fs.readFile(INPUT, "utf8");
  const data = JSON.parse(raw);

  const rows = [];
  for (const chapter of data.chapters ?? []) {
    for (const article of chapter.articles ?? []) {
      walkArticleBody(article, ({ block, source, pathLabel, articleLabel }) => {
        const text = blockCumulativeText(block);
        if (text.length === 0) return;
        const { ranges, ambiguous } = findRangesInBlock(text);
        const merged = mergeRanges(ranges);
        if (merged.length === 0 && ambiguous.length === 0) return;

        // 블록 안 모든 빈칸 + 모호 케이스를 한 행으로 묶음.
        const blanks = merged.map((r) => r.answer);
        const offsets = merged.map((r) => r.start);
        const ambReason = ambiguous
          .map((a) => `${a.reason} [기간:${a.durationText}]`)
          .join(" / ");

        rows.push({
          law: LAW_LABEL,
          article: articleLabel,
          source,
          path: pathLabel,
          text: preview(text),
          blank1: blanks[0] ?? "",
          blank2: blanks[1] ?? "",
          blank3: blanks[2] ?? "",
          blank4: blanks[3] ?? "",
          offsets: offsets.join(","),
          ambiguous: ambReason,
          intended: "",
          notes: "",
        });
      });
    }
  }

  const headers = [
    "법", "조문", "출처", "블록", "본문",
    "빈칸1", "빈칸2", "빈칸3", "빈칸4",
    "위치 offset", "모호 사유",
    "의도(수정 시 입력 — | 로 구분)", "메모",
  ];
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push([
      r.law, r.article, r.source, r.path, r.text,
      r.blank1, r.blank2, r.blank3, r.blank4,
      r.offsets, r.ambiguous,
      r.intended, r.notes,
    ].map(csvEscape).join(","));
  }
  const csv = "﻿" + lines.join("\r\n"); // BOM + CRLF for Excel.

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_PATH, csv, "utf8");
  console.log(`✓ ${rows.length} rows → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
