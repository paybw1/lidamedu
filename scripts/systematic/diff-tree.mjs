// 체계도 원본(hwpx 추출 JSON) ↔ 운영 DB 대조. **읽기 전용** — 아무것도 바꾸지 않는다.
//
// 원본은 두 벌이다.
//   조문용        = 기본 트리(display_label)
//   판례/객관식용 = 판례 화면에서 보이는 트리(case_only 노드 · case_display_label 다른 이름)
// 두 파일의 합집합이 DB 트리여야 하고, 어느 쪽에만 있는 노드가 case_only / 조문 전용이 된다.
//
// ★노드를 지우는 일은 위험하다 — systematic_nodes 를 참조하는 테이블이 14개다.
//   그래서 이 스크립트는 "사라진 노드"마다 **붙어 있는 콘텐츠 수**를 함께 센다.
//
//   node scripts/systematic/diff-tree.mjs trademark
//   node scripts/systematic/diff-tree.mjs design
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SOURCES = {
  trademark: {
    label: "상표법",
    article: "source/상표법/체계도/체계도(상표법) - 조문용.extracted.json",
    caseView: "source/상표법/체계도/체계도(상표법) - 판례, 객관식용.extracted.json",
  },
  design: {
    label: "디자인보호법",
    article: "source/디자인보호법학습/체계도/체계도(디보법) - 조문용.extracted.json",
    caseView: "source/디자인보호법학습/체계도/체계도(디보법) - 판례, 객관식용.extracted.json",
  },
};

const lawCode = process.argv[2];
const src = SOURCES[lawCode];
if (!src) {
  console.error(`사용: node scripts/systematic/diff-tree.mjs <${Object.keys(SOURCES).join("|")}>`);
  process.exit(1);
}

