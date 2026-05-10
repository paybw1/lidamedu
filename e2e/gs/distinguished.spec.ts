// 학생 우수 답안 페이지 E2E.
//
// 회귀 보호: 운영자가 우수답안(distinguished_answers) 을 발행한 뒤
// 학생이 /gs/{round}/distinguished 에서 답안 카드를 확인할 수 있어야 한다.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.GS_DIST_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "GS_DIST_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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
let testDistinctionId: string | null = null;

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

test.describe.serial("GS 우수답안", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const u = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (u.error || !u.data.user) throw u.error ?? new Error("user");
    testStudentId = u.data.user.id;
    await admin
      .from("profiles")
      .update({ name: "우수 학생" })
      .eq("profile_id", testStudentId);

    const round = await admin
      .from("gs_rounds")
      .insert({
        title: "[E2E TEST] distinguished",
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
          body_md: "Q1",
          model_answer_md: "Q1 모범",
          max_score: 30,
        },
      ])
      .select("question_id");

    const sub = await admin
      .from("gs_submissions")
      .insert({
        round_id: testRoundId,
        user_id: testStudentId,
        started_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        submitted_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        graded_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        total_score: 28,
      })
      .select("submission_id")
      .single();
    const submissionId = sub.data!.submission_id;

    await admin.from("gs_answers").insert({
      submission_id: submissionId,
      question_id: qs.data![0].question_id,
      score: 28,
      feedback_md: "최고",
    });

    await admin.from("gs_submission_pages").insert({
      submission_id: submissionId,
      page_number: 1,
      attachment: {
        path: `${testStudentId}/${testRoundId}/page-01-fake.jpg`,
        fileName: "p1.jpg",
        mime: "image/jpeg",
        size: 50 * 1024,
        createdAt: new Date().toISOString(),
        ocrText: "OCR 텍스트 — 우수 답안 본문 시뮬레이션.",
      },
      legibility_confirmed: true,
    });
    await admin.from("gs_question_pages").insert({
      submission_id: submissionId,
      question_id: qs.data![0].question_id,
      page_number: 1,
    });

    // 우수답안 — 문항 단위, 학생에게 공개, 익명 해제로 학생 이름 노출.
    const dist = await admin
      .from("gs_distinguished_answers")
      .insert({
        round_id: testRoundId,
        submission_id: submissionId,
        question_id: qs.data![0].question_id,
        reason: "법리 적용이 명확",
        is_published: true,
        is_anonymous: false,
        points_awarded: 5,
      })
      .select("distinction_id")
      .single();
    testDistinctionId = dist.data!.distinction_id;
  });

  test.afterAll(async () => {
    if (testRoundId) await admin.from("gs_rounds").delete().eq("round_id", testRoundId);
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("우수답안 카드가 학생 화면에 노출", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto(`/gs/${testRoundId}/distinguished`);

    // 페이지 헤더 + 문항 카드(우수 1명) + DistinguishedItem (testid).
    await expect(
      page.getByRole("heading", { name: /\[E2E TEST\] distinguished/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/우수 1명/)).toBeVisible();
    await expect(
      page.getByTestId(`distinguished-${testDistinctionId}`),
    ).toBeVisible();

    // 작성자명(공개) + 사유 + 포인트 표기.
    await expect(page.getByText("우수 학생")).toBeVisible();
    await expect(page.getByText(/법리 적용이 명확/)).toBeVisible();
    await expect(page.getByText("+5P")).toBeVisible();
  });
});
