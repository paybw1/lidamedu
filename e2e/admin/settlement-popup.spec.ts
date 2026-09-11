// feat-8-031 — 강사 정산현황 팝업 E2E.
//
// 회귀 보호: 강의 플랫폼 우상단 계정 아이콘 → 「정산현황」 팝업이 열리고, 요약 칸이 채워지고,
// 월을 바꿔도 팝업이 닫히지 않으며, 닫은 뒤 페이지가 다시 클릭 가능해야 한다.
// ★마지막 항목이 핵심 — 드롭다운 항목에서 preventDefault 로 Dialog 를 여는 구조는 Radix 가
//   body 에 pointer-events:none 를 남겨 화면 전체가 죽는 사고가 잦다.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "Test1234!";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ★auth.users 는 지워지지 않는 경우가 있어 실행마다 고유 이메일을 쓴다.
const EMAIL = `e2e-settle-${Date.now()}@test.local`;
let userId: string | null = null;

test.describe.serial("강사 정산현황 팝업", () => {
  test.beforeAll(async () => {
    const u = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      // ★lecture.layout 은 profiles.name 이 아니라 user_metadata.name 을 쓴다(없으면 "학습자").
      user_metadata: { name: "E2E 강사" },
    });
    if (u.error || !u.data.user) throw u.error ?? new Error("user 생성 실패");
    userId = u.data.user.id;
    await admin
      .from("profiles")
      .update({ name: "E2E 강사", role: "instructor" })
      .eq("profile_id", userId);
  });

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  });

  test("계정 메뉴에서 열고 · 월을 바꾸고 · 닫은 뒤에도 화면이 살아있다", async ({
    page,
  }) => {
    await loginUser(page, EMAIL, PASSWORD);
    await page.goto("/lecture/home");

    // 계정 아이콘 → 정산현황
    await page.getByRole("button", { name: "E2E 강사" }).click();
    const menuItem = page.getByRole("menuitem", { name: "정산현황" });
    await expect(menuItem).toBeVisible();
    await menuItem.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("불러오는 중…")).toHaveCount(0, {
      timeout: 20_000,
    });

    // 요약 7칸 + 산식 라벨
    for (const label of [
      "결제",
      "환불",
      "수수료",
      "매출",
      "정산금액",
      "세금액",
      "정산 지급액",
    ]) {
      await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible();
    }
    // 배분 규칙·수수료율 미설정 안내(운영 준비 전 상태)
    await expect(dialog.getByText(/배분 규칙이 등록되지 않아/)).toBeVisible();
    await expect(dialog.getByText(/수수료율이 아직 설정되지 않아/)).toBeVisible();

    // 월 변경 — 팝업이 닫히지 않아야 한다.
    const select = dialog.locator("#settlement-month");
    const options = await select.locator("option").all();
    expect(options.length).toBe(12);
    await select.selectOption(await options[1].getAttribute("value"));
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("이 달에 정산 대상 결제가 없습니다.")).toBeVisible({
      timeout: 20_000,
    });

    // 닫기 → 본문이 다시 조작 가능해야 한다(pointer-events 잔류 확인).
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const bodyPointerEvents = await page.evaluate(
      () => getComputedStyle(document.body).pointerEvents,
    );
    expect(bodyPointerEvents).not.toBe("none");
    await page.getByRole("button", { name: "E2E 강사" }).click();
    await expect(page.getByRole("menuitem", { name: "정산현황" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  // ★원장 보고(2026-09-12): 강의 플랫폼에서만 뜨고 학습 플랫폼에서는 안 떴다.
  //   계정 메뉴는 두 플랫폼이 공유하지만 항목은 레이아웃이 주입하므로 양쪽을 다 지킨다.
  test("학습 플랫폼 계정 메뉴에서도 열린다", async ({ page }) => {
    // 대시보드는 팝업 공지·온보딩이 클릭을 가로챈다 — 억제값을 선주입한다
    //   ("never:" = 앞으로 보지 않기, popup-notice 컴포넌트 규약).
    const { data: notices } = await admin
      .from("popup_notices")
      .select("notice_id");
    await page.addInitScript((ids: string[]) => {
      for (const id of ids) {
        window.localStorage.setItem(
          `popupNoticeHiddenUntil:${id}`,
          "never:32503680000000",
        );
      }
    }, (notices ?? []).map((n) => n.notice_id));

    await loginUser(page, EMAIL, PASSWORD);
    await page.goto("/dashboard");
    // 신규 계정은 목표 입력 온보딩 시트가 모달로 떠 계정 메뉴를 가린다 — 건너뛴다.
    const skip = page.getByRole("button", { name: /지금은 건너뛰기/ });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await expect(skip).toBeHidden();
    }
    // 상단바는 역할(isStaff)을 스트리밍으로 늦게 받는다 — staff 전용 링크가 뜬 뒤에 연다.
    await expect(
      page.getByRole("link", { name: "운영관리" }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "E2E 강사" }).first().click();
    const menuItem = page.getByRole("menuitem", { name: "정산현황" });
    await expect(menuItem).toBeVisible();
    await menuItem.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("정산 지급액", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("전체 화면 /lecture/settlements 가 렌더된다", async ({ page }) => {
    await loginUser(page, EMAIL, PASSWORD);
    await page.goto("/lecture/settlements");
    await expect(
      page.getByRole("heading", { name: "정산현황", level: 1 }),
    ).toBeVisible();
    await expect(page.locator("#settlement-month")).toBeVisible();
    await expect(page.getByText("정산 지급액", { exact: true })).toBeVisible();
  });
});
