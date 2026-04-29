// 조문 빈칸 자료 파싱 + 시드 (모든 법 공용).
//
// 사용법:
//   node scripts/seed-patent-blanks.mjs                       — 기본 (특허법)
//   node scripts/seed-blanks.mjs --law=trademark --file=...   — 다른 법
//   node scripts/seed-blanks.mjs --law=patent                 — 기본 파일 경로 자동
//
// 흐름:
//   1. 본문(`제1조 【...】` 부터) 만 추출, 시행령/시행규칙/구특허법 등 부가 자료 제외
//   2. 조문 단위 분할 — `^제\d+조(?:의\d+)?` 헤더 라인 시작
//   3. 각 조문 본문에서 빈칸 `(<공백+>)` 위치를 [[BLANK:N]] 으로 치환, 빈칸 메타 추출
//   4. 매칭되는 article_id 의 article_revisions.body_json 을 가져와 paragraph 단위 best-effort 정답 추출
//   5. article_blank_sets 시드 (article_id + version='v1' UNIQUE upsert)
//   6. 매칭 실패한 빈칸 리포트

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// CLI 인수 파싱: --law=patent --file=path/to.utf8.txt --version=v1
const argMap = new Map();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=(.+)$/);
  if (m) argMap.set(m[1], m[2]);
}
const LAW_CODE = argMap.get("law") ?? "patent";
const VERSION = argMap.get("version") ?? "v1";
// owner_id (UUID). 기본 admin 임병웅. --owner=<uuid> 또는 --owner-email=... 로 변경 가능.
const DEFAULT_OWNER_ID = "8dbc9c0e-a32d-456e-bf53-bf89160669e0";
const OWNER_ID = argMap.get("owner") ?? DEFAULT_OWNER_ID;
const DISPLAY_NAME = argMap.get("display-name") ?? null;

// 기본 파일 경로 — 법별 한글 이름. 사용자가 --file 로 직접 지정 가능.
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
  console.error("--file=<path> 로 지정하거나 source/_converted 에 변환된 파일을 두세요.");
  process.exit(1);
}

console.log(`law=${LAW_CODE} version=${VERSION}`);
console.log(`source: ${TXT_PATH}`);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ───────── 1. 본문 추출 + 조문 단위 분할 ─────────

const ARTICLE_HEAD_RE = /^(제(\d+)조(?:의(\d+))?)\s*【([^】]*)】(?:\s*\(([★]+)\))?\s*(.*)$/;
const CHAPTER_HEAD_RE = /^제\d+장\s/;
const APPENDIX_PATTERNS = [
  /^시행령/,
  /^시행규칙/,
  /^구특허법/,
  /^아래의/,
  /^\[전문개정/,
];

function isAppendixHeader(line) {
  return APPENDIX_PATTERNS.some((p) => p.test(line));
}

function findBodyStart(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 본문 첫 조문 패턴: 별점만 있고 page no(탭 + 숫자) 없는 조문 헤더
    const m = ARTICLE_HEAD_RE.exec(line);
    if (m && m[2] === "1" && !line.includes("\t")) return i;
  }
  return -1;
}

function articleNumberText(major, minor) {
  return minor ? `${major}의${minor}` : String(major);
}

// 조문 단위 분할. 시행령/시행규칙/구특허법 등 부가자료는 skip.
function splitArticles(lines, startIdx) {
  const articles = [];
  let cur = null;
  let inAppendix = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (CHAPTER_HEAD_RE.test(line)) {
      // 새 장 헤더 — 부가자료 모드 해제, 현재 조문 닫기
      inAppendix = false;
      continue;
    }
    if (isAppendixHeader(line)) {
      // 시행령/구특허법 등 — 부가자료 시작. 현재 조문 닫고 부가자료 모드 진입.
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
      // 새 조문 시작 — 이전 조문 push
      if (cur) articles.push(cur);
      // 부가자료 모드에서도 새 조문이면 본문 모드로 (부가자료의 제N조 패턴은 거의 없음)
      inAppendix = false;
      cur = {
        articleNumber: articleNumberText(major, minor),
        title,
        importance,
        // 헤더 라인의 후행 (法 ... ref) 도 본문 첫 줄로 수집
        bodyLines: tail ? [tail] : [],
      };
      continue;
    }
    // 빈 줄 / 일반 본문 줄
    if (cur && !inAppendix) {
      cur.bodyLines.push(line);
    }
  }
  if (cur) articles.push(cur);
  return articles;
}

