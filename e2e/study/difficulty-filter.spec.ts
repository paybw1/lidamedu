// 난이도 필터 — ProblemsTab 테이블에 ?p_difficulty=very_hard 적용 시
// 시도 데이터 시드된 문제만 노출되는지 확인.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.DIFFFILTER_TEST_USER_EMAIL;
const TEST_PROBLEM_ID = process.env.DIFFFILTER_TEST_PROBLEM_ID;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !TEST_PROBLEM_ID || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "DIFFFILTER_TEST_USER_EMAIL, DIFFFILTER_TEST_PROBLEM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("ProblemsTab 난이도 필터", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const { data: created, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    const userId = created.user.id;

    // 20번 오답 시도 → 정답률 0% → very_hard 버킷.
    const rows = Array.from({ length: 20 }, () => ({
      user_id: userId,
      problem_id: TEST_PROBLEM_ID!,
      is_correct: false,
      mode: "study" as const,
    }));
    const { error: insErr } = await admin
      .from("user_problem_attempts")
      .insert(rows);
    if (insErr) throw insErr;
  });

  test.afterAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("?p_difficulty=very_hard → 시드 문제만 테이블에 잔존", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    // 필터 미적용: 369문항 노출 (수가 많아 toBeVisible 만 확인).
    await page.goto("/subjects/patent?tab=problems");
    await expect(
      page.getByRole("heading", { name: /1차 객관식/ }),
    ).toBeVisible();

    // 필터 적용 — very_hard 만.
    await page.goto(
      "/subjects/patent?tab=problems&p_difficulty=very_hard",
    );
    // 본문 단락 일부로 시드 문제가 보이는지 확인.
    await expect(page.getByText("기간의 末日이 공휴일")).toBeVisible({
      timeout: 15000,
    });
    // 행 수: 1 (이 테스트가 단독으로 시드한 very_hard 문제). 다른 테스트가
    // 동시에 다른 patent 문제에 시도를 쌓을 가능성은 낮지만 가능 → 1 이상.
    const rows = await page
      .locator('table tbody tr')
      .count();
    expect(rows).toBeGreaterThanOrEqual(1);
    expect(rows).toBeLessThanOrEqual(20); // 369 전체보다 훨씬 적음
  });
});
