// 도해특허법 추록 시트 PDF 재생성.
// ★쪽번호 정정(2026-09-13, PDF 물리 쪽 → 교재 인쇄 쪽) 후 시트를 다시 찍기 위한 것.
//   평소에는 /admin 의 추록 시트 화면에서 재렌더한다 — 여기는 일괄용.
import "dotenv/config";

import adminClient from "~/core/lib/supa-admin-client.server";
import { regenerateErrataSheet } from "~/features/errata/pdf/regenerate.server";

const TITLE = process.argv[2] ?? "도해특허법";

const { data: pub, error: pe } = await adminClient
  .from("publications")
  .select("publication_id, title")
  .eq("title", TITLE)
  .maybeSingle();
if (pe) throw pe;
if (!pub) throw new Error(`교재 없음: ${TITLE}`);

const { data: eds, error: ee } = await adminClient
  .from("publication_editions")
  .select("edition_id, edition_label, errata_sheet_item_count, errata_sheet_url")
  .eq("publication_id", pub.publication_id);
if (ee) throw ee;

for (const e of eds ?? []) {
  console.log(`${pub.title} ${e.edition_label} — 재생성 시작 (기존 ${e.errata_sheet_item_count ?? 0}항목)`);
  const r = await regenerateErrataSheet(e.edition_id);
  console.log(r.ok ? `  완료 · 항목 ${r.itemCount}` : `  ★실패: ${r.error}`);
}
