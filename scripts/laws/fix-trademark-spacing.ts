/**
 * 일회성: 상표법 조문 본문 — clause/item/sub/para 의 첫 inline text 토큰 leading
 * 공백 제거. 특허법(1730/1731 no leading space) 기준에 맞춰 통일.
 *
 *   npx dotenv -e .env -- npx tsx scripts/laws/fix-trademark-spacing.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";

import type { Database, Json } from "../../database.types";
import type { ArticleBody, Block } from "../../app/features/laws/lib/article-body";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("env missing");

const dryRun = process.argv.includes("--dry-run");

const admin = createClient<Database>(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function visitBlocks(blocks: Block[]): number {
  let count = 0;
  for (const b of blocks) {
    if (
      b.kind === "clause" ||
      b.kind === "item" ||
      b.kind === "sub" ||
      b.kind === "para"
    ) {
      const first = b.inline[0];
      if (first && first.type === "text" && first.text.startsWith(" ")) {
        (first as { text: string }).text = first.text.replace(/^\s+/, "");
        count += 1;
      }
      if (b.kind !== "para") {
        count += visitBlocks(b.children);
      }
    } else if (b.kind === "sub_article_group") {
      if (b.preface) count += visitBlocks(b.preface);
      for (const sa of b.articles) count += visitBlocks(sa.blocks);
    }
  }
  return count;
}

async function main() {
  const { data: laws, error: lawErr } = await admin
    .from("laws")
    .select("law_id")
    .eq("law_code", "trademark")
    .maybeSingle();
  if (lawErr || !laws) throw new Error("trademark law not found");

  const { data: arts, error } = await admin
    .from("articles")
    .select("article_id, display_label, current_revision_id")
    .eq("law_id", laws.law_id)
    .is("deleted_at", null)
    .not("current_revision_id", "is", null);
  if (error || !arts) throw new Error("no articles");

  console.log(`[trademark-spacing] dry=${dryRun} articles=${arts.length}`);
  let touched = 0;
  let totalEdits = 0;
  for (const a of arts) {
    if (!a.current_revision_id) continue;
    const { data: rev } = await admin
      .from("article_revisions")
      .select("body_json")
      .eq("revision_id", a.current_revision_id)
      .maybeSingle();
    if (!rev?.body_json) continue;
    const body = JSON.parse(JSON.stringify(rev.body_json)) as ArticleBody;
    const n = visitBlocks(body.blocks);
    if (n === 0) continue;
    console.log(`  [CHG] ${a.display_label} — ${n} leading-space strip`);
    totalEdits += n;
    touched += 1;
    if (dryRun) continue;
    const { error: updErr } = await admin
      .from("article_revisions")
      .update({ body_json: body as unknown as Json })
      .eq("revision_id", a.current_revision_id);
    if (updErr) {
      console.error(`  [FAIL] ${a.display_label}: ${updErr.message}`);
    }
  }
  console.log(`[trademark-spacing] touched=${touched} totalEdits=${totalEdits}`);
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
