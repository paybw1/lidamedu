// 민법 판례 → 체계도 노드 배치안 (원장 지시 2026-08-20 — 먼저 목록으로 검토).
//
// 근거 경로: 판례 → 그 판례를 인용한 문항 → 문항의 조문(primary_article_id)
//            → article_systematic_links → 체계도 노드
// ★"판례 자체의 법리 조문"이 아니라 "그 판례를 인용한 문제가 걸린 조문"이다.
//   대체로 일치하지만 여러 쟁점을 묶은 문제에서는 어긋날 수 있어, 확정도를 함께 낸다:
//     single   — 인용 문항이 모두 같은 노드
//     majority — 노드가 갈리지만 최다 득표가 단독
//     tie      — 동수(자동 배치 대상 아님. 사람이 정한다)
//
//   node scripts/precedents/plan-civil-case-placement.mjs            # 배치안 산출(JSON)
//   node scripts/precedents/plan-civil-case-placement.mjs --apply    # cases.primary_node_id 반영
//   node scripts/precedents/plan-civil-case-placement.mjs --apply --only single
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const argOf = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const APPLY = argv.includes("--apply");
const ONLY = argOf("--only"); // single | majority (미지정이면 둘 다)
const OUT = path.resolve(process.cwd(), "tmp/civil-placement-plan.json");
const CIVIL_LAW_ID = "74dc73af-f25d-40ff-aead-fb039471982c";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/** PostgREST 기본 상한이 1000행 — 페이지로 끝까지 읽는다(잘린 줄 모르고 집계하면 틀린다). */
async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  // ── 노드 트리(전체 경로 라벨용)
  const nodes = await pageAll(() =>
    sb
      .from("systematic_nodes")
      .select("node_id, parent_id, display_label, ord")
      .eq("law_code", "civil")
      .order("node_id"),
  );
  const nodeById = new Map(nodes.map((n) => [n.node_id, n]));
  const fullLabel = (id) => {
    const parts = [];
    let cur = nodeById.get(id);
    let guard = 0;
    while (cur && guard++ < 10) {
      parts.unshift(cur.display_label);
      cur = cur.parent_id ? nodeById.get(cur.parent_id) : null;
    }
    return parts.join(" > ");
  };

  // ── 민법 문항 + 조문 + 노드
  const probs = await pageAll(() =>
    sb
      .from("problems")
      .select("problem_id, display_no, primary_article_id")
      .eq("law_id", CIVIL_LAW_ID)
      .is("deleted_at", null)
      .order("problem_id"),
  );
  const probById = new Map(probs.map((p) => [p.problem_id, p]));
  const artIds = [...new Set(probs.map((p) => p.primary_article_id).filter(Boolean))];
  const nodeOfArticle = new Map();
  for (let i = 0; i < artIds.length; i += 150) {
    const { data, error } = await sb
      .from("article_systematic_links")
      .select("article_id, node_id")
      .in("article_id", artIds.slice(i, i + 150));
    if (error) throw new Error(error.message);
    for (const l of data ?? []) {
      if (!nodeOfArticle.has(l.article_id)) nodeOfArticle.set(l.article_id, l.node_id);
    }
  }

  // ── 판례 ← 링크 ← 문항 (링크는 이미 걸려 있다)
  const cases = await pageAll(() =>
    sb
      .from("cases")
      .select("case_id, case_number, case_title, decided_at, importance, primary_node_id")
      .contains("subject_laws", ["civil"])
      .is("deleted_at", null)
      .order("case_id"),
  );
  const caseById = new Map(cases.map((c) => [c.case_id, c]));
  const links = await pageAll(() =>
    sb
      .from("problem_case_links")
      .select("problem_id, case_id")
      .eq("note", "civil-exam-scan")
      .order("link_id"),
  );
  const citedBy = new Map();
  for (const l of links) {
    if (!caseById.has(l.case_id)) continue;
    if (!citedBy.has(l.case_id)) citedBy.set(l.case_id, []);
    citedBy.get(l.case_id).push(l.problem_id);
  }

  const plan = [];
  const counts = { single: 0, majority: 0, tie: 0, no_article: 0, no_link: 0 };
  for (const c of cases) {
    const pids = citedBy.get(c.case_id) ?? [];
    if (!pids.length) {
      counts.no_link += 1;
      continue;
    }
    const votes = new Map();
    for (const pid of pids) {
      const art = probById.get(pid)?.primary_article_id;
      const node = art ? nodeOfArticle.get(art) : null;
      if (!node) continue;
      votes.set(node, (votes.get(node) ?? 0) + 1);
    }
    if (votes.size === 0) {
      counts.no_article += 1;
      continue;
    }
    const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    const decided =
      sorted.length === 1
        ? "single"
        : sorted[0][1] > sorted[1][1]
          ? "majority"
          : "tie";
    counts[decided] += 1;
    plan.push({
      caseId: c.case_id,
      caseNumber: c.case_number,
      caseTitle: c.case_title,
      decidedAt: c.decided_at,
      importance: c.importance,
      decided,
      nodeId: sorted[0][0],
      nodeLabel: fullLabel(sorted[0][0]),
      votes: sorted[0][1],
      totalVotes: [...votes.values()].reduce((s, v) => s + v, 0),
      // 동수·다수결 검토용 — 경쟁 노드도 싣는다.
      alternatives: sorted.slice(1, 4).map(([id, v]) => ({ label: fullLabel(id), votes: v })),
      problems: pids
        .map((pid) => probById.get(pid)?.display_no)
        .filter(Boolean)
        .sort((a, b) => a - b),
    });
  }

  fs.writeFileSync(OUT, JSON.stringify({ counts, plan }, null, 2), "utf8");
  console.log(
    `민법 판례 ${cases.length}건 — 단일 ${counts.single} · 다수결 ${counts.majority} · 동수 ${counts.tie} · 조문없음 ${counts.no_article} · 인용문항없음 ${counts.no_link}`,
  );
  const byNode = {};
  for (const p of plan) byNode[p.nodeLabel] = (byNode[p.nodeLabel] ?? 0) + 1;
  console.log(`노드 ${Object.keys(byNode).length}개에 분포 · 배치안: ${OUT}`);

  if (!APPLY) {
    console.log("\n--apply 를 붙이면 cases.primary_node_id 에 반영합니다.");
    return;
  }
  const targets = plan.filter(
    (p) => p.decided !== "tie" && (!ONLY || p.decided === ONLY),
  );
  console.log(`반영 대상 ${targets.length}건`);
  let done = 0;
  for (const t of targets) {
    const { error } = await sb
      .from("cases")
      .update({ primary_node_id: t.nodeId })
      .eq("case_id", t.caseId);
    if (error) throw new Error(`${t.caseNumber}: ${error.message}`);
    done += 1;
    if (done % 100 === 0) console.log(`  ${done}/${targets.length}`);
  }
  console.log(`\n배치 완료 ${done}건.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
