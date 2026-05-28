// 학생 GS 응시 → 페이지 업로드 → 문항 매핑 → 판독 확인 → 제출 → 결과 검증.
//
// 핵심 회귀 보호 대상:
//   - 페이지 슬롯 업로드 (gs_submission_pages insert)
//   - 페이지 ↔ 문항 매핑 (gs_question_pages M:N)
//   - 페이지별 판독 자가확인 토글
//   - 제출 가드 (모든 문항 매핑 + 모든 페이지 판독확인)
//   - 결과 페이지의 답안지 갤러리 + 문항 카드 매핑 anchor.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.GS_TAKE_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "GS_TAKE_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures");
const FIXTURE_1 = path.join(FIXTURE_DIR, "test-page-1.jpg");
const FIXTURE_2 = path.join(FIXTURE_DIR, "test-page-2.jpg");

let testRoundId: string | null = null;

// listUsers 가 서버 에러를 자주 내서, 비밀번호 sign-in 으로 user.id 얻는 우회.
// 잔여 user 가 있다면 같은 TEST_PASSWORD 로 만들어졌으므로 sign-in 가능.
const anonClient = createClient(
  SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

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

async function createTestRound(): Promise<string> {
  const { data: round, error: roundErr } = await admin
    .from("gs_rounds")
    .insert({
      title: "[E2E TEST] GS 응시 → 제출",
      subject: "patent",
      description_md: null,
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 3 * 3600_000).toISOString(),
      duration_min: 60,
      status: "published",
      expected_pages: 4, // 작은 슬롯 수로 검증.
    })
    .select("round_id")
    .single();
  if (roundErr || !round) throw roundErr ?? new Error("round creation failed");

  const { error: qErr } = await admin.from("gs_questions").insert([
    {
      round_id: round.round_id,
      order_index: 0,
      title: "문 1.",
      body_md: "테스트 문제 1",
      max_score: 30,
    },
    {
      round_id: round.round_id,
      order_index: 1,
      title: "문 2.",
      body_md: "테스트 문제 2",
      max_score: 20,
    },
    {
      round_id: round.round_id,
      order_index: 2,
      title: "문 3.",
      body_md: "테스트 문제 3",
      max_score: 30,
    },
    {
      round_id: round.round_id,
      order_index: 3,
      title: "문 4.",
      body_md: "테스트 문제 4",
      max_score: 20,
    },
  ]);
  if (qErr) throw qErr;
  return round.round_id;
}

async function deleteTestRound(roundId: string) {
  // 회차 삭제 시 questions/submissions/pages/mappings CASCADE.
  await admin.from("gs_rounds").delete().eq("round_id", roundId);
}

test.describe.serial("GS 응시 → 제출 → 결과", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const { error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    testRoundId = await createTestRound();
  });

  test.afterAll(async () => {
    if (testRoundId) await deleteTestRound(testRoundId);
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("페이지 2장 업로드 → 4문항 매핑 → 판독확인 → 제출 → 결과 갤러리", async ({
    page,
  }) => {
    // confirm() 자동 수락 (제출 다이얼로그).
    page.on("dialog", (d) => d.accept());

    // 1) 로그인.
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    // 2) 응시 화면 진입.
    expect(testRoundId).not.toBeNull();
    await page.goto(`/gs/${testRoundId}/take`);
    await expect(
      page.getByRole("heading", { name: /\[E2E TEST\] GS 응시/ }),
    ).toBeVisible({ timeout: 15000 });

    // 슬롯 4개 모두 비어있는 상태 확인.
    for (let n = 1; n <= 4; n++) {
      await expect(
        page.getByTestId(`gs-page-slot-${n}`),
      ).toHaveAttribute("data-empty", "true");
    }

    // 3) 슬롯 1, 2 에 이미지 업로드.
    await page
      .getByTestId("gs-page-file-input-1")
      .setInputFiles(FIXTURE_1);
    await expect(
      page.getByTestId("gs-page-slot-1"),
    ).toHaveAttribute("data-empty", "false", { timeout: 30_000 });

    await page
      .getByTestId("gs-page-file-input-2")
      .setInputFiles(FIXTURE_2);
    await expect(
      page.getByTestId("gs-page-slot-2"),
    ).toHaveAttribute("data-empty", "false", { timeout: 30_000 });

    // 4) 매핑 — 페이지 1 = 문 1+2, 페이지 2 = 문 3+4.
    for (const q of [1, 2]) {
      await page.getByTestId(`gs-page-1-question-${q}`).click();
      await expect(
        page.getByTestId(`gs-page-1-question-${q}`),
      ).toHaveAttribute("data-on", "true");
    }
    for (const q of [3, 4]) {
      await page.getByTestId(`gs-page-2-question-${q}`).click();
      await expect(
        page.getByTestId(`gs-page-2-question-${q}`),
      ).toHaveAttribute("data-on", "true");
    }

    // 5) 판독 확인 체크 (페이지 1, 2).
    // .check() 는 controlled React 인풋 + fetcher 비동기에 잘 안 맞아 .click() 사용.
    await page.getByTestId("gs-page-confirm-1").click();
    await expect(
      page.getByTestId("gs-page-slot-1"),
    ).toHaveAttribute("data-confirmed", "true", { timeout: 10_000 });
    await page.getByTestId("gs-page-confirm-2").click();
    await expect(
      page.getByTestId("gs-page-slot-2"),
    ).toHaveAttribute("data-confirmed", "true", { timeout: 10_000 });

    // 6) 제출.
    await expect(page.getByTestId("gs-submit")).toBeEnabled();
    await page.getByTestId("gs-submit").click();

    // 7) 제출 후 결과 페이지로 redirect.
    await page.waitForURL(`**/gs/${testRoundId}/result`, { timeout: 15000 });
    await expect(
      page.getByText(/내 답안지/, { exact: false }),
    ).toBeVisible({ timeout: 10_000 });

    // 답안지 페이지 카드 2개가 갤러리에 보여야 함.
    const pageCards = page.locator('[id^="page-"]');
    await expect(pageCards.first()).toBeVisible();
    expect(await pageCards.count()).toBeGreaterThanOrEqual(2);
  });
});
