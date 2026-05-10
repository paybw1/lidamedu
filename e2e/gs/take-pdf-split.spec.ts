// 다페이지 PDF 자동 분할 흐름 E2E.
//
// 사용자가 슬롯 1 에 3페이지 PDF 를 올리면 confirm 다이얼로그가 뜨고, 수락 시
// 클라이언트 PDF.js 가 페이지별 JPEG 으로 변환해 슬롯 1·2·3 에 순차 분배한다.
// 이 테스트는 그 흐름의 회귀를 잡는다.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.GS_PDF_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "GS_PDF_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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
}

async function createTestRound(): Promise<string> {
  const { data: round, error } = await admin
    .from("gs_rounds")
    .insert({
      title: "[E2E TEST] PDF 분할",
      subject: "patent",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 3 * 3600_000).toISOString(),
      duration_min: 60,
      status: "published",
      expected_pages: 5, // 3 페이지 PDF + 여유.
    })
    .select("round_id")
    .single();
  if (error || !round) throw error ?? new Error("round creation failed");
  await admin.from("gs_questions").insert([
    { round_id: round.round_id, order_index: 0, title: "문 1.", body_md: "Q1", max_score: 10 },
    { round_id: round.round_id, order_index: 1, title: "문 2.", body_md: "Q2", max_score: 10 },
    { round_id: round.round_id, order_index: 2, title: "문 3.", body_md: "Q3", max_score: 10 },
  ]);
  return round.round_id;
}

test.describe.serial("GS PDF 다페이지 자동 분할", () => {
  test.beforeAll(async () => {
    await ensureCleanUser(TEST_EMAIL!);
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("user create failed");
    testUserId = data.user.id;
    testRoundId = await createTestRound();
  });

  test.afterAll(async () => {
    if (testRoundId) {
      await admin.from("gs_rounds").delete().eq("round_id", testRoundId);
    }
    await ensureCleanUser(TEST_EMAIL!);
  });

  test("3페이지 PDF → 슬롯 1·2·3 에 이미지로 자동 분배", async ({ page }) => {
    // confirm 다이얼로그(분할 여부) 를 자동 수락.
    page.on("dialog", (d) => d.accept());

    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto(`/gs/${testRoundId}/take`);
    await expect(
      page.getByRole("heading", { name: /\[E2E TEST\] PDF 분할/ }),
    ).toBeVisible({ timeout: 15000 });

    // 슬롯 1 에 PDF 업로드. 다이얼로그는 자동 수락 → 분할 + 순차 업로드.
    await page
      .getByTestId("gs-page-file-input-1")
      .setInputFiles(FIXTURE_PDF);

    // 분할 + 3장 업로드 (PDF.js 워커 로드 + 페이지 렌더 + 순차 fetch).
    // 슬롯 1·2·3 모두 채워지길 기다린다.
    for (const n of [1, 2, 3]) {
      await expect(page.getByTestId(`gs-page-slot-${n}`)).toHaveAttribute(
        "data-empty",
        "false",
        { timeout: 60_000 },
      );
    }

    // 슬롯 4·5 는 그대로 비어 있어야 한다 (3페이지 PDF 였으므로).
    await expect(page.getByTestId("gs-page-slot-4")).toHaveAttribute(
      "data-empty",
      "true",
    );
    await expect(page.getByTestId("gs-page-slot-5")).toHaveAttribute(
      "data-empty",
      "true",
    );

    // DB 검증 — 페이지 1·2·3 모두 image/* MIME 이어야 한다 (PDF 가 아니라 분할된 JPEG).
    const sub = await admin
      .from("gs_submissions")
      .select("submission_id")
      .eq("user_id", testUserId!)
      .eq("round_id", testRoundId!)
      .maybeSingle();
    expect(sub.data?.submission_id).toBeTruthy();

    const pages = await admin
      .from("gs_submission_pages")
      .select("page_number, attachment")
      .eq("submission_id", sub.data!.submission_id)
      .order("page_number", { ascending: true });
    expect(pages.data).toHaveLength(3);
    for (const row of pages.data ?? []) {
      const att = row.attachment as { mime?: string; size?: number } | null;
      expect(att?.mime).toMatch(/^image\//);
      expect(att?.size ?? 0).toBeGreaterThan(20 * 1024);
    }
  });
});
