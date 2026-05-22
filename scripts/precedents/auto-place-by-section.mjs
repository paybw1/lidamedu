// hwpx 원본의 section 정보 + 본문 키워드로 cases.primary_node_id 자동 배치.
//
// 매칭 규칙:
//   1) precedents.json 의 case.section ("제1절  발 명") → display_label 정규화 매칭
//      → systematic_nodes.display_label 동일하면 그 node_id 를 primary_node_id 로.
//      예: "발명" → patent.b1.b2 "발명"
//          "실시" → patent.b1.b2.b6 "실시"
//          "산업상 이용가능성" → patent.b2.b1.b1
//   2) 위에서 매칭된 node 가 "발명"(patent.b1.b2) 이면 본문 키워드로 sub-node 6 중 하나로 down-shift.
//      "의약/약리/투여" → 용도(의약)발명
//      "미생물/균주/박테리아" → 미생물발명
//      "식물/신품종"        → 식물발명
//      "영업방법/비즈니스/BM" → BM발명
//      그 외                → 일반발명
//   3) precedents.json 에 case_number 없으면 skip (수동 입력 case).
//
// 사용:
//   node scripts/precedents/auto-place-by-section.mjs              # dry-run
//   node scripts/precedents/auto-place-by-section.mjs --apply
//   node scripts/precedents/auto-place-by-section.mjs --apply --case 2009허351
//
// 재실행 안전 — primary_node_id 가 이미 set 된 case 는 skip (스크립트로 덮어쓰지 않음).
// staff 가 admin UI 에서 수동 지정한 값을 자동 배치가 덮어쓰지 않도록 정책 보호.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv();

const APPLY = process.argv.includes("--apply");
const caseIdx = process.argv.indexOf("--case");
const ONLY_CASE = caseIdx >= 0 ? process.argv[caseIdx + 1] : null;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const INVENTION_NODE_LABEL = "발명";
const INVENTION_PATH = "patent.b1.b2";

// section name → display_label 정규화. "제N절", 공백 모두 제거.
function normalizeLabel(s) {
  return (s ?? "")
    .replace(/^제\s*\d+\s*절\s*/, "")
    .replace(/\s+/g, "");
}

// case 본문 텍스트(요지/판시이유/비고 합) 에서 발명 sub-node 결정 키워드 검색.
function classifyInventionSubNode(bodyAll) {
  const t = bodyAll;
  // 우선순위: 더 좁은 카테고리 먼저 — 식물 / 미생물 / 의약 / BM / 일반
  if (/식물|신품종|육종/.test(t)) return "식물발명";
  if (/미생물|균주|박테리아|효모|곰팡이|바이러스/.test(t)) return "미생물발명";
  if (/의약|약리|약효|투여|투약|약학|약물|용도발명|의료/.test(t))
    return "용도(의약)발명";
  if (/영업방법|비즈니스|BM발명|business\s*method/i.test(t)) return "BM발명";
  return "일반발명";
}

async function loadAllNodes() {
  const { data, error } = await supabase
    .from("systematic_nodes")
    .select("node_id, path, display_label")
    .eq("law_code", "patent");
  if (error) throw error;
  // path 는 ltree → 문자열 반환됨. display_label normalize → node 단일 매핑(중복 시 첫번째)
  const byLabel = new Map();
  const byPath = new Map();
  for (const n of data ?? []) {
    const key = normalizeLabel(n.display_label);
    if (!byLabel.has(key)) byLabel.set(key, n);
    byPath.set(n.path, n);
  }
  return { byLabel, byPath, all: data ?? [] };
}

async function loadPatentCases() {
  const { data, error } = await supabase
    .from("cases")
    .select(
      "case_id, case_number, primary_article_id, primary_node_id, summary_body_md, summary_items, reasoning_md, comment_body_md, related_md",
    )
    .contains("subject_laws", ["patent"])
    .is("deleted_at", null);
  if (error) throw error;
  return data ?? [];
}

