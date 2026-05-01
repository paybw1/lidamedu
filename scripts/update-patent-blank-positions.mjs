// 빈칸 자료(HWP→utf8.txt) 의 빈칸 위치만 기존 article_blank_sets 에 반영하는 스크립트.
// seed 와 달리 row 를 wipe & insert 하지 않고, 매칭되는 set 의 body_text + blanks 만 UPDATE.
// importance/display_name/owner_id/created_at 등 다른 메타데이터는 보존된다.
//
// 사용법:
//   node scripts/update-patent-blank-positions.mjs                — dry-run (변경 요약만)
//   node scripts/update-patent-blank-positions.mjs --apply        — 실제 UPDATE 적용
//   --law=patent --version=v1 --owner=<uuid> --file=<path>        — override
//
// 정답 보존 규칙 (--apply 일 때):
//   1) 새 blank 의 자동 추출 정답이 있으면: 그대로 사용
//   2) 자동 추출 빈칸이지만 이전 set 에 같은 idx + 비어있지 않은 정답이 있으면: 이전 정답 유지
//      (운영자가 수동 입력했을 가능성이 큰 케이스 — 다만 idx 가 같은 경우만 보수적으로)
//   3) 둘 다 비어있으면 빈 정답
//
// 다른 column (importance, display_name 등) 은 절대 수정하지 않는다.

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const argMap = new Map();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)(?:=(.+))?$/);
  if (m) argMap.set(m[1], m[2] ?? true);
}
const APPLY = argMap.has("apply");
const LAW_CODE = argMap.get("law") ?? "patent";
const VERSION = argMap.get("version") ?? "v1";
const DEFAULT_OWNER_ID = "8dbc9c0e-a32d-456e-bf53-bf89160669e0";
const OWNER_ID = argMap.get("owner") ?? DEFAULT_OWNER_ID;

const DEFAULT_FILE_NAMES = {
  patent: "리담특허법 조문 빈칸(Ver1).utf8.txt",
  trademark: "리담상표법 조문 빈칸(Ver1).utf8.txt",
  design: "리담디자인보호법 조문 빈칸(Ver1).utf8.txt",
  civil: "리담민법 조문 빈칸(Ver1).utf8.txt",
  "civil-procedure": "리담민사소송법 조문 빈칸(Ver1).utf8.txt",
};
const fileArg = argMap.get("file");
const TXT_PATH = fileArg
  ? resolve(ROOT, fileArg)
  : resolve(ROOT, "source/_converted", DEFAULT_FILE_NAMES[LAW_CODE] ?? "");

if (!existsSync(TXT_PATH)) {
  console.error(`입력 파일이 없습니다: ${TXT_PATH}`);
  process.exit(1);
}

