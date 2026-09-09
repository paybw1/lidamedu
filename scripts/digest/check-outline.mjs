// 정리 화면 좌패널 목차가 어떻게 서는지 — 화면과 같은 순서로 찍어 본다.
//   node scripts/digest/check-outline.mjs
//
// 독립 항목(node_id is null)이 먼저, 그다음 체계도 대분류. 번호는 이 자리로 매겨진다.
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const LAW_CODE = "patent";
const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: digests } = await supa
  .from("systematic_digests")
  .select("node_id, outline_label, page, title, ord")
  .eq("law_code", LAW_CODE)
  .order("ord")
  .order("page");

const { data: nodes } = await supa
  .from("systematic_nodes")
  .select("node_id, display_label, ord, case_only")
  .eq("law_code", LAW_CODE)
  .is("parent_id", null)
  .order("ord");

const items = [
  ...digests
    .filter((d) => d.node_id === null)
    .map((d) => ({ label: d.outline_label ?? d.title, pages: [d.page] })),
  ...nodes
    .filter((n) => !n.case_only)
    .map((n) => ({
      label: n.display_label.replace(/^\d+\s*/, ""),
      pages: digests.filter((d) => d.node_id === n.node_id).map((d) => d.page),
    })),
];

for (const [i, it] of items.entries()) {
  const no = String(i + 1).padStart(2, "0");
  const pages = it.pages.length ? it.pages.map((p) => `${p}p`).join(" · ") : "—";
  console.log(`  ${no} ${it.label.padEnd(24)} ${pages}`);
}
const covered = items.reduce((n, it) => n + it.pages.length, 0);
console.log(`\n항목 ${items.length}개 · 자료 ${covered}쪽`);
