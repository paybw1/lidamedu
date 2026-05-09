// 대시보드 스모크 — 진입 + 실데이터 위젯 노출 확인.
// 새 유저는 0 값으로 표시되어야 함.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.DASHBOARD_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "DASHBOARD_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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

test.describe.serial("대시보드 실데이터", () => {
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

  test("로그인 → /dashboard → KPI/오늘 날짜/5과목 진도 노출", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto("/dashboard");

    // 오늘 날짜 라벨 — Intl 포맷이 한국어로 출력됨.
    await expect(page.getByTestId("today-label")).toBeVisible();
    await expect(page.getByTestId("today-label")).toContainText("년");

    // 3 KPI — 새 유저라 0/0/0%.
    await expect(page.getByText("누적 풀이 시간")).toBeVisible();
    await expect(page.getByText("푼 문제 수")).toBeVisible();
    await expect(page.getByText("평균 정답률")).toBeVisible();

    // 과목별 진도 카드 — 5과목 노출 (특허/상표/디자인보호/민/민사소송).
    const subjectCard = page.getByTestId("subjects-progress");
    await expect(subjectCard).toBeVisible();
    await expect(subjectCard.getByText("특허법")).toBeVisible();
    await expect(subjectCard.getByText("상표법")).toBeVisible();
    await expect(subjectCard.getByText("디자인보호법")).toBeVisible();
    await expect(subjectCard.getByText("민법", { exact: true })).toBeVisible();
    await expect(subjectCard.getByText("민사소송법")).toBeVisible();

    // 히트맵/주간 요약 — 새 유저는 0일/0시간/0연속.
    const heatmapSummary = page.getByTestId("heatmap-summary");
    await expect(heatmapSummary).toBeVisible();
    await expect(heatmapSummary).toContainText("총 0일 학습");
    await expect(heatmapSummary).toContainText("연속 0일");

    // 이번 주 막대 — 합계 0.0h.
    await expect(page.getByTestId("weekly-total-hours")).toContainText("0.0h");

    // 오늘 진척도 카드 — 0.0h / 3.6h (기본 25/7).
    const today = page.getByTestId("today-progress");
    await expect(today).toBeVisible();
    await expect(page.getByTestId("today-hours")).toContainText("0.0");
    await expect(today).toContainText("h /");
    await expect(today).toContainText("0일 연속");
    await expect(today).toContainText("맞춤 퀴즈");
    await expect(today).toContainText("오답노트");
    await expect(today).toContainText("체계별 풀이");

    // 신규 법 개정 / 최근 판례 카드 (실제 시드 데이터 16건/3건 존재).
    const revisions = page.getByTestId("recent-revisions");
    await expect(revisions).toBeVisible();
    await expect(revisions).toContainText("모든 개정 보기");
    const cases = page.getByTestId("recent-cases");
    await expect(cases).toBeVisible();
    await expect(cases).toContainText("모든 판례 보기");

    // 전체 진척도 도넛 3개 — 새 유저는 모두 0%.
    const overall = page.getByTestId("overall-progress");
    await expect(overall).toBeVisible();
    await expect(page.getByTestId("donut-articles")).toContainText("0%");
    await expect(page.getByTestId("donut-cases")).toContainText("0%");
    await expect(page.getByTestId("donut-problems")).toContainText("0%");

    // 최근 학습 피드 — 새 유저는 빈 상태.
    await expect(page.getByTestId("recent-activity-empty")).toBeVisible();

    // 즐겨찾기 빠른 접근 — 새 유저는 빈 메시지.
    await expect(page.getByTestId("quick-bookmarks-empty")).toBeVisible();
  });
});
