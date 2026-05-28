// ⌘K / Ctrl+K Command Palette 스모크 — 단축키로 열림 + 검색어 입력 시 결과 노출.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.SEARCH_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "SEARCH_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required",
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

test.describe.serial("Command Palette", () => {
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
        .update({ onboarded_at: new Date().toISOString() })
        .eq("profile_id", data.user.id);
    }
  });

  test.afterAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("Ctrl+K 로 열리고 검색어 입력 시 API 응답 표시", async ({ page }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);
    // 재스킨 후 /dashboard 는 자체 chrome(사이드바+탑바)으로 전역 nav 레이아웃 밖에 있어
    // CommandPalette 가 mount 되지 않는다. 전역 nav + 팔레트가 있는 보호 라우트로 진입.
    await page.goto("/study/wrong-note");

    // 단축키로 모달 열기.
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "전역 검색" });
    await expect(dialog).toBeVisible();

    // 기본 안내 문구 노출 (검색어 0자).
    await expect(dialog).toContainText("검색어를 입력하세요");

    // "특허" — 시드 데이터에 특허법 조문 다수 → 결과 노출.
    await dialog.getByPlaceholder("검색어를 입력하세요").first().fill("특허");
    // API + 디바운스 (180ms) + 렌더.
    await expect(dialog.getByText("조문", { exact: false })).toBeVisible({
      timeout: 5000,
    });

    // 닫기.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("네비 검색 버튼 클릭으로도 열림", async ({ page }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);
    // open-command-palette 버튼은 전역 navigation-bar 에 있음 (대시보드 자체 탑바 아님).
    await page.goto("/study/wrong-note");

    await page.getByTestId("open-command-palette").click();
    await expect(
      page.getByRole("dialog", { name: "전역 검색" }),
    ).toBeVisible();
  });
});