console.log(`mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`law=${LAW_CODE} version=${VERSION} owner=${OWNER_ID}`);
console.log(`source: ${TXT_PATH}`);
console.log("");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ───────── 파서 (seed-patent-blanks.mjs 와 동일) ─────────

const ARTICLE_HEAD_RE = /^(제(\d+)조(?:의(\d+))?)\s*【([^】]*)】(?:\s*\(([★]+)\))?\s*(.*)$/;
const CHAPTER_HEAD_RE = /^제\d+장\s/;
const APPENDIX_PATTERNS = [
  /^시행령/,
  /^시행규칙/,
  /^구특허법/,
  /^구상표법/,
  /^구디자인보호법/,
  /^아래의/,
  /^\[전문개정/,
];

function isAppendixHeader(line) {
  return APPENDIX_PATTERNS.some((p) => p.test(line));
}

function findBodyStart(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = ARTICLE_HEAD_RE.exec(line);
    if (m && m[2] === "1" && !line.includes("\t")) return i;
  }
  return -1;
}

function articleNumberText(major, minor) {
  return minor ? `${major}의${minor}` : String(major);
}

function splitArticles(lines, startIdx) {
  const articles = [];
  let cur = null;
  let inAppendix = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (CHAPTER_HEAD_RE.test(line)) {
      inAppendix = false;
      continue;
    }
    if (isAppendixHeader(line)) {
      if (cur) {
        articles.push(cur);
        cur = null;
      }
      inAppendix = true;
      continue;
    }
    const head = ARTICLE_HEAD_RE.exec(line);
    if (head && !line.includes("\t")) {
      const major = Number(head[2]);
      const minor = head[3] ? Number(head[3]) : 0;
      const title = head[4].trim();
      const importance = head[5] ? head[5].length : 0;
      const tail = head[6].trim();
      if (cur) articles.push(cur);
      inAppendix = false;
      cur = {
        articleNumber: articleNumberText(major, minor),
        title,
        importance,
        bodyLines: tail ? [tail] : [],
      };
      continue;
    }
    if (cur && !inAppendix) cur.bodyLines.push(line);
  }
  if (cur) articles.push(cur);
  return articles;
}

const BLANK_RE = /\(([\s　]+)\)/g;

function tokenizeBlanks(text) {
  const blanks = [];
  let idx = 1;
  const tokenized = text.replace(BLANK_RE, (_m, inner) => {
    const length = Math.max(1, Math.round(inner.length / 2));
    blanks.push({ idx, length });
    return `[[BLANK:${idx++}]]`;
  });
  return { tokenized, blanks };
}

function blocksToParagraphs(body) {
  if (!body || !Array.isArray(body.blocks)) return [];
  const out = [];
  const walk = (blocks) => {
    for (const b of blocks) {
      const inline = (b.inline ?? [])
        .filter((t) => t.type === "text" || t.type === "title_marker" || t.type === "ref_article" || t.type === "ref_law")
        .map((t) => {
          if (t.type === "text" || t.type === "title_marker") return t.text;
          if (t.type === "ref_article" || t.type === "ref_law") return t.raw ?? "";
          return "";
        })
        .join("");
      let lead = "";
      if (b.kind === "clause") lead = `clause:${b.number}`;
      else if (b.kind === "item") lead = `item:${b.number}`;
      else if (b.kind === "sub") lead = `sub:${b.letter}`;
      else lead = `para`;
      out.push({ kind: b.kind, lead, text: inline.trim() });
      if (Array.isArray(b.children) && b.children.length > 0) walk(b.children);
    }
  };
  walk(body.blocks);
  return out;
}

function blankBodyToParagraphs(bodyText) {
  const paras = [];
  const lines = bodyText.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/^\s+/, "");
    if (!line) continue;
    if (/^\[(전문개정|개정|시행)/.test(line)) continue;
    let kind = "para";
    let marker = "";
    let rest = line;
    const clauseM = /^([①-⑳㉑-㉟㊱-㊿])\s*(.*)$/.exec(line);
    const itemM = /^(\d+)\.\s*(.*)$/.exec(line);
    const subM = /^([가-하])\.\s*(.*)$/.exec(line);
    if (clauseM) {
      kind = "clause";
      marker = clauseM[1];
      rest = clauseM[2];
    } else if (itemM) {
      kind = "item";
      marker = itemM[1];
      rest = itemM[2];
    } else if (subM) {
      kind = "sub";
      marker = subM[1];
      rest = subM[2];
    }
    paras.push({ kind, marker, text: rest });
  }
  return paras;
}

function stripLabels(text) {
  let s = text.replace(/\[\[BLANK:(\d+)\]\]/g, (_, n) => ` BLANK${n}`);
  s = s.replace(/\(([^()]{1,40})\)/g, (m, inner) => {
    if (/^[\s　]*$/.test(inner)) return m;
    return "";
  });
  s = s.replace(/<[^<>]{1,100}>/g, "");
  s = s.replace(
    /[法법]\s*\d+(?:의\d+)?(?:[~\-]\s*\d+(?:의\d+)?)?(?:[①-⑳㉑-㉟㊱-㊿]+(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ,]+)?)?/g,
    "",
  );
  s = s.replace(/ BLANK(\d+)/g, (_, n) => `[[BLANK:${n}]]`);
  return s;
}

function normalizeForMatch(text) {
  return text
    .replace(/[\s　]+/g, "")
    .replace(/[·∙ㆍ・]/g, "")
    .replace(/[「」『』【】［］\[\]()（）]/g, "")
    .replace(/[，,、。.;:]/g, "")
    .toLowerCase();
}

function findIndexNormalized(haystack, needle, fromIndex = 0) {
  if (!needle) return fromIndex;
  const map = [];
  let normHay = "";
  for (let i = 0; i < haystack.length; i++) {
    const normCh = normalizeForMatch(haystack[i]);
    if (normCh) {
      normHay += normCh;
      map.push(i);
    }
  }
  const normNeedle = normalizeForMatch(needle);
  if (!normNeedle) return fromIndex;
  let normFrom = 0;
  for (; normFrom < map.length && map[normFrom] < fromIndex; normFrom++) {}
  const found = normHay.indexOf(normNeedle, normFrom);
  if (found === -1) return -1;
  return map[found] ?? -1;
}

function extractAnswers(blankText, origText) {
  const stripped = stripLabels(blankText).replace(/[\s　]+/g, " ").trim();
  const orig = origText.trim();
  if (!stripped || !orig) return {};
  const re = /\[\[BLANK:(\d+)\]\]/g;
  const parts = [];
  const indices = [];
  let last = 0;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    parts.push(stripped.slice(last, m.index));
    indices.push(Number(m[1]));
    last = m.index + m[0].length;
  }
  parts.push(stripped.slice(last));
  if (indices.length === 0) return {};
  const out = {};
  let cursor = 0;
  const CONTEXT_LEN = 12;
  for (let i = 0; i < indices.length; i++) {
    const before = parts[i].trim();
    const after = parts[i + 1].trim();
    const tryLengths = [10, 8, 6, 4];
    let afterCursor = cursor;
    let foundBefore = before.length === 0;
    for (const len of tryLengths) {
      if (before.length === 0) break;
      const anchor = before.slice(-Math.min(len, before.length));
      const idx = findIndexNormalized(orig, anchor, cursor);
      if (idx !== -1) {
        let probe = idx;
        let normCount = 0;
        const anchorNorm = normalizeForMatch(anchor);
        while (probe < orig.length && normCount < anchorNorm.length) {
          const c = normalizeForMatch(orig[probe]);
          if (c) normCount++;
          probe++;
        }
        afterCursor = probe;
        foundBefore = true;
        break;
      }
    }
    if (!foundBefore) continue;
    let endInOrig = orig.length;
    if (after.length > 0) {
      let foundAfter = false;
      for (const len of tryLengths) {
        const anchor = after.slice(0, Math.min(len, after.length));
        const idx = findIndexNormalized(orig, anchor, afterCursor);
        if (idx !== -1) {
          endInOrig = idx;
          foundAfter = true;
          break;
        }
      }
      if (!foundAfter && i < indices.length - 1) continue;
    }
    const answer = orig.slice(afterCursor, endInOrig)
      .trim()
      .replace(/^[,.、，。]+|[,.、，。]+$/g, "")
      .trim();
    if (answer.length > 0 && answer.length < 200) {
      const ctxStart = Math.max(0, afterCursor - CONTEXT_LEN);
      out[indices[i]] = {
        answer,
        beforeContext: orig.slice(ctxStart, afterCursor),
        afterContext: orig.slice(endInOrig, Math.min(orig.length, endInOrig + CONTEXT_LEN)),
      };
    }
    cursor = endInOrig;
  }
  return out;
}

const CLAUSE_NUM = {"①":1,"②":2,"③":3,"④":4,"⑤":5,"⑥":6,"⑦":7,"⑧":8,"⑨":9,"⑩":10,"⑪":11,"⑫":12,"⑬":13,"⑭":14,"⑮":15,"⑯":16,"⑰":17,"⑱":18,"⑲":19,"⑳":20};

function matchKey(p) {
  if (p.kind === "clause") return `clause:${CLAUSE_NUM[p.marker] ?? 0}`;
  if (p.kind === "item") return `item:${p.marker}`;
  if (p.kind === "sub") return `sub:${p.marker}`;
  return "para";
}

function origKey(p) {
  if (p.kind === "clause") return `clause:${p.lead.match(/clause:(\d+)/)?.[1] ?? 0}`;
  if (p.kind === "item") return `item:${p.lead.match(/item:(\d+)/)?.[1] ?? 0}`;
  if (p.kind === "sub") {
    const letter = p.lead.match(/sub:(.+)/)?.[1] ?? "";
    return `sub:${letter}`;
  }
  return "para";
}

function matchParagraphs(blankParas, origParas) {
  const answers = {};
  const usedOrig = new Set();
  const blankWithBlanks = blankParas
    .map((bp, bi) => ({ bp, bi }))
    .filter(({ bp }) => bp.text.includes("[[BLANK:"));
  for (const { bp } of blankWithBlanks) {
    const wantedKey = matchKey(bp);
    let matched = -1;
    for (let j = 0; j < origParas.length; j++) {
      if (usedOrig.has(j)) continue;
      if (origKey(origParas[j]) === wantedKey) {
        matched = j;
        break;
      }
    }
    if (matched === -1) {
      const lastUsed = Math.max(-1, ...[...usedOrig]);
      for (let j = lastUsed + 1; j < origParas.length; j++) {
        if (origParas[j].kind === bp.kind) {
          matched = j;
          break;
        }
      }
    }
    if (matched === -1) {
      for (let j = 0; j < origParas.length; j++) {
        if (!usedOrig.has(j)) {
          matched = j;
          break;
        }
      }
    }
    if (matched === -1) continue;
    usedOrig.add(matched);
    Object.assign(answers, extractAnswers(bp.text, origParas[matched].text));
  }
  return answers;
}

// ───────── 메인 ─────────

async function main() {
  const txt = readFileSync(TXT_PATH, "utf8").replace(/^﻿/, "");
  const lines = txt.split(/\r?\n/);
  const startIdx = findBodyStart(lines);
  if (startIdx === -1) {
    console.error("본문 시작점을 찾지 못했습니다.");
    process.exit(1);
  }
  const rawArticles = splitArticles(lines, startIdx);
  const tokenized = rawArticles.map((a) => {
    const bodyText = a.bodyLines.join("\n");
    const { tokenized: tokText, blanks } = tokenizeBlanks(bodyText);
    return { ...a, tokenized: tokText, blanks };
  });
  const withBlanks = tokenized.filter((a) => a.blanks.length > 0);
  console.log(`HWP 분석: 조문 ${rawArticles.length}개, 빈칸 있는 조문 ${withBlanks.length}개, 총 빈칸 ${withBlanks.reduce((s, a) => s + a.blanks.length, 0)}개`);

  // DB 메타 fetch
  const { data: law } = await supa
    .from("laws")
    .select("law_id")
    .eq("law_code", LAW_CODE)
    .single();
  const { data: arts } = await supa
    .from("articles")
    .select("article_id, article_number, current_revision_id")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .is("deleted_at", null);
  const articleIdByNumber = new Map((arts ?? []).map((a) => [a.article_number, a]));

  const revIds = (arts ?? []).map((a) => a.current_revision_id).filter(Boolean);
  const { data: revs } = await supa
    .from("article_revisions")
    .select("revision_id, body_json")
    .in("revision_id", revIds);
  const revById = new Map((revs ?? []).map((r) => [r.revision_id, r.body_json]));

  // 기존 set fetch (UPDATE 대상)
  const wipeIds = (arts ?? []).map((a) => a.article_id);
  const { data: existingSets } = await supa
    .from("article_blank_sets")
    .select("set_id, article_id, body_text, blanks")
    .eq("version", VERSION)
    .eq("owner_id", OWNER_ID)
    .in("article_id", wipeIds);
  const existingByArticleId = new Map((existingSets ?? []).map((s) => [s.article_id, s]));
  console.log(`기존 set ${existingSets?.length ?? 0}개 (law=${LAW_CODE} version=${VERSION} owner=${OWNER_ID})`);
  console.log("");

  // 변경 분석
  let updated = 0;
  let countChanged = 0;
  let bodyChanged = 0;
  let answerPreserved = 0;
  let articlesNotInDb = 0;
  let articlesNoExistingSet = 0;
  const samples = [];

  for (const a of withBlanks) {
    const meta = articleIdByNumber.get(a.articleNumber);
    if (!meta) {
      articlesNotInDb++;
      continue;
    }
    const existing = existingByArticleId.get(meta.article_id);
    if (!existing) {
      articlesNoExistingSet++;
      continue;
    }
    const body = meta.current_revision_id ? revById.get(meta.current_revision_id) : null;
    const blankParas = blankBodyToParagraphs(a.tokenized);
    const origParas = body ? blocksToParagraphs(body) : [];
    const answers = body ? matchParagraphs(blankParas, origParas) : {};

    // 이전 blanks idx → answer (snake_case 또는 camelCase)
    const oldByIdx = new Map();
    for (const b of existing.blanks ?? []) {
      const idx = typeof b.idx === "number" ? b.idx : Number(b.idx);
      if (Number.isFinite(idx)) oldByIdx.set(idx, b);
    }

    let preservedHere = 0;
    const newBlanks = a.blanks.map((b) => {
      const match = answers[b.idx];
      const autoAns = match?.answer ?? "";
      let answer = autoAns;
      let beforeContext = match?.beforeContext ?? "";
      let afterContext = match?.afterContext ?? "";
      // 보존 규칙: 자동 추출이 비어 있는데 같은 idx 의 기존 정답이 있으면 유지.
      if (!answer) {
        const old = oldByIdx.get(b.idx);
        const oldAns = old?.answer ?? "";
        if (oldAns) {
          answer = oldAns;
          beforeContext = old?.before_context ?? old?.beforeContext ?? "";
          afterContext = old?.after_context ?? old?.afterContext ?? "";
          preservedHere++;
        }
      }
      return {
        idx: b.idx,
        length: b.length,
        answer,
        before_context: beforeContext,
        after_context: afterContext,
      };
    });

    const oldCount = existing.blanks?.length ?? 0;
    const newCount = newBlanks.length;
    const oldBodyText = existing.body_text ?? "";
    const newBodyText = a.tokenized;
    const isCountDiff = oldCount !== newCount;
    const isBodyDiff = oldBodyText !== newBodyText;
    if (isCountDiff || isBodyDiff) {
      if (isCountDiff) countChanged++;
      if (isBodyDiff && !isCountDiff) bodyChanged++;
      if (samples.length < 8) {
        samples.push({
          art: a.articleNumber,
          oldCount,
          newCount,
          preservedHere,
          oldBodyLen: oldBodyText.length,
          newBodyLen: newBodyText.length,
        });
      }
      if (APPLY) {
        const { error } = await supa
          .from("article_blank_sets")
          .update({ body_text: newBodyText, blanks: newBlanks })
          .eq("set_id", existing.set_id);
        if (error) {
          console.error(`  ! 제${a.articleNumber}조 UPDATE 실패: ${error.message}`);
          continue;
        }
        updated++;
        answerPreserved += preservedHere;
      } else {
        // dry-run 도 보존 카운트는 합산
        answerPreserved += preservedHere;
      }
    }
  }

  console.log("=== 분석 결과 ===");
  console.log(`  HWP 에 있으나 DB articles 미존재: ${articlesNotInDb}건`);
  console.log(`  DB articles 있으나 기존 set 없음: ${articlesNoExistingSet}건 (이번 작업에서 SKIP — 다른 것은 반영하지 않음)`);
  console.log(`  blank 개수 변경: ${countChanged}건`);
  console.log(`  body_text 만 변경: ${bodyChanged}건`);
  console.log(`  보존된 기존 정답 (자동추출 실패 + 같은 idx): ${answerPreserved}개`);
  if (APPLY) {
    console.log(`  UPDATE 실행: ${updated}건`);
  } else {
    console.log(`  UPDATE 예정: ${countChanged + bodyChanged}건 (--apply 없음 — 미적용)`);
  }
  if (samples.length > 0) {
    console.log("");
    console.log("샘플:");
    for (const s of samples) {
      console.log(
        `  제${s.art}조: blanks ${s.oldCount} → ${s.newCount}, body ${s.oldBodyLen}자 → ${s.newBodyLen}자, 정답보존 ${s.preservedHere}개`,
      );
    }
  }
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
