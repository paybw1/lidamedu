// user_highlights 의 before_ctx/after_ctx 결측분 일괄 백필.
//
// 원리: 하이라이트 offset(start/end)은 ArticleBodyView / case-body 의 rendered
//   textContent 기준으로 산출됨. 동일 시뮬레이터로 textContent 를 재현한 뒤
//   slice(start,end) === label 로 정합을 검증하고, 일치하는 건만 앞·뒤 ±30자를
//   before_ctx/after_ctx 에 채운다. (label/offset/삭제는 절대 손대지 않음 — 빈 컬럼만 채움.)
//
// 시뮬레이터는 검증된 변환 스크립트에서 그대로 복사:
//   - 조문: scripts/articles/convert-underline-to-staff-highlights.mjs
//   - 판례: scripts/precedents/convert-u-to-staff-highlights.mjs
//
// 사용:
//   node scripts/backfill-highlight-context.mjs            # dry-run (매칭률 리포트)
//   node scripts/backfill-highlight-context.mjs --apply    # 적용 (검증 통과분만)

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv();

const APPLY = process.argv.includes("--apply");
const CTX = 30; // 앞·뒤 문맥 길이 (기존 캡처 규약과 동일)

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ════════ 조문 시뮬레이터 (convert-underline-to-staff-highlights.mjs 복사) ════════
function splitTrailingRefs(inline) {
  const work = [...inline];
  const tail = [];
  const heldAmendments = [];
  while (work.length > 0) {
    const last = work[work.length - 1];
    if (last.type === "ref_article") { tail.unshift(work.pop()); continue; }
    if (last.type === "text" && /^[\s,/.·]*$/.test(last.text)) { tail.unshift(work.pop()); continue; }
    if (last.type === "amendment_note") { heldAmendments.unshift(work.pop()); continue; }
    break;
  }
  if (!tail.some((t) => t.type === "ref_article")) return { main: inline, tail: [] };
  return { main: [...work, ...heldAmendments], tail };
}
function inlineText(n) {
  switch (n.type) {
    case "text": return n.text;
    case "underline": return n.text;
    case "subtitle": return `(${n.text})`;
    case "annotation": return `[${n.text}]`;
    case "ref_article": return n.raw;
    case "ref_law": return n.raw;
    case "amendment_note": return n.text;
    case "footnote": return String(n.n);
    default: return "";
  }
}
function emitInlines(inlines, parts) { for (const n of inlines) parts.push(inlineText(n)); }
function emitRefsCollapsibleButton(refs, parts) {
  const refCount = (refs ?? []).filter((r) => r && r.type === "ref_article").length;
  if (refCount === 0) return false;
  parts.push("관련 조문"); parts.push(`${refCount}건`); return true;
}
function emitSubArticleGroupButton(block, parts) {
  parts.push(`함께 공부할 조문 — ${block.source ?? ""}`);
  parts.push(`${(block.articles ?? []).length}개`);
}
function refsHaveUnderlines(refs) { return (refs ?? []).some((r) => r && r.type === "underline"); }
function blocksHaveUnderlines(blocks) {
  for (const b of blocks ?? []) {
    if (b.kind === "clause" || b.kind === "item" || b.kind === "sub") {
      if (refsHaveUnderlines(b.inline)) return true;
      if (blocksHaveUnderlines(b.children)) return true;
    } else if (b.kind === "para") {
      if (refsHaveUnderlines(b.inline)) return true;
    } else if (b.kind === "sub_article_group") {
      if (b.preface && blocksHaveUnderlines(b.preface)) return true;
      for (const sa of b.articles) if (blocksHaveUnderlines(sa.blocks)) return true;
    } else if (b.kind === "header_refs") {
      if (refsHaveUnderlines(b.refs)) return true;
    }
  }
  return false;
}
function emitRefsCollapsible(refs, parts) {
  if (!emitRefsCollapsibleButton(refs, parts)) return;
  if (refsHaveUnderlines(refs)) emitInlines(refs, parts);
}
function emitBlock(block, parts) {
  switch (block.kind) {
    case "para": {
      const { main, tail } = splitTrailingRefs(block.inline);
      emitInlines(main, parts); emitRefsCollapsible(tail, parts); break;
    }
    case "title_marker": parts.push(block.text); break;
    case "clause":
    case "item":
    case "sub": {
      parts.push(block.label);
      if (block.subtitle) parts.push(`(${block.subtitle})`);
      const { main, tail } = splitTrailingRefs(block.inline);
      emitInlines(main, parts); emitRefsCollapsible(tail, parts);
      for (const c of block.children) emitBlock(c, parts);
      break;
    }
    case "sub_article_group": {
      emitSubArticleGroupButton(block, parts);
      const hasUL =
        (block.preface ? blocksHaveUnderlines(block.preface) : false) ||
        block.articles.some((sa) => blocksHaveUnderlines(sa.blocks));
      if (hasUL) {
        if (block.preface && block.preface.length > 0) {
          parts.push("코멘트");
          for (const b of block.preface) emitBlock(b, parts);
        }
        for (const sa of block.articles) {
          parts.push(`제${sa.number}조${sa.branch ? `의${sa.branch}` : ""} (${sa.title})`);
          for (const b of sa.blocks) emitBlock(b, parts);
        }
      }
      break;
    }
    case "header_refs": emitRefsCollapsible(block.refs, parts); break;
  }
}
function articleBodyTextContent(body) {
  const parts = [];
  for (const b of body.blocks) emitBlock(b, parts);
  return parts.join("");
}

