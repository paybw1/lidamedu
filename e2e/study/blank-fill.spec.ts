// 조문 빈칸 채우기 — 정답 시 자동이동 없음 + Enter 로 다음 빈칸 이동(글자 이월 leak 없음).
// fix(blanks): 자동 focus 이동 제거 → Enter 이동. IME 조합 잔여 이월(leak) 근절 검증.
//
// 실데이터: 특허법 제29조 빈칸 세트(27칸). 게이트(승인·필수동의)는 service_role 로 우회.

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env");
}

// 특허법 제29조 (level=article) — 27칸 빈칸 세트 보유.
const ARTICLE_ID = "79650d86-1a89-46bb-ae76-323f5e72a05d";
const TEST_EMAIL = `e2e-blank-${Date.now()}@example.com`;
const TEST_PASSWORD = "Test1234!";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId = "";
let setId = "";
const answerByIdx = new Map<number, string>();

// 클로즈(내용 빈칸) 모드 진입 후 렌더된 빈칸 input 들의 idx 를 DOM 순서대로 반환.
async function enterClozeMode(page: Page): Promise<number[]> {
  await page.goto(`/subjects/patent/articles/29?blank=${setId}`);
  await page.getByRole("button", { name: /내용 빈칸/ }).first().click();
  // 콜드 컴파일 대비 넉넉한 타임아웃.
  await expect(page.locator('input[aria-label^="빈칸"]').first()).toBeVisible({
    timeout: 45000,
  });
  const labels = await page
    .locator('input[aria-label^="빈칸"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || ""));
  return labels
    .map((l) => Number(l.replace(/[^0-9]/g, "")))
    .filter((n) => Number.isFinite(n));
}

test.describe.serial("조문 빈칸 — 자동이동 없음 + Enter 이동(leak 없음)", () => {
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
      })
      .eq("profile_id", userId);
    const { data: set } = await admin
      .from("article_blank_sets")
      .select("set_id, blanks")
      .eq("article_id", ARTICLE_ID)
      .maybeSingle();
    if (!set) throw new Error("제29조 빈칸 세트 없음");
    setId = set.set_id;
    for (const b of set.blanks as Array<{ idx: number; answer: string }>) {
      if (b.answer) answerByIdx.set(b.idx, b.answer);
    }
    expect(answerByIdx.size).toBeGreaterThan(1);
  });

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  });

  test("정답 시 자동이동 없음 → Enter 로 다음 빈칸(빈값)으로 이동", async ({
    page,
  }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    const idxs = await enterClozeMode(page);
    const idx = idxs.find((i) => answerByIdx.has(i))!;
    const input = page.locator(`input[aria-label="빈칸 ${idx}"]`);

    // 정답 입력 → correct(emerald) 표시.
    await input.fill(answerByIdx.get(idx)!);
    await expect(input).toHaveClass(/emerald/, { timeout: 10000 });

    // ★자동이동 없음 — 정답을 맞혀도 포커스가 그 칸에 그대로 있어야 한다.
    const activeAfterCorrect = await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    );
    expect(activeAfterCorrect).toBe(`빈칸 ${idx}`);

    // Enter → 다음 빈칸으로 이동, 그 칸은 빈 값(이월 leak 없음).
    await input.press("Enter");
    const moved = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      return { label: el?.getAttribute("aria-label"), value: el?.value };
    });
    expect(moved.label).toMatch(/^빈칸 /);
    expect(moved.label).not.toBe(`빈칸 ${idx}`);
    expect(moved.value ?? "").toBe("");
  });

  test("연속 정답+Enter 3회 — 매번 빈 칸으로 이동(누적 leak 없음)", async ({
    page,
  }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    const idxs = await enterClozeMode(page);
    const targets = idxs.filter((i) => answerByIdx.has(i)).slice(0, 3);
    expect(targets.length).toBe(3);
    for (const idx of targets) {
      const input = page.locator(`input[aria-label="빈칸 ${idx}"]`);
      await input.fill(answerByIdx.get(idx)!);
      await expect(input).toHaveClass(/emerald/, { timeout: 10000 });
      await input.press("Enter");
      const val = await page.evaluate(
        () => (document.activeElement as HTMLInputElement | null)?.value ?? "",
      );
      expect(val).toBe("");
    }
  });

  test("IME 조합 중 Enter 는 이동하지 않는다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    const idxs = await enterClozeMode(page);
    const idx = idxs.find((i) => answerByIdx.has(i))!;
    const input = page.locator(`input[aria-label="빈칸 ${idx}"]`);
    await input.focus();
    await input.dispatchEvent("compositionstart");
    await input.press("Enter");
    const during = await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    );
    expect(during).toBe(`빈칸 ${idx}`);
    await input.dispatchEvent("compositionend");
  });
});
