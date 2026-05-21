// 조문 body_json 의 { type:"underline" } inline 노드를 staff(원장/관리자/강사) underline highlight 로 변환.
//
// 정책:
//   - field_path: "article.body" (HighlightOverlay 의 단일 컨테이너)
//   - color: "underline" — staff RLS 로 모든 학생에게 노출
//   - start_offset/end_offset: ArticleBodyView 의 textContent flow 모방
//   - excerpt: underline 노드 text
//   - body_json 의 underline 노드는 그대로 유지 (article_revisions 발행 후 immutable trigger).
//     시각 underline 은 ArticleBodyView 가 underline 노드를 일반 text 로 렌더하도록 변경됨
//     (feat-3-211) — single source of truth = staff highlight
//   - user_id: 8dbc9c0e-... (임병웅 admin)
//
// closed-by-default 영역(sub_article_group / header_refs) 안 underline 은 변환에서 보류·warn.
//   향후 사용자가 그 영역 펼친 채로 highlight 추가하려면 별도 처리 필요.
//
// 사용:
//   node scripts/articles/convert-underline-to-staff-highlights.mjs                      # dry-run
//   node scripts/articles/convert-underline-to-staff-highlights.mjs --apply              # 실행
//   node scripts/articles/convert-underline-to-staff-highlights.mjs --article {uuid}     # 1건만
//   node scripts/articles/convert-underline-to-staff-highlights.mjs --law patent --apply # 단일 법령

import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv();

