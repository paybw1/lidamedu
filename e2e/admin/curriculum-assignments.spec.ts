// 커리큘럼 + 과제 배포 e2e 스모크 (feat-7-020 / feat-7-021).
// 운영자 화면(/admin/curricula, /admin/cohorts/:id/assignments) + 학생 과제함(/assignments)
// 핵심 요소 노출 + 신규 생성 자동 변환 흐름 검증.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const ADMIN_EMAIL = process.env.CURRICULUM_ADMIN_EMAIL;
const STUDENT_EMAIL = process.env.CURRICULUM_STUDENT_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ADMIN_EMAIL || !STUDENT_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "CURRICULUM_ADMIN_EMAIL, CURRICULUM_STUDENT_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let adminId: string | null = null;
let studentId: string | null = null;
let cohortId: string | null = null;
let curriculumId: string | null = null;
let weekId: string | null = null;

async function deleteUserIfExists(email: string) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const u = data?.users.find((x) => x.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
}

test.describe.serial("운영자 — 커리큘럼/과제", () => {
  test.beforeAll(async () => {
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
      .update({ name: "E2E 운영자(커리큘럼)", role: "admin" })
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
      .update({ name: "E2E 테스트 학생(커리큘럼)" })
      .eq("profile_id", studentId);

    // cohort + 멤버
    const cohort = await admin
      .from("cohorts")
      .insert({
        name: "E2E 커리큘럼 검증 cohort",
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

    // 커리큘럼 + 1주차 + 항목 1개(article_read)
    const curr = await admin
      .from("curricula")
      .insert({
        name: "E2E 1주 종합반",
        description: "스모크용",
        duration_weeks: 1,
        owner_id: adminId,
        is_published: true,
      })
      .select("curriculum_id")
      .single();
    if (curr.error || !curr.data) throw curr.error;
    curriculumId = curr.data.curriculum_id;

    const week = await admin
      .from("curriculum_weeks")
      .insert({
        curriculum_id: curriculumId,
        week_number: 1,
        title: "Week 1 — 스모크",
      })
      .select("week_id")
      .single();
    if (week.error || !week.data) throw week.error;
    weekId = week.data.week_id;

    // 첫 patent article 하나 pick
    const { data: articles } = await admin
      .from("articles")
      .select("article_id")
      .eq("level", "article")
      .limit(1);
    if (articles && articles.length > 0) {
      await admin.from("curriculum_items").insert({
        week_id: weekId,
        ord: 0,
        kind: "article",
        article_id: articles[0].article_id,
      });
    }

    // cohort 에 커리큘럼 적용
    await admin.from("cohort_curricula").insert({
      cohort_id: cohortId,
      curriculum_id: curriculumId,
      start_date: new Date().toISOString().slice(0, 10),
      assigned_by: adminId,
    });
  });

  test.afterAll(async () => {
    if (cohortId) {
      await admin.from("assignments").delete().eq("cohort_id", cohortId);
      await admin.from("cohort_curricula").delete().eq("cohort_id", cohortId);
      await admin.from("cohort_members").delete().eq("cohort_id", cohortId);
      await admin.from("cohorts").delete().eq("cohort_id", cohortId);
    }
    if (curriculumId) {
      await admin
        .from("curricula")
        .delete()
        .eq("curriculum_id", curriculumId);
    }
    if (studentId) await admin.auth.admin.deleteUser(studentId);
    if (adminId) await admin.auth.admin.deleteUser(adminId);
  });

  test("/admin/curricula — 목록 + 신규 커리큘럼 노출", async ({ page }) => {
    await loginUser(page, ADMIN_EMAIL!, TEST_PASSWORD);

    await page.goto("/admin/curricula");
    await expect(
      page.getByRole("heading", { name: "커리큘럼 관리" }),
    ).toBeVisible();
    await expect(page.getByText("E2E 1주 종합반")).toBeVisible();
  });

  test("/admin/curricula/:id — 편집 페이지 + 주차 + 항목", async ({ page }) => {
    if (!curriculumId) throw new Error("curriculumId 없음");
    await loginUser(page, ADMIN_EMAIL!, TEST_PASSWORD);

    await page.goto(`/admin/curricula/${curriculumId}`);
    await expect(
      page.getByRole("heading", { name: "E2E 1주 종합반" }),
    ).toBeVisible();
    await expect(page.getByText("Week 1")).toBeVisible();
  });

  test("/admin/cohorts/:id/assignments — 주차 자동 변환", async ({ page }) => {
    if (!cohortId) throw new Error("cohortId 없음");
    await loginUser(page, ADMIN_EMAIL!, TEST_PASSWORD);

    await page.goto(`/admin/cohorts/${cohortId}/assignments`);
    await expect(page.getByText(/E2E 커리큘럼 검증 cohort/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /자동 생성/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /수동 신규/ })).toBeVisible();
  });

  test("학생 /assignments — 자동 변환 후 노출", async ({ page }) => {
    if (!cohortId || !weekId || !adminId)
      throw new Error("시드 데이터 없음");

    // 자동 변환 — convertWeekToAssignment 호출 (REST 또는 직접 insert)
    const due = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const a = await admin
      .from("assignments")
      .insert({
        cohort_id: cohortId,
        title: "E2E 1주차 과제",
        due_at: due,
        created_by: adminId,
        source_week_id: weekId,
      })
      .select("assignment_id")
      .single();
    if (a.error || !a.data) throw a.error;

    // 학생 로그인
    await loginUser(page, STUDENT_EMAIL!, TEST_PASSWORD);

    await page.goto("/assignments");
    await expect(page.getByRole("heading", { name: "내 과제" })).toBeVisible();
    await expect(page.getByText("E2E 1주차 과제")).toBeVisible();
  });
});
