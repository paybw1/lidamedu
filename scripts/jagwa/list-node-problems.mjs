// 주어진 systematic 노드에 (조문 파생으로) 노출되는 미고정 문제 목록 + 고정 문제 목록.
// 노드 오배치 진단용(읽기 전용). usage: node scripts/jagwa/list-node-problems.mjs <nodeId> [...]
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const snip = (s) => (s ?? "").replace(/\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 110);

for (const nodeId of process.argv.slice(2)) {
  const { data: node } = await sb
    .from("systematic_nodes")
    .select("node_id, display_label, path, law_code")
    .eq("node_id", nodeId)
    .single();
  if (!node) { console.log(`\n[${nodeId}] 노드 없음`); continue; }

  // subtree = path 접두 일치 (ltree 를 문자열로 비교)
  const { data: all } = await sb
    .from("systematic_nodes")
    .select("node_id, path")
    .eq("law_code", node.law_code);
  const sub = all.filter((n) => n.path === node.path || n.path.startsWith(node.path + "."));
  const subIds = sub.map((n) => n.node_id);

  const { data: links } = await sb
    .from("article_systematic_links")
    .select("article_id, articles(article_number)")
    .in("node_id", subIds);
  const artIds = [...new Set(links.map((l) => l.article_id))];
  const artNums = [...new Set(links.map((l) => l.articles?.article_number).filter(Boolean))];

  const { data: pinned } = await sb
    .from("problems")
    .select("problem_id, problem_number")
    .in("primary_node_id", subIds)
    .is("deleted_at", null);

  const { data: derived } = artIds.length
    ? await sb
        .from("problems")
        .select("problem_id, problem_number, body_md, articles!primary_article_id(article_number)")
        .in("primary_article_id", artIds)
        .is("primary_node_id", null)
        .is("deleted_at", null)
    : { data: [] };

  console.log(`\n===== ${node.display_label} [${node.path}] (${nodeId}) =====`);
  console.log(`연결 조문: ${artNums.join(", ") || "(없음)"}`);
  console.log(`고정(primary_node_id) 문제: ${pinned?.length ?? 0}`);
  console.log(`조문 파생 문제: ${derived?.length ?? 0}`);
  for (const p of (derived ?? []).sort((a, b) => (a.problem_number ?? 0) - (b.problem_number ?? 0))) {
    console.log(`  no.${p.problem_number ?? "?"} [${p.articles?.article_number ?? "?"}] ${p.problem_id.slice(0, 8)} — ${snip(p.body_md)}`);
  }
}
