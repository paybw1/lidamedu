// 본문 검색 — ProblemsTab 의 ?p_search 필터 동작.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.SEARCH_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "SEARCH_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("문제 본문 검색", () => {
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

  test("?p_search=취소신청 → 결과 축소 + 키워드 본문 노출", async ({ page }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    // 키워드 직접 URL 로 (입력 폼 제출도 동일).
    await page.goto("/subjects/patent?tab=problems&p_search=특허취소신청");
    // 결과 row 가 존재 + 369 미만.
    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(50);
    // 본문에 키워드 substring 포함된 행이 적어도 하나 있어야.
    await expect(page.getByText("특허취소신청").first()).toBeVisible();
  });
});
