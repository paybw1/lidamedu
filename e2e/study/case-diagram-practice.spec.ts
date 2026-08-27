// 판례 도식 연습 모드 — 법리·포섭 빈칸에 쓰고 「맞춰보기」로 채점(feat-2-035 S6).
//
// 검증 축:
//   ① 연습으로 바꾸면 법리·포섭이 빈칸이 되고 **결론이 가려진다**(먼저 보이면 답을 읽는다)
//   ② ★축이 어긋나도 인정 — 취지의 해석 칸 내용을 문언적 해석 자리에 써도 그 축은 맞은 것
//   ③ 초안이 브라우저에 남아 새로고침해도 살아 있다
//
// 실데이터: 특허 2010후3356 도식(쟁점 2개, 첫 쟁점에 문언적/취지의 해석 2축 + 포섭·결론).
// ★검사 계정을 instructor 로 만든다 — 도식 RLS 는 `private.is_staff()` 단일 정책이라
//   **학생에게는 도식 자체가 안 보인다**(2026-08-23 staff 전용 결정). 학생 공개로
//   바뀌면 이 준비만 student 로 되돌리면 된다.

import { createClient } from "@supabase/supabase-js";
import { type Page, expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env");
}

const CASE_ID = "d4fe5626-b959-4eb9-bf6a-c0e3d9af844d"; // 2010후3356
const TEST_EMAIL = `e2e-diagram-${Date.now()}@example.com`;
const TEST_PASSWORD = "Test1234!";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId = "";
/** 첫 쟁점의 모범답안 — DB 에서 읽어 온다(문구가 바뀌어도 테스트가 따라간다). */
let axis0 = "";
let axis1 = "";
let application = "";
let conclusion = "";

async function dismissPopupNotice(page: Page): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    if (!(await dialog.count())) return;
    if (!(await dialog.first().isVisible().catch(() => false))) return;
    const close = dialog.first().getByRole("button", { name: "닫기" });
    if (!(await close.count())) return;
    await close.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
}

/** 판례 뷰어를 열고 도식 패널까지 띄운다(?diagram=1 이면 열린 채로 뜬다). */
async function openDiagram(page: Page): Promise<void> {
  await page.goto(`/subjects/patent/cases/${CASE_ID}?diagram=1`);
  await dismissPopupNotice(page);
  await expect(page.getByText("판례 도식")).toBeVisible({ timeout: 45000 });
}

const practiceTab = (page: Page) => page.getByRole("button", { name: "연습" });
const readTab = (page: Page) => page.getByRole("button", { name: "읽기" });
/** 법리·포섭 입력칸 — 연습 모드에서만 뜬다. */
const inputs = (page: Page) => page.locator("textarea");

test.describe.serial("판례 도식 — 답안 쓰기 연습", () => {
  test.beforeAll(async () => {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error || !created.user) throw error ?? new Error("createUser 실패");
    userId = created.user.id;
    await admin
      .from("profiles")
      .update({
        access_approved_at: new Date().toISOString(),
        service_data_consent_at: new Date().toISOString(),
        // feat-8-030 필수정보 게이트 — 미입력이면 /onboarding/profile 로 튕긴다.
        profile_completed_at: new Date().toISOString(),
        role: "instructor",
      })
      .eq("profile_id", userId);

    const { data: diagram } = await admin
      .from("case_diagrams")
      .select("blocks, review_status")
      .eq("case_id", CASE_ID)
      .single();
    expect(diagram?.review_status).toBe("approved"); // 학생에게 보이는 도식이어야 한다
    const block = (
      diagram?.blocks as Array<{
        doctrine: Record<string, string>;
        application: string;
        conclusion: string;
      }>
    )[0];
    axis0 = block.doctrine.textual ?? "";
    axis1 = block.doctrine.purpose ?? "";
    application = block.application;
    conclusion = block.conclusion;
    expect(axis0.length).toBeGreaterThan(20);
    expect(axis1.length).toBeGreaterThan(20);
    expect(conclusion.length).toBeGreaterThan(2);
  });

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  });

  test("연습으로 바꾸면 법리·포섭이 빈칸이 되고 결론이 가려진다", async ({
    page,
  }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await openDiagram(page);

    // 읽기에서는 모범답안과 결론이 그대로 보인다.
    await expect(page.getByText(axis0.slice(0, 30))).toBeVisible();
    await expect(page.getByText(conclusion.slice(0, 20)).first()).toBeVisible();

    await practiceTab(page).click();

    // 빈칸이 생기고, 모범답안·결론은 사라진다.
    await expect(inputs(page).first()).toBeVisible();
    await expect(page.getByText(axis0.slice(0, 30))).toHaveCount(0);
    await expect(page.getByText(conclusion.slice(0, 20))).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "맞춰보기" }).first(),
    ).toBeVisible();
  });

  test("모범답안대로 쓰면 인정 100% + 결론이 열린다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await openDiagram(page);
    await practiceTab(page).click();

    await inputs(page).nth(0).fill(`${axis0}\n\n${axis1}`);
    await inputs(page).nth(1).fill(application);
    await page.getByRole("button", { name: "맞춰보기" }).first().click();

    // 두 축 모두 인정 — 100%.
    await expect(page.getByText("2갈래 중")).toBeVisible();
    await expect(page.getByText("인정 · 100%").first()).toBeVisible();
    // 맞춰본 뒤에야 결론이 열린다.
    await expect(page.getByText(conclusion.slice(0, 20)).first()).toBeVisible();
  });

  test("★축이 어긋나도 인정 — 취지의 해석 내용만 써도 그 축은 맞은 것", async ({
    page,
  }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await openDiagram(page);
    await practiceTab(page).click();

    // 두 번째 축(취지의 해석)의 내용만 제출한다 — 어느 칸에 쓰는지는 묻지 않는다.
    await inputs(page).nth(0).fill(axis1);
    await page.getByRole("button", { name: "맞춰보기" }).first().click();

    await expect(page.getByText("2갈래 중")).toBeVisible();
    // 취지의 해석은 100% 인정, 문언적 해석은 못 쓴 것으로 미흡.
    const report = page.locator("text=취지의 해석").first();
    await expect(report).toBeVisible();
    await expect(page.getByText("인정 · 100%").first()).toBeVisible();
    await expect(page.getByText("미흡").first()).toBeVisible();
    await expect(page.getByText("1갈래").first()).toBeVisible();
  });

  test("쓰다 만 초안은 새로고침해도 남는다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await openDiagram(page);
    await practiceTab(page).click();

    const draft = "확인대상발명은 구체적으로 특정되어야 한다";
    await inputs(page).nth(0).fill(draft);
    await inputs(page).nth(0).blur(); // 초안 저장은 blur 에서 일어난다

    await openDiagram(page);
    // 「연습」 선택도 localStorage 에 남아 다시 고르지 않아도 된다.
    await expect(inputs(page).first()).toBeVisible();
    await expect(inputs(page).nth(0)).toHaveValue(draft);
  });

  test("읽기로 돌아오면 모범답안이 다시 보인다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await openDiagram(page);
    await readTab(page).click();
    await expect(page.getByText(axis0.slice(0, 30))).toBeVisible();
    await expect(inputs(page)).toHaveCount(0);
  });
});