/** 표기 차이를 지운 비교용 키 — 글머리·번호·공백만 없앤다. 글자는 건드리지 않는다. */
function norm(s) {
  return s
    .replace(/^\s*[•·]\s*/, "")
    .replace(/^\s*-\s*/, "")
    .replace(/^\s*\[\d{2}\]\s*/, "")
    .replace(/^\s*\d{2}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 매칭용 키 — 라벨에서 조문 표기를 뗀다.
 * ★새 원본은 기존 라벨에 조문번호를 붙였다(`목적` → `목적(法 1)`). 표기만 바뀐 것을
 *   "삭제 + 신규"로 세면 172건이 사라지는 것처럼 보인다. 실제로는 이름이 붙은 것이다.
 */
function matchKey(label) {
  return label
    .replace(/\s*\(\s*法[^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}
const keyPath = (p) => p.split(" / ").map(matchKey).join(" / ");

function levelOf(t) {
  if (/^\d{2}\s/.test(t)) return 1;
  if (/^\s*\[\d{2}\]/.test(t)) return 2;
  if (/^\s*[•·]/.test(t)) return 3;
  if (/^\s*-\s/.test(t)) return 4;
  return 0;
}

/** 문단 목록 → 경로 배열. 경로는 정규화한 라벨을 ' / ' 로 이은 것. */
function parseTree(file) {
  const paras = JSON.parse(fs.readFileSync(file, "utf8")).paragraphs;
  const stack = [];
  const out = [];
  for (const p of paras) {
    const raw = p.text;
    if (!raw || !raw.trim()) continue;
    const lv = levelOf(raw);
    if (lv === 0) {
      out.push({ level: 0, label: raw.trim(), path: `(형식불명) ${raw.trim()}`, raw });
      continue;
    }
    // ★원본은 중간 단계를 건너뛴다(L1 바로 아래 L3 이 오는 곳이 있다). 빈 칸을 그대로
    //   경로에 넣으면 `상표 외의 권리 /  / 단체표장` 같은 유령 경로가 생겨 DB 와 안 맞는다.
    //   비어 있는 단계는 경로에서 뺀다.
    const label = norm(raw);
    stack.length = lv - 1;
    stack[lv - 1] = label;
    out.push({
      level: lv,
      label,
      path: stack.slice(0, lv).filter(Boolean).join(" / "),
      raw,
    });
  }
  return out;
}

const articleTree = parseTree(src.article);
const caseTree = parseTree(src.caseView);

// ── DB 트리 ────────────────────────────────────────────────────────────────
const { data: nodes, error } = await sb
  .from("systematic_nodes")
  .select("node_id, parent_id, path, display_label, case_display_label, case_only, ord")
  .eq("law_code", lawCode)
  .order("path");
if (error) throw new Error(error.message);

const byId = new Map(nodes.map((n) => [n.node_id, n]));
function dbPath(n, useCaseLabel) {
  const parts = [];
  let cur = n;
  while (cur) {
    parts.unshift(norm((useCaseLabel && cur.case_display_label) || cur.display_label));
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return parts.join(" / ");
}

const dbArticlePaths = new Map(); // 조문 화면에 보이는 것 = case_only 제외
const dbCasePaths = new Map(); // 판례 화면에 보이는 것 = 전부(case_display_label 우선)
for (const n of nodes) {
  if (!n.case_only) dbArticlePaths.set(dbPath(n, false), n);
  dbCasePaths.set(dbPath(n, true), n);
}

// ── 붙어 있는 콘텐츠 세기 ──────────────────────────────────────────────────
const REFS = [
  ["problem_systematic_links", "node_id", "문제 배치"],
  ["case_systematic_links", "node_id", "판례 배치"],
  ["article_systematic_links", "node_id", "조문 연결"],
  ["problems", "primary_node_id", "문제 대표노드"],
  ["cases", "primary_node_id", "판례 대표노드"],
  ["dohae_unit_nodes", "node_id", "도해 유닛"],
  ["study_plan_items", "node_id", "학습계획"],
  ["qna_threads", "node_id", "Q&A"],
];
async function attachedCounts(nodeIds) {
  const out = new Map(nodeIds.map((id) => [id, {}]));
  for (const [table, col, label] of REFS) {
    for (let i = 0; i < nodeIds.length; i += 150) {
      const chunk = nodeIds.slice(i, i + 150);
      const { data } = await sb.from(table).select(col).in(col, chunk);
      for (const r of data ?? []) {
        const id = r[col];
        const m = out.get(id);
        if (m) m[label] = (m[label] ?? 0) + 1;
      }
    }
  }
  return out;
}

// ── 대조 ───────────────────────────────────────────────────────────────────
// 원본 경로 — 조문번호를 뗀 키로 인덱싱하되, 원래 라벨을 값으로 들고 있는다(이름 변경 검출).
const fileByKey = new Map();
for (const x of [...articleTree, ...caseTree]) {
  if (!fileByKey.has(keyPath(x.path))) fileByKey.set(keyPath(x.path), x.path);
}
const dbKeys = new Set();
for (const n of nodes) {
  dbKeys.add(keyPath(dbPath(n, false)));
  dbKeys.add(keyPath(dbPath(n, true)));
}

const added = [...fileByKey.entries()].filter(([k]) => !dbKeys.has(k)).map(([, p]) => p);
const removedNodes = nodes.filter(
  (n) => !fileByKey.has(keyPath(dbPath(n, false))) && !fileByKey.has(keyPath(dbPath(n, true))),
);

// 이름만 바뀐 것 — 같은 키인데 표기가 다르다(대개 조문번호가 붙었다).
const renamed = [];
for (const n of nodes) {
  const cur = dbPath(n, false);
  const want = fileByKey.get(keyPath(cur));
  if (want && want !== cur) {
    renamed.push({
      node: n,
      from: norm(n.display_label),
      to: want.split(" / ").pop(),
    });
  }
}

const bad = [...articleTree, ...caseTree].filter((x) => x.level === 0);

console.log(`\n═══ ${src.label} 체계도 대조 ═══`);
console.log(`원본 조문용 ${articleTree.length}행 · 판례객관식용 ${caseTree.length}행 · 합집합 ${fileByKey.size}경로`);
console.log(`운영 DB ${nodes.length}노드 (case_only ${nodes.filter((n) => n.case_only).length})`);
if (bad.length) {
  console.log(`\n★형식을 못 읽은 줄 ${bad.length}건 — 확인 필요`);
  bad.slice(0, 10).forEach((x) => console.log("   ", JSON.stringify(x.raw)));
}

console.log(`\n── 이름만 바뀜 (${renamed.length}) — 대개 조문번호가 붙었다 ──`);
renamed.slice(0, 25).forEach((r) => console.log(`  ~ ${r.from}  →  ${r.to}`));
if (renamed.length > 25) console.log(`  … 외 ${renamed.length - 25}건`);

console.log(`\n── 원본에 있고 DB 에 없음 (신규 ${added.length}) ──`);
added.slice(0, 40).forEach((p) => console.log("  +", p));
if (added.length > 40) console.log(`  … 외 ${added.length - 40}건`);

console.log(`\n── DB 에 있고 원본에 없음 (${removedNodes.length}) ──`);
if (removedNodes.length) {
  const counts = await attachedCounts(removedNodes.map((n) => n.node_id));
  let withContent = 0;
  for (const n of removedNodes) {
    const c = counts.get(n.node_id) ?? {};
    const parts = Object.entries(c).map(([k, v]) => `${k} ${v}`);
    if (parts.length) withContent += 1;
    console.log(
      `  - ${dbPath(n, false)}${n.case_only ? "  [case_only]" : ""}` +
        (parts.length ? `\n      ★ ${parts.join(" · ")}` : ""),
    );
  }
  console.log(`\n  → 이 중 콘텐츠가 붙어 있는 노드 ${withContent}개. 지우면 그 연결이 끊긴다.`);
}

// ── 이동 판정 ──────────────────────────────────────────────────────────────
// ★경로로만 비교하면 부모가 바뀐 노드가 "삭제 + 신규"로 보인다. 디자인보호법의
//   「특유제도」 가 통째로 사라진 것처럼 보였지만, 그 아래 항목은 전부 새 원본의
//   다른 자리에 그대로 있다. 잎 라벨로 다시 맞춰 **이동**을 가려낸다.
const leafKey = (p) => matchKey(p.split(" / ").pop() ?? "");

const addedByLeaf = new Map();
for (const p of added) {
  const k = leafKey(p);
  if (!addedByLeaf.has(k)) addedByLeaf.set(k, []);
  addedByLeaf.get(k).push(p);
}

const moved = [];
const trulyRemoved = [];
for (const n of removedNodes) {
  const cands = addedByLeaf.get(leafKey(dbPath(n, false)));
  if (cands && cands.length) {
    moved.push({ node: n, from: dbPath(n, false), to: cands.shift() });
  } else {
    trulyRemoved.push(n);
  }
}
const trulyAdded = [...addedByLeaf.values()].flat();

console.log(`\n═══ 정리 ═══`);
console.log(`  이름만 변경   ${renamed.length}`);
console.log(`  이동(부모 변경) ${moved.length}`);
console.log(`  신규 추가     ${trulyAdded.length}`);
console.log(`  원본에 없음   ${trulyRemoved.length}  ← 삭제 대상이 아니라 판단이 필요한 것`);

if (moved.length) {
  console.log(`\n── 이동 (${moved.length}) ──`);
  moved.slice(0, 20).forEach((m) => console.log(`  → ${m.from}\n      ⇒ ${m.to}`));
  if (moved.length > 20) console.log(`  … 외 ${moved.length - 20}건`);
}
if (trulyAdded.length) {
  console.log(`\n── 진짜 신규 (${trulyAdded.length}) ──`);
  trulyAdded.slice(0, 20).forEach((p) => console.log("  +", p));
  if (trulyAdded.length > 20) console.log(`  … 외 ${trulyAdded.length - 20}건`);
}
if (trulyRemoved.length) {
  const counts = await attachedCounts(trulyRemoved.map((n) => n.node_id));
  const withContent = trulyRemoved.filter(
    (n) => Object.keys(counts.get(n.node_id) ?? {}).length > 0,
  );
  console.log(`\n── 원본에 없는 DB 노드 (${trulyRemoved.length}, 콘텐츠 보유 ${withContent.length}) ──`);
  const caseOnly = trulyRemoved.filter((n) => n.case_only);
  console.log(`  · case_only(판례 주제 배치 레이어) ${caseOnly.length} — 원본 체계도에 없는 별도 층이다. 유지해야 한다.`);
  trulyRemoved
    .filter((n) => !n.case_only)
    .slice(0, 20)
    .forEach((n) => {
      const c = counts.get(n.node_id) ?? {};
      const parts = Object.entries(c).map(([k, v]) => `${k} ${v}`);
      console.log(`  · ${dbPath(n, false)}${parts.length ? `  ★ ${parts.join(" · ")}` : ""}`);
    });
}
