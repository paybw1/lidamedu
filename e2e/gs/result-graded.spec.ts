// 학생 결과 화면(graded) E2E.
//
// 회귀 보호: 채점 완료된 제출에 대해 /gs/{round}/result 가
// - 총점 + 만점 표시
// - 답안지 페이지 갤러리 카드 N개
// - 문항 카드의 점수/피드백/모범답안 노출
//   를 정확히 렌더하는지.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.GS_RESULT_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "GS_RESULT_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let testRoundId: string | null = null;
let testStudentId: string | null = null;

async function ensureCleanUser(email: string) {
  const { data } = await anonClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  const id = data?.user?.id;
  if (id) {
    await admin.from("gs_submissions").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

test.describe.serial("GS 결과 화면 (graded)", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const u = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (u.error || !u.data.user) throw u.error ?? new Error("user");
    testStudentId = u.data.user.id;

    const round = await admin
      .from("gs_rounds")
      .insert({
        title: "[E2E TEST] result-graded",
        subject: "patent",
        start_at: new Date(Date.now() - 60_000).toISOString(),
        end_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
        duration_min: 60,
        status: "closed",
        expected_pages: 4,
      })
      .select("round_id")
      .single();
    testRoundId = round.data!.round_id;

    const qs = await admin
      .from("gs_questions")
      .insert([
        {
          round_id: testRoundId,
          order_index: 0,
          title: "문 1.",
          body_md: "Q1 본문",
          model_answer_md: "Q1 모범답안",
          max_score: 30,
        },
        {
          round_id: testRoundId,
          order_index: 1,
          title: "문 2.",
          body_md: "Q2 본문",
          model_answer_md: "Q2 모범답안",
          max_score: 20,
        },
      ])
      .select("question_id, order_index");

    const sub = await admin
      .from("gs_submissions")
      .insert({
        round_id: testRoundId,
        user_id: testStudentId,
        started_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        submitted_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        graded_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        total_score: 42,
      })
      .select("submission_id")
      .single();
    const submissionId = sub.data!.submission_id;

    await admin.from("gs_answers").insert([
      {
        submission_id: submissionId,
        question_id: qs.data![0].question_id,
        score: 25,
        feedback_md: "**Q1 피드백입니다.**",
      },
      {
        submission_id: submissionId,
        question_id: qs.data![1].question_id,
        score: 17,
        feedback_md: "Q2 잘 했어요.",
      },
    ]);

    await admin.from("gs_submission_pages").insert([
      {
        submission_id: submissionId,
        page_number: 1,
        attachment: {
          path: `${testStudentId}/${testRoundId}/page-01-fake.jpg`,
          fileName: "p1.jpg",
          mime: "image/jpeg",
          size: 50 * 1024,
          createdAt: new Date().toISOString(),
        },
        legibility_confirmed: true,
      },
      {
        submission_id: submissionId,
        page_number: 2,
        attachment: {
          path: `${testStudentId}/${testRoundId}/page-02-fake.jpg`,
          fileName: "p2.jpg",
          mime: "image/jpeg",
          size: 50 * 1024,
          createdAt: new Date().toISOString(),
        },
        legibility_confirmed: true,
      },
    ]);
    await admin.from("gs_question_pages").insert([
      { submission_id: submissionId, question_id: qs.data![0].question_id, page_number: 1 },
      { submission_id: submissionId, question_id: qs.data![1].question_id, page_number: 2 },
    ]);
  });

  test.afterAll(async () => {
    if (testRoundId) await admin.from("gs_rounds").delete().eq("round_id", testRoundId);
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("총점/페이지 갤러리/문항 점수+피드백+모범답안 렌더", async ({ page }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    await page.goto(`/gs/${testRoundId}/result`);

    // 총점 (data-testid="result-total-score") = "42 / 50점".
    const total = page.getByTestId("result-total-score");
    await expect(total).toBeVisible({ timeout: 15_000 });
    await expect(total).toContainText("42");
    await expect(total).toContainText("50");

    // 답안지 페이지 카드 2개.
    await expect(page.getByTestId("result-page-1")).toBeVisible();
    await expect(page.getByTestId("result-page-2")).toBeVisible();

    // 문항별 점수 칩 (25 / 30점, 17 / 20점) + 피드백 + 모범답안.
    await expect(page.getByText("25 / 30점")).toBeVisible();
    await expect(page.getByText("17 / 20점")).toBeVisible();
    await expect(page.getByText(/Q1 피드백입니다/)).toBeVisible();
    await expect(page.getByText(/Q2 잘 했어요/)).toBeVisible();
    await expect(page.getByText(/Q1 모범답안/)).toBeVisible();
    await expect(page.getByText(/Q2 모범답안/)).toBeVisible();

    // 문항 카드의 매핑 페이지 anchor.
    await expect(page.getByRole("link", { name: /페이지 1/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /페이지 2/ })).toBeVisible();
  });
});