function bodyAllText(c) {
  const items = Array.isArray(c.summary_items) ? c.summary_items : [];
  const itemsTxt = items
    .map((it) => `${it.title ?? ""} ${it.body ?? ""}`)
    .join(" ");
  return [
    c.summary_body_md ?? "",
    itemsTxt,
    c.reasoning_md ?? "",
    c.comment_body_md ?? "",
    c.related_md ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

async function main() {
  console.log(`mode  : ${APPLY ? "APPLY" : "DRY-RUN"}`);
  const srcPath = resolve("source/_converted/precedents.json");
  const seedRaw = JSON.parse(readFileSync(srcPath, "utf-8"));
  // case_number → seed entry (chapter/section)
  const seedByNo = new Map();
  for (const s of seedRaw) seedByNo.set(s.caseNumber, s);
  console.log(`seed entries: ${seedRaw.length}`);

  const { byLabel } = await loadAllNodes();
  const cases = await loadPatentCases();
  console.log(`patent cases: ${cases.length}`);

  // 발명 6 sub-node label → node id
  const subnodeIdByLabel = new Map();
  for (const lbl of [
    "일반발명",
    "BM발명",
    "용도(의약)발명",
    "미생물발명",
    "식물발명",
    "실시",
  ]) {
    const n = byLabel.get(normalizeLabel(lbl));
    if (n) subnodeIdByLabel.set(lbl, n.node_id);
  }
  // 발명 노드 자체 id
  const inventionNode = byLabel.get(normalizeLabel(INVENTION_NODE_LABEL));

  const updates = [];
  let skipAlreadySet = 0;
  let skipNoSeed = 0;
  let skipNoMatch = 0;
  let onlyCase = 0;

  for (const c of cases) {
    if (ONLY_CASE && c.case_number !== ONLY_CASE) continue;
    onlyCase += 1;
    if (c.primary_node_id) {
      skipAlreadySet += 1;
      continue;
    }
    const seed = seedByNo.get(c.case_number);
    if (!seed || !seed.section) {
      skipNoSeed += 1;
      continue;
    }
    const labelKey = normalizeLabel(seed.section);
    const node = byLabel.get(labelKey);
    if (!node) {
      skipNoMatch += 1;
      continue;
    }
    let targetNodeId = node.node_id;
    let targetLabel = node.display_label;
    // 발명 노드면 본문 키워드로 sub-node down-shift
    if (inventionNode && node.node_id === inventionNode.node_id) {
      const subLabel = classifyInventionSubNode(bodyAllText(c));
      const subId = subnodeIdByLabel.get(subLabel);
      if (subId) {
        targetNodeId = subId;
        targetLabel = subLabel;
      }
    }
    updates.push({
      case_id: c.case_id,
      case_number: c.case_number,
      seedSection: seed.section,
      targetNodeId,
      targetLabel,
    });
  }

  console.log(`\n── 통계 ──`);
  console.log(`considered     : ${onlyCase}`);
  console.log(`already set    : ${skipAlreadySet}`);
  console.log(`no seed entry  : ${skipNoSeed}`);
  console.log(`no node match  : ${skipNoMatch}`);
  console.log(`will update    : ${updates.length}`);

  // sub-node 분포
  const dist = new Map();
  for (const u of updates) {
    dist.set(u.targetLabel, (dist.get(u.targetLabel) ?? 0) + 1);
  }
  console.log(`\n── 분포 (target label → count) ──`);
  [...dist.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k.padEnd(25, " ")} ${v}`));

  // 발명 sub-node 분포만 별도
  const inventionSubs = updates.filter((u) =>
    ["일반발명", "BM발명", "용도(의약)발명", "미생물발명", "식물발명", "실시"].includes(
      u.targetLabel,
    ),
  );
  if (inventionSubs.length > 0) {
    console.log(`\n── 발명 sub-node 분류 샘플 ──`);
    inventionSubs.slice(0, 30).forEach((u) => {
      console.log(
        `  ${u.case_number.padEnd(20, " ")} → ${u.targetLabel.padEnd(20, " ")}  (seed: ${u.seedSection})`,
      );
    });
    if (inventionSubs.length > 30)
      console.log(`  … 외 ${inventionSubs.length - 30}건`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — --apply 로 실제 update)`);
    return;
  }

  console.log(`\n── apply ──`);
  let ok = 0;
  let fail = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("cases")
      .update({ primary_node_id: u.targetNodeId })
      .eq("case_id", u.case_id);
    if (error) {
      console.error(`  ${u.case_number} 실패: ${error.message}`);
      fail += 1;
    } else ok += 1;
  }
  console.log(`  ok=${ok}, fail=${fail}`);
  console.log(`\n=== 완료 ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
