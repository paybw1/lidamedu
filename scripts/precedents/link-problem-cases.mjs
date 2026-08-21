// 문항 ↔ 판례 상호 링크 + 중요도 재산정 — 과목 공용 (원장 지시 2026-08-21).
//
// link-civil-problem-cases.mjs 를 과목 공용으로 일반화한 것.
//
//   ① 문항의 지문·선지·해설에서 사건번호를 뽑아 그 과목 판례와 매칭 → problem_case_links insert
//      (relation_type='cited' 한 방향만 저장, 조회에서 양방향 — 개발 원칙 Layer 2-9)
//   ② (--importance) 인용 문항 수로 중요도 재산정 — ★민법 전용
//      1회 이하 = 미부여(NULL) / 2~3 = ★1 / 4~5 = ★2 / 6+ = ★3
//   ③ (--null-unexamined) 기출 흔적이 전혀 없는 판례만 중요도 미부여(NULL)로
//      기출 흔적 = problem_case_links 1건 이상 OR exam_1st_years OR exam_2nd_years
//
// ★★②는 민법 전용이다 — 원장 확정 2026-08-21 "기출 인용으로 제한하는 건 민법만".
//   특허·상표·디자인 판례는 교재 주제배치로 적재한 것이라 중요도도 교재 기반이다.
//   인용 횟수로 덮으면 안 된다: 실제로 한 번 적용했다가 상표 356건 중 321건이
//   미부여가 되어 백업으로 되돌렸다. 이 과목들은 --importance 없이 돌린다.
// ★③은 등급을 재산정하지 않는다 — 기출이 아예 없는 판례의 기본값 ★1(적재 시
//   일괄 부여분)만 걷어낸다. 교재 기반 ★2·★3 은 건드리지 않는다.
// ★링크는 멱등(이미 있으면 건너뜀). 문항을 추가 적재하면 다시 돌린다.
//
//   node scripts/precedents/link-problem-cases.mjs --law patent            # dry-run
//   node scripts/precedents/link-problem-cases.mjs --law patent --apply    # 링크만
//   node scripts/precedents/link-problem-cases.mjs --law patent --apply --null-unexamined
//   node scripts/precedents/link-problem-cases.mjs --law civil --apply --importance
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const WITH_IMPORTANCE = argv.includes("--importance");
const NULL_UNEXAMINED = argv.includes("--null-unexamined");
const LAW = argv.includes("--law") ? argv[argv.indexOf("--law") + 1] : null;
const BATCH = 200;

if (!LAW) {
  console.error("사용: --law <patent|trademark|design|civil> [--apply] [--importance]");
  process.exit(1);
}
const NOTE = `${LAW}-exam-scan`;
const BACKUP = path.resolve(process.cwd(), `tmp/importance-backup-${LAW}.json`);

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// 사건번호 — 연도 + 부호 + 일련번호. ★"제133조의2" 같은 조문 표기를 배제한다
//   (부호 자리에 조·항·호·목이 오면 사건번호가 아니다).
const CASE_RE = /(\d{2,4})(?!조|항|호|목)\s*([가-힣]{1,3})\s*(\d{1,6})/g;

// 민법과 동일한 중요도 기준 (원장 확정 2026-08-20).
const importanceOf = (n) => (n >= 6 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : null);

async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await build().range(from, from + 499);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 500) break;
  }
  return out;
}

