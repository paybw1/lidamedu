// 맞춤 퀴즈 설정 → 필터 기반 세션 생성 → 결과 화면 도착 검증.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.SETUP_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "SETUP_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureCleanUser(email: string) {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
}

test.describe.serial("맞춤 퀴즈 설정 플로우", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    // onboarding(feat-8-017) 우회 — onboarded_at 이 null 이면 보호 라우트가 wizard 로 redirect.
    if (data.user) {
      await admin
        .from("profiles")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("profile_id", data.user.id);
    }
  });

  test.afterAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("setup → 시험모드 5문항 → 끝내기 → 결과", async ({ page }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    // 5문항 옵션은 기본 후보(10/20/30/50/100) 에 없으므로 가장 작은 10 선택.
    await page.goto("/subjects/patent/quiz/setup");
    await expect(
      page.getByRole("heading", { name: /맞춤 퀴즈 만들기/ }),
    ).toBeVisible();

    // radio 입력은 sr-only 라 force 옵션으로 직접 check.
    await page
      .locator('input[name="mode"][value="exam"]')
      .check({ force: true });
    await page
      .locator('input[name="count"][value="10"]')
      .check({ force: true });

    await page.getByTestId("setup-start").click();

    // 첫 문제로 redirect — 선지가 보여야 함.
    await page.waitForURL(/\/subjects\/patent\/problems\/.+\?session=/, {
      timeout: 20000,
    });
    await expect(page.getByTestId("problem-choice-1")).toBeVisible({
      timeout: 15000,
    });

    // 시험 모드 표지 + 라벨 "맞춤 퀴즈" 확인.
    await expect(page.getByText("시험 모드")).toBeVisible();
    await expect(page.getByText("맞춤 퀴즈").first()).toBeVisible();

    const sessionUrl = new URL(page.url());
    const sessionId = sessionUrl.searchParams.get("session");
    expect(sessionId).toBeTruthy();

    // 첫 문제만 임의 선택 후 즉시 끝내기 (나머지 9문항은 미응답으로).
    await page.getByTestId("problem-choice-1").click();
    // 끝내기 버튼은 헤더에 있는 finish-session 사용 (마지막 문제가 아니어도 노출).
    await page.getByTestId("finish-session").click();

    // 결과 화면.
    await page.waitForURL(
      `**/subjects/patent/quiz/result/${sessionId}`,
      { timeout: 15000 },
    );
    await expect(page.getByText("퀴즈 결과")).toBeVisible();

    // 응답 1 / 총 10 / 미응답 9.
    await expect(page.getByText("미응답 9")).toBeVisible();
    await expect(page.getByTestId("result-row")).toHaveCount(10);
  });
});
