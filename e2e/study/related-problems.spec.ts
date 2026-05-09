// 유사 문제 탭 — 같은 primary_article 의 다른 문제 노출 검증.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.RELATED_TEST_USER_EMAIL;
const TEST_PROBLEM_ID = process.env.RELATED_TEST_PROBLEM_ID;
const PEER_PROBLEM_ID = process.env.RELATED_TEST_PEER_PROBLEM_ID;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !TEST_EMAIL ||
  !TEST_PROBLEM_ID ||
  !PEER_PROBLEM_ID ||
  !SUPABASE_URL ||
  !SERVICE_ROLE
) {
  throw new Error(
    "RELATED_TEST_USER_EMAIL, RELATED_TEST_PROBLEM_ID, RELATED_TEST_PEER_PROBLEM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("유사 문제 탭", () => {
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

  test("같은 primary_article 의 다른 문제가 탭에 노출", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto(`/subjects/patent/problems/${TEST_PROBLEM_ID}`);
    // 탭 트리거 클릭.
    await page.getByRole("tab", { name: /유사 문제/ }).click();
    const list = page.getByTestId("related-problems-list");
    await expect(list).toBeVisible({ timeout: 10000 });
    await expect(
      list.locator(`a[href*="${PEER_PROBLEM_ID}"]`),
    ).toBeVisible();
  });
});
