// 상표법 내용 빈칸 시드 — 스터디키드 HTML 의 음영(background-color:#c0cdef) = 정답.
//
// 입력: source/_converted/리담상표법 스터디키드.utf8.html
// 동작:
//   1. 조문 파서(parse-trademark-articles.mjs)와 동일한 span/마커/부제목 로직으로 파싱하되
//      음영 스팬을 추적 → 각 블록의 inline 텍스트 내 정답 run + 앞뒤 ±30자 컨텍스트 추출.
//   2. 함께 공부할 조문(sub_article_group) 내부 빈칸도 같은 main 조문 set 에 포함(렌더러가 walk).
//   3. DB 의 트레이드마크 article body_json 과 대조해 매칭 검증(리포트).
//   4. article_blank_sets (version='v1') upsert.
//
// 주의: SUPABASE_SERVICE_ROLE_KEY 필요.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HTML = resolve(ROOT, "source/_converted/리담상표법 스터디키드.utf8.html");
const LAW_CODE = "trademark";
const VERSION = "v1";
const OWNER_ID = "8dbc9c0e-a32d-456e-bf53-bf89160669e0"; // admin 임병웅
const SHADE = "background-color:#c0cdef";
const CTX = 30;
const DRY = process.argv.includes("--dry");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const $ = cheerio.load(readFileSync(HTML, "utf8"), {});
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

// ── span 분류 (음영 플래그 포함) ──
function classifySpan($el) {
  const style = ($el.attr("style") || "").replace(/\s+/g, " ").toLowerCase();
  const text = $el.text();
  if (!text) return null;
  const shaded = style.includes(SHADE);
  const fontM = /font-family:\s*"?([^";]+)/.exec(style);
  const font = fontM ? fontM[1] : "";
  let kind = "text";
  if (/서울남산\s*장체/.test(font) || /^\s*[[<](개정|신설|삭제|전문개정|본조신설|본문개정|제목개정|타법개정|시행)/.test(text)) {
    kind = "amendment";
  } else if (/돋움체/.test(font) && (/bold/.test(style) || /font-weight:\s*(bold|[6-9]00)/.test(style))) {
    kind = "bold";
  } else if (/text-decoration[^;]*underline/.test(style)) {
    kind = "underline";
  }
  return { kind, text, shaded };
}
function mergeBold(tokens) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t && t.kind === "bold") {
      let merged = t.text;
      let j = i + 1;
      while (j < tokens.length && tokens[j] && tokens[j].kind === "bold") merged += tokens[j++].text;
      const sub = /^\s*\((.+)\)\s*$/.exec(merged);
      const ann = /^\s*\[(.+)\]\s*$/.exec(merged);
      if (sub) out.push({ kind: "subtitle", text: sub[1] });
      else if (ann) out.push({ kind: "annotation", text: ann[1] });
      else out.push({ kind: "text", text: merged });
      i = j;
    } else { out.push(t); i++; }
  }
  return out;
}
function paragraphTokens($p) {
  const raw = [];
  $p.children().each((_, el) => {
    if (el.name === "br") { raw.push({ kind: "text", text: " ", shaded: false }); return; }
    if (el.name !== "span") { const t = $(el).text(); if (t) raw.push({ kind: "text", text: t, shaded: false }); return; }
    const $el = $(el);
    if (($el.attr("class") || "").includes("hnc_page_break")) return;
    const c = classifySpan($el);
    if (c) raw.push(c);
  });
  return mergeBold(raw)
    .map((t) => {
      if (!t) return null;
      const shaded = !!t.shaded;
      if (t.kind === "text") return { type: "text", text: t.text, shaded };
      if (t.kind === "underline") return { type: "underline", text: t.text, shaded };
      if (t.kind === "subtitle") return { type: "subtitle", text: t.text, shaded: false };
      if (t.kind === "annotation") return { type: "annotation", text: t.text, shaded: false };
      if (t.kind === "amendment") return { type: "amendment_note", text: t.text, shaded: false };
      return null;
    })
    .filter(Boolean);
}
function stripMarker(tokens, markerLen) {
  const out = tokens.map((t) => ({ ...t }));
  for (const t of out) { if (t.type === "text") { t.text = t.text.replace(/^\s+/, "").slice(markerLen).replace(/^\s+/, ""); break; } break; }
  while (out.length && out[0].type === "text" && out[0].text === "") out.shift();
  return out;
}
function splitSubtitle(tokens) {
  const rest = tokens.slice();
  if (rest.length && rest[0].type === "subtitle") rest.shift();
  // 중간 subtitle 강등
  const inline = rest.map((t) => (t.type === "subtitle" ? { type: "text", text: `(${t.text})`, shaded: false } : t));
  // 빈/연속 text 병합 (shaded 경계 보존)
  const merged = [];
  for (const t of inline) {
    if (t.type === "text" && t.text === "") continue;
    const last = merged[merged.length - 1];
    if (last && last.type === "text" && t.type === "text" && !!last.shaded === !!t.shaded) last.text += t.text;
    else merged.push({ ...t });
  }
  return merged;
}

