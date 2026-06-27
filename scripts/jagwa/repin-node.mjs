// 소스 노드에 (조문 파생으로) 잘못 노출된 문제 중 키워드 매칭분을 대상 노드로 primary_node_id 고정.
// problem_id 기준(안정). usage:
//   node scripts/jagwa/repin-node.mjs --node <src> --to <dst> --match 공유[,키워드] [--article 99의2] [--apply]
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!process.env.SUPABASE_URL.includes("mcgdoplo")) throw new Error("SAFETY: not prod");

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const srcNode = arg("--node");
const dstNode = arg("--to");
const keywords = (arg("--match") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const articleFilter = arg("--article");
const exclude = (arg("--exclude") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const apply = process.argv.includes("--apply");
if (!srcNode || !dstNode || keywords.length === 0)
  throw new Error("need --node <src> --to <dst> --match <kw[,kw]>");

const snip = (s) => (s ?? "").replace(/\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

const { data: src } = await sb.from("systematic_nodes").select("path, law_code, display_label").eq("node_id", srcNode).single();
const { data: dst } = await sb.from("systematic_nodes").select("display_label").eq("node_id", dstNode).single();
const { data: all } = await sb.from("systematic_nodes").select("node_id, path").eq("law_code", src.law_code);
const subIds = all.filter((n) => n.path === src.path || n.path.startsWith(src.path + ".")).map((n) => n.node_id);
const { data: links } = await sb.from("article_systematic_links").select("article_id, articles(article_number)").in("node_id", subIds);
let artIds = [...new Set(links.map((l) => l.article_id))];
if (articleFilter) {
  artIds = [...new Set(links.filter((l) => l.articles?.article_number === articleFilter).map((l) => l.article_id))];
}

const { data: derived } = await sb
  .from("problems")
  .select("problem_id, problem_number, body_md, articles!primary_article_id(article_number)")
  .in("primary_article_id", artIds)
  .is("primary_node_id", null)
  .is("deleted_at", null);

const matched = (derived ?? [])
  .filter((p) => keywords.some((kw) => (p.body_md ?? "").includes(kw)))
  .filter((p) => !exclude.some((e) => p.problem_id.startsWith(e)));
console.log(`소스 "${src.display_label}" → 대상 "${dst.display_label}"`);
console.log(`조문필터 ${articleFilter ?? "(전체)"} · 키워드 ${JSON.stringify(keywords)} · 매칭 ${matched.length}건\n`);
for (const p of matched.sort((a, b) => (a.problem_number ?? 0) - (b.problem_number ?? 0))) {
  console.log(`  no.${p.problem_number ?? "?"} [${p.articles?.article_number ?? "?"}] ${p.problem_id} — ${snip(p.body_md)}`);
}

if (apply) {
  let ok = 0, fail = 0;
  for (const p of matched) {
    const { error } = await sb
      .from("problems")
      .update({ primary_node_id: dstNode, updated_at: new Date().toISOString() })
      .eq("problem_id", p.problem_id)
      .is("primary_node_id", null);
    if (error) { console.log("ERR", p.problem_id, error.message); fail++; } else ok++;
  }
  console.log(`\n적용: ${ok} 고정 / 실패 ${fail}`);
} else {
  console.log("\n적용하려면 --apply 추가");
}
