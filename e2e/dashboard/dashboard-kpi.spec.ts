// 대시보드 스모크 — 진입 + 실데이터 위젯 노출 확인.
// 새 유저는 0 값으로 표시되어야 함.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

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
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    // onboarding(feat-8-017) 우회 — onboarded_at 이 null 이면 /dashboard 가 wizard 로 redirect.
    // next_exam_round 는 DB DEFAULT 가 'first' 라(feat-2-025 ①) 신규 유저가 1차로 잡힌다.
    //   이 테스트는 "차수 미설정(null)" 기준 — 대시보드 법률 과목 진도가 1차/2차 두 그룹을
    //   모두 노출하는 상태 — 이므로 명시적으로 null 로 덮어쓴다.
    if (data.user) {
      await admin
        .from("profiles")
        .update({
          onboarded_at: new Date().toISOString(),
          next_exam_round: null,
        })
        .eq("profile_id", data.user.id);
    }
  });

  test.afterAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("로그인 → /dashboard → KPI/오늘 날짜/과목별 진도 노출", async ({ page }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    await page.goto("/dashboard");

    // 재스킨(2026-05-19) 후 대시보드는 testid 가 모두 제거됨 — 실제 노출 문자열로 재anchor.
    // 오늘 날짜 라벨 — DashHeader eyebrow 가 "{Intl 한국어 날짜} · {cohort}" 로 출력.
    await expect(page.getByText(/\d{4}년.*월.*일/)).toBeVisible();

    // 3 KPI — 새 유저라 0/0/0% (DashKpiStrip).
    await expect(page.getByText("누적 풀이 시간")).toBeVisible();
    await expect(page.getByText("푼 문제 수")).toBeVisible();
    await expect(page.getByText("평균 정답률")).toBeVisible();

    // 과목별 진도 카드(SubjectsProgressCard) — 차수 미설정(beforeAll 에서 next_exam_round=null)
    //   이라 1차(객관식)/2차(주관식) 두 그룹 모두 노출. 목표 차수를 정하면 그 차수 그룹만 보인다.
    //   산업재산권법(특허/상표/디자인)은 양쪽 그룹에 노출되므로 .first() 사용.
    await expect(page.getByText("법률 과목 진도")).toBeVisible();
    await expect(page.getByText("1차 · 객관식", { exact: true })).toBeVisible();
    await expect(page.getByText("2차 · 주관식", { exact: true })).toBeVisible();
    await expect(page.getByText("특허법").first()).toBeVisible();
    await expect(page.getByText("상표법").first()).toBeVisible();
    await expect(page.getByText("디자인보호법").first()).toBeVisible();
    await expect(page.getByText("민법", { exact: true })).toBeVisible();
    await expect(page.getByText("민사소송법")).toBeVisible();

    // 히트맵 요약(HeatmapCard) — 새 유저는 활동 0일. 연속(streak) 은 오늘 진척도 카드로 이동.
    await expect(page.getByText("학습 히트맵")).toBeVisible();
    await expect(page.getByText("0일", { exact: true }).first()).toBeVisible();

    // 이번 주 학습량 — 오늘 진척도 카드의 "이번 주 0.0h" (WeekBars 오늘 막대도 0.0h).
    await expect(page.getByText("이번 주 0.0h")).toBeVisible();

    // 오늘 진척도 카드(TodayProgressCard) — 0.0h 오늘 학습 / 0일 연속.
    await expect(page.getByText("오늘의 진척도")).toBeVisible();
    await expect(page.getByText("오늘 학습")).toBeVisible();
    await expect(page.getByText("0일 연속")).toBeVisible();
    // 재학습 진입점은 별도 RE-STUDY 카드(ReentryChipsCard)로 분리됨 — "오답노트" 진입 타일 확인.
    await expect(page.getByText("오답노트").first()).toBeVisible();
    // TODO(reskin): "맞춤 퀴즈"/"체계별 풀이" 퀵액션은 재스킨된 대시보드에 더 이상 없음(데이터 의존 추천 CTA 로만 조건부 등장).

    // 신규 법 개정 / 최근 판례 카드(dash-feed) — 둘 다 "모두 보기 →" 링크.
    // 헤딩 텍스트로 카드 존재 확인 + 링크는 href 로 구분.
    await expect(page.getByText("신규 법 개정")).toBeVisible();
    await expect(page.locator('a[href="/latest/laws"]').first()).toBeVisible();
    await expect(page.getByText("최근 판례", { exact: true })).toBeVisible();
    await expect(page.locator('a[href="/latest/cases"]').first()).toBeVisible();

    // 전체 진척도 도넛 3개(OverallProgressCard) — 새 유저는 모두 0%.
    await expect(page.getByText("전체 학습 진척도")).toBeVisible();
    // 도넛 라벨 "조문"/"판례"/"문제" + 0% 가 함께 노출.
    await expect(page.getByText("조문", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("0%").first()).toBeVisible();

    // 최근 학습 피드 — 새 유저는 빈 상태(RecentActivityCard).
    await expect(page.getByText("최근 학습 활동이 없습니다.")).toBeVisible();

    // 즐겨찾기 빠른 접근 — 새 유저는 빈 메시지(BookmarksQuickCard).
    await expect(
      page.getByText("즐겨찾기가 비어 있습니다", { exact: false }),
    ).toBeVisible();
  });
});
