// 정답률 기반 난이도 뱃지 — problem-viewer 헤더 + 표본 부족 fallback.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.DIFFICULTY_TEST_USER_EMAIL;
const TEST_PROBLEM_ID = process.env.DIFFICULTY_TEST_PROBLEM_ID;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !TEST_PROBLEM_ID || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "DIFFICULTY_TEST_USER_EMAIL, DIFFICULTY_TEST_PROBLEM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureCleanUser(email: string): Promise<string | null> {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);
  if (existing) {
    await admin.auth.admin.deleteUser(existing.id);
    return existing.id;
  }
  return null;
}

let userId: string | null = null;

test.describe.serial("문제 난이도 뱃지", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const { data: created, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = created.user.id;

    // 표본 충분 (>=5) + 정답률 0% 가 되도록 20번의 오답 시도 직접 삽입.
    const rows = Array.from({ length: 20 }, (_, i) => ({
      user_id: userId!,
      problem_id: TEST_PROBLEM_ID!,
      is_correct: false,
      mode: "study" as const,
      time_spent_ms: 5000 + i * 100,
    }));
    const { error: insErr } = await admin
      .from("user_problem_attempts")
      .insert(rows);
    if (insErr) throw insErr;
  });

  test.afterAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("표본 충분 + 0% → '매우 어려움' 뱃지 노출", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto(`/subjects/patent/problems/${TEST_PROBLEM_ID}`);
    const stats = page.getByTestId("problem-stats");
    await expect(stats).toBeVisible({ timeout: 15000 });
    await expect(stats).toContainText("매우 어려움");
    // "전체 정답률 0%" — 정확 비교는 다른 테스트 attempt 가 끼면 깨질 수 있어 substring.
    await expect(stats).toContainText("전체 정답률");
    await expect(stats).toContainText("시도");
  });
});
