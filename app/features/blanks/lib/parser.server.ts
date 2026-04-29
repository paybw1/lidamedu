// 빈칸 자료 utf8 텍스트 파서 (서버 사이드).
// scripts/seed-patent-blanks.mjs 의 핵심 로직을 TypeScript 로 포팅. 자동 정답 매칭까지 포함.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

const ARTICLE_HEAD_RE =
  /^(제(\d+)조(?:의(\d+))?)\s*【([^】]*)】(?:\s*\(([★]+)\))?\s*(.*)$/;
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
const BLANK_RE = /\(([\s　]+)\)/g;

const CLAUSE_NUM: Record<string, number> = {
  "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6, "⑦": 7, "⑧": 8,
  "⑨": 9, "⑩": 10, "⑪": 11, "⑫": 12, "⑬": 13, "⑭": 14, "⑮": 15,
  "⑯": 16, "⑰": 17, "⑱": 18, "⑲": 19, "⑳": 20,
};

function isAppendixHeader(line: string): boolean {
  return APPENDIX_PATTERNS.some((p) => p.test(line));
}

function articleNumberText(major: number, minor: number): string {
  return minor ? `${major}의${minor}` : String(major);
}

function findBodyStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const m = ARTICLE_HEAD_RE.exec(lines[i]);
    if (m && m[2] === "1" && !lines[i].includes("\t")) return i;
  }
  return -1;
}

interface RawArticle {
  articleNumber: string;
  title: string;
  importance: number;
  bodyLines: string[];
}