async function main() {
  const { data: law, error: lawErr } = await sb
    .from("laws")
    .select("law_id")
    .eq("law_code", LAW)
    .maybeSingle();
  if (lawErr) throw new Error(lawErr.message);
  if (!law) throw new Error(`법령 없음: ${LAW}`);

  const probs = await pageAll(() =>
    sb
      .from("problems")
      .select("problem_id, body_md, explanation_md, main_case_number")
      .eq("law_id", law.law_id)
      .is("deleted_at", null)
      .order("problem_id"),
  );
  const ids = probs.map((p) => p.problem_id);
  const choices = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb
      .from("problem_choices")
      .select("problem_id, body_md, explanation_md, related_case_number")
      .in("problem_id", ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    choices.push(...(data ?? []));
  }
  const choiceText = new Map();
  for (const c of choices) {
    choiceText.set(
      c.problem_id,
      `${choiceText.get(c.problem_id) ?? ""}\n${c.body_md ?? ""}\n${c.explanation_md ?? ""}\n${c.related_case_number ?? ""}`,
    );
  }

  // 사건번호 → 인용 문항 집합
  const cited = new Map();
  for (const p of probs) {
    const text = [
      p.body_md ?? "",
      p.explanation_md ?? "",
      p.main_case_number ?? "",
      choiceText.get(p.problem_id) ?? "",
    ].join("\n");
    for (const m of text.matchAll(CASE_RE)) {
      const raw = `${m[1]}${m[2]}${m[3]}`;
      if (!cited.has(raw)) cited.set(raw, new Set());
      cited.get(raw).add(p.problem_id);
    }
  }

  // 과목 판례 전량 — 인용 0회 판례도 중요도 재산정 대상이라 전부 읽는다.
  const cases = await pageAll(() =>
    sb
      .from("cases")
      .select("case_id, case_number, importance, exam_1st_years, exam_2nd_years")
      .contains("subject_laws", [LAW])
      .is("deleted_at", null)
      .order("case_id"),
  );
  const caseIdOf = new Map(cases.map((c) => [c.case_number, c.case_id]));

  // 이미 있는 링크는 건너뛴다(멱등).
  const caseIds = cases.map((c) => c.case_id);
  const have = new Set();
  for (let i = 0; i < caseIds.length; i += 100) {
    const { data, error } = await sb
      .from("problem_case_links")
      .select("problem_id, case_id")
      .in("case_id", caseIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const l of data ?? []) have.add(`${l.problem_id}:${l.case_id}`);
  }

  const rows = [];
  let unmatched = 0;
  for (const [raw, set] of cited) {
    const caseId = caseIdOf.get(raw);
    if (!caseId) {
      unmatched += 1;
      continue;
    }
    for (const problemId of set) {
      if (have.has(`${problemId}:${caseId}`)) continue;
      rows.push({ problem_id: problemId, case_id: caseId, relation_type: "cited", note: NOTE });
    }
  }

  // 중요도 — 새 링크 + 기존 링크를 합친 문항 수로 센다.
  const linkedProblems = new Map(); // caseId → Set(problemId)
  for (const key of have) {
    const [problemId, caseId] = key.split(":");
    if (!linkedProblems.has(caseId)) linkedProblems.set(caseId, new Set());
    linkedProblems.get(caseId).add(problemId);
  }
  for (const r of rows) {
    if (!linkedProblems.has(r.case_id)) linkedProblems.set(r.case_id, new Set());
    linkedProblems.get(r.case_id).add(r.problem_id);
  }
  const impChanges = [];
  const dist = { null: 0, 1: 0, 2: 0, 3: 0 };
  for (const c of cases) {
    const n = linkedProblems.get(c.case_id)?.size ?? 0;
    const next = importanceOf(n);
    dist[next ?? "null"] += 1;
    if ((c.importance ?? null) !== next) {
      impChanges.push({ caseId: c.case_id, caseNumber: c.case_number, from: c.importance ?? null, to: next, cites: n });
    }
  }

  console.log(
    `${LAW} — 문항 ${probs.length} · 인용 사건번호 ${cited.size}종 · 판례 매칭 ${cited.size - unmatched}종 (미매칭 ${unmatched})`,
  );
  console.log(`링크: 새로 ${rows.length}건 · 기존 ${have.size}건`);
  console.log(
    `중요도 재산정(--importance) 후 분포: 미부여 ${dist.null} · ★1 ${dist[1]} · ★2 ${dist[2]} · ★3 ${dist[3]} (변경 ${impChanges.length}건)`,
  );

  // ③ 기출 흔적이 전혀 없는 판례 — 적재 시 일괄로 들어간 기본값 ★1 만 걷어낸다.
  const unexamined = cases.filter(
    (c) =>
      !(linkedProblems.get(c.case_id)?.size ?? 0) &&
      (c.exam_1st_years ?? []).length === 0 &&
      (c.exam_2nd_years ?? []).length === 0 &&
      c.importance != null,
  );
  const byGrade = unexamined.reduce((acc, c) => {
    acc[c.importance] = (acc[c.importance] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `기출 흔적 없는 판례(--null-unexamined): ${unexamined.length}건 — ${
      Object.entries(byGrade)
        .map(([g, n]) => `★${g} ${n}`)
        .join(" · ") || "없음"
    }`,
  );

  if (!APPLY) {
    console.log("\n--apply 를 붙이면 링크를 반영합니다. 중요도까지 바꾸려면 --importance 를 함께.");
    return;
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await sb.from("problem_case_links").insert(rows.slice(i, i + BATCH));
    if (error) throw new Error(`링크 insert 실패: ${error.message}`);
  }
  console.log(`링크 ${rows.length}건 반영.`);

  if (NULL_UNEXAMINED) {
    await backupImportance(cases);
    await withSuppressWindow(`${LAW} 기출 없는 판례 중요도 미부여`, async () => {
      const ids = unexamined.map((c) => c.case_id);
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await sb
          .from("cases")
          .update({ importance: null })
          .in("case_id", ids.slice(i, i + 100));
        if (error) throw new Error(`중요도 갱신 실패: ${error.message}`);
      }
    });
    console.log(`기출 없는 판례 ${unexamined.length}건 중요도 미부여 반영.`);
  }

  if (!WITH_IMPORTANCE) {
    if (!NULL_UNEXAMINED) console.log("중요도는 건드리지 않았습니다(--importance 미지정).");
    return;
  }

  await backupImportance(cases);
  await withSuppressWindow(`${LAW} 판례 중요도 재산정(기출 인용 기준)`, async () => {
    for (const target of [null, 1, 2, 3]) {
      const batch = impChanges.filter((c) => c.to === target).map((c) => c.caseId);
      for (let i = 0; i < batch.length; i += 100) {
        const { error } = await sb
          .from("cases")
          .update({ importance: target })
          .in("case_id", batch.slice(i, i + 100));
        if (error) throw new Error(`중요도 갱신 실패: ${error.message}`);
      }
    }
  });
  console.log(`중요도 ${impChanges.length}건 반영 완료.`);
}

/** ★중요도를 덮기 전 현재 값을 남긴다 — 되돌릴 유일한 수단이다. */
let backedUp = false;
async function backupImportance(cases) {
  if (backedUp) return;
  fs.writeFileSync(
    BACKUP,
    JSON.stringify(
      cases.map((c) => ({ caseId: c.case_id, caseNumber: c.case_number, importance: c.importance })),
      null,
      2,
    ),
    "utf8",
  );
  backedUp = true;
  console.log(`중요도 백업 ${BACKUP}`);
}

/** 적재·정정은 추록 발행 대상이 아니다 — 개정 원장을 억제하고 실행한다. */
async function withSuppressWindow(reason, fn) {
  const { data: win, error } = await sb.rpc("fn_open_suppress_window", {
    p_minutes: 30,
    p_reason: reason,
    p_scope: ["precedent"],
  });
  if (error) throw new Error(error.message);
  try {
    await fn();
  } finally {
    await sb.rpc("fn_close_suppress_window", { p_window_id: win });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
