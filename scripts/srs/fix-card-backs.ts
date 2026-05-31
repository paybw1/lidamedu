/**
 * 일회성: srs_items.back 을 학생 카드 친화적 plain text 로 재정정.
 *
 * 1차(2026-05-31): seed-items.ts 가 article_revisions.body_text(JSON)를 raw 그대로
 *   500자 자르고 적재해 깨진 JSON 코드가 노출되던 문제 정정.
 * 2차(2026-05-31): 평탄화에 빈칸 매칭용 blockCumulativeText 를 빌려 써서 ref_article
 *   raw("法 132의13②") 와 amendment_note("[전문개정 2014.6.11.]") 가 본문과 섞여
 *   나오던 문제 — flattenBodyForCard (학습용) 로 교체 재정정.
 *
 * 실행:
 *   npx dotenv -e .env -- npx tsx scripts/srs/fix-card-backs.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { flattenBodyForCard } from "../../app/features/srs/lib/srs-flatten";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("env missing");

const dryRun = process.argv.includes("--dry-run");

const admin = createClient<Database>(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: items, error } = await admin
    .from("srs_items")
    .select("item_id, back, source_type, source_id")
    .eq("source_type", "article")
    .is("deleted_at", null);
  if (error) throw error;
  if (!items) {
    console.log("[fix] 아이템 없음");
    return;
  }

  let total = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const it of items) {
    total += 1;
    if (!it.source_id) {
      skipped += 1;
      continue;
    }
    // 항상 원본(article_revisions.body_text) 에서 다시 평탄화 — 1차 정정 후 back 은
    // 이미 plain text 라 거기서 ref/amendment 를 골라낼 수 없기 때문.
    const { data: art } = await admin
      .from("articles")
      .select("current_revision_id")
      .eq("article_id", it.source_id)
      .maybeSingle();
    if (!art?.current_revision_id) {
      skipped += 1;
      continue;
    }
    const { data: rev } = await admin
      .from("article_revisions")
      .select("body_text")
      .eq("revision_id", art.current_revision_id)
      .maybeSingle();
    if (!rev?.body_text) {
      skipped += 1;
      continue;
    }
    const flat = flattenBodyForCard(rev.body_text);
    if (!flat) {
      skipped += 1;
      continue;
    }
    if (flat === it.back) {
      unchanged += 1;
      continue;
    }
    if (!dryRun) {
      await admin
        .from("srs_items")
        .update({ back: flat })
        .eq("item_id", it.item_id);
    }
    updated += 1;
  }

  console.log(
    `[fix] dry=${dryRun} total=${total} updated=${updated} unchanged=${unchanged} skipped=${skipped}`,
  );
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
