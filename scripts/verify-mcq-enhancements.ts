// §C 자동 검증 — 응시·결과 화면 고도화 helper 안전성 + flag 멱등 + 채점 코어 import.
//
// 검증 항목:
//   1) 채점 코어 함수 import 가능 (시그니처 변경 0 확인용)
//   2) 빈 입력에서 helper 안전성 — getEvidenceForWrongProblems([]) → 빈 객체
//   3) 존재하지 않는 sessionId 로 getSessionFlagSet / getSessionWeakNodes / getQuizSessionResult → 빈/null
//   4) flag toggle 멱등 — 임시 quiz_session + problem 1건 만들고 toggle 2회/2회 → DB 상태 정합
//   5) cleanup
//
// 사용: npx tsx scripts/verify-mcq-enhancements.ts

import "dotenv/config";

import adminClient from "../app/core/lib/supa-admin-client.server";
import {
  getEvidenceForWrongProblems,
  getPreviousPackScores,
  getQuizSessionResult,
  getSessionFlagSet,
  getSessionWeakNodes,
} from "../app/features/study/queries.server";
import {
  getExamAttemptBreakdown,
  getExamAttemptRanking,
} from "../app/features/mcq-exams/queries.server";
import {
  getPackAttemptRanking,
  getPackResultStats,
} from "../app/features/mcq-packs/queries.server";

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";
const FAKE_USER = "11111111-1111-1111-1111-111111111111";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: Check[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  process.stdout.write(`  ${ok ? "✓" : "✗"} ${name}${detail ? "  " + detail : ""}\n`);
}

async function step1_coreImports(): Promise<void> {
  process.stdout.write(`\n=== ① 채점 코어 함수 import (시그니처 변경 0 확인) ===\n`);
  record("getPackResultStats import", typeof getPackResultStats === "function");
  record("getPackAttemptRanking import", typeof getPackAttemptRanking === "function");
  record("getExamAttemptBreakdown import", typeof getExamAttemptBreakdown === "function");
  record("getExamAttemptRanking import", typeof getExamAttemptRanking === "function");
}

async function step2_helperEmptyInput(): Promise<void> {
  process.stdout.write(`\n=== ② 빈/잘못된 input — helper 안전성 ===\n`);

  // getEvidenceForWrongProblems([]) → {}
  const ev = await getEvidenceForWrongProblems(adminClient, FAKE_USER, FAKE_UUID, []);
  record(
    "getEvidenceForWrongProblems([]) → 빈 객체",
    Object.keys(ev).length === 0,
  );

  // getSessionFlagSet — 존재 안 하는 session → []
  const flags = await getSessionFlagSet(adminClient, FAKE_USER, FAKE_UUID);
  record("getSessionFlagSet(fake) → []", flags.length === 0);

  // getSessionWeakNodes — 존재 안 하는 session → []
  const wn = await getSessionWeakNodes(adminClient, FAKE_USER, FAKE_UUID);
  record("getSessionWeakNodes(fake) → []", wn.length === 0);

  // getPreviousPackScores — 존재 안 하는 pack → []
  const prev = await getPreviousPackScores(
    adminClient,
    FAKE_USER,
    FAKE_UUID,
    FAKE_UUID,
    5,
  );
  record("getPreviousPackScores(fake) → []", prev.length === 0);

  // getQuizSessionResult — 존재 안 하는 session → null
  const qsr = await getQuizSessionResult(adminClient, FAKE_USER, FAKE_UUID);
  record("getQuizSessionResult(fake) → null", qsr === null);
}

async function step3_flagToggle(): Promise<void> {
  process.stdout.write(`\n=== ③ flag toggle 멱등 (실 DB) ===\n`);

  // 임시 quiz_session 만들기 — 실제 user/profile/problem 한 건 필요.
  // approved problem 1건 + 최근 staff 1건 가져옴.
  const { data: user } = await adminClient
    .from("profiles")
    .select("profile_id")
    .limit(1)
    .maybeSingle();
  const { data: prob } = await adminClient
    .from("problems")
    .select("problem_id, law_id")
    .eq("review_status", "approved")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!user || !prob) {
    record("prereq — profile/problem 1건 필요", false, "skip");
    return;
  }

  // 임시 quiz_session — mode='study' / scope_type='filter'
  const { data: session, error: sErr } = await adminClient
    .from("quiz_sessions")
    .insert({
      user_id: user.profile_id,
      mode: "study",
      law_code: "patent",
      scope_type: "filter",
      scope_payload: { test: "verify-script" },
      problem_ids: [prob.problem_id],
      time_limit_sec: null,
    })
    .select("session_id")
    .single();
  if (sErr || !session) {
    record("temp quiz_session insert", false, sErr?.message);
    return;
  }
  const tempSessionId = session.session_id;

  try {
    // flag insert (toggle on)
    const { error: e1 } = await adminClient.from("user_quiz_flags").insert({
      session_id: tempSessionId,
      problem_id: prob.problem_id,
      user_id: user.profile_id,
    });
    record("flag insert (on)", !e1, e1?.message);

    // 멱등 — 다시 insert 시도 → 23505 (duplicate) 무시 가능
    const { error: e2 } = await adminClient.from("user_quiz_flags").insert({
      session_id: tempSessionId,
      problem_id: prob.problem_id,
      user_id: user.profile_id,
    });
    const idempotent = e2?.code === "23505";
    record("flag insert 멱등 (duplicate=23505)", idempotent, e2?.message);

    // getSessionFlagSet 결과 — 1건
    const flags = await getSessionFlagSet(
      adminClient,
      user.profile_id,
      tempSessionId,
    );
    record(
      "getSessionFlagSet → 1건",
      flags.length === 1 && flags[0] === prob.problem_id,
    );

    // toggle off (delete)
    const { error: e3 } = await adminClient
      .from("user_quiz_flags")
      .delete()
      .eq("session_id", tempSessionId)
      .eq("problem_id", prob.problem_id)
      .eq("user_id", user.profile_id);
    record("flag delete (off)", !e3, e3?.message);

    // getSessionFlagSet 결과 — 0건
    const flags2 = await getSessionFlagSet(
      adminClient,
      user.profile_id,
      tempSessionId,
    );
    record("getSessionFlagSet → 0건", flags2.length === 0);
  } finally {
    // cleanup
    await adminClient
      .from("user_quiz_flags")
      .delete()
      .eq("session_id", tempSessionId);
    await adminClient
      .from("quiz_sessions")
      .delete()
      .eq("session_id", tempSessionId);
    process.stdout.write(`  · cleanup 완료\n`);
  }
}

async function main(): Promise<void> {
  await step1_coreImports();
  await step2_helperEmptyInput();
  await step3_flagToggle();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  process.stdout.write(`\n=== 종합 ===\n`);
  process.stdout.write(`  ${passed} 통과 / ${failed} 실패 (총 ${results.length})\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
