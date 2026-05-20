// feat-4-A-117 — 조문 우측 패널 "관련자료" 회귀 보호.
// 1) 학생: 자료 등록된 조문 진입 시 카드 표시
// 2) staff: 새 자료 업로드 시 새 카드 추가
//
// 환경: 매 실행 timestamp 기반 unique email — supabase admin deleteUser 가 이 환경에서
// 안정적이지 않아 cleanup 우회 (memory: e2e-deleteuser-noop).

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PASSWORD = "Test1234!";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env 가 설정되어야 합니다.",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 가장 작은 valid PDF (1 page blank) — pdf-lib 동적 생성.
async function makeMinimalPdf(): Promise<Buffer> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

async function loginAs(
  page: import("@playwright/test").Page,
  email: string,
): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("/", { timeout: 20000 });
}

test.describe("lecture_resources — 관련자료 패널", () => {
  test("학생 — 자료 등록된 조문 진입 시 우측 패널에 카드 표시", async ({
    page,
  }) => {
    const email = `lr-student-${Date.now()}@test.local`;
    const created = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    const userId = created.data.user?.id;
    if (!userId) throw new Error("user not created");
    // paywall(feat-8-008 area_subjects)·onboarding(feat-8-017) 우회 — 학습 데이터 자체
    // 회귀 보호가 목적. instructor 권한이면 인증 게이팅을 모두 통과.
    await admin
      .from("profiles")
      .update({ role: "instructor", onboarded_at: new Date().toISOString() })
      .eq("profile_id", userId);

    await loginAs(page, email);

    // 제29조 — 이미 자동 import 로 강의노트 자료가 여러 건 등록된 조문
    await page.goto("/subjects/patent/articles/29");
    // 우측 패널 탭이 mount 될 때까지 대기
    const materialsTab = page
      .getByRole("tab", { name: /관련자료/ })
      .first();
    await materialsTab.waitFor({ state: "visible", timeout: 20000 });
    await materialsTab.click();

    // 카드 1개 이상 — 자동 import 한 자료의 title 패턴 "리담특허법 강의노트"
    await expect(
      page.getByText(/리담특허법 강의노트/).first(),
    ).toBeVisible({ timeout: 10000 });

    // "열기" 버튼 존재
    await expect(page.getByRole("button", { name: /열기/ }).first()).toBeVisible();
  });

  test("staff — 새 자료 업로드 시 카드 즉시 추가", async ({ page }) => {
    const email = `lr-staff-${Date.now()}@test.local`;
    const created = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    const userId = created.data.user?.id;
    if (!userId) throw new Error("user not created");

    // profiles.role = 'admin' — RLS 가 staff 만 insert 허용. paywall·onboarding 우회.
    const upd = await admin
      .from("profiles")
      .update({ role: "admin", onboarded_at: new Date().toISOString() })
      .eq("profile_id", userId);
    if (upd.error) throw upd.error;

    await loginAs(page, email);

    // 자료 적게 등록된 조문으로 진입 — 카드 추가가 visual 하게 명확
    // (제1조: import-pptx-lecture 의 ch1 s.4-8 1건만 등록됨)
    await page.goto("/subjects/patent/articles/1");
    const materialsTab = page
      .getByRole("tab", { name: /관련자료/ })
      .first();
    await materialsTab.waitFor({ state: "visible", timeout: 20000 });
    await materialsTab.click();

    // staff 권한 — "+ 자료 추가" 버튼 노출
    const addBtn = page.getByRole("button", { name: /자료 추가/ }).first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    // file input + title input
    const pdfBuffer = await makeMinimalPdf();
    const uniqueTitle = `E2E 자료 ${Date.now()}`;
    await page.locator('input[type="file"][name="file"]').setInputFiles({
      name: "e2e-test.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });
    await page.locator('input[name="title"]').fill(uniqueTitle);

    // 업로드 — form 안의 submit 버튼
    await page.getByRole("button", { name: /^업로드$/ }).click();

    // 새 카드 등장 (해당 unique title 매칭)
    await expect(page.getByText(uniqueTitle).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
