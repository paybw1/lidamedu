// 학습 보조 4-set 페이지 스모크 — 로그인 후 각 페이지가 200 + 헤더 노출.
// 새 유저(시드 데이터 없음) 의 빈 상태에서 렌더가 깨지지 않는지 확인.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.STUDY_AIDS_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "STUDY_AIDS_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required",
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

test.describe.serial("학습 보조 4-set 스모크", () => {
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

  test("4 페이지 — 빈 상태에서 헤더 + 안내 문구 노출", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    // 오답노트
    await page.goto("/study/wrong-note");
    await expect(page.getByRole("heading", { name: "오답노트" })).toBeVisible();
    await expect(page.getByText("오답이 없습니다")).toBeVisible();

    // 즐겨찾기
    await page.goto("/study/bookmarks");
    await expect(
      page.getByRole("heading", { name: "즐겨찾기 모음" }),
    ).toBeVisible();
    await expect(
      page.getByText("즐겨찾기가 없습니다", { exact: false }),
    ).toBeVisible();

    // 내 메모
    await page.goto("/study/notes");
    await expect(page.getByRole("heading", { name: "내 메모" })).toBeVisible();
    await expect(
      page.getByText("메모가 없습니다", { exact: false }),
    ).toBeVisible();

    // 내 하이라이트
    await page.goto("/study/highlights");
    await expect(
      page.getByRole("heading", { name: "내 하이라이트" }),
    ).toBeVisible();
    await expect(
      page.getByText("하이라이트가 없습니다", { exact: false }),
    ).toBeVisible();
  });

  test("대시보드 재학습 진입점 타일 4개 노출", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto("/dashboard");
    const tiles = page.getByTestId("study-aid-tiles");
    await expect(tiles).toBeVisible();
    await expect(tiles.getByText("오답노트")).toBeVisible();
    await expect(tiles.getByText("즐겨찾기")).toBeVisible();
    await expect(tiles.getByText("내 메모")).toBeVisible();
    await expect(tiles.getByText("내 하이라이트")).toBeVisible();
  });
});