function splitArticles(lines: string[], startIdx: number): RawArticle[] {
  const out: RawArticle[] = [];
  let cur: RawArticle | null = null;
  let inAppendix = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (CHAPTER_HEAD_RE.test(line)) {
      inAppendix = false;
      continue;
    }
    if (isAppendixHeader(line)) {
      if (cur) {
        out.push(cur);
        cur = null;
      }
      inAppendix = true;
      continue;
    }
    const head = ARTICLE_HEAD_RE.exec(line);
    if (head && !line.includes("\t")) {
      const major = Number(head[2]);
      const minor = head[3] ? Number(head[3]) : 0;
      const title = (head[4] ?? "").trim();
      const importance = head[5] ? head[5].length : 0;
      const tail = (head[6] ?? "").trim();
      if (cur) out.push(cur);
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
  if (cur) out.push(cur);
  return out;
}

interface BlankMeta {
  idx: number;
  length: number;
  rawInnerLength: number;
}

function tokenizeBlanks(text: string): { tokenized: string; blanks: BlankMeta[] } {
  const blanks: BlankMeta[] = [];
  let idx = 1;
  const tokenized = text.replace(BLANK_RE, (_m, inner: string) => {
    const length = Math.max(1, Math.round(inner.length / 2));
    blanks.push({ idx, length, rawInnerLength: inner.length });
    return `[[BLANK:${idx++}]]`;
  });
  return { tokenized, blanks };
}

// 라벨/메타/ref 제거. [[BLANK:N]] 은 sentinel 로 보호.
function stripLabels(text: string): string {
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

function normalizeForMatch(text: string): string {
  return text
    .replace(/[\s　]+/g, "")
    .replace(/[·∙ㆍ・]/g, "")
    .replace(/[「」『』【】［］\[\]()（）]/g, "")
    .replace(/[，,、。.;:]/g, "")
    .toLowerCase();
}

function findIndexNormalized(
  haystack: string,
  needle: string,
  fromIndex = 0,
): number {
  if (!needle) return fromIndex;
  const map: number[] = [];
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

interface BlankPara {
  kind: "clause" | "item" | "sub" | "para";
  marker: string;
  text: string;
}

function blankBodyToParagraphs(bodyText: string): BlankPara[] {
  const paras: BlankPara[] = [];
  const lines = bodyText.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/^\s+/, "");
    if (!line) continue;
    if (/^\[(전문개정|개정|시행)/.test(line)) continue;
    let kind: BlankPara["kind"] = "para";
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

interface OrigPara {
  kind: string;
  lead: string;
  text: string;
}

interface BodyJson {
  blocks?: Array<Record<string, unknown>>;
}

function blocksToParagraphs(body: unknown): OrigPara[] {
  if (!body || typeof body !== "object") return [];
  const b = body as BodyJson;
  if (!Array.isArray(b.blocks)) return [];
  const out: OrigPara[] = [];
  const walk = (blocks: Array<Record<string, unknown>>) => {
    for (const block of blocks) {
      const inline = Array.isArray(block.inline)
        ? (block.inline as Array<Record<string, unknown>>)
        : [];
      const text = inline
        .filter(
          (t) =>
            t.type === "text" ||
            t.type === "title_marker" ||
            t.type === "ref_article" ||
            t.type === "ref_law",
        )
        .map((t) => {
          if (t.type === "text" || t.type === "title_marker")
            return typeof t.text === "string" ? t.text : "";
          if (t.type === "ref_article" || t.type === "ref_law")
            return typeof t.raw === "string" ? t.raw : "";
          return "";
        })
        .join("");
      let lead = "";
      if (block.kind === "clause") lead = `clause:${block.number}`;
      else if (block.kind === "item") lead = `item:${block.number}`;
      else if (block.kind === "sub") lead = `sub:${block.letter}`;
      else lead = "para";
      out.push({ kind: String(block.kind ?? ""), lead, text: text.trim() });
      if (Array.isArray(block.children) && block.children.length > 0) {
        walk(block.children as Array<Record<string, unknown>>);
      }
    }
  };
  walk(b.blocks);
  return out;
}

interface ExtractedAnswer {
  answer: string;
  beforeContext: string;
  afterContext: string;
}

function extractAnswers(
  blankText: string,
  origText: string,
): Record<number, ExtractedAnswer> {
  const stripped = stripLabels(blankText).replace(/[\s　]+/g, " ").trim();
  const orig = origText.trim();
  if (!stripped || !orig) return {};

  const re = /\[\[BLANK:(\d+)\]\]/g;
  const parts: string[] = [];
  const indices: number[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    parts.push(stripped.slice(last, m.index));
    indices.push(Number(m[1]));
    last = m.index + m[0].length;
  }
  parts.push(stripped.slice(last));

  if (indices.length === 0) return {};

  const out: Record<number, ExtractedAnswer> = {};
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
    const answer = orig
      .slice(afterCursor, endInOrig)
      .trim()
      .replace(/^[,.、，。]+|[,.、，。]+$/g, "")
      .trim();
    if (answer.length > 0 && answer.length < 200) {
      const ctxStart = Math.max(0, afterCursor - CONTEXT_LEN);
      out[indices[i]] = {
        answer,
        beforeContext: orig.slice(ctxStart, afterCursor),
        afterContext: orig.slice(
          endInOrig,
          Math.min(orig.length, endInOrig + CONTEXT_LEN),
        ),
      };
    }
    cursor = endInOrig;
  }
  return out;
}

function matchKey(p: BlankPara): string {
  if (p.kind === "clause") return `clause:${CLAUSE_NUM[p.marker] ?? 0}`;
  if (p.kind === "item") return `item:${p.marker}`;
  if (p.kind === "sub") return `sub:${p.marker}`;
  return "para";
}

function origKey(p: OrigPara): string {
  if (p.kind === "clause")
    return `clause:${p.lead.match(/clause:(\d+)/)?.[1] ?? 0}`;
  if (p.kind === "item")
    return `item:${p.lead.match(/item:(\d+)/)?.[1] ?? 0}`;
  if (p.kind === "sub") {
    const letter = p.lead.match(/sub:(.+)/)?.[1] ?? "";
    return `sub:${letter}`;
  }
  return "para";
}

function matchParagraphs(
  blankParas: BlankPara[],
  origParas: OrigPara[],
): Record<number, ExtractedAnswer> {
  const answers: Record<number, ExtractedAnswer> = {};
  const usedOrig = new Set<number>();
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

export interface SeedFromTextOptions {
  lawCode: string;
  version: string;
  ownerId: string;
  displayName: string | null;
  text: string;
  replaceExisting: boolean;
}

export interface SeedFromTextResult {
  totalArticles: number;
  totalBlanks: number;
  mappedAnswers: number;
  unmappedAnswers: number;
  insertedSets: number;
  unmappedReport: { articleNumber: string; reason: string; blanks: number }[];
}

export async function parseAndSeedBlanksFromText(
  client: SupabaseClient<Database>,
  opts: SeedFromTextOptions,
): Promise<SeedFromTextResult> {
  const lines = opts.text.replace(/^﻿/, "").split(/\r?\n/);
  const startIdx = findBodyStart(lines);
  if (startIdx === -1) {
    throw new Error(
      "본문 시작점(제1조 【...】)을 찾지 못했습니다. 형식이 맞는 텍스트인지 확인하세요.",
    );
  }
  const rawArticles = splitArticles(lines, startIdx);

  // article_id + body_json fetch
  const { data: law, error: lawErr } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", opts.lawCode)
    .maybeSingle();
  if (lawErr) throw lawErr;
  if (!law) throw new Error(`law_code='${opts.lawCode}' 미존재`);

  const { data: arts, error: artErr } = await client
    .from("articles")
    .select("article_id, article_number, current_revision_id")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .is("deleted_at", null);
  if (artErr) throw artErr;
  const artByNum = new Map(
    (arts ?? []).map((a) => [a.article_number, a] as const),
  );

  const revIds = (arts ?? [])
    .map((a) => a.current_revision_id)
    .filter((x): x is string => x != null);
  const revById = new Map<string, unknown>();
  if (revIds.length > 0) {
    const { data: revs } = await client
      .from("article_revisions")
      .select("revision_id, body_json")
      .in("revision_id", revIds);
    for (const r of revs ?? []) revById.set(r.revision_id, r.body_json);
  }

  // 기존 (lawCode + version + ownerId) wipe (옵션)
  if (opts.replaceExisting) {
    const wipeIds = (arts ?? []).map((a) => a.article_id);
    if (wipeIds.length > 0) {
      await client
        .from("article_blank_sets")
        .delete()
        .eq("version", opts.version)
        .eq("owner_id", opts.ownerId)
        .in("article_id", wipeIds);
    }
  }

  let totalBlanks = 0;
  let mapped = 0;
  let unmapped = 0;
  let insertedSets = 0;
  const unmappedReport: SeedFromTextResult["unmappedReport"] = [];

  for (const a of rawArticles) {
    const bodyText = a.bodyLines.join("\n");
    const { tokenized, blanks } = tokenizeBlanks(bodyText);
    if (blanks.length === 0) continue;
    totalBlanks += blanks.length;

    const meta = artByNum.get(a.articleNumber);
    if (!meta) {
      unmappedReport.push({
        articleNumber: a.articleNumber,
        reason: "DB에 article 없음",
        blanks: blanks.length,
      });
      continue;
    }

    const body = meta.current_revision_id
      ? revById.get(meta.current_revision_id)
      : null;
    const blankParas = blankBodyToParagraphs(tokenized);
    const origParas = body ? blocksToParagraphs(body) : [];
    const answers = body ? matchParagraphs(blankParas, origParas) : {};

    const blanksJson = blanks.map((b) => {
      const match = answers[b.idx];
      const ans = match?.answer ?? "";
      if (ans) mapped++;
      else unmapped++;
      return {
        idx: b.idx,
        length: b.length,
        answer: ans,
        before_context: match?.beforeContext ?? "",
        after_context: match?.afterContext ?? "",
      };
    });

    const { error: insErr } = await client.from("article_blank_sets").insert({
      article_id: meta.article_id,
      version: opts.version,
      body_text: tokenized,
      blanks: blanksJson as never,
      importance: a.importance,
      owner_id: opts.ownerId,
      display_name: opts.displayName,
    });
    if (insErr) {
      unmappedReport.push({
        articleNumber: a.articleNumber,
        reason: insErr.message,
        blanks: blanks.length,
      });
      continue;
    }
    insertedSets++;
  }

  return {
    totalArticles: rawArticles.length,
    totalBlanks,
    mappedAnswers: mapped,
    unmappedAnswers: unmapped,
    insertedSets,
    unmappedReport,
  };
}