// ════════ 판례 시뮬레이터 (convert-u-to-staff-highlights.mjs 복사) ════════
function isMarkdownTableParagraph(p) {
  const lines = p.split("\n");
  if (lines.length < 2) return false;
  const head = lines[0].trim(); const sep = lines[1].trim();
  if (!head.startsWith("|") || !head.endsWith("|")) return false;
  if (!sep.startsWith("|") || !sep.endsWith("|")) return false;
  const cells = sep.slice(1, -1).split("|").map((c) => c.trim());
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}
function tableTextContent(p) {
  const lines = p.split("\n"); const cells = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|\s*:?-{3,}:?(\s*\|\s*:?-{3,}:?\s*)+\|$/.test(t)) continue;
    const arr = t.slice(1, t.endsWith("|") ? -1 : undefined).split("|").map((c) => c.trim());
    cells.push(...arr);
  }
  return cells.join("");
}
const IMG_PARA_RE = /^!\[(?<alt>[^\]]*)\]\((?<url>[^)\s]+)(?:\s+"[^"]*")?\)\s*$/;
function parseImageParagraph(p) {
  const m = p.trim().match(IMG_PARA_RE);
  if (!m || !m.groups) return null;
  return { alt: m.groups.alt, url: m.groups.url };
}
// <u> 마커는 현 DB 에 없으므로 단순 누적 — acc 가 곧 textContent.
function makeConsumer() {
  let acc = "";
  function consume(s) { if (s) acc += s; }
  return { consume, get acc() { return acc; } };
}
function feedProse(text, c) {
  if (!text) return;
  const paras = text.split(/\n{2,}/).filter((s) => s.trim() !== "");
  for (const p of paras) {
    const img = parseImageParagraph(p);
    if (img) { c.consume(img.alt ?? ""); continue; }
    if (isMarkdownTableParagraph(p)) { c.consume(tableTextContent(p)); continue; }
    c.consume(p);
  }
}
function feedSummaryItem(item, index, totalItems, c) {
  const t = item.title ?? "";
  let label = null; let displayTitle = t;
  const m = t.match(/^\[(\d+)\]\s*(.*)$/);
  if (m) { label = `[${m[1]}]`; displayTitle = m[2]; }
  const showLabel = totalItems > 1;
  if (showLabel && !label) label = `[${index + 1}]`;
  const labelNumber = label ? label.replace(/[^\d]/g, "") : null;
  if (labelNumber) c.consume(labelNumber);
  c.consume(displayTitle);
  feedProse(item.body ?? "", c);
  const commentRaw =
    typeof item.commentMd === "string" ? item.commentMd
      : typeof item.comment_md === "string" ? item.comment_md : "";
  if (commentRaw && commentRaw.trim() !== "") {
    c.consume(labelNumber ? `비고 ${labelNumber}` : "비고");
    c.consume("이 요지에 대한 코멘트");
    feedProse(commentRaw, c);
  }
}
function buildSummaryTextContent(summaryItems) {
  const c = makeConsumer();
  for (let i = 0; i < summaryItems.length; i += 1)
    feedSummaryItem(summaryItems[i], i, summaryItems.length, c);
  return c.acc;
}
function buildProseTextContent(text) {
  const c = makeConsumer();
  feedProse(text, c);
  return c.acc;
}