// inline 토큰 배열에서 음영 run → 빈칸 {answer, beforeContext, afterContext}
function blanksFromInline(inline) {
  const fullText = inline.map((t) => t.text).join("");
  const out = [];
  let offset = 0;
  let i = 0;
  while (i < inline.length) {
    if (inline[i].shaded && inline[i].text.trim()) {
      // 연속 shaded run 병합
      let runText = "";
      const start = offset;
      while (i < inline.length && inline[i].shaded) { runText += inline[i].text; offset += inline[i].text.length; i++; }
      // 트림 + offset 보정
      const lead = runText.length - runText.replace(/^\s+/, "").length;
      const trail = runText.length - runText.replace(/\s+$/, "").length;
      const aStart = start + lead;
      const aEnd = start + runText.length - trail;
      const answer = fullText.slice(aStart, aEnd);
      if (answer.trim().length > 0) {
        out.push({
          answer,
          beforeContext: fullText.slice(Math.max(0, aStart - CTX), aStart),
          afterContext: fullText.slice(aEnd, aEnd + CTX),
        });
      }
    } else {
      offset += inline[i].text.length;
      i++;
    }
  }
  return out;
}

// ── walk (스터디키드 스타일) ──
// 메인 조문 헤더 = HStyle9 | HStyle11 (+ "제N조(제목)"). 임베드 출처=HStyle20, 임베드 sub-header=HStyle15.
// 빈칸은 모두 현재 메인 조문 set 에 귀속(렌더러가 sub_article_group 까지 walk). 임베드 헤더만 skip.
const HEADER_RE = /^제(\d+)조(?:의(\d+))?\s*\(([^)]*)\)/;
const MAIN_HEADER_CLS = new Set(["HStyle9", "HStyle11"]);
const SKIP_CLS = new Set(["HStyle20", "HStyle15"]); // 임베드 출처/내부 헤더 — 본문 아님

const pList = [];
$("p").each((_, el) => {
  const $p = $(el);
  pList.push({ $p, cls: norm($p.attr("class")) || "", text: norm($p.text()) });
});
let bodyStart = -1;
pList.forEach((p, i) => {
  if (/^제1조\s*\(목적\)/.test(p.text)) bodyStart = i;
});
if (bodyStart < 0) { console.error("본문 시작점 못 찾음"); process.exit(1); }

const articleBlanks = new Map(); // articleNumberText -> [{answer,beforeContext,afterContext}]
let curKey = null;

function emit(inline) {
  if (!curKey) return;
  const bs = blanksFromInline(inline);
  if (bs.length) {
    const arr = articleBlanks.get(curKey) ?? [];
    arr.push(...bs);
    articleBlanks.set(curKey, arr);
  }
}

for (let i = bodyStart; i < pList.length; i++) {
  const { cls, text, $p } = pList[i];
  if (!text) continue;
  const hM = HEADER_RE.exec(text);
  if (MAIN_HEADER_CLS.has(cls) && hM) {
    curKey = hM[2] ? `${hM[1]}의${hM[2]}` : hM[1];
    continue;
  }
  if (!curKey) continue;
  if (SKIP_CLS.has(cls)) continue; // 임베드 출처/sub-header

  const tokens = paragraphTokens($p);
  if (tokens.length === 0) continue;
  const firstText = tokens[0].type === "text" ? tokens[0].text.replace(/^\s+/, "") : "";
  let m, inline;
  if ((m = /^([①-⑳])/.exec(firstText))) inline = splitSubtitle(stripMarker(tokens, firstText.indexOf(m[1]) + m[1].length));
  else if ((m = /^(\d+)\.\s*/.exec(firstText))) inline = splitSubtitle(stripMarker(tokens, m[0].length));
  else if ((m = /^([가-하])\.\s*/.exec(firstText))) inline = splitSubtitle(stripMarker(tokens, m[0].length));
  else inline = splitSubtitle(tokens);
  emit(inline);
}

