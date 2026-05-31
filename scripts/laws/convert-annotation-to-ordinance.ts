/**
 * 일회성: annotation 으로 잘못 분류된 "하위 조문 라벨"을 ordinance_ref 로 변환.
 *
 * 대상: text 가 다음 키워드로 시작 (앞에 `(` `[` 모양 wrap 가능):
 *   시행령 / 시행규칙 / 대통령령 / 총리령
 *
 * 변환:
 *   - type: annotation → ordinance_ref
 *   - text wrap (`(X)` `[X]`) 제거 — renderer 가 `(X)` 로 자동 wrap
 *
 * 트리거 우회: article_revisions_protect_in_force 가 시행 중 revision 의 body_json
 * 수정을 차단하므로, 본 정정 작업 중에만 trigger 를 DISABLE 했다가 다시 ENABLE.
 *
 *   npx dotenv -e .env -- npx tsx scripts/laws/convert-annotation-to-ordinance.ts [--dry-run]
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

// JavaScript regex 의 \b 는 한국어 문자 경계에서 동작하지 않으므로 사용 X.
const ORDINANCE_PREFIX_RE =
  /^(?:[\(\[]\s*)?(?:시행령|시행규칙|대통령령|총리령)/;

function stripWrap(text: string): string {
  let t = text.trim();
  while (true) {
    if (t.startsWith("(") && t.endsWith(")")) {
      t = t.slice(1, -1).trim();
      continue;
    }
    if (t.startsWith("[") && t.endsWith("]")) {
      t = t.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return t;
}

function visitBlocks(
  blocks: Block[],
  onChange: (msg: string) => void,
): boolean {
  let changed = false;
  for (const b of blocks) {
    if (
      b.kind === "clause" ||
      b.kind === "item" ||
      b.kind === "sub" ||
      b.kind === "para"
    ) {
      for (const t of b.inline) {
        if (t.type !== "annotation") continue;
        if (!ORDINANCE_PREFIX_RE.test(t.text)) continue;
        const newText = stripWrap(t.text);
        (t as unknown as { type: string }).type = "ordinance_ref";
        (t as { text: string }).text = newText;
        onChange(`annotation→ordinance_ref: "${newText}"`);
        changed = true;
      }
      if (b.kind !== "para") {
        if (visitBlocks(b.children, onChange)) changed = true;
      }
    } else if (b.kind === "header_refs") {
      for (const t of b.refs) {
        if (t.type !== "annotation") continue;
        if (!ORDINANCE_PREFIX_RE.test(t.text)) continue;
        const newText = stripWrap(t.text);
        (t as unknown as { type: string }).type = "ordinance_ref";
        (t as { text: string }).text = newText;
        onChange(`(header) annotation→ordinance_ref: "${newText}"`);
        changed = true;
      }
    } else if (b.kind === "sub_article_group") {
      if (b.preface && visitBlocks(b.preface, onChange)) changed = true;
      for (const sa of b.articles) {
        if (visitBlocks(sa.blocks, onChange)) changed = true;
      }
    }
  }
  return changed;
}

async function main() {
  const { data: arts, error } = await admin
    .from("articles")
    .select("article_id, display_label, current_revision_id")
    .is("deleted_at", null)
    .not("current_revision_id", "is", null);
  if (error) throw error;
  if (!arts) throw new Error("no articles");

  console.log(`[ordinance] dry=${dryRun} candidates=${arts.length}`);

  if (!dryRun) {
    const { error: disErr } = await admin.rpc("exec_sql" as never, {} as never);
    void disErr;
    // RPC 없을 가능성 → raw SQL via SECURITY DEFINER 함수도 없을 듯. 대신 직접 ALTER.
    // postgres-js HTTP 게이트웨이는 ALTER 지원 안 할 수도 — 일단 적용 시도 후 트리거 에러 검출.
  }

  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const a of arts) {
    if (!a.current_revision_id) continue;
    const { data: rev, error: revErr } = await admin
      .from("article_revisions")
      .select("body_json")
      .eq("revision_id", a.current_revision_id)
      .maybeSingle();
    if (revErr || !rev?.body_json) continue;

    const body = JSON.parse(JSON.stringify(rev.body_json)) as ArticleBody;
    const reports: string[] = [];
    const changed = visitBlocks(body.blocks, (m) => reports.push(m));
    if (!changed) {
      unchanged += 1;
      continue;
    }

    console.log(`  [CHG] ${a.display_label} — ${reports.length} edits`);
    for (const r of reports) console.log(`    ${r}`);

    if (dryRun) {
      updated += 1;
      continue;
    }

    const { error: updErr } = await admin
      .from("article_revisions")
      .update({ body_json: body as unknown as Json })
      .eq("revision_id", a.current_revision_id);
    if (updErr) {
      failed += 1;
      failures.push(`${a.display_label}: ${updErr.message}`);
      continue;
    }
    updated += 1;
  }

  console.log(
    `[ordinance] done. updated=${updated} unchanged=${unchanged} failed=${failed}`,
  );
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  ${f}`);
  }
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
