// §3 검증 — AI 분석 보조 (의미 매칭).
// API 키 호출은 실제 비용 발생 — 가짜 모킹으로 흐름만 검증.
// 1) lib import / parser 안전성
// 2) cap 도달 시 시뮬 — analyzeIssueExtraction 은 호출 전 cap 체크 안 함 (호출 측 책임)
// 3) ai_analysis jsonb 저장·조회 roundtrip — upsert + select
//
// 사용: npx tsx scripts/verify-gs-issue-analyze.ts

import "dotenv/config";

import adminClient from "../app/core/lib/supa-admin-client.server";
import { analyzeIssueExtraction } from "../app/features/gs/lib/ai-issue-analyzer.server";
import {
  approveIssue,
  insertDraftIssuesFromAi,
} from "../app/features/gs/queries-issues.server";
import {
  type AiAnalysis,
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
  process.stdout.write(`\n=== ① lib import ===\n`);
  record(
    "analyzeIssueExtraction import",
    typeof analyzeIssueExtraction === "function",
  );

  process.stdout.write(`\n=== ② ai_analysis jsonb roundtrip ===\n`);
  // 시드.
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
  const { data: round } = await adminClient
    .from("gs_rounds")
    .insert({
      title: "verify-issue-analyze 임시",
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
      body_md: "사례 — 신규성 다툼",
      model_answer_md: "모범답안",
      max_score: 100,
    })
    .select("question_id")
    .single();
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
    .select("issue_id")
    .eq("gs_question_id", q!.question_id);
  const issueIds = (issueRows ?? []).map((r) => r.issue_id);
  for (const id of issueIds) await approveIssue(adminClient, id, staff.profile_id);

  // attempt 생성 (submit 완료 상태).
  const a = await upsertIssueAttempt(adminClient, {
    userId: student.profile_id,
    gsQuestionId: q!.question_id,
    studentIssuesMd: "신규성 위반\n진보성",
    submittedAt: new Date().toISOString(),
  });
  record("attempt 생성", !!a.attemptId);

  // ai_analysis 직접 update (모킹).
  const fakeAnalysis: AiAnalysis = {
    hits: [
      { issueId: issueIds[0], evidence: "학생이 '신규성 위반' 표현 사용" },
      { issueId: issueIds[1], evidence: "'진보성' 명시" },
    ],
    missed: [{ issueId: issueIds[2], severity: "side" }],
    extras: [],
    reasoning: "표현 차이 허용 매칭",
  };
  const { error: upErr } = await adminClient
    .from("user_issue_attempts")
    .update({
      ai_analysis: fakeAnalysis as unknown as never,
      ai_analyzed_at: new Date().toISOString(),
    })
    .eq("attempt_id", a.attemptId);
  record("ai_analysis update", !upErr, upErr?.message);

  // 재조회 — jsonb shape 확인.
  const { data: re } = await adminClient
    .from("user_issue_attempts")
    .select("ai_analysis, ai_analyzed_at")
    .eq("attempt_id", a.attemptId)
    .maybeSingle();
  const ra = (re?.ai_analysis ?? null) as AiAnalysis | null;
  record(
    "roundtrip — hits 2 / missed 1 / extras 0",
    !!ra &&
      ra.hits.length === 2 &&
      ra.missed.length === 1 &&
      ra.extras.length === 0,
    `analyzed_at=${re?.ai_analyzed_at}`,
  );
  record(
    "hits[0].evidence 보존",
    ra?.hits[0].evidence === "학생이 '신규성 위반' 표현 사용",
  );

  process.stdout.write(`\n=== ③ ANTHROPIC_API_KEY 미설정 시 graceful ===\n`);
  // 임시 unset 으로 skipped_no_key 경로 확인.
  const orig = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const noKey = await analyzeIssueExtraction({
    questionTitle: null,
    questionBody: "test",
    masterIssues: [],
    studentIssuesMd: "test",
  });
  if (orig) process.env.ANTHROPIC_API_KEY = orig;
  record("키 없음 → null (graceful)", noKey === null);

  // gs_ai_usage 에 skipped_no_key 행이 1개 이상 들어왔는지.
  const { data: usage } = await adminClient
    .from("gs_ai_usage")
    .select("id, outcome, kind, reason")
    .eq("kind", "ai_issue_analyze")
    .eq("outcome", "skipped_no_key")
    .order("occurred_at", { ascending: false })
    .limit(1);
  record(
    "gs_ai_usage 에 skipped_no_key 기록",
    (usage ?? []).length === 1,
    usage?.[0]?.reason ?? "",
  );
  // cleanup 그 행.
  if ((usage ?? []).length > 0) {
    await adminClient.from("gs_ai_usage").delete().eq("id", usage![0].id);
  }

  process.stdout.write(`\n=== ④ cleanup ===\n`);
  await adminClient
    .from("user_issue_attempts")
    .delete()
    .eq("attempt_id", a.attemptId);
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
