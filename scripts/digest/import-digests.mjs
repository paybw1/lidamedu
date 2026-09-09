// 정리비교표 재작화 산출물 → systematic_digests 적재.
//
//   node scripts/digest/import-digests.mjs            # dry-run(무엇이 바뀌는지만)
//   node scripts/digest/import-digests.mjs --apply
//
// ★(law_code, page) 로 upsert 한다 — 같은 쪽을 다시 올리면 덮어쓴다.
// ★노출은 RLS 가 정한다(현재 staff 전용). 이 스크립트는 노출을 건드리지 않는다.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";

import { convert } from "./convert.mjs";

// 교재 쪽 → 체계도 대분류. 한 단원에 여러 쪽이 붙으면 ord 순서로 세로로 쌓인다.
//   ★`node` 대신 `outline`(목차 이름)을 적으면 **노드에 붙지 않는 독립 항목**이 되어
//     정리 화면 목차 맨 앞에 자기 이름으로 선다. 2p 는 어느 한 단원의 자료가 아니라
//     과목 전체 지도라 이쪽이다(원장 지시 2026-09-09).
//     체계도 노드를 새로 만들지 않는 이유 — 노드는 조문·판례·주관식이 함께 쓴다.
const PAGES = [
  { page: 2, outline: "체계도", ord: 0 },
  { page: 3, node: "01 총칙/보칙", ord: 0 },
  { page: 4, node: "02 특허요건", ord: 0 },
  { page: 5, node: "03 이익제도", ord: 0 },
  { page: 6, node: "04 심사", ord: 0 },
  { page: 7, node: "05 특허권", ord: 0 },
  { page: 8, node: "06 심판", ord: 0 },
  { page: 9, node: "06 심판", ord: 1 },
  { page: 10, node: "07 소송", ord: 0 },
  { page: 11, node: "08 특허협력조약에 의한 국제출원", ord: 0 },
  { page: 12, node: "09 실용신안법", ord: 0 },
  { page: 13, node: "10 국제조약", ord: 0 },
];

const LAW_CODE = "patent";
const apply = process.argv.includes("--apply");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 (.env)");
  process.exit(1);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

const { data: nodes, error: nodeErr } = await supa
  .from("systematic_nodes")
  .select("node_id, display_label")
  .eq("law_code", LAW_CODE)
  .is("parent_id", null);
if (nodeErr) throw nodeErr;

const byLabel = new Map(nodes.map((n) => [n.display_label, n.node_id]));

const rows = [];
for (const p of PAGES) {
  const nodeId = p.node ? byLabel.get(p.node) : null;
  if (p.node && !nodeId) throw new Error(`체계도 대분류를 찾지 못했습니다: ${p.node}`);
  const html = readFileSync(`scripts/digest/pages/digest-${p.page}p.html`, "utf8");
  const { title, bodyHtml, css } = convert(html, p.page);
  rows.push({
    law_code: LAW_CODE,
    node_id: nodeId ?? null,
    outline_label: p.outline ?? null,
    page: p.page,
    title,
    body_html: bodyHtml,
    css,
    ord: p.ord,
  });
  console.log(
    `${String(p.page).padStart(2)}p ${title.padEnd(18)} → ${(p.node ?? `「${p.outline}」(독립 항목)`).padEnd(22)} (ord ${p.ord}) · 본문 ${bodyHtml.length}자 CSS ${css.length}자`,
  );
}

const { data: before } = await supa
  .from("systematic_digests")
  .select("page")
  .eq("law_code", LAW_CODE);
console.log(`\n적재 대상 ${rows.length}쪽 · 현재 등록 ${before?.length ?? 0}쪽`);

if (!apply) {
  console.log("dry-run 입니다. 반영하려면 --apply 를 붙이세요.");
  process.exit(0);
}

const { error } = await supa
  .from("systematic_digests")
  .upsert(rows, { onConflict: "law_code,page" });
if (error) throw error;

const { data: after } = await supa
  .from("systematic_digests")
  .select("page, title, ord")
  .eq("law_code", LAW_CODE)
  .order("page");
console.log(`반영 완료 — 등록 ${after?.length ?? 0}쪽`);
for (const r of after ?? []) console.log(`  ${String(r.page).padStart(2)}p ${r.title}`);
