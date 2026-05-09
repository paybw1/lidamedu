// 해설 카드 — 지문별 "관련 조문" 링크 클릭 시 article-viewer 진입 검증.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.EXPLAIN_TEST_USER_EMAIL;
const TEST_PROBLEM_ID = process.env.EXPLAIN_TEST_PROBLEM_ID;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !TEST_PROBLEM_ID || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "EXPLAIN_TEST_USER_EMAIL, EXPLAIN_TEST_PROBLEM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("해설 카드 관련 조문 링크", () => {
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

  test("정답 확인 → 해설 → 관련 조문 링크 → article-viewer 이동", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto(`/subjects/patent/problems/${TEST_PROBLEM_ID}`);
    await expect(page.getByTestId("problem-choice-1")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("problem-choice-1").click();
    await page.getByRole("button", { name: "정답 확인 (학습 모드)" }).click();
    await expect(page.getByText("해설 — 지문별 O/X")).toBeVisible();

    // 첫 관련 조문 링크 클릭.
    const links = page.getByTestId("choice-related-article");
    await expect(links.first()).toBeVisible({ timeout: 5000 });
    await links.first().click();

    // article-viewer URL 패턴 확인.
    await page.waitForURL(/\/subjects\/patent\/articles\/.+/, {
      timeout: 10000,
    });
  });
});