console.log(`파싱: ${articleBlanks.size} 조문에 빈칸, 총 ${[...articleBlanks.values()].reduce((a, b) => a + b.length, 0)}개`);

// ── DB 매칭 검증 + 시드 ──
const { data: law } = await supa.from("laws").select("law_id").eq("law_code", LAW_CODE).single();
const { data: arts } = await supa
  .from("articles")
  .select("article_id, article_number, current_revision_id")
  .eq("law_id", law.law_id).eq("level", "article").is("deleted_at", null);
const byNum = new Map(arts.filter((a) => a.article_number).map((a) => [a.article_number, a]));

// 블록 cumulative inline 텍스트 모음 (검증용) — body_json walk
function blockTexts(body) {
  const out = [];
  const inlineText = (b) => (b.inline || []).map((t) => t.text ?? t.raw ?? "").join("");
  const walk = (blocks) => {
    for (const b of blocks || []) {
      if (b.kind === "clause" || b.kind === "item" || b.kind === "sub") { out.push(inlineText(b)); walk(b.children); }
      else if (b.kind === "para") out.push(inlineText(b));
      else if (b.kind === "sub_article_group") { walk(b.preface); for (const sa of b.articles || []) walk(sa.blocks); }
    }
  };
  walk(body?.blocks);
  return out;
}
function locates(blockTextList, answer, before, after) {
  const a = answer.trim();
  for (const bt of blockTextList) {
    let from = 0, idx;
    while ((idx = bt.indexOf(a, from)) >= 0) {
      const b = bt.slice(Math.max(0, idx - before.length), idx);
      const af = bt.slice(idx + a.length, idx + a.length + after.length);
      // 앵커: 짧은 쪽 기준 꼬리/머리 일치
      const bOk = before.length === 0 || b.endsWith(before.slice(-Math.min(before.length, 12))) || before.endsWith(b.slice(-Math.min(b.length, 12)));
      const aOk = after.length === 0 || af.startsWith(after.slice(0, Math.min(after.length, 12))) || after.startsWith(af.slice(0, Math.min(af.length, 12)));
      if (bOk && aOk) return true;
      from = idx + 1;
    }
  }
  return false;
}

const revIds = arts.map((a) => a.current_revision_id).filter(Boolean);
const { data: revs } = await supa.from("article_revisions").select("revision_id, body_json").in("revision_id", revIds);
const bodyByRev = new Map(revs.map((r) => [r.revision_id, r.body_json]));

let setCount = 0, blankCount = 0, matched = 0, unmatched = 0;
const unmatchedSamples = [];
for (const [key, blanks] of articleBlanks) {
  const art = byNum.get(key);
  if (!art) { console.log(`  ! 조문 미존재: ${key} (빈칸 ${blanks.length})`); continue; }
  const body = bodyByRev.get(art.current_revision_id);
  const bts = blockTexts(body);
  // 본문에서 매칭되는 빈칸만 저장 (강사 축약 라벨 등 미매칭은 제외 — 렌더 불가).
  const kept = [];
  for (const b of blanks) {
    if (locates(bts, b.answer, b.beforeContext, b.afterContext)) { matched++; kept.push(b); }
    else { unmatched++; if (unmatchedSamples.length < 15) unmatchedSamples.push(`${key}:${b.answer}`); }
  }
  if (kept.length === 0) continue;
  const entries = kept.map((b, i) => ({
    idx: i + 1,
    answer: b.answer,
    length: b.answer.length,
    before_context: b.beforeContext,
    after_context: b.afterContext,
  }));
  if (!DRY) {
    const { error } = await supa.from("article_blank_sets").upsert(
      {
        article_id: art.article_id,
        version: VERSION,
        body_text: "",
        blanks: entries,
        owner_id: OWNER_ID,
        display_name: "리담 상표법 스터디키트",
      },
      { onConflict: "article_id,version,owner_id" },
    );
    if (error) { console.error(`upsert ${key}: ${error.message}`); continue; }
  }
  setCount++; blankCount += entries.length;
}

console.log(`\n=== 결과 ===`);
console.log(`  blank_sets: ${setCount} / blanks: ${blankCount}`);
console.log(`  매칭 검증: ok ${matched} / 미매칭 ${unmatched} (${((matched / (matched + unmatched)) * 100).toFixed(1)}%)`);
if (unmatchedSamples.length) console.log(`  미매칭 표본: ${unmatchedSamples.join(", ")}`);
