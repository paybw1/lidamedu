/**
 * 일회성: amendment_note 로 잘못 분류된 inline 토큰 21건을 annotation 으로 정정.
 *
 * 화이트리스트:
 *  A. 부속 조문 참조 (4 unique): "(시행령 제5조)", "(시행규칙 제21조의2)",
 *     "(시행규칙 제21조의3)", "시행령 제6조]"
 *  B. 조문 표제/요지 라벨 (16 unique): "[심판관의 제척사유...]", "[외국인의 권리능력]",
 *     "[발명의 상세한 설명의 기재]", "[청구범위 기재방법: ...]", "[특허권의 공유]",
 *     "[후발적 무효사유]" 등
 *  + 빈 토큰 1건 (trademark 제51조) — inline 배열에서 제거
 *
 * 9건 article(특허법 7건 + 상표법 1건 + 제51조 1건) 각각 새 article_revision 생성 +
 * articles.current_revision_id 교체. 기존 revision 은 보존 (Non-neg #8 — 이력 유지).
 *
 *   npx dotenv -e .env -- npx tsx scripts/laws/fix-amendment-mislabels.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";

import type { Database, Json } from "../../database.types";
import type {
  ArticleBody,
  Block,
  Inline,
} from "../../app/features/laws/lib/article-body";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("env missing");

const dryRun = process.argv.includes("--dry-run");

const admin = createClient<Database>(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RECLASSIFY_TO_ANNOTATION = new Set<string>([
  // A — 부속 조문 참조
  "(시행규칙 제21조의2)",
  "(시행규칙 제21조의3)",
  "(시행령 제5조)",
  "시행령 제6조]",
  // B — 조문 표제/요지 라벨
  "[심판관의 제척사유, 단 전심관여 제외]",
  "[발명의 상세한 설명의 기재]",
  "[생산방법의 추정]",
  "[손해배상청구권의 소멸시효]",
  "[신규사항추가금지: 외국어특허출원의 경우 원문 및 국어번역문의 범위]",
  "[심사 또는 소송절차의 중지]",
  "[심사관의 심사]",
  "[외국인의 권리능력]",
  "[청구범위 기재방법: 기재원칙]",
  "[청구범위 기재방법: 다항제 기재방법]",
  "[특허권의 공유]",
  "[특허를 받을 수 없는 발명]",
  "[특허를 받을 수 있는 자]",
  "[특허여부결정의 방식]",
  "[하나의 특허출원의 범위]",
  "[후발적 무효사유]",
]);

const AFFECTED_ARTICLE_IDS = [
  "c0f22102-36a6-42be-8cec-b5214db86c86", // patent 제100조 전용실시권
  "7acfbe55-ec48-42c2-a5b5-615c92c98185", // patent 제42조 특허출원
  "e34d4487-8474-4598-acac-71ae3b979002", // patent 제42조의3 외국어특허출원 등
  "eb472560-73e9-4097-bf96-45a4a2fe0bb0", // patent 제45조 하나의 특허출원의 범위
  "29012fc7-0051-4c2f-8bf9-951a3d1bc0f1", // patent 제62조 특허거절결정
  "02d8cf29-d975-48fc-a41c-9c76e9b96e0d", // patent 제65조 출원공개의 효과
  "60e73a87-9e01-43db-9e5f-0b9c20ad1872", // patent 제68조 심판규정의 심사에의 준용
  "64a77d26-45c4-4998-92bd-c7ea576edbc5", // patent 제93조 준용규정
  "30e1cf8a-0436-4a1a-a131-ab434ef9c8f2", // trademark 제51조 상표전문기관의 등록 등
];

/**
 * inline 배열 안 amendment_note 토큰을 in-place 정정.
 * - text 가 화이트리스트면 type='annotation' 으로
 * - text 가 빈 문자열이고 type='amendment_note' 면 inline 배열에서 제거
 */
function fixInlineArray(arr: Inline[]): { reclassified: number; removed: number } {
  let reclassified = 0;
  let removed = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    const t = arr[i];
    if (t.type !== "amendment_note") continue;
    if (t.text === "") {
      arr.splice(i, 1);
      removed += 1;
      continue;
    }
    if (RECLASSIFY_TO_ANNOTATION.has(t.text)) {
      // amendment_note → annotation. Inline schema 의 annotation 도 {type, text}.
      (t as unknown as { type: string }).type = "annotation";
      reclassified += 1;
    }
  }
  return { reclassified, removed };
}

