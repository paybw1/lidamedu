// feat-9-010 후속 — 아카이브 스레드의 단원(node_id) 앵커 백필.
//   일반: article → article_systematic_links 첫 노드 (resolveNodeForTarget 와 동일 의미).
//   특허 제29조(208건): 키워드 분류로 세부 주제 노드(확대된 선출원/진보성/산업상 이용가능성/신규성)
//   에 배정 — 노드 뷰어에서 주제별 구분 열람(원장 지시 2026-07-08). 미분류는 NULL 유지.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const A29 = "79650d86"; // prefix 확인용 — 실제로는 전체 id 조회
// 특허 29조 키워드 → 노드 (우선순위 순)
const TOPIC_RULES = [
  { label: "확대된 선출원", re: /확대된\s*선출원|확선|29조\s*제?\s*[34]항|확대선출원/ },
  { label: "진보성", re: /진보성/ },
  { label: "산업상 이용가능성", re: /산업상|이용\s*가능성|의료행위|의료업/ },
  { label: "신규성", re: /신규성|공지|공연\s*실시|반포|간행물|불특정/ },
];

// 대상: 아카이브 article 스레드 전량
const threads = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("qna_threads")
    .select("thread_id, target_id, title, question_md, node_id")
    .eq("archive_source", "cafe-archive")
    .eq("target_type", "article")
    .is("deleted_at", null)
    .range(from, from + 999);
  if (error) throw error;
  threads.push(...data);
  if (data.length < 1000) break;
}
console.log("아카이브 article 스레드:", threads.length);

// 조문→노드 링크 일괄
const articleIds = [...new Set(threads.map((t) => t.target_id))];
const linkByArticle = new Map();
for (let i = 0; i < articleIds.length; i += 150) {
  const slice = articleIds.slice(i, i + 150);
  const { data, error } = await sb
    .from("article_systematic_links")
    .select("article_id, node_id")
    .in("article_id", slice);
  if (error) throw error;
  for (const r of data) {
    if (!linkByArticle.has(r.article_id)) linkByArticle.set(r.article_id, []);
    linkByArticle.get(r.article_id).push(r.node_id);
  }
}
// 노드 라벨
const allNodeIds = [...new Set([...linkByArticle.values()].flat())];
const nodeLabel = new Map();
for (let i = 0; i < allNodeIds.length; i += 150) {
  const { data } = await sb
    .from("systematic_nodes")
    .select("node_id, display_label")
    .in("node_id", allNodeIds.slice(i, i + 150));
  for (const n of data ?? []) nodeLabel.set(n.node_id, n.display_label);
}

let single = 0, multiClassified = 0, multiUnmatched = 0, noLink = 0;
const updates = [];
const dist = {};
for (const t of threads) {
  const nodes = linkByArticle.get(t.target_id) ?? [];
  if (nodes.length === 0) { noLink++; continue; }
  let target = null;
  if (nodes.length === 1) {
    target = nodes[0];
    single++;
  } else {
    // 다중 링크(29조 등) — 키워드 분류. 제목 우선, 본문 앞 400자 보조.
    const hay = `${t.title}\n${t.question_md.slice(0, 400)}`;
    for (const rule of TOPIC_RULES) {
      if (!rule.re.test(hay)) continue;
      const hit = nodes.find((n) => (nodeLabel.get(n) ?? "").includes(rule.label));
      if (hit) { target = hit; break; }
    }
    if (target) multiClassified++;
    else { multiUnmatched++; continue; } // 미분류 → NULL 유지(조문 패널만)
  }
  if (t.node_id === target) continue;
  updates.push({ thread_id: t.thread_id, node_id: target });
  const l = nodeLabel.get(target) ?? target;
  dist[l] = (dist[l] || 0) + 1;
}
console.log(`단일 링크 ${single} / 다중 분류 성공 ${multiClassified} / 다중 미분류 ${multiUnmatched} / 링크 없음 ${noLink}`);
console.log("갱신 대상:", updates.length);
const top = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 12);
top.forEach(([k, n]) => console.log("  ", n + "×", k));

if (!APPLY) { console.log("\n--apply 로 실행"); process.exit(0); }
let n = 0;
for (const u of updates) {
  const { error } = await sb.from("qna_threads").update({ node_id: u.node_id }).eq("thread_id", u.thread_id);
  if (error) throw error;
  if (++n % 500 === 0) console.log(`  ${n}/${updates.length}`);
}
console.log("완료:", n);
