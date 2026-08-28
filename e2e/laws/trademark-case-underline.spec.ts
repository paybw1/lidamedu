// 상표 판례 제16판 반영 — 교재 밑줄이 실제 화면에 그어지는지(feat-3-213 §7 규칙 1).
//
// ★DB 에 `<u>` 마커가 들어간 건 이번이 처음이다. 데이터에 마커가 있다는 것과
//   화면에 밑줄이 보인다는 건 다른 얘기라, 실제 렌더를 한 번 확인한다.
//   같이 보는 것: 쟁점상표 표 · 문장 속 표장 그림(둘 다 같은 본문 경로를 탄다).
//
// ★검사 계정을 instructor 로 만든다 — 상표는 STUDENT_DISABLED 과목이라 학생에겐 안 열린다.

import { createClient } from "@supabase/supabase-js";
import { type Page, expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env");
}

// 2006후4086 — 밑줄 문단 7개 + 쟁점상표 표 + 문장 속 표장 그림.
const CASE_ID = "b317f55d-ab2b-4f58-b95a-5a38173d1c75";
const TEST_EMAIL = `e2e-tm-underline-${Date.now()}@example.com`;
const TEST_PASSWORD = "Test1234!";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId = "";
/** DB 의 첫 밑줄 문구 — 교재 문구가 바뀌어도 테스트가 따라간다. */
let firstUnderlineText = "";

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

test.describe.serial("상표 판례 뷰어 — 교재 밑줄", () => {
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

    const { data: row } = await admin
      .from("cases")
      .select("book_sections")
      .eq("case_id", CASE_ID)
      .single();
    const sections = (row?.book_sections as { sections?: { blocks?: { text?: string }[] }[] })
      ?.sections;
    const marked = (sections ?? [])
      .flatMap((s) => s.blocks ?? [])
      .map((b) => b.text ?? "")
      .find((t) => t.includes("<u>"));
    firstUnderlineText = /<u>([\s\S]*?)<\/u>/.exec(marked ?? "")?.[1] ?? "";
    expect(firstUnderlineText.length).toBeGreaterThan(15);
  });

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  });

  test("교재 밑줄이 <u> 요소로 그어지고, 마커 글자는 노출되지 않는다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto(`/subjects/trademark/cases/${CASE_ID}`);
    await dismissPopupNotice(page);

    const prose = page.locator(".case-prose").first();
    await expect(prose).toBeVisible({ timeout: 45000 });

    // ① 밑줄이 실제 <u> 요소다
    const underlines = page.locator(".case-prose u");
    await expect(underlines.first()).toBeVisible({ timeout: 15000 });
    expect(await underlines.count()).toBeGreaterThan(0);

    // ② 그 안 글자가 DB 의 밑줄 문구와 같다(앞 20자로 대조 — 줄바꿈·공백 차이 흡수)
    const head = firstUnderlineText.slice(0, 20).replace(/\s+/g, " ").trim();
    await expect(page.locator(".case-prose u", { hasText: head }).first()).toBeVisible();

    // ③ 마커 글자가 그대로 보이면 안 된다(렌더가 아니라 텍스트로 샌 것)
    await expect(page.getByText("<u>", { exact: false })).toHaveCount(0);
  });

  test("쟁점상표 표와 문장 속 표장 그림이 함께 렌더된다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto(`/subjects/trademark/cases/${CASE_ID}`);
    await dismissPopupNotice(page);
    await expect(page.locator(".case-prose").first()).toBeVisible({ timeout: 45000 });

    // 교재 구조 섹션 헤딩
    await expect(page.getByText("쟁점상표").first()).toBeVisible();

    // 해시 이름으로 올린 그림이 실제로 뜬다(깨진 URL 이면 naturalWidth 가 0)
    const img = page.locator('img[src*="/tmc-"]').first();
    await expect(img).toBeVisible({ timeout: 15000 });
    const w = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
    expect(w).toBeGreaterThan(0);
  });

  // 교재 표가 화면 밖으로 나가지 않는지 — 신고 사례(2010후3080 평석 표)를 회귀로 고정.
  // ★첫 열을 "라벨"로 보고 nowrap 을 걸면 첫 칸이 문장인 표가 통째로 넘친다(실측 374px).
  const CASES = [
    "cfcdd087-901e-4de5-bd58-c4e8c11baa95", // 2010후3080 평석 표(첫 칸 73자)
    "b317f55d-ab2b-4f58-b95a-5a38173d1c75", // 2006후4086 쟁점상표 표
  ];
  test("표가 담을 칸을 넘지 않는다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    for (const id of CASES) {
      await page.goto(`/subjects/trademark/cases/${id}`);
      await dismissPopupNotice(page);
      await expect(page.locator(".case-prose").first()).toBeVisible({ timeout: 45000 });
      const over = await page.evaluate(() => {
        const out: number[] = [];
        document.querySelectorAll<HTMLElement>(".overflow-x-auto").forEach((el) => {
          if (el.scrollWidth > el.clientWidth + 1) out.push(el.scrollWidth - el.clientWidth);
        });
        return out;
      });
      expect(over, `${id} 표 넘침(px)`).toEqual([]);
    }
  });

});