function walkBlocks(
  blocks: Block[],
  totals: { reclassified: number; removed: number },
): void {
  for (const b of blocks) {
    if (b.kind === "header_refs") {
      const r = fixInlineArray(b.refs);
      totals.reclassified += r.reclassified;
      totals.removed += r.removed;
    } else if (
      b.kind === "clause" ||
      b.kind === "item" ||
      b.kind === "sub" ||
      b.kind === "para"
    ) {
      const r = fixInlineArray(b.inline);
      totals.reclassified += r.reclassified;
      totals.removed += r.removed;
      if (b.kind !== "para") walkBlocks(b.children, totals);
    } else if (b.kind === "sub_article_group") {
      if (b.preface) walkBlocks(b.preface, totals);
      for (const sa of b.articles) walkBlocks(sa.blocks, totals);
    }
    // title_marker — text only
  }
}

async function processArticle(
  articleId: string,
): Promise<{ articleId: string; status: "updated" | "noop" | "error"; detail: string }> {
  const { data: art, error: artErr } = await admin
    .from("articles")
    .select("article_id, law_id, current_revision_id, display_label")
    .eq("article_id", articleId)
    .maybeSingle();
  if (artErr) return { articleId, status: "error", detail: artErr.message };
  if (!art?.current_revision_id) {
    return { articleId, status: "error", detail: "no current_revision_id" };
  }

  const { data: rev, error: revErr } = await admin
    .from("article_revisions")
    .select("body_json")
    .eq("revision_id", art.current_revision_id)
    .maybeSingle();
  if (revErr) return { articleId, status: "error", detail: revErr.message };
  if (!rev?.body_json) {
    return { articleId, status: "error", detail: "no body_json" };
  }

  // 깊은 복사 후 정정.
  const body = JSON.parse(JSON.stringify(rev.body_json)) as ArticleBody;
  const totals = { reclassified: 0, removed: 0 };
  walkBlocks(body.blocks, totals);

  if (totals.reclassified === 0 && totals.removed === 0) {
    return {
      articleId,
      status: "noop",
      detail: `${art.display_label} — no matching tokens`,
    };
  }

  if (dryRun) {
    return {
      articleId,
      status: "updated",
      detail: `${art.display_label} — reclass=${totals.reclassified} removed=${totals.removed} (dry-run)`,
    };
  }

  // saveArticleQuickEdit 패턴 — law_revisions + article_revisions + articles 갱신.
  const today = new Date().toISOString().slice(0, 10);
  const stamp = Date.now();
  const { data: lawRev, error: lawRevErr } = await admin
    .from("law_revisions")
    .insert({
      law_id: art.law_id,
      revision_number: `fix-mislabel-${stamp}`,
      promulgated_at: today,
      effective_date: today,
    })
    .select("law_revision_id")
    .single();
  if (lawRevErr) {
    return { articleId, status: "error", detail: `law_revisions: ${lawRevErr.message}` };
  }

  const { data: artRev, error: artRevErr } = await admin
    .from("article_revisions")
    .insert({
      article_id: art.article_id,
      law_revision_id: lawRev.law_revision_id,
      body_json: body as unknown as Json,
      change_kind: "amended",
      effective_date: today,
    })
    .select("revision_id")
    .single();
  if (artRevErr) {
    return { articleId, status: "error", detail: `article_revisions: ${artRevErr.message}` };
  }

  const { error: updErr } = await admin
    .from("articles")
    .update({ current_revision_id: artRev.revision_id })
    .eq("article_id", art.article_id);
  if (updErr) return { articleId, status: "error", detail: `articles: ${updErr.message}` };

  return {
    articleId,
    status: "updated",
    detail: `${art.display_label} — reclass=${totals.reclassified} removed=${totals.removed} new_rev=${artRev.revision_id}`,
  };
}

async function main() {
  console.log(`[fix-amendment] dry=${dryRun} targets=${AFFECTED_ARTICLE_IDS.length}`);
  let updated = 0;
  let noop = 0;
  let failed = 0;
  for (const id of AFFECTED_ARTICLE_IDS) {
    const r = await processArticle(id);
    console.log(`  [${r.status}] ${r.detail}`);
    if (r.status === "updated") updated += 1;
    else if (r.status === "noop") noop += 1;
    else failed += 1;
  }
  console.log(
    `[fix-amendment] done. updated=${updated} noop=${noop} failed=${failed}`,
  );
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
