// 특허·상표·디자인 판례 중요도 산정 — 3과목 공통 기준 (원장 확정 2026-08-21).
//
//   ① 기출 인용 횟수  1~2회 = ★1 · 3~4회 = ★2 · 5회 이상 = ★3
//   ② ①에서 등급이 없는 판례(인용 0회) 중 최근 10년 이내 대법원 판결 = ★1
//   ③ 나머지 = 미부여(NULL)
//
// ★민법은 다른 기준이다(1회=미부여 / 2~3=★1 / 4~5=★2 / 6+=★3) — 여기서 다루지 않는다.
//   민법은 link-civil-problem-cases.mjs / link-problem-cases.mjs --importance 소관.
//
// 해석을 두 군데서 정했다 — 바꾸려면 여기를 고친다.
//   · "기출" = problems.origin === 'past_exam' (1차·2차 모두). 예상문제·AI 초안·기출변형은
//     기출이 아니므로 세지 않는다. 특허는 예상문제 링크가 120건이라 포함하면 등급이 부푼다.
//   · "횟수" = max(기출문제 링크 수, exam_1st_years + exam_2nd_years 개수).
//     두 표기가 같은 출제를 가리키는 판례가 141건이라 더하면 중복 계산된다. 반대로 연도
//     표기만 있고 링크가 없는 판례도 32건 있어 링크만 세면 누락된다 — 큰 쪽을 쓴다.
//
//   node scripts/precedents/apply-ip-case-importance.mjs                 # 3과목 dry-run
//   node scripts/precedents/apply-ip-case-importance.mjs --law patent
//   node scripts/precedents/apply-ip-case-importance.mjs --apply
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ONLY = argv.includes("--law") ? argv[argv.indexOf("--law") + 1] : null;
const LAWS = ONLY ? [ONLY] : ["patent", "trademark", "design"];

/** 최근 10년 — 실행 시점 기준(재실행하면 경계가 따라 움직인다). */
const RECENT_YEARS = 10;
const recentCutoff = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - RECENT_YEARS);
  return d.toISOString().slice(0, 10);
};

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

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

function gradeOf(cites, court, decidedAt, cutoff) {
  if (cites >= 5) return 3;
  if (cites >= 3) return 2;
  if (cites >= 1) return 1;
  if (court === "supreme" && (decidedAt ?? "") >= cutoff) return 1;
  return null;
}

async function runLaw(law, cutoff) {
  const cases = await pageAll(() =>
    sb
      .from("cases")
      .select("case_id, case_number, case_title, court, decided_at, importance, exam_1st_years, exam_2nd_years")
      .contains("subject_laws", [law])
      .is("deleted_at", null)
      .order("case_id"),
  );
  if (cases.length === 0) {
    console.log(`${law}: 판례 0건 — 할 일 없음.`);
    return;
  }

  const ids = cases.map((c) => c.case_id);
  const links = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb
      .from("problem_case_links")
      .select("case_id, problem_id")
      .in("case_id", ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    links.push(...(data ?? []));
  }
  const problemIds = [...new Set(links.map((l) => l.problem_id))];
  const problems = [];
  for (let i = 0; i < problemIds.length; i += 150) {
    const { data, error } = await sb
      .from("problems")
      .select("problem_id, origin")
      .in("problem_id", problemIds.slice(i, i + 150));
    if (error) throw new Error(error.message);
    problems.push(...(data ?? []));
  }
  const originOf = new Map(problems.map((p) => [p.problem_id, p.origin]));

  const pastByCase = new Map();
  for (const l of links) {
    if (originOf.get(l.problem_id) !== "past_exam") continue;
    if (!pastByCase.has(l.case_id)) pastByCase.set(l.case_id, new Set());
    pastByCase.get(l.case_id).add(l.problem_id);
  }

  const changes = [];
  const dist = { null: 0, 1: 0, 2: 0, 3: 0 };
  let byRecency = 0;
  for (const c of cases) {
    const linked = pastByCase.get(c.case_id)?.size ?? 0;
    const marked = (c.exam_1st_years ?? []).length + (c.exam_2nd_years ?? []).length;
    const cites = Math.max(linked, marked);
    const next = gradeOf(cites, c.court, c.decided_at, cutoff);
    dist[next ?? "null"] += 1;
    if (cites === 0 && next === 1) byRecency += 1;
    if ((c.importance ?? null) !== next) {
      changes.push({ caseId: c.case_id, caseNumber: c.case_number, from: c.importance ?? null, to: next, cites });
    }
  }

  console.log(
    `■ ${law} ${cases.length}건 → 미부여 ${dist.null} · ★1 ${dist[1]} · ★2 ${dist[2]} · ★3 ${dist[3]}` +
      `  (인용 0회지만 최근 10년 대법원이라 ★1 = ${byRecency}건 · 변경 ${changes.length}건)`,
  );
  if (!APPLY) return;

  // ★되돌릴 수 있게 현재 값을 먼저 남긴다.
  const backup = path.resolve(process.cwd(), `tmp/importance-backup-${law}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      cases.map((c) => ({ caseId: c.case_id, caseNumber: c.case_number, importance: c.importance })),
      null,
      2,
    ),
    "utf8",
  );
  console.log(`   백업 ${backup}`);

  // 중요도 조정은 추록 발행 대상이 아니다 — 개정 원장 억제.
  const { data: win, error: winErr } = await sb.rpc("fn_open_suppress_window", {
    p_minutes: 30,
    p_reason: `${law} 판례 중요도 산정(3과목 공통 기준)`,
    p_scope: ["precedent"],
  });
  if (winErr) throw new Error(winErr.message);
  try {
    for (const target of [null, 1, 2, 3]) {
      const batch = changes.filter((c) => c.to === target).map((c) => c.caseId);
      for (let i = 0; i < batch.length; i += 100) {
        const { error } = await sb
          .from("cases")
          .update({ importance: target })
          .in("case_id", batch.slice(i, i + 100));
        if (error) throw new Error(`중요도 갱신 실패: ${error.message}`);
      }
    }
  } finally {
    await sb.rpc("fn_close_suppress_window", { p_window_id: win });
  }
  console.log(`   ${changes.length}건 반영 완료.`);
}

const cutoff = recentCutoff();
console.log(`기준 — 1~2회 ★1 / 3~4회 ★2 / 5회+ ★3 · 인용 0회는 ${cutoff} 이후 대법원 판결만 ★1\n`);
for (const law of LAWS) await runLaw(law, cutoff);
if (!APPLY) console.log("\n--apply 를 붙이면 반영합니다.");
