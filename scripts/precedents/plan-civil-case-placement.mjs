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
//
// ★출제범위: 변리사 민법은 제4편 친족·제5편 상속이 시험 범위가 아니다(원장 2026-08-20).
//   그 두 편에 속한 노드는 득표 계산에서 아예 뺀다.
// ★동수는 중복 배치한다 — primary_node_id 는 단일 배치라 쓸 수 없으므로
//   article_case_links(조문↔판례 다대다)로 건다. 배치 로직은 primary_* 가 비어 있으면
//   ACL 이 가리키는 노드 전부에 판례를 올린다(getCasePlacementMaps 의 legacy 분기).
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
// 시험 범위 밖 — 루트 노드 라벨 접두사로 판별한다.
const OUT_OF_SCOPE_ROOTS = ["제4편", "제5편"];
const ACL_NOTE = "civil-exam-scan";

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
  /** 시험 범위 판정 — 루트(편)까지 올라가 제4편·제5편이면 제외. */
  const inScope = (id) => {
    let cur = nodeById.get(id);
    let guard = 0;
    while (cur?.parent_id && guard++ < 10) cur = nodeById.get(cur.parent_id);
    const root = cur?.display_label ?? "";
    return !OUT_OF_SCOPE_ROOTS.some((p) => root.startsWith(p));
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
  const counts = {
    single: 0,
    majority: 0,
    tie: 0,
    no_article: 0,
    no_link: 0,
    out_of_scope: 0,
  };
  for (const c of cases) {
    const pids = citedBy.get(c.case_id) ?? [];
    if (!pids.length) {
      counts.no_link += 1;
      continue;
    }
    const votes = new Map(); // node → { n, articles:Set }
    let dropped = 0;
    for (const pid of pids) {
      const art = probById.get(pid)?.primary_article_id;
      const node = art ? nodeOfArticle.get(art) : null;
      if (!node) continue;
      // ★제4편 친족·제5편 상속은 변리사 시험 범위가 아니다 — 득표에서 뺀다.
      if (!inScope(node)) {
        dropped += 1;
        continue;
      }
      const cur = votes.get(node) ?? { n: 0, articles: new Set() };
      cur.n += 1;
      cur.articles.add(art);
      votes.set(node, cur);
    }
    if (votes.size === 0) {
      if (dropped > 0) counts.out_of_scope += 1;
      else counts.no_article += 1;
      continue;
    }
    const sorted = [...votes.entries()].sort((a, b) => b[1].n - a[1].n);
    const top = sorted[0][1].n;
    const decided =
      sorted.length === 1
        ? "single"
        : top > sorted[1][1].n
          ? "majority"
          : "tie";
    counts[decided] += 1;
    // 동수는 동점 노드 전부에 중복 배치한다(원장 지시) — ACL 로 건다.
    const tied = sorted.filter(([, v]) => v.n === top);
    plan.push({
      caseId: c.case_id,
      caseNumber: c.case_number,
      caseTitle: c.case_title,
      decidedAt: c.decided_at,
      importance: c.importance,
      decided,
      nodeId: sorted[0][0],
      nodeLabel: fullLabel(sorted[0][0]),
      votes: top,
      totalVotes: [...votes.values()].reduce((s, v) => s + v.n, 0),
      outOfScopeDropped: dropped,
      // 동수일 때 실제로 걸 대상 — 노드 라벨과 그 노드를 가리킨 조문 id.
      tiedNodes:
        decided === "tie"
          ? tied.map(([id, v]) => ({
              nodeId: id,
              label: fullLabel(id),
              articleIds: [...v.articles],
            }))
          : [],
      // 다수결 검토용 — 경쟁 노드도 싣는다.
      alternatives: sorted
        .slice(1, 4)
        .map(([id, v]) => ({ label: fullLabel(id), votes: v.n })),
      problems: pids
        .map((pid) => probById.get(pid)?.display_no)
        .filter(Boolean)
        .sort((a, b) => a - b),
    });
  }

  fs.writeFileSync(OUT, JSON.stringify({ counts, plan }, null, 2), "utf8");
  console.log(
    `민법 판례 ${cases.length}건 — 단일 ${counts.single} · 다수결 ${counts.majority} · 동수(중복배치) ${counts.tie}` +
      ` · 범위밖만(4·5편) ${counts.out_of_scope} · 조문없음 ${counts.no_article} · 인용문항없음 ${counts.no_link}`,
  );
  const byNode = {};
  for (const p of plan) byNode[p.nodeLabel] = (byNode[p.nodeLabel] ?? 0) + 1;
  console.log(`노드 ${Object.keys(byNode).length}개에 분포 · 배치안: ${OUT}`);

  if (!APPLY) {
    console.log("\n--apply 를 붙이면 cases.primary_node_id 에 반영합니다.");
    return;
  }
  // ① 단일·다수결 → primary_node_id(단일 배치)
  const single = plan.filter(
    (p) => p.decided !== "tie" && (!ONLY || p.decided === ONLY),
  );
  console.log(`단일 배치 ${single.length}건`);
  let done = 0;
  for (const t of single) {
    const { error } = await sb
      .from("cases")
      .update({ primary_node_id: t.nodeId })
      .eq("case_id", t.caseId);
    if (error) throw new Error(`${t.caseNumber}: ${error.message}`);
    done += 1;
    if (done % 200 === 0) console.log(`  ${done}/${single.length}`);
  }

  // ② 동수 → 중복 배치. primary_* 를 비워 두면 배치 로직이 ACL 의 조문들이 가리키는
  //    노드 전부에 판례를 올린다(getCasePlacementMaps). ACL 은 멱등하게 넣는다.
  const ties = ONLY ? [] : plan.filter((p) => p.decided === "tie");
  const aclRows = [];
  for (const t of ties) {
    for (const n of t.tiedNodes) {
      for (const articleId of n.articleIds) {
        aclRows.push({
          article_id: articleId,
          case_id: t.caseId,
          // 기존 값과 맞춘다 — article_case_links 는 cites / directly_interprets 를 쓴다.
          relation_type: "cites",
          note: ACL_NOTE,
        });
      }
    }
  }
  let aclInserted = 0;
  if (aclRows.length) {
    const caseIds = [...new Set(ties.map((t) => t.caseId))];
    const have = new Set();
    for (let i = 0; i < caseIds.length; i += 100) {
      const { data, error } = await sb
        .from("article_case_links")
        .select("article_id, case_id")
        .in("case_id", caseIds.slice(i, i + 100));
      if (error) throw new Error(error.message);
      for (const l of data ?? []) have.add(`${l.article_id}:${l.case_id}`);
    }
    const fresh = aclRows.filter((r) => !have.has(`${r.article_id}:${r.case_id}`));
    for (let i = 0; i < fresh.length; i += 200) {
      const { error } = await sb
        .from("article_case_links")
        .insert(fresh.slice(i, i + 200));
      if (error) throw new Error(`ACL insert 실패: ${error.message}`);
      aclInserted += fresh.slice(i, i + 200).length;
    }
    // 동수 건은 primary 를 비워 둬야 중복 배치가 산다(이전 실행분 정리 포함).
    for (let i = 0; i < caseIds.length; i += 100) {
      const { error } = await sb
        .from("cases")
        .update({ primary_node_id: null, primary_article_id: null })
        .in("case_id", caseIds.slice(i, i + 100));
      if (error) throw new Error(`primary 초기화 실패: ${error.message}`);
    }
  }
  console.log(
    `\n배치 완료 — 단일 ${done}건 · 동수 중복배치 ${ties.length}건(조문 링크 ${aclInserted}개 신규)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
