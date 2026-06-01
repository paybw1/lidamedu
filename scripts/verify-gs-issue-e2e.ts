// §4 통합 E2E 검증 — 강사 추출+승인 → 학생 작성+제출+자기채점 → AI 분석(모킹) → ref deep link.
//
// 사용: npx tsx scripts/verify-gs-issue-e2e.ts

import "dotenv/config";

import adminClient from "../app/core/lib/supa-admin-client.server";
import {
  approveIssue,
  getRefLinksForIssues,
  insertDraftIssuesFromAi,
  listApprovedIssuesForGsQuestion,
} from "../app/features/gs/queries-issues.server";
import {
  type AiAnalysis,
  type SelfCheck,
  getIssueQuestionForStudent,
  listIssueQuestionsForStudent,
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

  // 임시 회차 + 문항.
  const { data: round } = await adminClient
    .from("gs_rounds")
    .insert({
      title: "verify-issue-e2e",
      subject: "patent",
      status: "draft",
      start_at: new Date().toISOString(),
      end_at: new Date(Date.now() + 86400_000).toISOString(),
      duration_min: 60,
      expected_pages: 4,
    })
    .select("round_id")
    .single();
  const { data: q } = await adminClient
    .from("gs_questions")
    .insert({
      round_id: round!.round_id,
      order_index: 0,
      body_md: "사례 — A가 B에게 특허받은 발명의 진보성을 다툰다",
      model_answer_md: "모범답안 줄글",
      max_score: 100,
    })
    .select("question_id")
    .single();

  // 강사 — 논점 3건 draft + 1건 승인 + 1건 ref_article_id 연결.
  process.stdout.write(`\n=== ① 강사 — 추출 + 승인 + ref link ===\n`);
  await insertDraftIssuesFromAi(adminClient, {
    gsQuestionId: q!.question_id,
    createdBy: staff.profile_id,
    startingOrderIndex: 0,
    items: [
      { label: "신규성", descriptionMd: "공지 동일", importance: "core" },
      { label: "진보성", descriptionMd: "용이 발명", importance: "core" },
      { label: "출원경과", descriptionMd: "부차", importance: "side" },
    ],
  });

  const { data: issueRows } = await adminClient
    .from("gs_question_issues")
    .select("issue_id, label")
    .eq("gs_question_id", q!.question_id)
    .order("order_index");
  const issues = issueRows ?? [];
  for (const i of issues) await approveIssue(adminClient, i.issue_id, staff.profile_id);

  // ref_article_id 연결 — "신규성" 논점에 특허법 제29조 (있으면).
  const { data: article } = await adminClient
    .from("articles")
    .select("article_id, laws!inner(law_code)")
    .eq("laws.law_code", "patent")
    .eq("level", "article")
    .eq("article_number", "29")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (article) {
    await adminClient
      .from("gs_question_issues")
      .update({ ref_article_id: article.article_id })
      .eq("issue_id", issues[0].issue_id);
    record("신규성 논점에 ref_article_id 연결", true);
  } else {
    record("articles 시드 부재 — ref_article_id 검증 skip", true);
  }

  const approved = await listApprovedIssuesForGsQuestion(adminClient, q!.question_id);
  record("approved 논점 3건", approved.length === 3);

  process.stdout.write(`\n=== ② 학생 — 색인 + 게이트 + 작성 흐름 ===\n`);
  const indexItems = await listIssueQuestionsForStudent(
    adminClient,
    student.profile_id,
  );
  record(
    "색인에 이 회차 문항 노출",
    indexItems.some((it) => it.gsQuestionId === q!.question_id),
  );

  // autosave + submit.
  await upsertIssueAttempt(adminClient, {
    userId: student.profile_id,
    gsQuestionId: q!.question_id,
    studentIssuesMd: "신규성 위반 — 제29조 제1항\n진보성",
  });
  const submitted = await upsertIssueAttempt(adminClient, {
    userId: student.profile_id,
    gsQuestionId: q!.question_id,
    studentIssuesMd: "신규성 위반 — 제29조 제1항\n진보성",
    submittedAt: new Date().toISOString(),
  });
  record("submit", !!submitted.submittedAt);

  // 자기채점 — 2건 짚음, 1건 빠뜨림 (출원경과 부차).
  const sc: SelfCheck = {
    hits: [issues[0].issue_id, issues[1].issue_id],
    missed: [issues[2].issue_id],
    wrong: [],
  };
  await upsertIssueAttempt(adminClient, {
    userId: student.profile_id,
    gsQuestionId: q!.question_id,
    selfCheck: sc,
    selfCheckedAt: new Date().toISOString(),
  });

  // ai_analysis 모킹 저장.
  const fakeAi: AiAnalysis = {
    hits: [
      { issueId: issues[0].issue_id, evidence: "'신규성 위반' 직접 언급" },
      { issueId: issues[1].issue_id },
    ],
    missed: [{ issueId: issues[2].issue_id, severity: "side" }],
    extras: [],
  };
  await adminClient
    .from("user_issue_attempts")
    .update({
      ai_analysis: fakeAi as unknown as never,
      ai_analyzed_at: new Date().toISOString(),
    })
    .eq("user_id", student.profile_id)
    .eq("gs_question_id", q!.question_id);

  // get 으로 다 같이 들어오는지.
  const ctx = await getIssueQuestionForStudent(
    adminClient,
    student.profile_id,
    q!.question_id,
  );
  record(
    "결과 단계 attempt — selfCheck + aiAnalysis 모두 hydrate",
    !!ctx?.myAttempt?.selfCheck &&
      !!ctx?.myAttempt?.aiAnalysis &&
      ctx.myAttempt.selfCheck.hits.length === 2 &&
      ctx.myAttempt.aiAnalysis.hits.length === 2,
  );

  process.stdout.write(`\n=== ③ 빠뜨린 논점 → ref deep link ===\n`);
  const refLinks = await getRefLinksForIssues(adminClient, approved);
  if (article) {
    record(
      "신규성 issue → article deep link 메타 포함",
      !!refLinks[issues[0].issue_id]?.article &&
        refLinks[issues[0].issue_id].article!.lawCode === "patent",
      `lawCode=${refLinks[issues[0].issue_id]?.article?.lawCode}, article#=${refLinks[issues[0].issue_id]?.article?.articleNumber}`,
    );
  } else {
    record("articles 시드 부재 — deep link 메타 skip", true);
  }

  process.stdout.write(`\n=== ④ 게이트 비회귀 (미승인 노출 X) ===\n`);
  // 한 건 반려 → 학생 listApproved 결과 1건 줄어듦.
  const { error: rejErr } = await adminClient
    .from("gs_question_issues")
    .update({ review_status: "rejected", rejected_reason: "verify-only test" })
    .eq("issue_id", issues[2].issue_id);
  record("issue 반려 처리", !rejErr);
  const approvedAfter = await listApprovedIssuesForGsQuestion(
    adminClient,
    q!.question_id,
  );
  record(
    "approved 목록에서 반려 행 제외 (게이트)",
    approvedAfter.length === 2,
    `count=${approvedAfter.length}`,
  );

  process.stdout.write(`\n=== ⑤ cleanup ===\n`);
  await adminClient
    .from("user_issue_attempts")
    .delete()
    .eq("user_id", student.profile_id)
    .eq("gs_question_id", q!.question_id);
  await adminClient
    .from("gs_question_issues")
    .delete()
    .eq("gs_question_id", q!.question_id);
  await adminClient
    .from("gs_questions")
    .delete()
    .eq("question_id", q!.question_id);
  await adminClient.from("gs_rounds").delete().eq("round_id", round!.round_id);
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
