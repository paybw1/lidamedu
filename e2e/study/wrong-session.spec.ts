// 오답노트 → "시험 모드" CTA → 세션 첫 문제 진입.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.WRONG_SESSION_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SEED_PROBLEMS = [
  process.env.EXAM_TEST_FIRST_PROBLEM_ID, // patent
  process.env.RELATED_TEST_PROBLEM_ID, // patent
];

if (
  !TEST_EMAIL ||
  !SUPABASE_URL ||
  !SERVICE_ROLE ||
  !SEED_PROBLEMS[0] ||
  !SEED_PROBLEMS[1]
) {
  throw new Error("env required: WRONG_SESSION_TEST_USER_EMAIL, EXAM_TEST_FIRST_PROBLEM_ID, RELATED_TEST_PROBLEM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
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

test.describe.serial("오답노트 → 세션 묶기", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const { data: created, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    const userId = created.user.id;
    // 두 patent 문제에 오답 1건씩 시드.
    const rows = SEED_PROBLEMS.map((pid) => ({
      user_id: userId,
      problem_id: pid!,
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

  test("오답 2건 시드 → wrong-note → 시험 모드 → 세션 첫 문제", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto("/study/wrong-note");
    await expect(page.getByText("오답 2건을 한 세션으로")).toBeVisible();
    await page.getByTestId("wrong-start-exam").click();

    // 세션 생성 → 첫 문제로 redirect (URL 에 ?session=&mode=exam).
    await page.waitForURL(/\/subjects\/patent\/problems\/.+\?session=/, {
      timeout: 15000,
    });
    await expect(page).toHaveURL(/mode=exam/);
    await expect(page.getByTestId("problem-choice-1")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("시험 모드")).toBeVisible();
    // total = 2.
    await expect(page.getByText("/ 2")).toBeVisible();
  });
});
