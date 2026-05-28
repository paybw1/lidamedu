// 학습 목표 저장 → 대시보드 D-day/주간 목표 반영 검증.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.GOALS_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "GOALS_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("학습목표 → 대시보드", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const { error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
  });

  test.afterAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("/goals 저장 → 대시보드 D-day · 주간 목표 갱신", async ({ page }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    // 초기 대시보드: 목표 미설정 → fallback "2026-07-23" 라벨.
    await page.goto("/dashboard");
    await expect(page.getByTestId("exam-date-label")).toContainText("2026");

    // /goals 진입 → 시험일 30일 뒤 + 주간 35시간 입력.
    await page.goto("/goals");
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await page.getByTestId("goal-exam-date").fill(futureDate);
    await page.getByTestId("goal-weekly-hours").fill("35");
    await page.getByTestId("goal-save").click();
    await expect(page.getByTestId("goal-saved")).toBeVisible({
      timeout: 10000,
    });

    // 대시보드 재진입 → 새 시험일 + D-30 + 주간 목표 35시간.
    await page.goto("/dashboard");
    await expect(page.getByTestId("exam-date-label")).toContainText(
      String(new Date(futureDate).getFullYear()),
    );
    await expect(page.getByText("D-30")).toBeVisible();
    await expect(page.getByText("목표 35시간")).toBeVisible();
  });
});
