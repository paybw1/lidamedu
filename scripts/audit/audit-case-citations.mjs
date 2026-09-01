// 전수 점검 — AI 가 만든 콘텐츠에 **실재하지 않는 사건번호**가 인용됐는지.
//
// 2026-09-01 원장 지적으로 발견: 2차 훈련 논점 6건 중 3건이 지어낸 번호였다
// (2005후3352 · 2009후3919 · 2015다257538 — 법리는 맞는데 번호만 근처의 없는 번호).
// 법리가 맞아 읽어서는 안 잡힌다. 초안이 전부 AI 생성이므로 **전 콘텐츠**를 훑는다.
//
// 판정 3단계:
//   ① 우리 DB(cases.case_number + case_lower_courts.lower_case_number) 에 있으면  → OK
//   ② 없으면 **국가법령정보센터 + casenote 두 곳** 조회 → 하나라도 있으면          → WARN(DB 미수록)
//   ③ 두 곳 다 없을 때만                                                          → FAIL(지어낸 것 의심)
//
// ★★한 소스로 부존재를 단정하면 안 된다. 법령정보센터 API 만 보고 판정했다가 실재하는
//   95후1326·98허4883 을 "지어냄" 으로 몰 뻔했다(2026-09-01, 406종 중 다수가 오탐이었다).
// ★부호 화이트리스트(CASE_MARKS)로 거른다 — "제29조의2" 의 "29의2" 가 사건번호로 잡혔다.
//
// ★특허심판원 심판번호(당·원·정·취·소 …)는 법원 판결이 아니라 조회 대상이 아니다 —
//   빼지 않으면 전부 FAIL 로 잡힌다(과거 audit-diagrams 에서 90건 오탐 선례).
// ★조회 결과는 디스크에 캐시한다(tmp/law-precedent-cache.json) — 재실행이 싸야 반복해서 돈다.
//
//   npx tsx scripts/audit/audit-case-citations.mjs              # DB 대조까지 + 조회 대상 집계
//   npx tsx scripts/audit/audit-case-citations.mjs --verify     # 법령정보센터 조회까지
//   npx tsx scripts/audit/audit-case-citations.mjs --verify --publish   # 검수 큐 적재
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { publishAuditFindings } from "../lib/audit-findings.mjs";
import { CASE_NO_RE, flatten, isCourtCaseNo, markOf } from "../lib/content-rules.mjs";
import { verifyCaseNumber } from "../lib/law-precedent-lookup.mjs";

const argv = process.argv.slice(2);
const VERIFY = argv.includes("--verify");
const PUBLISH = argv.includes("--publish");

const CACHE_PATH = path.resolve(process.cwd(), "tmp", "law-precedent-cache.json");
const PAGE = 1000;

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/** 스캔 대상 — 표, 키, 검사할 텍스트 필드, 큐 entity_type(없으면 보고만). */
const TARGETS = [
  {
    table: "case_training_issues",
    key: "issue_id",
    entityType: "case_training_issue",
    fields: ["label", "description_md", "model_conclusion_md"],
    label: "2차 훈련 논점",
  },
  {
    table: "case_diagrams",
    key: "diagram_id",
    entityType: "case_diagram",
    fields: ["facts_md", "blocks"],
    label: "판례 도식",
  },
  {
    table: "problems",
    key: "problem_id",
    entityType: "problem",
    fields: ["explanation_md", "model_answer_md", "grading_rubric_md", "rubric_items"],
    label: "문제 해설·모범답안",
  },
  {
    table: "cases",
    key: "case_id",
    entityType: null, // 검수 큐 대상 아님 — 보고만.
    fields: ["summary_body_md", "reasoning_md", "comment_body_md", "summary_items"],
    label: "판례 서술",
    // 자기 사건번호는 당연히 나오므로 제외한다.
    selfField: "case_number",
  },
];

const asText = (v) =>
  v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);

async function loadAll(table, cols) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select(cols)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

async function loadKnown() {
  const known = new Set();
  for (const [table, col] of [
    ["cases", "case_number"],
    ["case_lower_courts", "lower_case_number"],
  ]) {
    for (const r of await loadAll(table, col)) {
      for (const part of String(r[col] ?? "").split(/[,·/]/)) {
        const t = flatten(part);
        if (t) known.add(t);
      }
    }
  }
  return known;
}

function loadCache() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"))));
  } catch {
    return new Map();
  }
}
function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(cache), null, 0));
}

