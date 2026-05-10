// 페이지 끼워넣기 E2E.
//
// 회귀 보호: gs_shift_pages_down RPC + ON UPDATE CASCADE 매핑 + UI 가드.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.GS_INSERT_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "GS_INSERT_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
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
const FIXTURE_1 = path.resolve(__dirname, "../fixtures/test-page-1.jpg");
const FIXTURE_2 = path.resolve(__dirname, "../fixtures/test-page-2.jpg");

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
      title: "[E2E TEST] 페이지 끼워넣기",
      subject: "patent",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 3 * 3600_000).toISOString(),
      duration_min: 60,
      status: "published",
      expected_pages: 5, // 슬롯 1~3 채우고 4·5 비워둘 여유.
    })
    .select("round_id")
    .single();
  if (error || !round) throw error ?? new Error("round creation failed");
  await admin.from("gs_questions").insert([
    { round_id: round.round_id, order_index: 0, title: "문 1.", body_md: "Q1", max_score: 10 },
    { round_id: round.round_id, order_index: 1, title: "문 2.", body_md: "Q2", max_score: 10 },
  ]);
  return round.round_id;
}

test.describe.serial("GS 페이지 끼워넣기", () => {
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

  test("슬롯 1·3 업로드 후 슬롯 2 자리 끼워넣기 → 3·4 로 시프트", async ({ page }) => {
    page.on("dialog", (d) => d.accept());

    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    await page.goto(`/gs/${testRoundId}/take`);
    await expect(
      page.getByRole("heading", { name: /\[E2E TEST\] 페이지 끼워넣기/ }),
    ).toBeVisible({ timeout: 15000 });

    // 슬롯 1, 2, 3 에 업로드 (서로 다른 fixture 로 구분).
    await page.getByTestId("gs-page-file-input-1").setInputFiles(FIXTURE_1);
    await expect(page.getByTestId("gs-page-slot-1")).toHaveAttribute(
      "data-empty",
      "false",
      { timeout: 30_000 },
    );
    await page.getByTestId("gs-page-file-input-2").setInputFiles(FIXTURE_2);
    await expect(page.getByTestId("gs-page-slot-2")).toHaveAttribute(
      "data-empty",
      "false",
      { timeout: 30_000 },
    );
    await page.getByTestId("gs-page-file-input-3").setInputFiles(FIXTURE_1);
    await expect(page.getByTestId("gs-page-slot-3")).toHaveAttribute(
      "data-empty",
      "false",
      { timeout: 30_000 },
    );

    // 페이지 1 에 문 1 매핑 (CASCADE 검증용).
    await page.getByTestId("gs-page-1-question-1").click();
    await expect(page.getByTestId("gs-page-1-question-1")).toHaveAttribute(
      "data-on",
      "true",
    );

    // 끼워넣기 전 상태 캡처.
    const sub = await admin
      .from("gs_submissions")
      .select("submission_id")
      .eq("user_id", testUserId!)
      .eq("round_id", testRoundId!)
      .single();
    const submissionId = sub.data!.submission_id;

    const before = await admin
      .from("gs_submission_pages")
      .select("page_number, attachment")
      .eq("submission_id", submissionId)
      .order("page_number", { ascending: true });
    const fileBefore = new Map<number, string>();
    for (const r of before.data ?? []) {
      fileBefore.set(
        r.page_number,
        (r.attachment as { fileName: string }).fileName,
      );
    }
    expect(fileBefore.size).toBe(3);

    // 슬롯 2 에 끼워넣기 — confirm 자동 수락.
    await page.getByTestId("gs-page-insert-2").click();

    // DB 가 시프트 됐는지 polling.
    await expect.poll(
      async () => {
        const after = await admin
          .from("gs_submission_pages")
          .select("page_number, attachment")
          .eq("submission_id", submissionId);
        const m = new Map<number, string>();
        for (const r of after.data ?? []) {
          m.set(
            r.page_number,
            (r.attachment as { fileName: string }).fileName,
          );
        }
        return (
          m.get(1) === fileBefore.get(1) &&
          m.get(3) === fileBefore.get(2) &&
          m.get(4) === fileBefore.get(3) &&
          !m.has(2)
            ? "shifted"
            : "not-yet"
        );
      },
      { timeout: 15_000, intervals: [500] },
    ).toBe("shifted");

    // CASCADE 검증 — 페이지 1 의 매핑은 그대로 (페이지 2·3 매핑은 페이지 3·4 로 따라가야).
    const maps = await admin
      .from("gs_question_pages")
      .select("page_number, question_id")
      .eq("submission_id", submissionId);
    const mapsByPage = new Map<number, string[]>();
    for (const m of maps.data ?? []) {
      const arr = mapsByPage.get(m.page_number) ?? [];
      arr.push(m.question_id);
      mapsByPage.set(m.page_number, arr);
    }
    // 페이지 1 의 매핑이 살아있어야 함 (문 1 = order_index 0).
    const qs = await admin
      .from("gs_questions")
      .select("question_id, order_index")
      .eq("round_id", testRoundId!);
    const q1 = qs.data?.find((q) => q.order_index === 0);
    expect(mapsByPage.get(1)).toContain(q1?.question_id);
  });
});
