// 문제 polymorphic annotation 검증 — 즐겨찾기 별점 클릭 후 새로고침 시 유지.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.ANNO_TEST_USER_EMAIL;
const TEST_PROBLEM_ID = process.env.WRONG_NOTE_TEST_PROBLEM_ID;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !TEST_PROBLEM_ID || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "ANNO_TEST_USER_EMAIL, WRONG_NOTE_TEST_PROBLEM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("문제 polymorphic annotation", () => {
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

  test("즐겨찾기 3단계 클릭 → 새로고침 후 유지", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto(`/subjects/patent/problems/${TEST_PROBLEM_ID}`);

    // 즐겨찾기 탭은 기본 활성. 3번째 하트 클릭.
    const star3 = page.getByRole("button", { name: "3단계 즐겨찾기" });
    await expect(star3).toBeVisible({ timeout: 10000 });
    await star3.click();

    // 즉시 반영: 3개 별 모두 aria-pressed=true.
    await expect(page.getByRole("button", { name: "1단계 즐겨찾기" })).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: 5000 },
    );
    await expect(page.getByRole("button", { name: "3단계 즐겨찾기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // 새로고침 후 유지.
    await page.reload();
    await expect(page.getByRole("button", { name: "3단계 즐겨찾기" })).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: 10000 },
    );
    // 4단계는 false.
    await expect(page.getByRole("button", { name: "4단계 즐겨찾기" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
