// 적재 오류로 발행됐던 추록을 시트에서 내린다(철회 고지 없이).
//   추록·정오표는 '실제 책이 바뀐 경우'에만 발행한다 — P-5966 건은 교재 해설편에 원래
//   있던 후속 문단(ⅰ~ⅲ)을 파서가 버린 것이라 책은 바뀐 적이 없다.
//   원장(content_revisions) 기록은 지우지 않고 notice_status 만 none 으로 되돌린다.
//   node scripts/mcq-audit/unpublish-import-errata.mjs [--apply]
import { writeFileSync } from "node:fs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const REVISION_ID = "8dfc76f5-688d-4284-bc47-569354938909"; // P-5966 · 출원공개제도 3번 지문 ④
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rev, error } = await supa
  .from("content_revisions")
  .select("revision_id, content_type, content_id, errata_kind, errata_title, notice_status, published_at")
  .eq("revision_id", REVISION_ID)
  .single();
if (error) throw error;

// 이 revision 이 실려 있던 교재(edition) 찾기
const { data: maps } = await supa
  .from("publication_content_map")
  .select("edition_id, content_type, content_id")
  .eq("content_id", rev.content_id);
const editionIds = [...new Set((maps ?? []).filter((m) => m.content_type === rev.content_type).map((m) => m.edition_id))];

const { data: editions } = await supa
  .from("publication_editions")
  .select("edition_id, edition_label, errata_sheet_url, errata_sheet_updated_at, errata_sheet_item_count, publications(title)")
  .in("edition_id", editionIds);

// 같은 교재에 남는 다른 발행분이 있는지 — 있으면 시트를 비우면 안 된다.
const remaining = new Map();
for (const ed of editions ?? []) {
  const { count } = await supa
    .from("v_errata_sheet")
    .select("revision_id", { count: "exact", head: true })
    .eq("edition_id", ed.edition_id)
    .eq("notice_status", "published")
    .neq("revision_id", REVISION_ID);
  remaining.set(ed.edition_id, count ?? 0);
}

writeFileSync(
  "scripts/mcq-audit/backups/backup-unpublish-errata.json",
  JSON.stringify({ revision: rev, editions }, null, 1),
  "utf8",
);
console.log(`대상: ${rev.errata_title} (${rev.errata_kind}, ${rev.notice_status})`);
for (const ed of editions ?? []) {
  console.log(
    `교재: ${ed.publications?.title} ${ed.edition_label} · 현재 ${ed.errata_sheet_item_count}건 · 내린 뒤 남는 발행분 ${remaining.get(ed.edition_id)}건`,
  );
}
console.log("백업: scripts/mcq-audit/backups/backup-unpublish-errata.json");

if (!APPLY) {
  console.log("\ndry-run — 반영하려면 --apply");
  process.exit(0);
}

const { error: e1 } = await supa
  .from("content_revisions")
  .update({ notice_status: "none", published_at: null })
  .eq("revision_id", REVISION_ID);
if (e1) throw e1;
console.log("✓ 원장 notice_status → none (기록 자체는 보존)");

for (const ed of editions ?? []) {
  if ((remaining.get(ed.edition_id) ?? 0) > 0) {
    console.log(`· ${ed.edition_label}: 남은 발행분이 있어 시트 재생성 필요 — 어드민에서 재렌더할 것`);
    continue;
  }
  // 남는 항목이 없다 → 시트 자체를 내린다(목록에서 'PDF 받기' 가 사라진다).
  const { error: e2 } = await supa
    .from("publication_editions")
    .update({ errata_sheet_url: null, errata_sheet_updated_at: null, errata_sheet_item_count: 0 })
    .eq("edition_id", ed.edition_id);
  if (e2) throw e2;
  const { error: e3 } = await supa.storage.from("errata").remove([`${ed.edition_id}.pdf`]);
  if (e3) console.warn(`  (Storage 삭제 실패: ${e3.message})`);
  console.log(`✓ ${ed.edition_label}: 시트 내림 + Storage PDF 제거`);
}