// ════════ main ════════
async function main() {
  console.log(`mode : ${APPLY ? "APPLY" : "DRY-RUN"}  (ctx=±${CTX}자)`);

  // 1) 문맥 결측 하이라이트 전부.
  const missing = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("user_highlights")
      .select(
        "highlight_id, target_type, target_id, field_path, start_offset, end_offset, label",
      )
      .is("deleted_at", null)
      .is("before_ctx", null)
      .is("after_ctx", null)
      .range(from, from + PAGE - 1);
    if (error) { console.error("highlights 조회 실패:", error.message); process.exit(1); }
    missing.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`문맥 결측 하이라이트: ${missing.length}`);

  // 2) 원문 소스 fetch.
  const articleIds = [...new Set(missing.filter((h) => h.target_type === "article").map((h) => h.target_id))];
  const caseIds = [...new Set(missing.filter((h) => h.target_type === "case").map((h) => h.target_id))];

  // 조문: article_id → current_revision body_json → textContent.
  const articleText = new Map();
  if (articleIds.length > 0) {
    const arts = [];
    for (let i = 0; i < articleIds.length; i += 300) {
      const { data } = await supabase
        .from("articles")
        .select("article_id, current_revision_id")
        .in("article_id", articleIds.slice(i, i + 300));
      arts.push(...(data ?? []));
    }
    const revToArticle = new Map();
    for (const a of arts) if (a.current_revision_id) revToArticle.set(a.current_revision_id, a.article_id);
    const revIds = [...revToArticle.keys()];
    for (let i = 0; i < revIds.length; i += 200) {
      const { data } = await supabase
        .from("article_revisions")
        .select("revision_id, body_json")
        .in("revision_id", revIds.slice(i, i + 200));
      for (const r of data ?? []) {
        if (!r.body_json) continue;
        try {
          articleText.set(revToArticle.get(r.revision_id), articleBodyTextContent(r.body_json));
        } catch (e) {
          // 시뮬레이터 예외 — 해당 조문은 매칭 실패로 집계.
        }
      }
    }
  }

  // 판례: case_id → field 별 textContent.
  const caseText = new Map(); // case_id → { summary, reasoning, comment }
  if (caseIds.length > 0) {
    for (let i = 0; i < caseIds.length; i += 200) {
      const { data } = await supabase
        .from("cases")
        .select("case_id, summary_items, reasoning_md, comment_body_md")
        .in("case_id", caseIds.slice(i, i + 200));
      for (const c of data ?? []) {
        caseText.set(c.case_id, {
          summary: (c.summary_items ?? []).length > 0 ? buildSummaryTextContent(c.summary_items) : null,
          reasoning: c.reasoning_md ? buildProseTextContent(c.reasoning_md) : null,
          comment: c.comment_body_md ? buildProseTextContent(c.comment_body_md) : null,
        });
      }
    }
  }

  function textFor(h) {
    if (h.target_type === "article") return articleText.get(h.target_id) ?? null;
    if (h.target_type === "case") {
      const t = caseText.get(h.target_id);
      if (!t) return null;
      if (h.field_path === "case.summary") return t.summary;
      if (h.field_path === "case.reasoning") return t.reasoning;
      if (h.field_path === "case.comment") return t.comment;
      return null; // case.related 등 미지원
    }
    return null;
  }

  // 3) 검증 + 문맥 계산.
  const updates = [];
  const stat = {
    matched: 0, mismatch: 0, noSource: 0,
    byField: {},
  };
  const bump = (field, key) => {
    stat.byField[field] = stat.byField[field] ?? { matched: 0, mismatch: 0, noSource: 0 };
    stat.byField[field][key] += 1;
  };
  let sampleShown = 0;

  for (const h of missing) {
    const field = `${h.target_type}:${h.field_path}`;
    const text = textFor(h);
    if (text == null) { stat.noSource += 1; bump(field, "noSource"); continue; }
    const label = h.label ?? "";
    const seg = text.slice(h.start_offset, h.end_offset);
    const ok = label.length >= 500 ? seg.slice(0, 500) === label : seg === label;
    if (!ok) { stat.mismatch += 1; bump(field, "mismatch"); continue; }
    stat.matched += 1; bump(field, "matched");
    const before = text.slice(Math.max(0, h.start_offset - CTX), h.start_offset);
    const after = text.slice(h.end_offset, h.end_offset + CTX);
    updates.push({ highlight_id: h.highlight_id, before_ctx: before, after_ctx: after });
    if (sampleShown < 6) {
      sampleShown += 1;
      console.log(`  [${field}] …${before}⟦${seg.slice(0, 40)}${seg.length > 40 ? "…" : ""}⟧${after}…`);
    }
  }

  console.log(`\n=== 매칭 통계 ===`);
  console.log(`matched (백필 가능): ${stat.matched}`);
  console.log(`mismatch (offset 불일치 — skip): ${stat.mismatch}`);
  console.log(`no source (case.related 등 미지원 — skip): ${stat.noSource}`);
  console.log(`\n--- field 별 ---`);
  for (const [f, s] of Object.entries(stat.byField))
    console.log(`  ${f}: matched=${s.matched} mismatch=${s.mismatch} noSource=${s.noSource}`);

  if (!APPLY) {
    console.log(`\n(dry-run — 변경 없음. --apply 로 ${updates.length}건 백필)`);
    return;
  }

  // 4) 적용 — before_ctx/after_ctx 만 update (여전히 null 인 행만).
  console.log(`\n백필 적용 (${updates.length}건)...`);
  let ok = 0; let fail = 0;
  for (let i = 0; i < updates.length; i += 1) {
    const u = updates[i];
    const { error } = await supabase
      .from("user_highlights")
      .update({ before_ctx: u.before_ctx, after_ctx: u.after_ctx })
      .eq("highlight_id", u.highlight_id)
      .is("before_ctx", null)
      .is("after_ctx", null);
    if (error) { fail += 1; if (fail <= 5) console.error(`  ${u.highlight_id} 실패:`, error.message); }
    else ok += 1;
    if ((i + 1) % 200 === 0) console.log(`  …${i + 1}/${updates.length}`);
  }
  console.log(`  ok=${ok}, fail=${fail}`);
  console.log(`\n=== 완료 ===`);
}

main().catch((e) => { console.error(e); process.exit(1); });
