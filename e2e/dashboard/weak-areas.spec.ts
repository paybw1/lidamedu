// 약점 우선 복습 카드 — 내 오답이 글로벌 어려움 순으로 노출.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.WEAK_TEST_USER_EMAIL;
const TEST_PROBLEM_ID = process.env.WEAK_TEST_PROBLEM_ID;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !TEST_PROBLEM_ID || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "WEAK_TEST_USER_EMAIL, WEAK_TEST_PROBLEM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("대시보드 약점 우선 복습", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const { data: created, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    const userId = created.user.id;

    // 마지막 시도가 오답인 1건 (오답노트 큐 기준).
    const { error: insErr } = await admin
      .from("user_problem_attempts")
      .insert({
        user_id: userId,
        problem_id: TEST_PROBLEM_ID!,
        is_correct: false,
        mode: "study",
      });
    if (insErr) throw insErr;
  });

  test.afterAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("오답 1건 시드 → 약점 카드에 노출", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto("/dashboard");
    const card = page.getByTestId("weak-areas");
    await expect(card).toBeVisible();
    await expect(card).toContainText("법정기간이라고 인정되지 않는");
    await expect(card).toContainText("특허법");
  });
});
