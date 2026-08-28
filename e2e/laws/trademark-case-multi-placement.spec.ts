// feat-3-214 — 한 판례, 주제별 서술.
//
// 교재는 96후1866 을 주제9(등록적격성 개별 판단)와 주제19(지정상품 감축으로 제34①11
// 극복) 두 곳에서 **다른 각도로** 다룬다. 예전엔 배치가 한 곳뿐이라 주제19 쪽 서술이
// 통째로 안 보였다. 지금은 어느 주제에서 들어왔는지에 따라 본문이 갈린다.
//
// ★검사 계정을 instructor 로 — 상표는 STUDENT_DISABLED 과목이라 학생에겐 안 열린다.

import { createClient } from "@supabase/supabase-js";
import { type Page, expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env");
}

const TEST_EMAIL = `e2e-tm-multi-${Date.now()}@example.com`;
const TEST_PASSWORD = "Test1234!";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId = "";
let caseId = "";
let node9 = "";
let node19 = "";

async function dismissPopupNotice(page: Page): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const dialog = page.locator('[data-popup-notice="true"]');
    if (!(await dialog.count())) return;
    await dialog
      .first()
      .getByRole("button", { name: "닫기" })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(200);
  }
}

test.describe.serial("판례 다중 배치 — 주제별 서술", () => {
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
        profile_completed_at: new Date().toISOString(),
        role: "instructor",
      })
      .eq("profile_id", userId);

    // 사건번호·주제 제목으로 찾는다 — id 를 박아 두면 재적재 때 깨진다.
    const { data: kase } = await admin
      .from("cases")
      .select("case_id")
      .eq("case_number", "96후1866")
      .contains("subject_laws", ["trademark"])
      .is("deleted_at", null)
      .single();
    caseId = kase!.case_id;
    const { data: links } = await admin
      .from("case_systematic_links")
      .select("node_id, systematic_nodes(display_label)")
      .eq("case_id", caseId);
    for (const l of links ?? []) {
      const label =
        (l.systematic_nodes as { display_label: string } | null)?.display_label ?? "";
      if (label.startsWith("주제9 ")) node9 = l.node_id;
      if (label.startsWith("주제19 ")) node19 = l.node_id;
    }
    expect(node9, "주제9 배치").toBeTruthy();
    expect(node19, "주제19 배치").toBeTruthy();
  });

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  });

  test("주제마다 다른 본문이 열린다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto(`/subjects/trademark/cases/${caseId}?node=${node9}`);
    await dismissPopupNotice(page);
    await expect(page.locator(".case-prose").first()).toBeVisible({ timeout: 45000 });
    // 주제9 = 등록적격성 개별 판단(사실관계·본심 없음)
    await expect(
      page.getByText("상표의 등록적격성의 유무는 지정상품과의 관계", { exact: false }),
    ).toBeVisible();

    await page.goto(`/subjects/trademark/cases/${caseId}?node=${node19}`);
    await dismissPopupNotice(page);
    await expect(page.locator(".case-prose").first()).toBeVisible({ timeout: 45000 });
    // 주제19 = 지정상품 감축으로 제34①11 극복 — 이 서술이 예전엔 안 보였다
    await expect(
      page.getByText("지정상품에 관하여 종류를 일부 삭제", { exact: false }),
    ).toBeVisible();
  });

  test("두 자리를 오갈 수 있는 칩이 뜬다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto(`/subjects/trademark/cases/${caseId}?node=${node19}`);
    await dismissPopupNotice(page);
    await expect(page.locator(".case-prose").first()).toBeVisible({ timeout: 45000 });

    const box = page.locator("div").filter({ hasText: /^교재 수록/ }).last();
    await expect(box).toBeVisible();
    const chips = box.locator("a");
    await expect(chips).toHaveCount(2);
    // 지금 보는 자리에 aria-current
    await expect(box.locator('a[aria-current="page"]')).toContainText("주제19");
  });

  test("목록에서 들어가면 그 주제를 물고 간다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto(`/subjects/trademark?tab=cases&case_node=${node19}`);
    await dismissPopupNotice(page);
    const link = page.getByRole("link", { name: "96후1866" }).first();
    await expect(link).toBeVisible({ timeout: 45000 });
    expect(await link.getAttribute("href")).toContain(`node=${node19}`);
  });
});
