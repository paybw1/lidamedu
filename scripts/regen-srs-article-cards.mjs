// SRS 조문 암기카드 back 재생성 — 고아 쉼표 정리 + 짤림 해소(전문 보존).
//   기존 srs_items(source_type=article) 의 back 만 in-place 갱신(item_id 보존 → 스케줄 무영향).
//   flatten 로직은 app/features/srs/lib/srs-flatten.ts 와 동일하게 이식(향후 생성과 일치).
//
//   node scripts/regen-srs-article-cards.mjs [--apply]
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const ARTICLE_BACK_MAX = 20000;
const APPLY = process.argv.includes("--apply");

// ── flatten (srs-flatten.ts 이식) ──
function inlineLearnerText(t) {
  if (t && (t.type === "text" || t.type === "underline")) return t.text ?? "";
  return "";
}
function blockLearnerText(block) {
  if (
    block.kind === "title_marker" ||
    block.kind === "header_refs" ||
    block.kind === "sub_article_group"
  )
    return "";
  return (block.inline ?? [])
    .map(inlineLearnerText)
    .join("")
    .replace(/\s+,+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function walk(blocks, visit) {
  for (const b of blocks ?? []) {
    visit(b);
    if (b.kind === "clause" || b.kind === "item" || b.kind === "sub")
      walk(b.children, visit);
  }
}
function flattenBodyForCard(jsonStr) {
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.blocks))
    return null;
  const parts = [];
  walk(parsed.blocks, (block) => {
    const text = blockLearnerText(block);
    if (!text) return;
    if (block.kind === "clause" || block.kind === "item" || block.kind === "sub") {
      const head = block.label ? `${block.label} ` : "";
      parts.push(`${head}${text}`);
    } else if (block.kind === "para") {
      parts.push(text);
    }
  });
  return parts.join("\n").trim() || null;
}

// ── main ──
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
console.log(`target: ${process.env.SUPABASE_URL}  mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

const { data: cards, error: cErr } = await db
  .from("srs_items")
  .select("item_id, source_id, back")
  .eq("source_type", "article")
  .is("deleted_at", null);
if (cErr) {
  console.error(cErr.message);
  process.exit(1);
}
const srcIds = [...new Set(cards.map((c) => c.source_id).filter(Boolean))];

const { data: arts } = await db
  .from("articles")
  .select("article_id, current_revision_id")
  .in("article_id", srcIds);
const revOf = new Map(arts.map((a) => [a.article_id, a.current_revision_id]));
const revIds = [...new Set([...revOf.values()].filter(Boolean))];

const { data: revs } = await db
  .from("article_revisions")
  .select("revision_id, body_text")
  .in("revision_id", revIds);
const bodyOf = new Map(revs.map((r) => [r.revision_id, r.body_text]));

let changed = 0;
let unchanged = 0;
let failed = 0;
for (const c of cards) {
  const revId = revOf.get(c.source_id);
  const raw = revId ? (bodyOf.get(revId) ?? null) : null;
  const flat = raw ? flattenBodyForCard(raw) : null;
  let back = flat ?? raw ?? "(본문 미수록 — 조문 학습 화면에서 확인)";
  if (back.length > ARTICLE_BACK_MAX)
    back = back.slice(0, ARTICLE_BACK_MAX).trimEnd() + "…";

  if (back === c.back) {
    unchanged += 1;
    continue;
  }
  changed += 1;
  if (APPLY) {
    const { error } = await db
      .from("srs_items")
      .update({ back })
      .eq("item_id", c.item_id);
    if (error) {
      failed += 1;
      console.error(`update 실패 ${c.item_id}:`, error.message);
    }
  } else if (changed <= 4) {
    console.log(`\n--- ${c.item_id} ---\nBEFORE: ${c.back.slice(0, 160)}\nAFTER : ${back.slice(0, 160)}`);
  }
}
console.log(
  `\ncards=${cards.length}  changed=${changed}  unchanged=${unchanged}  failed=${failed}`,
);
if (!APPLY) console.log("DRY-RUN — 적용하려면 --apply 플래그를 붙이세요.");
