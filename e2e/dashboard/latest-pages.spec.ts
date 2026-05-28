// 대시보드 신규 알림 → /latest/laws · /latest/cases 진입 검증.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.LATEST_PAGES_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "LATEST_PAGES_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("최신 정보 페이지", () => {
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

  test("/latest/laws · /latest/cases 진입 후 항목 노출", async ({ page }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    await page.goto("/latest/laws");
    await expect(page.getByRole("heading", { name: "법 개정" })).toBeVisible();
    await expect(page.getByTestId("latest-laws-list")).toBeVisible();

    await page.goto("/latest/cases");
    await expect(page.getByRole("heading", { name: "최근 판례" })).toBeVisible();
    await expect(page.getByTestId("latest-cases-list")).toBeVisible();

    // 과목 필터 — patent 적용. list 컨테이너 안에 과목 chip "특허법" 노출.
    await page.goto("/latest/cases?subject=patent");
    const patentList = page.getByTestId("latest-cases-list");
    await expect(patentList).toBeVisible();
    await expect(
      patentList.getByText("특허법", { exact: true }).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