const APPLY = process.argv.includes("--apply");
const articleIdx = process.argv.indexOf("--article");
const ONLY_ARTICLE = articleIdx >= 0 ? process.argv[articleIdx + 1] : null;
const lawIdx = process.argv.indexOf("--law");
const ONLY_LAW = lawIdx >= 0 ? process.argv[lawIdx + 1] : null;
const STAFF_USER_ID = "8dbc9c0e-a32d-456e-bf53-bf89160669e0"; // bwyim@lidamip.com 임병웅

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function sha256Hex(s) {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

// ─── splitTrailingRefs (article-body.tsx 와 동일 로직) ─────────────────────
function splitTrailingRefs(inline) {
  const work = [...inline];
  const tail = [];
  const heldAmendments = [];
  while (work.length > 0) {
    const last = work[work.length - 1];
    if (last.type === "ref_article") {
      tail.unshift(work.pop());
      continue;
    }
    if (last.type === "text" && /^[\s,/.·]*$/.test(last.text)) {
      tail.unshift(work.pop());
      continue;
    }
    if (last.type === "amendment_note") {
      heldAmendments.unshift(work.pop());
      continue;
    }
    break;
  }
  if (!tail.some((t) => t.type === "ref_article")) {
    return { main: inline, tail: [] };
  }
  return { main: [...work, ...heldAmendments], tail };
}

// ─── ArticleBodyView textContent simulator ─────────────────────────────────
// closed 상태 가정: sub_article_group / header_refs / RefsCollapsible 의 내부는 textContent X.
function inlineText(n) {
  switch (n.type) {
    case "text":
      return n.text;
    case "underline":
      return n.text;
    case "subtitle":
      return `(${n.text})`;
    case "annotation":
      return `[${n.text}]`;
    case "ref_article":
      return n.raw;
    case "ref_law":
      return n.raw;
    case "amendment_note":
      return n.text;
    case "footnote":
      return String(n.n);
    default:
      return "";
  }
}

function emitInlines(inlines, parts) {
  for (const n of inlines) parts.push(inlineText(n));
}

// RefsCollapsible button 의 textContent — refCount 가 0 이상이면 항상 표시.
// `"관련 조문" + "${refCount}건"` — 6글자 이상.
function emitRefsCollapsibleButton(refs, parts) {
  const refCount = (refs ?? []).filter((r) => r && r.type === "ref_article").length;
  if (refCount === 0) return false;
  parts.push("관련 조문");
  parts.push(`${refCount}건`);
  return true;
}

// SubArticleGroup button 의 textContent.
function emitSubArticleGroupButton(block, parts) {
  parts.push(`함께 공부할 조문 — ${block.source ?? ""}`);
  parts.push(`${(block.articles ?? []).length}개`);
}

// 영역 안에 underline 노드가 있는지 — feat-3-211 default open 정책과 동일.
function refsHaveUnderlines(refs) {
  return (refs ?? []).some((r) => r && r.type === "underline");
}
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

// RefsCollapsible 의 펼친 상태 textContent — 안 inline (refs/tail) 의 textContent 까지.
// RefsCollapsible 안 InlineRun 은 일반 InlineNode 와 동일 — ref_article 은 raw, underline 은 text.
function emitRefsCollapsible(refs, parts) {
  if (!emitRefsCollapsibleButton(refs, parts)) return;
  // default open 정책: 안에 underline 이 있을 때만 펼침.
  if (refsHaveUnderlines(refs)) {
    emitInlines(refs, parts);
  }
}

function emitBlock(block, parts) {
  switch (block.kind) {
    case "para": {
      const { main, tail } = splitTrailingRefs(block.inline);
      emitInlines(main, parts);
      emitRefsCollapsible(tail, parts);
      break;
    }
    case "title_marker":
      parts.push(block.text);
      break;
    case "clause":
    case "item":
    case "sub": {
      parts.push(block.label);
      if (block.subtitle) parts.push(`(${block.subtitle})`);
      const { main, tail } = splitTrailingRefs(block.inline);
      emitInlines(main, parts);
      emitRefsCollapsible(tail, parts);
      for (const c of block.children) emitBlock(c, parts);
      break;
    }
    case "sub_article_group": {
      emitSubArticleGroupButton(block, parts);
      // default open 정책: 안에 underline 이 있을 때만 펼침.
      const hasUL =
        (block.preface ? blocksHaveUnderlines(block.preface) : false) ||
        block.articles.some((sa) => blocksHaveUnderlines(sa.blocks));
      if (hasUL) {
        if (block.preface && block.preface.length > 0) {
          parts.push("코멘트"); // preface 박스의 "코멘트" 라벨
          for (const b of block.preface) emitBlock(b, parts);
        }
        for (const sa of block.articles) {
          // SubArticleView 의 title — JSX 그대로 매핑.
          parts.push(
            `제${sa.number}조${sa.branch ? `의${sa.branch}` : ""} (${sa.title})`,
          );
          for (const b of sa.blocks) emitBlock(b, parts);
        }
      }
      break;
    }
    case "header_refs":
      emitRefsCollapsible(block.refs, parts);
      break;
  }
}

function articleBodyTextContent(body) {
  const parts = [];
  for (const b of body.blocks) emitBlock(b, parts);
  return parts.join("");
}

// ─── underline 노드 순회 ───────────────────────────────────────────────────
// feat-3-211 v2: sub_article_group / header_refs 안 underline 도 변환 대상 — default open 정책.
function collectUnderlineNodes(body) {
  const out = [];
  function walkInlines(inlines, mutate) {
    for (let i = 0; i < inlines.length; i += 1) {
      const n = inlines[i];
      if (n.type === "underline") {
        out.push({ text: n.text, isClosedArea: false, swap: () => mutate(i) });
      }
    }
  }
  function walkBlock(block) {
    switch (block.kind) {
      case "para":
        walkInlines(block.inline, (i) => {
          block.inline[i] = { type: "text", text: block.inline[i].text };
        });
        break;
      case "clause":
      case "item":
      case "sub":
        walkInlines(block.inline, (i) => {
          block.inline[i] = { type: "text", text: block.inline[i].text };
        });
        for (const c of block.children) walkBlock(c);
        break;
      case "sub_article_group":
        if (block.preface) for (const b of block.preface) walkBlock(b);
        for (const sa of block.articles) {
          for (const b of sa.blocks) walkBlock(b);
        }
        break;
      case "header_refs":
        walkInlines(block.refs, (i) => {
          block.refs[i] = { type: "text", text: block.refs[i].text };
        });
        break;
    }
  }
  for (const b of body.blocks) walkBlock(b);
  return out;
}

// ─── main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`mode  : ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`staff : ${STAFF_USER_ID}`);

  let q = supabase
    .from("articles")
    .select(
      "article_id, display_label, law_id, current_revision_id, deleted_at, laws!inner(law_code)",
    )
    .is("deleted_at", null)
    .not("current_revision_id", "is", null);
  if (ONLY_ARTICLE) q = q.eq("article_id", ONLY_ARTICLE);
  if (ONLY_LAW) q = q.eq("laws.law_code", ONLY_LAW);

  const { data: articles, error } = await q;
  if (error) {
    console.error("articles 조회 실패:", error.message);
    process.exit(1);
  }
  console.log(`articles: ${articles.length}`);

  // 1) 각 article 의 current revision body_json fetch (배치).
  const revIds = articles
    .map((a) => a.current_revision_id)
    .filter((v) => !!v);
  const revMap = new Map();
  for (let i = 0; i < revIds.length; i += 200) {
    const slice = revIds.slice(i, i + 200);
    const { data: rows, error: rErr } = await supabase
      .from("article_revisions")
      .select("revision_id, body_json, body_text")
      .in("revision_id", slice);
    if (rErr) {
      console.error(`  rev fetch batch ${i} 실패:`, rErr.message);
      continue;
    }
    for (const r of rows ?? []) revMap.set(r.revision_id, r);
  }

  let casesAffected = 0;
  let totalMarks = 0;
  let closedMarks = 0;
  let unmatchedMarks = 0;
  const insertRows = [];
  const updateRows = [];
  const sampleSeen = { ok: false };

  for (const a of articles) {
    const rev = revMap.get(a.current_revision_id);
    if (!rev?.body_json) continue;
    const body = rev.body_json;
    const underlineNodes = collectUnderlineNodes(body);
    const openUnderlines = underlineNodes.filter((u) => !u.isClosedArea);
    const closedHere = underlineNodes.length - openUnderlines.length;
    closedMarks += closedHere;
    if (openUnderlines.length === 0) continue;

    // textContent 재계산 (closed 영역 제외)
    const textContent = articleBodyTextContent(body);

    // 각 underline 의 텍스트를 순차적 occurrence 로 매칭.
    let cursor = 0;
    const articleMarks = [];
    let unmatchedHere = 0;
    for (const u of openUnderlines) {
      const idx = textContent.indexOf(u.text, cursor);
      if (idx < 0) {
        unmatchedHere += 1;
        continue;
      }
      articleMarks.push({
        start: idx,
        end: idx + u.text.length,
        content: u.text,
        swap: u.swap,
      });
      cursor = idx + u.text.length;
    }
    unmatchedMarks += unmatchedHere;
    if (articleMarks.length === 0) continue;

    casesAffected += 1;
    totalMarks += articleMarks.length;

    for (const mk of articleMarks) {
      insertRows.push({
        user_id: STAFF_USER_ID,
        target_type: "article",
        target_id: a.article_id,
        field_path: "article.body",
        start_offset: mk.start,
        end_offset: mk.end,
        content_hash: sha256Hex(mk.content),
        color: "underline",
        label: mk.content.slice(0, 500),
      });
      // swap 호출 X — body_json mutate 하면 후속 멱등 delete 가 변환 대상 article 을 다시 찾지 못함
      // (collectUnderlineNodes 가 텍스트 노드로 바뀐 영역을 보지 못해 targetArticleIds 빈 배열).
      // body_json cleanup 은 어차피 article_revisions immutable trigger 라 skip.
    }
    updateRows.push({
      article_id: a.article_id,
      revision_id: a.current_revision_id,
      article_label: a.display_label,
      law_code: a.laws.law_code,
    });

    if (!sampleSeen.ok && articleMarks.length > 0) {
      sampleSeen.ok = true;
      console.log(
        `\n--- sample (${a.laws.law_code} ${a.display_label}) — marks=${articleMarks.length}, textLen=${textContent.length} ---`,
      );
      for (const mk of articleMarks.slice(0, 3)) {
        console.log(
          `  [${mk.start}..${mk.end}] "${mk.content.slice(0, 80)}${mk.content.length > 80 ? "…" : ""}"`,
        );
        console.log(
          `  context: "…${textContent.slice(Math.max(0, mk.start - 20), mk.start)}[${textContent.slice(mk.start, mk.end)}]${textContent.slice(mk.end, Math.min(textContent.length, mk.end + 20))}…"`,
        );
      }
    }
  }

  console.log(`\n=== 변환 통계 ===`);
  console.log(`articles affected : ${casesAffected}`);
  console.log(`highlights total  : ${totalMarks}`);
  console.log(`closed-area marks : ${closedMarks} (변환 보류 — sub_article_group / header_refs 내부)`);
  console.log(`unmatched marks   : ${unmatchedMarks} (텍스트가 본문 textContent 에 없음 — 보고 후 보류)`);

  if (!APPLY) {
    console.log(`\n(dry-run — 실제 변경 안 함. --apply 로 실행)`);
    return;
  }

  // 1) 멱등성 — 기존 staff underline (article) row 먼저 정리.
  console.log(`\n기존 staff underline highlight 제거 (멱등성)...`);
  const targetArticleIds = updateRows.map((r) => r.article_id);
  for (let i = 0; i < targetArticleIds.length; i += 500) {
    const slice = targetArticleIds.slice(i, i + 500);
    const { error: delErr } = await supabase
      .from("user_highlights")
      .delete()
      .eq("user_id", STAFF_USER_ID)
      .eq("target_type", "article")
      .eq("color", "underline")
      .in("target_id", slice);
    if (delErr) console.error(`  delete batch ${i} 실패:`, delErr.message);
  }

  // 2) highlights insert (200 개씩).
  console.log(`\nhighlights insert ...`);
  let okIns = 0;
  let failIns = 0;
  for (let i = 0; i < insertRows.length; i += 200) {
    const slice = insertRows.slice(i, i + 200);
    const { error: insErr } = await supabase
      .from("user_highlights")
      .insert(slice);
    if (insErr) {
      console.error(`  insert batch ${i}~${i + slice.length} 실패:`, insErr.message);
      failIns += slice.length;
    } else {
      okIns += slice.length;
    }
  }
  console.log(`  ok=${okIns}, fail=${failIns}`);

  // article_revisions body_json 은 immutable — cleanup 안 함.
  // ArticleBodyView 의 underline 노드 렌더가 plain text 로 변경됐으므로 시각 중복 없음.
  // body_json mutate 도 skip — 멱등 delete 가 변환 대상 article 식별을 못 하게 만들기 때문 (위 swap 미호출 사유 참조).
  console.log(
    `\nbody_json cleanup: skip (article_revisions immutable trigger — 의미적으로 영향 없음, ` +
      `ArticleBodyView 의 underline 노드 렌더가 plain text 라 시각 중복 없음)`,
  );

  console.log(`\n=== 완료 ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
