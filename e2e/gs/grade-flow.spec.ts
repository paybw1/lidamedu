// 운영자 채점 흐름 E2E.
//
// 회귀 보호: admin-gs-grade-list 진입 → 학생 행 클릭 → admin-gs-grade 에서
// 문항별 점수 저장 → 채점 마무리 → DB 의 graded_at + total_score + gs_answers.score 검증.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const ADMIN_EMAIL = process.env.GS_GRADER_EMAIL;
const STUDENT_EMAIL = process.env.GS_GRADED_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ADMIN_EMAIL || !STUDENT_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "GS_GRADER_EMAIL, GS_GRADED_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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
let testSubmissionId: string | null = null;

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

test.describe.serial("GS 운영자 채점 흐름", () => {
  test.beforeAll(async () => {
    // 1) admin 사용자 생성 + 역할 승격.
    await ensureCleanUser(ADMIN_EMAIL!);
    const adminUser = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (adminUser.error || !adminUser.data.user)
      throw adminUser.error ?? new Error("admin user create failed");
    await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("profile_id", adminUser.data.user.id);

    // 2) 학생 사용자 + 회차/문항/제출/페이지 시드.
    await ensureCleanUser(STUDENT_EMAIL!);
    const studentUser = await admin.auth.admin.createUser({
      email: STUDENT_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (studentUser.error || !studentUser.data.user)
      throw studentUser.error ?? new Error("student user create failed");
    testStudentId = studentUser.data.user.id;
    await admin
      .from("profiles")
      .update({ name: "E2E 학생" })
      .eq("profile_id", testStudentId);

    const round = await admin
      .from("gs_rounds")
      .insert({
        title: "[E2E TEST] 채점 흐름",
        subject: "patent",
        start_at: new Date(Date.now() - 60_000).toISOString(),
        end_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
        duration_min: 60,
        status: "closed",
        expected_pages: 4,
      })
      .select("round_id")
      .single();
    if (round.error || !round.data) throw round.error ?? new Error("round err");
    testRoundId = round.data.round_id;

    const qs = await admin
      .from("gs_questions")
      .insert([
        { round_id: testRoundId, order_index: 0, title: "문 1.", body_md: "Q1", max_score: 30 },
        { round_id: testRoundId, order_index: 1, title: "문 2.", body_md: "Q2", max_score: 20 },
      ])
      .select("question_id, order_index");
    if (qs.error || !qs.data) throw qs.error ?? new Error("question err");

    const sub = await admin
      .from("gs_submissions")
      .insert({
        round_id: testRoundId,
        user_id: testStudentId,
        started_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        submitted_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      })
      .select("submission_id")
      .single();
    if (sub.error || !sub.data) throw sub.error ?? new Error("submission err");
    testSubmissionId = sub.data.submission_id;

    // 페이지 2 개 + 문항 매핑.
    await admin.from("gs_submission_pages").insert([
      {
        submission_id: testSubmissionId,
        page_number: 1,
        attachment: {
          path: `${testStudentId}/${testRoundId}/page-01-fake.jpg`,
          fileName: "fake-page-1.jpg",
          mime: "image/jpeg",
          size: 50 * 1024,
          createdAt: new Date().toISOString(),
        },
        legibility_confirmed: true,
      },
      {
        submission_id: testSubmissionId,
        page_number: 2,
        attachment: {
          path: `${testStudentId}/${testRoundId}/page-02-fake.jpg`,
          fileName: "fake-page-2.jpg",
          mime: "image/jpeg",
          size: 50 * 1024,
          createdAt: new Date().toISOString(),
        },
        legibility_confirmed: true,
      },
    ]);
    // 매핑 — 페이지 1 = 문 1, 페이지 2 = 문 2.
    await admin.from("gs_question_pages").insert([
      {
        submission_id: testSubmissionId,
        question_id: qs.data[0].question_id,
        page_number: 1,
      },
      {
        submission_id: testSubmissionId,
        question_id: qs.data[1].question_id,
        page_number: 2,
      },
    ]);
  });

  test.afterAll(async () => {
    if (testRoundId) {
      await admin.from("gs_rounds").delete().eq("round_id", testRoundId);
    }
    await ensureCleanUser(ADMIN_EMAIL!);
    await ensureCleanUser(STUDENT_EMAIL!);
  });

  test("학생 클릭 → 점수 입력 + 저장 → 채점 마무리 → DB 갱신", async ({ page }) => {
    page.on("dialog", (d) => d.accept());

    await loginUser(page, ADMIN_EMAIL!, TEST_PASSWORD);

    // 채점 목록 진입.
    await page.goto(`/admin/gs/${testRoundId}/grade`);
    await expect(
      page.getByTestId(`grade-row-${testSubmissionId}`),
    ).toBeVisible({ timeout: 15000 });

    // 학생 행의 "채점" 링크 클릭.
    await page.getByTestId(`grade-link-${testSubmissionId}`).click();
    await page.waitForURL(
      `**/admin/gs/${testRoundId}/grade/${testSubmissionId}`,
      { timeout: 10_000 },
    );

    // 문 1 점수 25, 문 2 점수 18 입력 + 저장.
    await page.getByTestId("grade-score-1").fill("25");
    await page.getByTestId("grade-save-1").click();
    await expect.poll(
      async () => {
        const row = await admin
          .from("gs_answers")
          .select("score")
          .eq("submission_id", testSubmissionId!)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return row.data?.score != null ? "saved" : "wait";
      },
      { timeout: 10_000, intervals: [500] },
    ).toBe("saved");

    await page.getByTestId("grade-score-2").fill("18");
    await page.getByTestId("grade-save-2").click();

    // 두 답안 모두 score 가 저장되어야 finalize 활성화.
    await expect.poll(
      async () => {
        const r = await admin
          .from("gs_answers")
          .select("score")
          .eq("submission_id", testSubmissionId!)
          .not("score", "is", null);
        return r.data?.length ?? 0;
      },
      { timeout: 10_000, intervals: [500] },
    ).toBe(2);

    // 채점 마무리.
    await page.getByTestId("grade-finalize").click();

    // DB 검증 — graded_at, total_score=43, graded_by=admin.
    await expect.poll(
      async () => {
        const r = await admin
          .from("gs_submissions")
          .select("total_score, graded_at, graded_by")
          .eq("submission_id", testSubmissionId!)
          .maybeSingle();
        if (!r.data) return null;
        return {
          totalScore: Number(r.data.total_score),
          graded: r.data.graded_at != null,
          gradedBy: r.data.graded_by != null,
        };
      },
      { timeout: 15_000, intervals: [500] },
    ).toEqual({ totalScore: 43, graded: true, gradedBy: true });
  });
});
