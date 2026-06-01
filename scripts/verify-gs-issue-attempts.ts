// §2 검증 — user_issue_attempts CRUD + 게이트.
//
// 사용: npx tsx scripts/verify-gs-issue-attempts.ts

import "dotenv/config";

import adminClient from "../app/core/lib/supa-admin-client.server";
import {
  approveIssue,
  insertDraftIssuesFromAi,
} from "../app/features/gs/queries-issues.server";
import {
  type SelfCheck,
  getIssueQuestionForStudent,
  listIssueQuestionsForStudent,
  resetIssueAttempt,
  upsertIssueAttempt,
} from "../app/features/gs/queries-issue-attempts.server";

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

async function main(): Promise<void> {
  // 사전 — staff + student 1명씩, 임시 round + question 2개 (1개 승인된 논점, 1개 draft only).
  const { data: staff } = await adminClient
    .from("profiles")
    .select("profile_id")
    .in("role", ["instructor", "admin"])
    .limit(1)
    .maybeSingle();
  const { data: student } = await adminClient
    .from("profiles")
    .select("profile_id")
    .eq("role", "student")
    .limit(1)
    .maybeSingle();
  if (!staff || !student) {
    record("staff + student 필요", false);
    process.exit(1);
  }

  // 회차 + 문항 2개.
  const { data: round } = await adminClient
    .from("gs_rounds")
    .insert({
      title: "verify-issue-attempts 임시",
      subject: "patent",
      status: "draft",
      start_at: new Date().toISOString(),
      end_at: new Date(Date.now() + 86400_000).toISOString(),
      duration_min: 60,
      expected_pages: 4,
    })
    .select("round_id")
    .single();
  if (!round) {
    record("round insert", false);
    process.exit(1);
  }

  const { data: q1 } = await adminClient
    .from("gs_questions")
    .insert({
      round_id: round.round_id,
      order_index: 0,
      body_md: "사례 본문 1 — 신규성/진보성 다툼",
      model_answer_md: "모범답안 1",
      max_score: 100,
    })
    .select("question_id")
    .single();
  const { data: q2 } = await adminClient
    .from("gs_questions")
    .insert({
      round_id: round.round_id,
      order_index: 1,
      body_md: "사례 본문 2 — 미승인 논점만",
      model_answer_md: "모범답안 2",
      max_score: 100,
    })
    .select("question_id")
    .single();
  if (!q1 || !q2) {
    record("q1/q2 insert", false);
    process.exit(1);
  }

  // q1 에 논점 3개 — 2 승인 + 1 draft.
  await insertDraftIssuesFromAi(adminClient, {
    gsQuestionId: q1.question_id,
    createdBy: staff.profile_id,
    startingOrderIndex: 0,
    items: [
      {
        label: "신규성 위반",
        descriptionMd: "공지된 발명과 동일",
        importance: "core",
      },
      {
        label: "진보성",
        descriptionMd: "통상의 기술자 용이",
        importance: "core",
      },
      {
        label: "출원경과",
        descriptionMd: "부차 논점",
        importance: "side",
      },
    ],
  });
  // q2 에 1건 draft (승인 X).
  await insertDraftIssuesFromAi(adminClient, {
    gsQuestionId: q2.question_id,
    createdBy: staff.profile_id,
    startingOrderIndex: 0,
    items: [
      {
        label: "draft only",
        descriptionMd: "승인 안 됨",
        importance: "core",
      },
    ],
  });

  const { data: q1IssueRows } = await adminClient
    .from("gs_question_issues")
    .select("issue_id")
    .eq("gs_question_id", q1.question_id);
  const q1Ids = (q1IssueRows ?? []).map((r) => r.issue_id);
  // q1 의 첫 2건 승인.
  await approveIssue(adminClient, q1Ids[0], staff.profile_id);
  await approveIssue(adminClient, q1Ids[1], staff.profile_id);

  process.stdout.write(`\n=== ① 색인 게이트 ===\n`);
  const items = await listIssueQuestionsForStudent(adminClient, student.profile_id);
  const q1Item = items.find((it) => it.gsQuestionId === q1.question_id);
  const q2Item = items.find((it) => it.gsQuestionId === q2.question_id);
  record(
    "q1 (승인된 논점 ≥1) — 색인 노출",
    !!q1Item && q1Item.approvedIssueCount === 2,
    `q1.count=${q1Item?.approvedIssueCount}`,
  );
  record(
    "q2 (승인 논점 0) — 색인 미노출",
    !q2Item,
  );

  process.stdout.write(`\n=== ② 단건 진입 게이트 ===\n`);
  const q1Ctx = await getIssueQuestionForStudent(
    adminClient,
    student.profile_id,
    q1.question_id,
  );
  record("q1 — getIssueQuestionForStudent 정상", !!q1Ctx);
  const q2Ctx = await getIssueQuestionForStudent(
    adminClient,
    student.profile_id,
    q2.question_id,
  );
  record("q2 — null (게이트 차단)", q2Ctx === null);

  process.stdout.write(`\n=== ③ autosave → submit → self_check → reset ===\n`);
  // autosave (insert).
  const a1 = await upsertIssueAttempt(adminClient, {
    userId: student.profile_id,
    gsQuestionId: q1.question_id,
    studentIssuesMd: "신규성 위반\n진보성",
  });
  record("autosave insert", !!a1.attemptId && a1.submittedAt === null);

  // autosave (update — text 갱신).
  const a2 = await upsertIssueAttempt(adminClient, {
    userId: student.profile_id,
    gsQuestionId: q1.question_id,
    studentIssuesMd: "신규성 위반\n진보성 판단\n출원경과",
  });
  record(
    "autosave update — 같은 attempt_id 유지",
    a2.attemptId === a1.attemptId,
  );

  // submit.
  const a3 = await upsertIssueAttempt(adminClient, {
    userId: student.profile_id,
    gsQuestionId: q1.question_id,
    studentIssuesMd: "신규성 위반\n진보성 판단\n출원경과",
    submittedAt: new Date().toISOString(),
  });
  record("submit — submittedAt 설정", !!a3.submittedAt);

  // self_check.
  const sc: SelfCheck = {
    hits: [q1Ids[0], q1Ids[1]],
    missed: [],
    wrong: [],
  };
  const a4 = await upsertIssueAttempt(adminClient, {
    userId: student.profile_id,
    gsQuestionId: q1.question_id,
    selfCheck: sc,
    selfCheckedAt: new Date().toISOString(),
  });
  record(
    "self_check 저장 — hits 2건 / selfCheckedAt 설정",
    !!a4.selfCheckedAt &&
      Array.isArray(a4.selfCheck?.hits) &&
      a4.selfCheck?.hits.length === 2,
  );

  // reset.
  await resetIssueAttempt(adminClient, student.profile_id, q1.question_id);
  const a5 = await getIssueQuestionForStudent(
    adminClient,
    student.profile_id,
    q1.question_id,
  );
  record(
    "reset — student_issues_md='' + submittedAt=null + selfCheckedAt=null",
    a5?.myAttempt?.studentIssuesMd === "" &&
      a5?.myAttempt?.submittedAt === null &&
      a5?.myAttempt?.selfCheckedAt === null,
  );

  process.stdout.write(`\n=== ④ cleanup ===\n`);
  await adminClient
    .from("user_issue_attempts")
    .delete()
    .eq("user_id", student.profile_id)
    .eq("gs_question_id", q1.question_id);
  await adminClient
    .from("gs_question_issues")
    .delete()
    .in("gs_question_id", [q1.question_id, q2.question_id]);
  await adminClient
    .from("gs_questions")
    .delete()
    .in("question_id", [q1.question_id, q2.question_id]);
  await adminClient.from("gs_rounds").delete().eq("round_id", round.round_id);
  record("cleanup", true);

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
