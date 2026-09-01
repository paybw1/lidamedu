// 대법원 사건번호만 추려 **개별 확인**.
//
// 전수 점검에서 하급심·특허법원은 공개 DB 수록률이 낮아 판정할 수 없었다(판정 불가를
// "지어냄" 으로 몰 뻔했다 — 2026-09-01). 대법원 판결은 공개 DB 가 잘 담으므로
// **대법원 번호만** 골라 확인하면 신호가 깨끗하다.
//
// ★★검증 우선순위:
//   ① **우리가 가진 판결문 원문**(cases.official_text_md + case_lower_courts.body_text) —
//      다른 판결이 그 번호를 인용하고 있으면 실재한다. **가장 확실하고 공짜인 근거**이고,
//      외부 조회를 크게 줄여 rate limit 도 피한다. (2012후1613 이 이 방법으로 확인됐다 —
//      2014후1563·2024후10108·2019다277751 세 판결문이 인용 중. 외부 조회는 놓쳤다.)
//   ② casenote  ③ 국가법령정보센터(누락 많음 — 단독 근거로 쓰지 않는다)
// ★두 곳 다 "없음" 일 때만 의심으로 올린다. 조회 실패는 미판정으로 남긴다.
//
//   npx tsx scripts/audit/verify-supreme-citations.mjs            # 확인만
//   npx tsx scripts/audit/verify-supreme-citations.mjs --publish  # 의심분 검수 큐 적재
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { publishAuditFindings } from "../lib/audit-findings.mjs";
import { CASE_NO_RE, flatten, markOf } from "../lib/content-rules.mjs";
import { verifyCaseNumber } from "../lib/law-precedent-lookup.mjs";

const argv = process.argv.slice(2);
const PUBLISH = argv.includes("--publish");
const CACHE_PATH = path.resolve(process.cwd(), "tmp", "supreme-citation-cache.json");
const PAGE = 1000;

/** 대법원 사건부호만. 하급심(가합·카합·나·노…)·특허법원(허)은 여기서 제외. */
const SUPREME_MARKS = new Set([
  "후", "다", "도", "두", "마", "므", "그", "오", "초", "재다", "재후",
]);

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

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
    entityType: null,
    fields: ["summary_body_md", "reasoning_md", "comment_body_md", "summary_items"],
    label: "판례 서술",
    selfField: "case_number",
  },
];

const asText = (v) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v));

async function loadAll(table, cols) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

/**
 * 우리가 가진 판결문 전문 뭉치 — 다른 판결이 인용한 사건번호는 실재한다.
 * ★공백을 지운 한 덩어리로 만들어 부분일치로 본다(판결문은 줄바꿈이 번호 가운데를 벌린다).
 */
async function loadJudgmentCorpus() {
  const parts = [];
  for (const [table, col] of [
    ["cases", "official_text_md"],
    ["case_lower_courts", "body_text"],
  ]) {
    for (const r of await loadAll(table, col)) {
      const t = r[col];
      if (t) parts.push(flatten(t));
    }
  }
  return parts.join("\n");
}

async function main() {
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

  const citations = new Map();
  for (const t of TARGETS) {
    const cols = [t.key, ...t.fields, t.selfField].filter(Boolean).join(", ");
    for (const r of await loadAll(t.table, cols)) {
      const self = flatten(r[t.selfField] ?? "");
      const text = t.fields.map((f) => asText(r[f])).join("\n");
      for (const no of new Set(text.match(CASE_NO_RE) ?? [])) {
        if (!SUPREME_MARKS.has(markOf(no))) continue;
        if (flatten(no) === self) continue;
        const list = citations.get(no) ?? [];
        list.push({ entityType: t.entityType, entityId: r[t.key], label: t.label });
        citations.set(no, list);
      }
    }
  }

  const notInDb = [...citations.keys()].filter((n) => !known.has(flatten(n)));
  // ★외부에 묻기 전에 **우리 판결문 뭉치**부터 본다 — 다른 판결이 인용했으면 실재한다.
  //   2012후1613 이 이 방법으로 확인됐다(외부 조회는 놓쳤다). 외부 요청도 크게 준다.
  const corpus = await loadJudgmentCorpus();
  const inCorpus = notInDb.filter((n) => corpus.includes(flatten(n)));
  const unknown = notInDb.filter((n) => !corpus.includes(flatten(n)));
  console.log(
    `대법원 인용 ${citations.size}종\n` +
      `  DB 수록        ${citations.size - notInDb.length}종\n` +
      `  판결문이 인용   ${inCorpus.length}종 (실재 확인 — 외부 조회 불필요)\n` +
      `  외부 조회 대상  ${unknown.length}종\n`,
  );

  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    cache = {};
  }

  const fake = [];
  const real = [];
  const unresolved = [];
  for (const [i, n] of unknown.entries()) {
    let v = Object.prototype.hasOwnProperty.call(cache, n) ? cache[n] : undefined;
    if (v === undefined || v === null) {
      v = await verifyCaseNumber(n);
      cache[n] = v;
      if ((i + 1) % 10 === 0) {
        fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
        console.log(`   확인 ${i + 1}/${unknown.length}…`);
      }
    }
    (v === false ? fake : v === true ? real : unresolved).push(n);
  }
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));

  console.log(
    `\n실재 ${real.length} · **두 곳 모두 없음 ${fake.length}** · 미판정(조회실패) ${unresolved.length}`,
  );
  if (fake.length) {
    console.log(`\n[두 곳(casenote·법령정보센터) 모두 없음 — 개별 확인 대상]`);
    for (const n of fake.sort()) {
      const w = citations.get(n);
      console.log(
        `   ${n.padEnd(14)} ${String(w.length).padStart(2)}곳  ${[...new Set(w.map((x) => x.label))].join(", ")}`,
      );
    }
  }
  if (unresolved.length) {
    console.log(`\n[미판정 ${unresolved.length}종 — 조회 실패, 없음으로 단정하지 않는다]`);
    for (const n of unresolved.sort()) console.log(`   ${n}`);
  }

  if (!PUBLISH) {
    console.log("\n--publish 를 붙이면 의심분만 검수 큐에 적재합니다.");
    return;
  }
  const findings = [];
  for (const n of fake) {
    for (const w of citations.get(n)) {
      if (!w.entityType) continue;
      findings.push({
        entityType: w.entityType,
        entityId: w.entityId,
        ruleKey: "실재 확인 안 되는 대법원 사건번호",
        severity: "fail",
        message: `casenote·법령정보센터 모두에 없는 대법원 사건번호: ${n}`,
      });
    }
  }
  const res = await publishAuditFindings(sb, {
    source: "verify-supreme-citations",
    findings,
  });
  console.log(`\n검수 큐에 적재: ${res.inserted}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
