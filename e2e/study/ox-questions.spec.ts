// 정오문제 패널 — 조문 viewer 우측 탭에서 OX 가능 지문 노출 + 채점 검증.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.OX_TEST_USER_EMAIL;
const ARTICLE_SLUG = process.env.OX_TEST_ARTICLE_SLUG;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !ARTICLE_SLUG || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "OX_TEST_USER_EMAIL, OX_TEST_ARTICLE_SLUG, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("정오문제 패널", () => {
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

  test("article-viewer → 정오문제 탭 → O 클릭 → 결과 노출", async ({ page }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    await page.goto(`/subjects/patent/articles/${ARTICLE_SLUG}`);
    // 우측 패널이 로드된 후 정오문제 탭 클릭.
    await page.getByRole("tab", { name: /정오문제/ }).click();
    const panel = page.getByTestId("ox-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });

    // O 클릭 → 결과 카드 노출.
    await panel.getByTestId("ox-pick-O").click();
    await expect(page.getByTestId("ox-result")).toBeVisible({ timeout: 5000 });
    // 정답 문구 또는 오답 문구 둘 중 하나는 반드시 노출.
    const result = page.getByTestId("ox-result");
    const text = await result.textContent();
    expect(text === null ? "" : text).toMatch(/정답|오답/);

    // "다음 지문" 클릭 시 새 문항.
    await page.getByTestId("ox-next").click();
    await expect(page.getByTestId("ox-result")).toHaveCount(0);
    await expect(panel.getByTestId("ox-pick-O")).toBeEnabled();
  });
});
