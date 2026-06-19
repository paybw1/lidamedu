// 학습 목표 저장 → 대시보드 D-day/주간 목표 반영 검증.
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.GOALS_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "GOALS_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("학습목표 → 대시보드", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    // onboarding(feat-8-017) 우회 — onboarded_at 이 null 이면 /dashboard 가 wizard 로 redirect.
    if (data.user) {
      await admin
        .from("profiles")
        .update({
          onboarded_at: new Date().toISOString(),
          // /goals→/study/stats 통합(3a): 통계 A-동의 게이트 통과 → 목표 띠·Sheet 노출.
          my_analysis_consent_at: new Date().toISOString(),
        })
        .eq("profile_id", data.user.id);
    }
  });

  test.afterAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("/goals 저장 → 대시보드 D-day · 주간 목표 갱신", async ({ page }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    // 초기 대시보드: 목표 미설정 → DashHeader 의 시험 D-day 영역(fallback)만 노출.
    // 재스킨 후 exam-date-label testid 제거 — "변리사 1차" eyebrow + 미설정 안내 링크로 확인.
    await page.goto("/dashboard");
    await expect(page.getByText("변리사 1차")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /시험일.*설정하기/ }),
    ).toBeVisible();

    // /goals 는 /study/stats 로 redirect(통폐합 3a) → 상단 목표 요약 띠 노출.
    await page.goto("/goals");
    await page.waitForURL(/\/study\/stats/);
    await expect(page.getByTestId("goal-summary-bar")).toBeVisible();
    // "목표 설정" Sheet 열기 → 시험일 30일 뒤 + 주간 35시간 입력.
    await page.getByRole("button", { name: "목표 설정" }).click();
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await page.getByTestId("goal-exam-date").fill(futureDate);
    await page.getByTestId("goal-weekly-hours").fill("35");
    await page.getByTestId("goal-save").click();
    await expect(page.getByTestId("goal-saved")).toBeVisible({
      timeout: 10000,
    });

    // 대시보드 재진입 → 새 시험일(DashHeader "시험일 {ISO}") + D-30 + 주간 목표 35h.
    await page.goto("/dashboard");
    // 설정 후 헤더가 시험일 ISO 를 노출 → 연도 포함.
    await expect(page.getByText(futureDate, { exact: false })).toBeVisible();
    await expect(page.getByText("D-30")).toBeVisible();
    // 주간 목표는 오늘 진척도 카드에 "목표 35h" 로 노출(재스킨: 시간→h).
    await expect(page.getByText("목표 35h")).toBeVisible();
  });
});