async function main() {
  const known = await loadKnown();
  console.log(`DB 사건번호 ${known.size}종\n`);

  // ── 1) 전 콘텐츠에서 인용 사건번호 수집 ──────────────────────────────
  /** number → [{ entityType, entityId, table, label, self }] */
  const citations = new Map();
  let scanned = 0;

  for (const t of TARGETS) {
    const cols = [t.key, ...t.fields, t.selfField].filter(Boolean).join(", ");
    const rows = await loadAll(t.table, cols);
    scanned += rows.length;
    let hits = 0;
    for (const r of rows) {
      const self = flatten(r[t.selfField] ?? "");
      const text = t.fields.map((f) => asText(r[f])).join("\n");
      for (const no of new Set(text.match(CASE_NO_RE) ?? [])) {
        const flat = flatten(no);
        if (flat === self) continue;
        const list = citations.get(no) ?? [];
        list.push({
          entityType: t.entityType,
          entityId: r[t.key],
          label: t.label,
        });
        citations.set(no, list);
        hits += 1;
      }
    }
    console.log(`${t.label.padEnd(14)} ${String(rows.length).padStart(5)}건 스캔 · 인용 ${hits}회`);
  }

  const all = [...citations.keys()];
  // ★부호 화이트리스트로 거른다 — 블랙리스트로는 "제29조의2" 의 "29의2" 같은 조문 표기가
  //   사건번호로 잡혀 대량 오탐이 났다(2026-09-01: 95의2 17곳·99의2 50곳).
  const courtNos = all.filter(isCourtCaseNo);
  const trial = all.filter((n) => !isCourtCaseNo(n));
  const unknown = courtNos.filter((n) => !known.has(flatten(n)));

  console.log(
    `\n스캔 ${scanned}행 · 인용 사건번호 ${all.length}종` +
      ` (사건번호 아님·심판번호 ${trial.length}종 제외 · 법원 ${courtNos.length}종)`,
  );
  console.log(`DB 수록 ${courtNos.length - unknown.length}종 · DB 미수록 ${unknown.length}종`);

  if (!VERIFY) {
    console.log(`\n[조회 생략] --verify 를 붙이면 미수록 ${unknown.length}종을 법령정보센터에 조회합니다.`);
    for (const n of unknown.slice(0, 40)) {
      console.log(`   ${n.padEnd(14)} 인용 ${citations.get(n).length}곳`);
    }
    if (unknown.length > 40) console.log(`   … 외 ${unknown.length - 40}종`);
    return;
  }

  // ── 2) 미수록 번호만 법령정보센터 조회(캐시) ─────────────────────────
  const cache = loadCache();
  let looked = 0;
  const verdict = new Map(); // number → true(실재) | false(없음) | null(조회실패)
  for (const n of unknown) {
    // ★null(조회 실패)은 캐시로 인정하지 않는다 — 다시 묻는다.
    if (cache.has(n) && cache.get(n) !== null) {
      verdict.set(n, cache.get(n));
      continue;
    }
    // ★두 소스(법령정보센터 + casenote)로 확인 — 한 소스만 보고 부존재를 단정하지 않는다.
    const live = await verifyCaseNumber(n);
    verdict.set(n, live);
    cache.set(n, live);
    looked += 1;
    if (looked % 20 === 0) {
      console.log(`   조회 ${looked}/${unknown.length}…`);
      saveCache(cache);
    }
  }
  saveCache(cache);

  const fake = unknown.filter((n) => verdict.get(n) === false);
  const outside = unknown.filter((n) => verdict.get(n) === true);
  const failedLookup = unknown.filter((n) => verdict.get(n) == null);

  console.log(
    `\n조회 ${looked}종(캐시 ${unknown.length - looked}) · ` +
      `실재 ${outside.length} · **실재하지 않음 ${fake.length}** · 조회실패 ${failedLookup.length}`,
  );

  if (fake.length > 0) {
    console.log(`\n[실재하지 않는 사건번호 — 지어낸 것 의심 ${fake.length}종]`);
    for (const n of fake.sort()) {
      const where = citations.get(n);
      const by = [...new Set(where.map((w) => w.label))].join(", ");
      console.log(`   ${n.padEnd(14)} ${String(where.length).padStart(3)}곳  (${by})`);
    }
  }
  if (outside.length > 0) {
    console.log(`\n[실재하나 DB 미수록 ${outside.length}종 — 적재 검토]`);
    for (const n of outside.sort().slice(0, 30)) {
      console.log(`   ${n.padEnd(14)} 인용 ${citations.get(n).length}곳`);
    }
    if (outside.length > 30) console.log(`   … 외 ${outside.length - 30}종`);
  }

  // ── 3) 검수 큐 적재 ─────────────────────────────────────────────────
  if (!PUBLISH) {
    console.log("\n--publish 를 붙이면 검수 큐에 적재합니다.");
    return;
  }
  const findings = [];
  for (const n of unknown) {
    const v = verdict.get(n);
    if (v === true) continue; // 실재 = 적재 대상 아님(별도 '미수록' 목록으로 관리)
    for (const w of citations.get(n)) {
      if (!w.entityType) continue; // cases 는 큐 대상이 아니다
      findings.push({
        entityType: w.entityType,
        entityId: w.entityId,
        ruleKey: v === false ? "실재하지 않는 사건번호" : "사건번호 조회 실패",
        severity: v === false ? "fail" : "warn",
        message:
          v === false
            ? `실재하지 않는 사건번호 — 지어낸 것으로 의심: ${n}`
            : `사건번호 확인 실패(조회 오류) — 사람이 확인: ${n}`,
      });
    }
  }
  const res = await publishAuditFindings(sb, {
    source: "audit-case-citations",
    findings,
  });
  console.log(`\n검수 큐에 적재: ${res.inserted}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
