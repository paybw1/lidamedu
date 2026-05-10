// 슬롯 드래그&드롭 페이지 교환 검증.
//
// HTML5 DnD 는 Playwright 의 dragTo 가 직접적으로 잘 안먹는 경우가 있어,
// 같은 회귀 보호를 직접적으로 얻기 위해 server intent (swap-pages) 를 호출하는 흐름은
// JS evaluate 가 아닌 dataTransfer 시뮬레이션 + dispatchEvent 로 처리.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.GS_SWAP_TEST_USER_EMAIL;
const TEST_PASSWORD = "Test1234!";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_EMAIL || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "GS_SWAP_TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures");
const FIXTURE_1 = path.join(FIXTURE_DIR, "test-page-1.jpg");
const FIXTURE_2 = path.join(FIXTURE_DIR, "test-page-2.jpg");

let testRoundId: string | null = null;
let testUserId: string | null = null;

const anonClient = createClient(
  SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

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
      title: "[E2E TEST] GS 페이지 swap",
      subject: "patent",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 3 * 3600_000).toISOString(),
      duration_min: 60,
      status: "published",
      expected_pages: 4,
    })
    .select("round_id")
    .single();
  if (error || !round) throw error ?? new Error("round creation failed");
  await admin.from("gs_questions").insert([
    { round_id: round.round_id, order_index: 0, title: "문 1.", body_md: "Q1", max_score: 10 },
    { round_id: round.round_id, order_index: 1, title: "문 2.", body_md: "Q2", max_score: 10 },
    { round_id: round.round_id, order_index: 2, title: "문 3.", body_md: "Q3", max_score: 10 },
    { round_id: round.round_id, order_index: 3, title: "문 4.", body_md: "Q4", max_score: 10 },
  ]);
  return round.round_id;
}

test.describe.serial("GS 페이지 swap (드래그&드롭)", () => {
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

  test("페이지 1 ↔ 페이지 3 swap → 매핑 따라가는지 검증", async ({ page }) => {
    page.on("dialog", (d) => d.accept());

    // 로그인.
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    // 응시.
    await page.goto(`/gs/${testRoundId}/take`);
    await expect(
      page.getByRole("heading", { name: /\[E2E TEST\] GS 페이지 swap/ }),
    ).toBeVisible({ timeout: 15000 });

    // 슬롯 1, 3 에 서로 다른 이미지 업로드 (구분 가능하게).
    await page.getByTestId("gs-page-file-input-1").setInputFiles(FIXTURE_1);
    await expect(page.getByTestId("gs-page-slot-1")).toHaveAttribute(
      "data-empty",
      "false",
      { timeout: 30_000 },
    );
    await page.getByTestId("gs-page-file-input-3").setInputFiles(FIXTURE_2);
    await expect(page.getByTestId("gs-page-slot-3")).toHaveAttribute(
      "data-empty",
      "false",
      { timeout: 30_000 },
    );

    // 페이지 1 에 문 1 매핑, 페이지 3 에 문 3 매핑.
    await page.getByTestId("gs-page-1-question-1").click();
    await expect(page.getByTestId("gs-page-1-question-1")).toHaveAttribute(
      "data-on",
      "true",
    );
    await page.getByTestId("gs-page-3-question-3").click();
    await expect(page.getByTestId("gs-page-3-question-3")).toHaveAttribute(
      "data-on",
      "true",
    );

    // swap 전 file name 캡처 (서버 검증용).
    const sub = await admin
      .from("gs_submissions")
      .select("submission_id")
      .eq("user_id", testUserId!)
      .eq("round_id", testRoundId!)
      .maybeSingle();
    expect(sub.data?.submission_id).toBeTruthy();

    const before = await admin
      .from("gs_submission_pages")
      .select("page_number, attachment")
      .eq("submission_id", sub.data!.submission_id)
      .order("page_number", { ascending: true });
    const beforeMap = new Map<number, string>();
    for (const row of before.data ?? []) {
      const att = row.attachment as { fileName?: string } | null;
      beforeMap.set(row.page_number, att?.fileName ?? "");
    }

    // HTML5 DnD 시뮬레이션 — Playwright dragTo 는 일부 브라우저에서 dispatch 누락.
    // dataTransfer 채워서 dragstart → dragover → drop 직접 디스패치.
    const fromSelector = '[data-testid="gs-page-grip-1"]';
    const toSelector = '[data-testid="gs-page-slot-3"]';
    await page.evaluate(
      ({ fromSelector, toSelector }) => {
        const from = document.querySelector(fromSelector) as HTMLElement;
        const to = document.querySelector(toSelector) as HTMLElement;
        if (!from || !to) throw new Error("drag/drop elements not found");
        const dt = new DataTransfer();
        from.dispatchEvent(
          new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }),
        );
        to.dispatchEvent(
          new DragEvent("dragover", { bubbles: true, dataTransfer: dt }),
        );
        to.dispatchEvent(
          new DragEvent("drop", { bubbles: true, dataTransfer: dt }),
        );
        from.dispatchEvent(
          new DragEvent("dragend", { bubbles: true, dataTransfer: dt }),
        );
      },
      { fromSelector, toSelector },
    );

    // swap 결과 — 페이지 1 의 fileName 이 이전 페이지 3 의 fileName 과 같아야 한다.
    await expect.poll(
      async () => {
        const r = await admin
          .from("gs_submission_pages")
          .select("page_number, attachment")
          .eq("submission_id", sub.data!.submission_id)
          .order("page_number", { ascending: true });
        const map = new Map<number, string>();
        for (const row of r.data ?? []) {
          const att = row.attachment as { fileName?: string } | null;
          map.set(row.page_number, att?.fileName ?? "");
        }
        return (
          map.get(1) === beforeMap.get(3) && map.get(3) === beforeMap.get(1)
            ? "swapped"
            : "not yet"
        );
      },
      { timeout: 15_000, intervals: [500] },
    ).toBe("swapped");

    // 매핑도 함께 swap 됐는지: 이제 페이지 1 에 문 3, 페이지 3 에 문 1 이 매핑되어야.
    const mapsAfter = await admin
      .from("gs_question_pages")
      .select("page_number, question_id")
      .eq("submission_id", sub.data!.submission_id)
      .order("page_number", { ascending: true });
    const byPage = new Map<number, string[]>();
    for (const m of mapsAfter.data ?? []) {
      const arr = byPage.get(m.page_number) ?? [];
      arr.push(m.question_id);
      byPage.set(m.page_number, arr);
    }
    // 문항 ID 해석.
    const qs = await admin
      .from("gs_questions")
      .select("question_id, order_index")
      .eq("round_id", testRoundId!);
    const qByOrder = new Map<number, string>();
    for (const q of qs.data ?? []) qByOrder.set(q.order_index, q.question_id);
    expect(byPage.get(1)).toContain(qByOrder.get(2)); // 문 3 (order_index 2).
    expect(byPage.get(3)).toContain(qByOrder.get(0)); // 문 1 (order_index 0).
  });
});
