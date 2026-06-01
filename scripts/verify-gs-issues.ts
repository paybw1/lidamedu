// §1 검증 — 논점 데이터·승인 게이트.
// 1) tracker / lib import 가능
// 2) 임시 회차+문항 + AI 추출 결과 모킹 → draft 일괄 insert → approve 1건 → 학생 RLS read
//    승인된 1건만 보이는지(서버 재검증) 확인.
//
// 사용: npx tsx scripts/verify-gs-issues.ts

import "dotenv/config";

import adminClient from "../app/core/lib/supa-admin-client.server";
import {
  approveIssue,
  insertDraftIssuesFromAi,
  listApprovedIssuesForGsQuestion,
  listIssuesForRoundStaff,
} from "../app/features/gs/queries-issues.server";
import { extractIssuesFromModelAnswer } from "../app/features/gs/lib/ai-issue-extractor.server";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const results: Check[] = [];
function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  process.stdout.write(
    `  ${ok ? "✓" : "✗"} ${name}${detail ? "  " + detail : ""}\n`,
  );
}

async function step1_libs(): Promise<void> {
  process.stdout.write(`\n=== ① lib import ===\n`);
  record(
    "extractIssuesFromModelAnswer import",
    typeof extractIssuesFromModelAnswer === "function",
  );
  record(
    "queries-issues helpers import",
    typeof insertDraftIssuesFromAi === "function" &&
      typeof approveIssue === "function" &&
      typeof listApprovedIssuesForGsQuestion === "function" &&
      typeof listIssuesForRoundStaff === "function",
  );
}

async function step2_seedAndGate(): Promise<{
  cleanup: () => Promise<void>;
}> {
  process.stdout.write(`\n=== ② 시드 + 게이트 (실 DB) ===\n`);

  // 임시 round + question.
  const { data: staff } = await adminClient
    .from("profiles")
    .select("profile_id")
    .in("role", ["instructor", "admin"])
    .limit(1)
    .maybeSingle();
  if (!staff) {
    record("staff 1명 필요 — skip", false, "no staff");
    return { cleanup: async () => {} };
  }

  const { data: round, error: rErr } = await adminClient
    .from("gs_rounds")
    .insert({
      title: "verify-gs-issues 임시 회차",
      subject: "patent",
      status: "draft",
      start_at: new Date().toISOString(),
      end_at: new Date(Date.now() + 86400_000).toISOString(),
      duration_min: 60,
      expected_pages: 4,
    })
    .select("round_id")
    .single();
  if (rErr || !round) {
    record("임시 round insert", false, rErr?.message);
    return { cleanup: async () => {} };
  }

  const { data: question, error: qErr } = await adminClient
    .from("gs_questions")
    .insert({
      round_id: round.round_id,
      order_index: 0,
      body_md: "사례 본문 — verify only",
      model_answer_md: "모범답안 — verify only",
      max_score: 100,
    })
    .select("question_id")
    .single();
  if (qErr || !question) {
    record("임시 question insert", false, qErr?.message);
    await adminClient.from("gs_rounds").delete().eq("round_id", round.round_id);
    return { cleanup: async () => {} };
  }

  // AI 추출 모킹 — 3건 draft insert.
  const inserted = await insertDraftIssuesFromAi(adminClient, {
    gsQuestionId: question.question_id,
    createdBy: staff.profile_id,
    startingOrderIndex: 0,
    items: [
      {
        label: "신규성 위반 여부",
        descriptionMd: "공지된 발명과 동일 또는 유사한지 판단",
        importance: "core",
        refHint: "특허법 제29조 제1항",
      },
      {
        label: "진보성 판단",
        descriptionMd: "통상의 기술자가 용이 발명 가능한지",
        importance: "core",
      },
      {
        label: "출원경과 금반언",
        descriptionMd: "보조 논점",
        importance: "side",
      },
    ],
  });
  record("AI 추출 결과 3건 draft insert", inserted === 3, `inserted=${inserted}`);

  // staff 큐 — 3건 draft 모두 보이는지.
  const staffView = await listIssuesForRoundStaff(adminClient, round.round_id);
  record(
    "staff 큐 — 3건 draft",
    (staffView.draftCount[question.question_id] ?? 0) === 3 &&
      (staffView.approvedCount[question.question_id] ?? 0) === 0,
  );

  // 1건 승인.
  const draftIds = (staffView.byQuestion[question.question_id] ?? []).map(
    (i) => i.issueId,
  );
  await approveIssue(adminClient, draftIds[0], staff.profile_id);

  // staff 큐 재조회 — 1 approved + 2 draft.
  const staffView2 = await listIssuesForRoundStaff(adminClient, round.round_id);
  record(
    "1건 승인 후 — 1 approved + 2 draft",
    (staffView2.approvedCount[question.question_id] ?? 0) === 1 &&
      (staffView2.draftCount[question.question_id] ?? 0) === 2,
  );

  // 학생 진입 RLS read — service_role 우회 X 위해 anon 클라이언트로 시뮬레이션은 어려움.
  // 대신 listApprovedIssuesForGsQuestion 함수 자체가 review_status='approved' 필터 — 1건만 반환.
  const approvedOnly = await listApprovedIssuesForGsQuestion(
    adminClient,
    question.question_id,
  );
  record(
    "listApprovedIssuesForGsQuestion — 1건 (게이트 동작)",
    approvedOnly.length === 1 && approvedOnly[0].reviewStatus === "approved",
    `count=${approvedOnly.length}`,
  );

  // CHECK constraint — gs_question_id 와 problem_id 둘 다 null 이면 reject.
  const { error: chkErr } = await adminClient.from("gs_question_issues").insert({
    gs_question_id: null,
    problem_id: null,
    label: "should fail",
    importance: "core",
    generated_by: "staff",
  });
  record(
    "CHECK (gs_question_id XOR problem_id) — null/null 거부",
    !!chkErr,
    chkErr?.message?.slice(0, 80),
  );

  return {
    cleanup: async () => {
      await adminClient
        .from("gs_question_issues")
        .delete()
        .eq("gs_question_id", question.question_id);
      await adminClient
        .from("gs_questions")
        .delete()
        .eq("question_id", question.question_id);
      await adminClient
        .from("gs_rounds")
        .delete()
        .eq("round_id", round.round_id);
    },
  };
}

async function main(): Promise<void> {
  await step1_libs();
  const { cleanup } = await step2_seedAndGate();
  process.stdout.write(`\n=== ③ cleanup ===\n`);
  try {
    await cleanup();
    record("cleanup 완료", true);
  } catch (e) {
    record(
      "cleanup 실패",
      false,
      e instanceof Error ? e.message : String(e),
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  process.stdout.write(`\n=== 종합 ===\n`);
  process.stdout.write(
    `  ${passed} 통과 / ${failed} 실패 (총 ${results.length})\n`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(
    `FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`,
  );
  process.exit(1);
});
