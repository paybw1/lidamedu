// 오답노트 E2E — 문제 풀이 시도 → /api/problems/attempt → /study/wrong-note 반영 검증.
//
// 환경변수:
//   WRONG_NOTE_TEST_USER_EMAIL  — 가입/삭제할 테스트 유저 이메일
//   WRONG_NOTE_TEST_PROBLEM_ID  — 채점 가능한 객관식 문제 UUID (choice_index 1=정답)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  — admin API 호출용

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.WRONG_NOTE_TEST_USER_EMAIL;
const TEST_PROBLEM_ID = process.env.WRONG_NOTE_TEST_PROBLEM_ID;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !TEST_PROBLEM_ID || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "WRONG_NOTE_TEST_USER_EMAIL, WRONG_NOTE_TEST_PROBLEM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureCleanUser(email: string) {
  // 같은 이메일의 기존 유저 삭제 (재실행 안전).
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
}

test.describe.serial("오답노트 풀이 기록 플로우", () => {
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

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    // 로그인 성공 시 / 로 리다이렉트.
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("오답 시도 → wrong-note 에 노출", async ({ page }) => {
    await page.goto(`/subjects/patent/problems/${TEST_PROBLEM_ID}`);
    await expect(page.getByTestId("problem-choice-1")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("problem-choice-2").click();

    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/problems/attempt") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "정답 확인 (학습 모드)" }).click();
    const response = await responsePromise;
    // useFetcher 제출은 turbo-stream 으로 직렬화되므로 body 가 {ok:true} 가 아닌
    // [{...}, "data", {...}, "ok", true] 형태. 상태 코드만 확인.
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('"ok"');

    await expect(page.getByText("해설 — 지문별 O/X")).toBeVisible();

    await page.goto("/study/wrong-note?subject=patent");
    await expect(page.getByText("특허법 오답")).toBeVisible();
    await expect(
      page.locator(`a[href*="${TEST_PROBLEM_ID}"]`),
    ).toBeVisible();
  });

  test("정답 재시도 → wrong-note 에서 사라짐", async ({ page }) => {
    await page.goto(`/subjects/patent/problems/${TEST_PROBLEM_ID}`);
    await expect(page.getByTestId("problem-choice-1")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("problem-choice-1").click();

    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/problems/attempt") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "정답 확인 (학습 모드)" }).click();
    await responsePromise;

    await page.goto("/study/wrong-note?subject=patent");
    await expect(
      page.locator(`a[href*="${TEST_PROBLEM_ID}"]`),
    ).toHaveCount(0);
  });
});
