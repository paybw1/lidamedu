// 운영자 cohort 진도/통계 스모크 (feat-7-019).
// 회귀 보호:
//   - /admin/cohorts/:id/progress — 학생별 진도 표 노출
//   - /admin/cohorts/:id/stats — 평균 KPI + 분포 + 4주 추이 + 5과목 표 + 상/하위 5명
// admin 자격 + 학생 자격 + 최소 cohort 시드 후 두 화면 진입 검증.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.COHORT_STATS_ADMIN_EMAIL;
const STUDENT_EMAIL = process.env.COHORT_STATS_STUDENT_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ADMIN_EMAIL || !STUDENT_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "COHORT_STATS_ADMIN_EMAIL, COHORT_STATS_STUDENT_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let adminId: string | null = null;
let studentId: string | null = null;
let cohortId: string | null = null;

async function deleteUserIfExists(email: string) {
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const u = list?.users.find((x) => x.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
}

test.describe.serial("운영자 — cohort 진도/통계", () => {
  test.beforeAll(async () => {
    // 1) admin + 학생 정리/생성
    await deleteUserIfExists(ADMIN_EMAIL!);
    await deleteUserIfExists(STUDENT_EMAIL!);

    const adminUser = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (adminUser.error || !adminUser.data.user)
      throw adminUser.error ?? new Error("admin 생성 실패");
    adminId = adminUser.data.user.id;
    await admin
      .from("profiles")
      .update({ name: "E2E 운영자", role: "admin" })
      .eq("profile_id", adminId);

    const studentUser = await admin.auth.admin.createUser({
      email: STUDENT_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (studentUser.error || !studentUser.data.user)
      throw studentUser.error ?? new Error("student 생성 실패");
    studentId = studentUser.data.user.id;
    await admin
      .from("profiles")
      .update({ name: "E2E 테스트 학생" })
      .eq("profile_id", studentId);

    // 2) cohort + 멤버
    const cohort = await admin
      .from("cohorts")
      .insert({
        name: "E2E 통계 검증 cohort",
        description: "cohort-stats.spec.ts 자동 시드",
        owner_id: adminId,
      })
      .select("cohort_id")
      .single();
    if (cohort.error || !cohort.data) throw cohort.error;
    cohortId = cohort.data.cohort_id;
    await admin.from("cohort_members").insert({
      cohort_id: cohortId,
      profile_id: studentId,
      added_by: adminId,
    });

    // 3) 학생 시도 시드 — patent problem 6개 (시도 ≥ 5 충족), 4 정답 / 2 오답
    const { data: problems } = await admin
      .from("problems")
      .select("problem_id")
      .eq("subject_type", "law")
      .is("deleted_at", null)
      .limit(6);
    const attempts = (problems ?? []).map((p, i) => ({
      user_id: studentId!,
      problem_id: p.problem_id,
      is_correct: i < 4,
      mode: "study",
      time_spent_ms: 20000,
      attempted_at: new Date(Date.now() - i * 86400_000).toISOString(),
    }));
    if (attempts.length > 0)
      await admin.from("user_problem_attempts").insert(attempts);
  });

  test.afterAll(async () => {
    if (studentId)
      await admin.from("user_problem_attempts").delete().eq("user_id", studentId);
    if (cohortId) {
      await admin.from("cohort_members").delete().eq("cohort_id", cohortId);
      await admin.from("cohorts").delete().eq("cohort_id", cohortId);
    }
    if (studentId) await admin.auth.admin.deleteUser(studentId);
    if (adminId) await admin.auth.admin.deleteUser(adminId);
  });

  test("/admin/cohorts/:id/progress — 학생별 진도 표", async ({ page }) => {
    if (!cohortId) throw new Error("cohortId 없음");
    await page.goto("/login");
    await page.locator("#email").fill(ADMIN_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto(`/admin/cohorts/${cohortId}/progress`);
    await expect(
      page.getByRole("heading", { name: /학생 진도/ }),
    ).toBeVisible();
    // 학생 이름이 행에 노출
    await expect(page.getByText("E2E 테스트 학생")).toBeVisible();
    // 전체 통계 진입 버튼
    await expect(page.getByRole("link", { name: /전체 통계/ })).toBeVisible();
  });

  test("/admin/cohorts/:id/stats — 평균 KPI + 분포 + 4주 추이 + 5과목 + 상/하위", async ({
    page,
  }) => {
    if (!cohortId) throw new Error("cohortId 없음");
    await page.goto("/login");
    await page.locator("#email").fill(ADMIN_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto(`/admin/cohorts/${cohortId}/stats`);
    await expect(
      page.getByRole("heading", { name: /E2E 통계 검증 cohort/ }),
    ).toBeVisible();

    // 평균 KPI 4종
    await expect(page.getByText("평균 정답률")).toBeVisible();
    await expect(page.getByText("평균 시도 문제")).toBeVisible();
    await expect(page.getByText("평균 조문 열람")).toBeVisible();
    await expect(page.getByText("최근 7일 활동")).toBeVisible();

    // 분포 + 추이 + 5과목 + 상/하위
    await expect(page.getByText("정답률 분포")).toBeVisible();
    await expect(page.getByText(/최근 \d+주 추이/)).toBeVisible();
    await expect(page.getByText("과목별 평균")).toBeVisible();
    await expect(page.getByText("상위 5명")).toBeVisible();
    await expect(page.getByText("하위 5명")).toBeVisible();

    // 학생별 진도 진입 버튼
    await expect(page.getByRole("link", { name: /학생별 진도/ })).toBeVisible();
  });

  test("학생 detail — 반 평균 대비 비교 카드", async ({ page }) => {
    if (!studentId) throw new Error("studentId 없음");
    await page.goto("/login");
    await page.locator("#email").fill(ADMIN_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto(`/admin/students/${studentId}`);
    await expect(
      page.getByRole("heading", { name: /E2E 테스트 학생/ }),
    ).toBeVisible();
    await expect(page.getByText(/반 평균 대비/)).toBeVisible();
    await expect(page.getByText("E2E 통계 검증 cohort")).toBeVisible();
  });
});
