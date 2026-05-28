// 운영자 회차 편집의 PaperPageHint E2E.
//
// 회귀 보호: 시험지 PDF 페이지 수와 expected_pages 가 다를 때 안내 + "맞추기" 버튼.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const TEST_EMAIL = process.env.GS_PAPER_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "GS_PAPER_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PDF = path.resolve(__dirname, "../fixtures/test-multipage.pdf");

let testRoundId: string | null = null;
let testUserId: string | null = null;

async function ensureCleanUser(email: string) {
  const { data } = await anonClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  const id = data?.user?.id;
  if (id) {
    await admin.from("gs_submissions").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  // 잔여 회차도 정리.
  await admin.from("gs_rounds").delete().like("title", "[E2E TEST] paper-sync%");
}

test.describe.serial("GS 운영자: 시험지 페이지 ↔ expected_pages 동기화", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("user create failed");
    testUserId = data.user.id;
    // admin 역할로 승격 — admin-gs-edit 진입 가능하도록.
    const promote = await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("profile_id", testUserId);
    if (promote.error) throw promote.error;

    const { data: round, error: rErr } = await admin
      .from("gs_rounds")
      .insert({
        title: "[E2E TEST] paper-sync 회차",
        subject: "patent",
        start_at: new Date(Date.now() - 60_000).toISOString(),
        end_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
        duration_min: 60,
        status: "draft",
        expected_pages: 20,
      })
      .select("round_id")
      .single();
    if (rErr || !round) throw rErr ?? new Error("round creation failed");
    testRoundId = round.round_id;
  });

  test.afterAll(async () => {
    if (testRoundId) {
      await admin.from("gs_rounds").delete().eq("round_id", testRoundId);
    }
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("시험지 PDF 업로드 → 페이지 수 불일치 안내 → 맞추기 → 저장", async ({
    page,
  }) => {
    await loginUser(page, TEST_EMAIL!, TEST_PASSWORD);

    await page.goto(`/admin/gs/${testRoundId}`);
    await expect(
      page.getByRole("heading", { name: /\[E2E TEST\] paper-sync 회차/ }),
    ).toBeVisible({ timeout: 15000 });

    // 시험지 PDF 업로드 — PaperSlot 의 file input.
    const paperFileInput = page.locator(
      'input[type="file"][accept="application/pdf"]',
    ).first();
    await paperFileInput.setInputFiles(FIXTURE_PDF);

    // 업로드 완료 후 PaperPageHint 가 나타나야 함. PDF 가 3페이지인데 expected_pages 가 20.
    // 분석 중 → 결과 까지 polling.
    await expect.poll(
      async () => {
        const text = await page.locator("body").innerText();
        return text.includes("시험지 3페이지") &&
          text.includes("답안지 페이지 수 20")
          ? "mismatch"
          : "wait";
      },
      { timeout: 30_000, intervals: [1000] },
    ).toBe("mismatch");

    // expected_pages input 의 현재 값은 20.
    const expectedInput = page.locator('input[name="expectedPages"]');
    await expect(expectedInput).toHaveValue("20");

    // "맞추기" 버튼 클릭.
    await page
      .getByRole("button", { name: /답안지 페이지 수를 3로 맞추기/ })
      .click();
    await expect(expectedInput).toHaveValue("3");

    // 폼 저장 — "회차 저장" 버튼.
    await page.getByRole("button", { name: "회차 저장" }).click();

    // DB 에서 expected_pages = 3 확인.
    await expect
      .poll(
        async () => {
          const { data: row } = await admin
            .from("gs_rounds")
            .select("expected_pages")
            .eq("round_id", testRoundId!)
            .maybeSingle();
          return row?.expected_pages ?? null;
        },
        { timeout: 10_000, intervals: [500] },
      )
      .toBe(3);

    // UI 도 갱신 후 일치 안내가 보여야 함.
    await expect(page.getByText(/시험지 3페이지 = 답안지 페이지 수 3\. 일치/)).toBeVisible({
      timeout: 30_000,
    });
  });
});
