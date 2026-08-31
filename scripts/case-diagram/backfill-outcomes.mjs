// feat-2-035 — 이미 만들어진 도식에 **심급별 결과(경과 배지)** 를 채운다.
//
// 도식을 통째로 다시 만들지 않는다 — 검수를 마친 사실관계·쟁점~결론은 그대로 두고
// outcomes 칸만 붙인다. 그래서 **승인본도 검수 대기로 되돌리지 않는다**(표시용 부가정보이고,
// 틀리면 패널에서 그 자리에서 고칠 수 있다).
//
// 추출은 draft-diagrams 와 **같은 모듈**(lib-outcomes.mjs)을 쓴다 — 사본을 두면 한쪽만 고쳐진다.
//
//   npx tsx scripts/case-diagram/backfill-outcomes.mjs                 # dry-run(대상·비용)
//   npx tsx scripts/case-diagram/backfill-outcomes.mjs --apply
//   npx tsx scripts/case-diagram/backfill-outcomes.mjs --limit 10 --apply   # 표본 먼저
//   npx tsx scripts/case-diagram/backfill-outcomes.mjs --case 2022후10180 --apply --force
//
// 이미 outcomes 가 있는 도식은 건너뛴다(--force 로 다시 만든다).
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

import { draftOutcomes } from "./lib-outcomes.mjs";

const argv = process.argv.slice(2);
const argOf = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const APPLY = argv.includes("--apply");
const FORCE = argv.includes("--force");
const LIMIT = argOf("--limit") ? Number(argOf("--limit")) : Infinity;
const CASE_LIST = (argOf("--case") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const LAW = argOf("--law") ?? "patent";

const MODEL = "claude-opus-4-7";
const COST = { inputPerM: 5.0, outputPerM: 25.0 };
const BACKUP_DIR = path.resolve(process.cwd(), "tmp", "case-diagram");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let spentInput = 0;
let spentOutput = 0;
const usd = () =>
  (spentInput / 1e6) * COST.inputPerM + (spentOutput / 1e6) * COST.outputPerM;

const textOf = (res) =>
  (res.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

async function callModel({ system, prompt, maxTokens, schema }) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      ...(schema ? { format: { type: "json_schema", schema } } : {}),
    },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  spentInput += res.usage?.input_tokens ?? 0;
  spentOutput += res.usage?.output_tokens ?? 0;
  return textOf(res);
}

async function main() {
  let cq = sb
    .from("cases")
    .select("case_id, case_number, court, decided_at, official_text_md")
    .is("deleted_at", null)
    .contains("subject_laws", [LAW])
    .order("decided_at");
  if (CASE_LIST.length > 0) cq = cq.in("case_number", CASE_LIST);
  const { data: cases, error } = await cq;
  if (error) throw new Error(error.message);

  const ids = cases.map((c) => c.case_id);
  const [{ data: diagrams }, { data: lowers }] = await Promise.all([
    sb
      .from("case_diagrams")
      .select("diagram_id, case_id, facts_md, timeline, outcomes, review_status")
      .in("case_id", ids)
      .is("deleted_at", null),
    sb
      .from("case_lower_courts")
      .select("case_id, body_text")
      .in("case_id", ids)
      .eq("status", "loaded")
      .is("deleted_at", null),
  ]);
  const diaByCase = new Map((diagrams ?? []).map((d) => [d.case_id, d]));
  const lowerByCase = new Map((lowers ?? []).map((r) => [r.case_id, r.body_text]));

  let targets = [];
  const skipped = [];
  for (const c of cases) {
    const dia = diaByCase.get(c.case_id);
    if (!dia) continue; // 도식 없는 판례는 이 스크립트의 일이 아니다
    const has = Array.isArray(dia.outcomes) && dia.outcomes.length > 0;
    if (has && !FORCE) continue;
    if ((c.official_text_md ?? "").trim().length < 200) {
      skipped.push({ case: c.case_number, why: "대법원 원문 없음/짧음" });
      continue;
    }
    targets.push({ kase: c, dia, lower: lowerByCase.get(c.case_id) ?? null });
  }
  if (targets.length > LIMIT) targets = targets.slice(0, LIMIT);

  console.log(
    `도식 ${diaByCase.size}건 · 결과 채울 대상 ${targets.length}건 · 건너뜀 ${skipped.length}`,
  );
  for (const s of skipped) console.log(`  skip ${s.case} — ${s.why}`);

  if (!APPLY) {
    console.log("\n[dry-run] 대상:");
    for (const t of targets) {
      console.log(
        `  ${t.kase.case_number.padEnd(13)} ${t.kase.decided_at}  전문 ${String((t.kase.official_text_md ?? "").length).padStart(6)}자  하급심 ${t.lower ? `${t.lower.length}자` : "없음"}  ${t.dia.review_status}`,
      );
    }
    console.log(
      `\n건당 1회 호출 — 예상 $${(targets.length * 0.02).toFixed(2)} 안팎. --apply 를 붙이면 실행합니다.`,
    );
    return;
  }
  if (targets.length === 0) return;

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(BACKUP_DIR, `outcomes-backup-${targets.length}-${stamp}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      targets.map((t) => ({
        case_number: t.kase.case_number,
        diagram_id: t.dia.diagram_id,
        outcomes: t.dia.outcomes,
      })),
      null,
      2,
    ),
  );
  console.log(`백업: ${backup}`);

  let done = 0;
  let empty = 0;
  for (const [i, t] of targets.entries()) {
    let outcomes = [];
    try {
      outcomes = await draftOutcomes({
        callModel,
        caseNumber: t.kase.case_number,
        court: t.kase.court,
        decidedAt: t.kase.decided_at,
        officialText: t.kase.official_text_md ?? "",
        lowerText: t.lower,
        factsMd: t.dia.facts_md,
        timeline: t.dia.timeline,
      });
    } catch (e) {
      console.log(`[${i + 1}/${targets.length}] ${t.kase.case_number} ✗ ${String(e).slice(0, 120)}`);
      continue;
    }
    if (outcomes.length === 0) {
      empty += 1;
      console.log(
        `[${i + 1}/${targets.length}] ${t.kase.case_number.padEnd(13)} 결과 0개 — 그대로 둠(사람이 볼 것)`,
      );
      continue;
    }
    const { error: upd } = await sb
      .from("case_diagrams")
      .update({ outcomes })
      .eq("diagram_id", t.dia.diagram_id);
    if (upd) {
      console.log(`[${i + 1}/${targets.length}] ${t.kase.case_number} ✗ ${upd.message}`);
      continue;
    }
    done += 1;
    console.log(
      `[${i + 1}/${targets.length}] ${t.kase.case_number.padEnd(13)} ${outcomes.map((o) => `${o.court} ${o.result}`).join(" → ")}  · 누적 $${usd().toFixed(2)}`,
    );
  }
  console.log(`\n채움 ${done}건 · 결과 0개 ${empty}건 · 비용 $${usd().toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
