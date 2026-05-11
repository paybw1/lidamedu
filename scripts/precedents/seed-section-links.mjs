// precedents.json 의 책 sectionPath ("제N절 신규성" 등) → patent systematic_node.display_label
// 매칭 → 그 노드의 articles 와 article_case_links 추가.
//
// false positive 줄이려고 display_label 정확 매칭(normalize 후) 만 인정.
// 동일 라벨 node 여럿이면 모두 link (시야 더 넓힘).

import { readFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// "제2절  신규성" → "신규성", "제2절 심판의 당사자" → "심판의당사자"
// 또한 "재 심" → "재심" 같이 단어 내 공백 제거.
function normalizeSectionLabel(raw) {
  let s = raw.trim();
  s = s.replace(/^제\d+(?:절|장|편)\s*/u, "");
  s = s.replace(/\s+/g, "");
  return s;
}

async function main() {
  const data = JSON.parse(
    readFileSync("source/_converted/precedents.json", "utf-8"),
  );
  console.log(`precedents: ${data.length}`);

  // (1) patent systematic_nodes + articles 매핑 빌드.
  const { data: nodeRows } = await supabase
    .from("systematic_nodes")
    .select("node_id, display_label")
    .eq("law_code", "patent");
  const nodesByLabel = new Map(); // normalizedLabel → node_id[]
  for (const n of nodeRows ?? []) {
    const k = normalizeSectionLabel(n.display_label);
    const arr = nodesByLabel.get(k) ?? [];
    arr.push(n.node_id);
    nodesByLabel.set(k, arr);
  }
  console.log(`patent systematic_nodes: ${nodeRows?.length ?? 0}`);
  console.log(`distinct normalized labels: ${nodesByLabel.size}`);

  // (2) 각 node 의 article_id 리스트 한 번에 fetch.
  const allNodeIds = [...nodesByLabel.values()].flat();
  const articlesByNode = new Map();
  if (allNodeIds.length > 0) {
    const PAGE = 500;
    for (let f = 0; f < allNodeIds.length; f += PAGE) {
      const slice = allNodeIds.slice(f, f + PAGE);
      const { data: linkRows } = await supabase
        .from("article_systematic_links")
        .select("node_id, article_id")
        .in("node_id", slice);
      for (const r of linkRows ?? []) {
        const arr = articlesByNode.get(r.node_id) ?? [];
        arr.push(r.article_id);
        articlesByNode.set(r.node_id, arr);
      }
    }
  }

  // (3) cases case_number → case_id (특허법).
  const { data: caseRows } = await supabase
    .from("cases")
    .select("case_id, case_number")
    .contains("subject_laws", ["patent"])
    .is("deleted_at", null);
  const caseByNumber = new Map();
  for (const r of caseRows ?? []) caseByNumber.set(r.case_number, r.case_id);

  // (4) 기존 article_case_links 셋 — 중복 방지.
  const existing = new Set();
  {
    let f = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from("article_case_links")
        .select("article_id, case_id, relation_type")
        .eq("relation_type", "directly_interprets")
        .range(f, f + PAGE - 1);
      if (error) {
        console.error("existing 조회:", error.message);
        break;
      }
      if (!data || data.length === 0) break;
      for (const r of data) existing.add(`${r.case_id}:${r.article_id}`);
      if (data.length < PAGE) break;
      f += PAGE;
    }
  }
  console.log(`existing directly_interprets links: ${existing.size}`);

  // (5) 매칭.
  const inserts = [];
  let casesWithSection = 0;
  let casesMatched = 0;
  for (const p of data) {
    if (!p.section) continue;
    casesWithSection++;
    const cid = caseByNumber.get(p.caseNumber);
    if (!cid) continue;
    const key = normalizeSectionLabel(p.section);
    const nodeIds = nodesByLabel.get(key);
    if (!nodeIds) continue;
    const articleIds = new Set();
    for (const nid of nodeIds) {
      for (const aid of articlesByNode.get(nid) ?? []) articleIds.add(aid);
    }
    if (articleIds.size === 0) continue;
    let m = 0;
    for (const aid of articleIds) {
      const k2 = `${cid}:${aid}`;
      if (existing.has(k2)) continue;
      inserts.push({
        article_id: aid,
        case_id: cid,
        relation_type: "directly_interprets",
        note: `자동 추출 — 책 절 라벨 매칭(${p.section})`,
      });
      existing.add(k2);
      m++;
    }
    if (m > 0) casesMatched++;
  }
  console.log(
    `cases with section: ${casesWithSection}, matched (link 새로 추가): ${casesMatched}, inserts: ${inserts.length}`,
  );

  // (6) batch insert.
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const slice = inserts.slice(i, i + BATCH);
    const { error } = await supabase
      .from("article_case_links")
      .insert(slice);
    if (error) {
      console.error(`batch 실패: ${error.message}`);
      for (const row of slice) {
        const { error: e } = await supabase
          .from("article_case_links")
          .insert(row);
        if (!e) inserted++;
      }
    } else {
      inserted += slice.length;
    }
  }
  console.log(`\n=== 완료 === inserted: ${inserted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