// ───────── 2. 빈칸 추출 + body_text 토큰화 ─────────

// 공백/전각공백만 있는 괄호 = 빈칸 (3자 이상). 1~2자 공백 괄호도 빈칸일 수 있어 1자 이상으로.
const BLANK_RE = /\(([\s　]+)\)/g;

function tokenizeBlanks(text) {
  const blanks = [];
  let idx = 1;
  const tokenized = text.replace(BLANK_RE, (m, inner) => {
    const length = Math.max(1, Math.round(inner.length / 2)); // 글자 수 hint (대략 절반)
    blanks.push({ idx, length, raw_inner: inner });
    return `[[BLANK:${idx++}]]`;
  });
  return { tokenized, blanks };
}

// ───────── 3. 자동 정답 매칭 ─────────
// body_json blocks 를 평문 paragraph 배열로 변환.

function blocksToParagraphs(body) {
  if (!body || !Array.isArray(body.blocks)) return [];
  const out = [];
  const walk = (blocks, prefix) => {
    for (const b of blocks) {
      const inline = (b.inline ?? [])
        .filter((t) => t.type === "text" || t.type === "title_marker" || t.type === "ref_article" || t.type === "ref_law")
        .map((t) => {
          if (t.type === "text") return t.text;
          if (t.type === "title_marker") return t.text;
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
      if (Array.isArray(b.children) && b.children.length > 0) {
        walk(b.children, lead);
      }
    }
  };
  walk(body.blocks, "");
  return out;
}

// 빈칸 자료 본문 텍스트 → paragraph 배열. 항(①), 호(1.), 목(가.) 마커 인지.
function blankBodyToParagraphs(bodyText) {
  // 줄 단위로 — 빈 줄은 paragraph 경계
  const paras = [];
  const lines = bodyText.split(/\r?\n/);
  for (let raw of lines) {
    const line = raw.replace(/^\s+/, "");
    if (!line) continue;
    // 메타 (개정/전문개정/法 ref 만) 무시
    if (/^\[(전문개정|개정|시행)/.test(line)) continue;
    // 항/호/목 마커 추출
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

const BLANK_SENTINEL = (n) => ` BLANK${n}`;
const BLANK_SENTINEL_RE = / BLANK(\d+)/g;

// 라벨 제거: 빈칸이 아닌 `(라벨)`, `<개정...>` 메타, `法 X` ref 제거.
// 빈칸 토큰 [[BLANK:N]] 은 sentinel 로 일시 보호.
function stripLabels(text) {
  // 1. 빈칸 토큰을 sentinel 로 치환
  let s = text.replace(/\[\[BLANK:(\d+)\]\]/g, (_, n) => BLANK_SENTINEL(n));
  // 2. 라벨 제거 (괄호 안 한글/약어 텍스트 — 빈칸이 아닌 것)
  s = s.replace(/\(([^()]{1,40})\)/g, (m, inner) => {
    if (/^[\s　]*$/.test(inner)) return m;
    return "";
  });
  // 3. 메타 <...>
  s = s.replace(/<[^<>]{1,100}>/g, "");
  // 4. 法 X, 法 X의Y, 法 X-Y, 法 X①Ⅰ 등 ref
  s = s.replace(
    /[法법]\s*\d+(?:의\d+)?(?:[~\-]\s*\d+(?:의\d+)?)?(?:[①-⑳㉑-㉟㊱-㊿]+(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ,]+)?)?/g,
    "",
  );
  // 5. sentinel 을 다시 토큰으로 복원
  s = s.replace(BLANK_SENTINEL_RE, (_, n) => `[[BLANK:${n}]]`);
  return s;
}

// 매칭 비교용 정규화 — 공백·구두점·brackets 무시. 한글/한자 유지.
function normalizeForMatch(text) {
  return text
    .replace(/[\s　]+/g, "")
    .replace(/[·∙ㆍ・]/g, "")
    .replace(/[「」『』【】［］\[\]()（）]/g, "")
    .replace(/[，,、。.;:]/g, "")
    .toLowerCase();
}

// substring 의 위치를 정규화된 비교로 찾는다. needle 이 haystack 의 어디에 시작하는지(원래 인덱스) 반환, 없으면 -1.
function findIndexNormalized(haystack, needle, fromIndex = 0) {
  if (!needle) return fromIndex;
  // 정규화된 텍스트와 원본 텍스트 사이의 인덱스 매핑.
  const map = []; // normalized 의 i 번째 char 가 원본의 어느 인덱스인지
  let normHay = "";
  for (let i = 0; i < haystack.length; i++) {
    const ch = haystack[i];
    const normCh = normalizeForMatch(ch);
    if (normCh) {
      normHay += normCh;
      map.push(i);
    }
  }
  const normNeedle = normalizeForMatch(needle);
  if (!normNeedle) return fromIndex;
  // fromIndex 에 대응하는 normalized index 찾기
  let normFrom = 0;
  for (; normFrom < map.length && map[normFrom] < fromIndex; normFrom++) {}
  const found = normHay.indexOf(normNeedle, normFrom);
  if (found === -1) return -1;
  return map[found] ?? -1;
}

// 두 paragraph text 간 빈칸 자리에 들어갈 정답 + 컨텍스트(앞뒤 일정 글자) 추출.
// 반환: { idx → { answer, beforeContext, afterContext } }
function extractAnswers(blankText, origText) {
  const stripped = stripLabels(blankText)
    .replace(/[\s　]+/g, " ")
    .trim();
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
      if (!foundAfter && i < indices.length - 1) {
        continue;
      }
    }
    const answer = orig
      .slice(afterCursor, endInOrig)
      .trim()
      .replace(/^[,.、，。]+|[,.、，。]+$/g, "")
      .trim();
    if (answer.length > 0 && answer.length < 200) {
      // 컨텍스트: 원본에서 정답 앞뒤 CONTEXT_LEN 글자
      const ctxStart = Math.max(0, afterCursor - CONTEXT_LEN);
      const beforeContext = orig.slice(ctxStart, afterCursor);
      const afterContext = orig.slice(
        endInOrig,
        Math.min(orig.length, endInOrig + CONTEXT_LEN),
      );
      out[indices[i]] = {
        answer,
        beforeContext,
        afterContext,
      };
    }
    cursor = endInOrig;
  }
  return out;
}

// 원숫자 → 정수 (① → 1)
const CLAUSE_NUM = {
  "①":1,"②":2,"③":3,"④":4,"⑤":5,"⑥":6,"⑦":7,"⑧":8,"⑨":9,"⑩":10,
  "⑪":11,"⑫":12,"⑬":13,"⑭":14,"⑮":15,"⑯":16,"⑰":17,"⑱":18,"⑲":19,"⑳":20,
};
const SUB_LETTERS = ["가","나","다","라","마","바","사","아","자","차","카","타","파","하"];

// 빈칸 자료 paragraph 의 marker 를 원본 block 의 (kind, number/letter) 와 매칭.
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

// 빈칸 자료의 paragraph 와 원본 paragraph 들을 매칭하면서 정답 채우기.
// 1차: marker key 정확히 일치하는 origPara 우선
// 2차: 같은 kind 순서대로
// 3차: 그 외 순서대로
function matchParagraphs(blankParas, origParas) {
  const answers = {};
  const usedOrig = new Set();

  // index 별로 가장 좋은 매칭 찾기
  const blankWithBlanks = blankParas
    .map((bp, bi) => ({ bp, bi }))
    .filter(({ bp }) => bp.text.includes("[[BLANK:"));

  for (const { bp, bi } of blankWithBlanks) {
    const wantedKey = matchKey(bp);
    let matched = -1;

    // 1차: 같은 marker key
    for (let j = 0; j < origParas.length; j++) {
      if (usedOrig.has(j)) continue;
      if (origKey(origParas[j]) === wantedKey) {
        matched = j;
        break;
      }
    }
    // 2차: 같은 kind, 순서 단조 증가
    if (matched === -1) {
      const lastUsed = Math.max(-1, ...[...usedOrig]);
      for (let j = lastUsed + 1; j < origParas.length; j++) {
        if (origParas[j].kind === bp.kind) {
          matched = j;
          break;
        }
      }
    }
    // 3차: 순서대로
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
    const op = origParas[matched];
    const partial = extractAnswers(bp.text, op.text);
    Object.assign(answers, partial);
  }
  return answers;
}

// ───────── 4. 메인 ─────────

async function main() {
  const txt = readFileSync(TXT_PATH, "utf8").replace(/^﻿/, "");
  const lines = txt.split(/\r?\n/);
  const startIdx = findBodyStart(lines);
  if (startIdx === -1) {
    console.error("본문 시작점을 찾지 못했습니다.");
    process.exit(1);
  }
  console.log(`본문 시작 line ${startIdx + 1}`);

  const articlesBlankRaw = splitArticles(lines, startIdx);
  console.log(`조문 ${articlesBlankRaw.length}개 분리`);

  // 토큰화 + 빈칸 메타 추출
  const tokenized = articlesBlankRaw.map((a) => {
    const bodyText = a.bodyLines.join("\n");
    const { tokenized: tokText, blanks } = tokenizeBlanks(bodyText);
    return { ...a, tokenized: tokText, blanks };
  });

  const totalBlanks = tokenized.reduce((s, a) => s + a.blanks.length, 0);
  console.log(`총 빈칸 ${totalBlanks}개`);

  // 빈칸 0개 article 은 시드 skip
  const withBlanks = tokenized.filter((a) => a.blanks.length > 0);
  console.log(`빈칸 있는 조문 ${withBlanks.length}개`);

  // patent law id + 모든 article (number → article_id) + body_json
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
  const articleIdByNumber = new Map(
    (arts ?? []).map((a) => [a.article_number, a]),
  );

  const revIds = (arts ?? [])
    .map((a) => a.current_revision_id)
    .filter(Boolean);
  const { data: revs } = await supa
    .from("article_revisions")
    .select("revision_id, body_json")
    .in("revision_id", revIds);
  const revById = new Map((revs ?? []).map((r) => [r.revision_id, r.body_json]));

  // wipe 기존 (이 law + 이 version + 이 owner 만)
  const wipeIds = (arts ?? []).map((a) => a.article_id);
  if (wipeIds.length > 0) {
    await supa
      .from("article_blank_sets")
      .delete()
      .eq("version", VERSION)
      .eq("owner_id", OWNER_ID)
      .in("article_id", wipeIds);
  }
  console.log(`기존 ${VERSION} blank sets wipe (law=${LAW_CODE}, owner=${OWNER_ID})`);

  // 시드
  let inserted = 0;
  let unmappedAnswers = 0;
  let mappedAnswers = 0;
  const unmappedReport = [];

  for (const a of withBlanks) {
    const meta = articleIdByNumber.get(a.articleNumber);
    if (!meta) {
      unmappedReport.push({
        articleNumber: a.articleNumber,
        reason: "article not found in DB",
        blanks: a.blanks.length,
      });
      continue;
    }
    const body = meta.current_revision_id
      ? revById.get(meta.current_revision_id)
      : null;

    // 정답 매칭 시도
    const blankParas = blankBodyToParagraphs(a.tokenized);
    const origParas = body ? blocksToParagraphs(body) : [];
    const answers = body ? matchParagraphs(blankParas, origParas) : {};

    const blanksWithAnswers = a.blanks.map((b) => {
      const match = answers[b.idx];
      const answer = match?.answer ?? "";
      if (answer) mappedAnswers++;
      else unmappedAnswers++;
      return {
        idx: b.idx,
        length: b.length,
        answer,
        before_context: match?.beforeContext ?? "",
        after_context: match?.afterContext ?? "",
      };
    });

    const { error: insErr } = await supa.from("article_blank_sets").insert({
      article_id: meta.article_id,
      version: VERSION,
      body_text: a.tokenized,
      blanks: blanksWithAnswers,
      importance: a.importance,
      owner_id: OWNER_ID,
      display_name: DISPLAY_NAME,
    });
    if (insErr) {
      console.error(`insert ${a.articleNumber}: ${insErr.message}`);
      continue;
    }
    inserted++;
  }

  console.log("");
  console.log("=== 결과 ===");
  console.log(`  blank_sets 시드: ${inserted}개 article`);
  console.log(`  정답 자동 추출 성공: ${mappedAnswers}/${mappedAnswers + unmappedAnswers}개 빈칸`);
  console.log(`  정답 미매칭(unmapped): ${unmappedAnswers}개`);
  if (unmappedReport.length > 0) {
    console.log(`  article 매칭 실패: ${unmappedReport.length}건`);
    for (const u of unmappedReport.slice(0, 20)) {
      console.log(
        `    - 제${u.articleNumber}조 (빈칸 ${u.blanks}개): ${u.reason}`,
      );
    }
  }
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
