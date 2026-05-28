// 시험 모드 + 결과 화면 E2E.
// 시나리오: 노드(2문제) 진입 → 시험 모드 → 둘 다 오답 → 시험 끝내기 → 결과 화면 검증.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.EXAM_TEST_USER_EMAIL;
const NODE_ID = process.env.EXAM_TEST_NODE_ID;
const FIRST_PROBLEM_ID = process.env.EXAM_TEST_FIRST_PROBLEM_ID;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !NODE_ID || !FIRST_PROBLEM_ID || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "EXAM_TEST_USER_EMAIL, EXAM_TEST_NODE_ID, EXAM_TEST_FIRST_PROBLEM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("시험 모드 풀이 → 결과 화면", () => {
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

  test("진입 → 2문제 오답 → 끝내기 → 결과 화면 KPI", async ({ page }) => {
    // 로그인.
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    // 시험 모드 진입 — 로더가 세션을 만들고 ?session=<sid> 붙여 redirect.
    await page.goto(
      `/subjects/patent/problems/${FIRST_PROBLEM_ID}?node=${NODE_ID}&mode=exam`,
    );
    await expect(page.getByTestId("problem-choice-1")).toBeVisible({
      timeout: 15000,
    });

    // 세션 ID 추출.
    const sessionUrl = new URL(page.url());
    const sessionId = sessionUrl.searchParams.get("session");
    expect(sessionId).toBeTruthy();
    expect(sessionUrl.searchParams.get("mode")).toBe("exam");

    // 시험 모드 표지 + 타이머 노출.
    await expect(page.getByText("시험 모드")).toBeVisible();
    await expect(page.getByTestId("exam-timer")).toBeVisible();

    // 1번 문제: 오답 선택 → 다음.
    await page.getByTestId("problem-choice-1").click();
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/problems/attempt") &&
          r.request().method() === "POST",
      ),
      page.getByTestId("exam-next").click(),
    ]);

    // 2번 문제 로드 대기.
    await expect(page.getByTestId("problem-choice-1")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("exam-next")).toHaveCount(0);
    await expect(page.getByTestId("exam-finish")).toBeVisible();

    // 2번 문제: 오답 선택 → 시험 끝내기.
    await page.getByTestId("problem-choice-2").click();
    await page.getByTestId("exam-finish").click();

    // 결과 화면으로 redirect.
    await page.waitForURL(
      `**/subjects/patent/quiz/result/${sessionId}`,
      { timeout: 15000 },
    );

    // KPI: 정답률 0%, 총 2, 오답 2.
    await expect(page.getByText("퀴즈 결과")).toBeVisible();
    await expect(page.getByText("0%", { exact: true })).toBeVisible();
    await expect(page.getByText("정답률")).toBeVisible();
    // 지문별 결과 리스트 — 2개 항목.
    await expect(page.getByTestId("result-row")).toHaveCount(2);

    // 오답노트 CTA 노출 + 오답노트 페이지 가서 둘 다 보이는지 확인.
    await expect(page.getByText("오답노트에 자동 등록")).toBeVisible();
    await page.goto("/study/wrong-note?subject=patent");
    await expect(
      page.locator(`a[href*="${FIRST_PROBLEM_ID}"]`),
    ).toBeVisible();
  });
});
