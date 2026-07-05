// 민법 체계도 노드 시드 — 정식 체계도가 없어 조문 목차(편·장·절·관)를 그대로 노드로 생성.
// (사용자 결정 2026-07-05: "체계도 목차가 없으니 조문 목차로 일단 문제를 배치")
// ① systematic_nodes: articles 의 part/chapter/section(관 포함) 계층 미러링.
//    path 는 2자리 제로패딩(civil.p01.c05.s04)으로 문자열 정렬 = 목차 순서 보장.
// ② article_systematic_links: 조문(article) → 최근접 상위 표제 노드 1:1 링크
//    (문제 배치는 primary_article_id → 링크 파생이라 코드 무수정으로 동작).
// ③ 대응 조문 없는 판례법 주제 6문항(명의신탁·비전형담보·유동적무효)은 primary_node_id 핀.
// dry-run 기본, --apply 반영.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: law } = await c.from("laws").select("law_id").eq("law_code", "civil").single();

const { count: existing } = await c
  .from("systematic_nodes")
  .select("node_id", { count: "exact", head: true })
  .eq("law_code", "civil");
if ((existing ?? 0) > 0) {
  console.log(`civil 노드 이미 ${existing}개 존재 — 중단(재시드는 수동 삭제 후).`);
  process.exit(1);
}

// 표제(part/chapter/section) + 조문 전체 로드
const heads = [];
const articles = [];
for (let from = 0; ; from += 1000) {
  const { data } = await c
    .from("articles")
    .select("article_id, level, display_label, parent_id, path")
    .eq("law_id", law.law_id)
    .is("deleted_at", null)
    .range(from, from + 999);
  for (const a of data) (a.level === "article" ? articles : a.level === "clause" || a.level === "item" || a.level === "subitem" ? [] : heads).push(a);
  if (data.length < 1000) break;
}
heads.sort((a, b) => a.path.localeCompare(b.path));
console.log(`표제 ${heads.length} (편·장·절·관) | 조문 ${articles.length}`);

// article path 세그먼트 → 노드 path 세그먼트 (2자리 제로패딩 유지)
//   pt01→p01, ch01→c01, s01→s01, gw01→g01
function nodePathOf(articlePath) {
  const segs = articlePath.split(".").slice(1); // drop 'civil'
  const mapped = segs.map((s) => {
    const m = s.match(/^(pt|ch|s|gw)(\d+)$/);
    if (!m) throw new Error(`표제 세그먼트 해석 불가: ${s} (${articlePath})`);
    const prefix = { pt: "p", ch: "c", s: "s", gw: "g" }[m[1]];
    return prefix + m[2].padStart(2, "0");
  });
  return "civil." + mapped.join(".");
}

// 노드 rows 구성 (parent 는 path 로 해석 — 삽입 후 id 매핑)
const nodePlan = heads.map((h) => {
  const path = nodePathOf(h.path);
  const segs = path.split(".");
  const last = segs[segs.length - 1];
  return {
    articleId: h.article_id,
    path,
    parentPath: segs.length > 2 ? segs.slice(0, -1).join(".") : null,
    ord: parseInt(last.replace(/\D/g, ""), 10),
    display_label: h.display_label,
  };
});
// parentPath 무결성
for (const n of nodePlan) {
  if (n.parentPath && !nodePlan.some((x) => x.path === n.parentPath)) {
    throw new Error(`부모 표제 누락: ${n.path} ← ${n.parentPath}`);
  }
}

// 조문 → 최근접 표제 (parent 체인)
const headByArticleId = new Map(nodePlan.map((n) => [n.articleId, n]));
const parentById = new Map([...heads, ...articles].map((a) => [a.article_id, a.parent_id]));
const linkPlan = [];
let unlinked = 0;
for (const a of articles) {
  let cur = a.parent_id;
  while (cur && !headByArticleId.has(cur)) cur = parentById.get(cur) ?? null;
  if (!cur) {
    console.log("표제 미도달 조문:", a.path);
    unlinked++;
    continue;
  }
  linkPlan.push({ article_id: a.article_id, headPath: headByArticleId.get(cur).path });
}
console.log(`링크 계획 ${linkPlan.length} | 미도달 ${unlinked}`);

// 판례법 주제 6문항 핀 (docs/survey/민법-대표조문-미지정-38.md 보류분)
const PINS = [
  { year: "2011", q: 18, path: "civil.p02.c03", why: "명의신탁 → 제2편 제3장 소유권" },
  { year: "2013", q: 14, path: "civil.p02.c09", why: "비전형담보(양도담보) → 제2편 제9장 저당권" },
  { year: "2013", q: 15, path: "civil.p02.c09", why: "비전형담보 → 저당권" },
  { year: "2017", q: 22, path: "civil.p02.c09", why: "비전형담보(가등기담보) → 저당권" },
  { year: "2021", q: 10, path: "civil.p01.c05.s04", why: "유동적 무효 → 제1편 제5장 제4절 무효와 취소" },
  { year: "2024", q: 11, path: "civil.p01.c05.s04", why: "유동적 무효 → 무효와 취소" },
];
for (const p of PINS) {
  if (!nodePlan.some((n) => n.path === p.path)) throw new Error(`핀 노드 미존재: ${p.path}`);
  console.log(`핀: ${p.year}#${p.q} → ${p.path} (${p.why})`);
}

console.log(`\n노드 ${nodePlan.length} | 링크 ${linkPlan.length} | 핀 ${PINS.length}`);
if (!APPLY) {
  for (const n of nodePlan.slice(0, 12)) console.log(" ", n.path, "|", n.display_label);
  console.log("(dry-run — --apply 반영)");
  process.exit(0);
}

// ① 노드 삽입 — 깊이 순(부모 먼저), parent_id 매핑
nodePlan.sort((a, b) => a.path.split(".").length - b.path.split(".").length || a.path.localeCompare(b.path));
const nodeIdByPath = new Map();
for (const n of nodePlan) {
  const { data: row, error } = await c
    .from("systematic_nodes")
    .insert({
      law_code: "civil",
      parent_id: n.parentPath ? nodeIdByPath.get(n.parentPath) : null,
      path: n.path,
      display_label: n.display_label,
      ord: n.ord,
      case_only: false,
    })
    .select("node_id")
    .single();
  if (error) throw new Error(`노드 삽입 실패 ${n.path}: ${error.message}`);
  nodeIdByPath.set(n.path, row.node_id);
}
console.log("노드 삽입:", nodeIdByPath.size);

// ② 조문 링크 삽입 (500개 배치)
const linkRows = linkPlan.map((l) => ({
  article_id: l.article_id,
  node_id: nodeIdByPath.get(l.headPath),
}));
for (let i = 0; i < linkRows.length; i += 500) {
  const { error } = await c.from("article_systematic_links").insert(linkRows.slice(i, i + 500));
  if (error) throw new Error(`링크 삽입 실패 (${i}): ${error.message}`);
}
console.log("링크 삽입:", linkRows.length);

// ③ 판례법 주제 핀
for (const p of PINS) {
  const { error } = await c
    .from("problems")
    .update({ primary_node_id: nodeIdByPath.get(p.path) })
    .eq("law_id", law.law_id)
    .eq("year", p.year)
    .eq("problem_number", p.q)
    .is("deleted_at", null);
  if (error) throw new Error(`핀 실패 ${p.year}#${p.q}: ${error.message}`);
}
console.log("핀 완료:", PINS.length);
console.log("완료 — 문제 배치는 primary_article_id → 링크 파생으로 자동.");
