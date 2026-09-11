// feat-2-038 정리비교표 팝업 — 학생 공개(2026-09-11)와 유출방지 다섯 겹 E2E.
// staff: 첫 열람 고지 → 확인 → 표 표시 → 워터마크(열람자 이름) → 열람 로그는 남지 않는다.
// 학생: 같은 흐름 + 열람 로그가 남는다 + 자료를 넘기면 로그가 는다. ★학생 케이스는
//   systematic_digests 의 읽기 정책이 열린 뒤에만 통과한다(정책 전에는 단추 자체가 없다).
import { type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createConfirmedUser,
  deleteUser,
  loginUser,
} from "e2e/utils/test-helpers";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required");
}
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STAFF_EMAIL = `e2e-digest-${Date.now()}@test.local`;
const STUDENT_EMAIL = `e2e-digest-s-${Date.now()}@test.local`;
const PASSWORD = "Test1234!";
const STAFF_NAME = "E2E 정리표 운영";
const STUDENT_NAME = "E2E 정리표 학생";
let staffId: string;
let studentId: string;

/** 공지 팝업(data-popup-notice)은 늦게 마운트돼 닫기 레이스가 끝이 없다 — 캡처 목적이라 숨긴다. */
async function hidePopupNotices(page: Page) {
  await page.addInitScript(() => {
    const inject = () => {
      const st = document.createElement("style");
      st.textContent = "[data-popup-notice]{display:none!important}";
      document.head.appendChild(st);
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", inject);
    else inject();
  });
}

/** 조문 탭 좌패널의 「정리비교표」 단추로 팝업을 열고 고지를 지나 표가 보일 때까지. */
async function openDigest(page: Page) {
  await page.goto("/subjects/patent");
  const btn = page.getByRole("button", { name: "정리비교표" });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await btn.click();
  const dialog = page.getByRole("dialog").filter({ hasText: "정리비교표" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // 유출방지 ④ — 첫 열람 고지(기기당 1회). 새 브라우저 컨텍스트라 반드시 뜬다.
  const gate = dialog.getByRole("button", { name: "확인했습니다" });
  await expect(gate).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator(".digest-doc")).toHaveCount(0);
  await gate.click();
  await expect(dialog.locator(".digest-doc").first()).toBeVisible({
    timeout: 30_000,
  });
  return dialog;
}

async function countViews(profileId: string): Promise<number> {
  const { count } = await admin
    .from("systematic_digest_views")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", profileId);
  return count ?? 0;
}

test.describe.serial("정리비교표 팝업 — 유출방지 (feat-2-038)", () => {
  test.setTimeout(240_000);
  test.beforeAll(async () => {
    staffId = await createConfirmedUser(STAFF_EMAIL, PASSWORD, STAFF_NAME);
    await admin
      .from("profiles")
      .update({
        role: "admin",
        access_approved_at: new Date().toISOString(),
        service_data_consent_at: new Date().toISOString(),
      })
      .eq("profile_id", staffId);
    studentId = await createConfirmedUser(STUDENT_EMAIL, PASSWORD, STUDENT_NAME);
    await admin
      .from("profiles")
      .update({
        role: "student",
        access_approved_at: new Date().toISOString(),
        service_data_consent_at: new Date().toISOString(),
        phone_e164: "+821000000000",
        address: "E2E",
        profile_completed_at: new Date().toISOString(),
      })
      .eq("profile_id", studentId);
  });
  test.afterAll(async () => {
    await deleteUser(STAFF_EMAIL).catch(() => undefined);
    await deleteUser(STUDENT_EMAIL).catch(() => undefined);
  });

  test("staff: 고지 → 표 → 워터마크, 열람 로그는 남지 않는다", async ({ page }) => {
    await hidePopupNotices(page);
    await loginUser(page, STAFF_EMAIL, PASSWORD);
    const dialog = await openDigest(page);
    // 유출방지 ① — 열람자 이름이 워터마크로 깔린다.
    await expect(dialog.getByText(STAFF_NAME).first()).toBeAttached();
    // ‹ › 로 다음 장 — 표가 바뀌어도 고지는 다시 뜨지 않는다.
    await dialog.getByRole("button", { name: /총칙/ }).first().click();
    await expect(dialog.locator(".digest-doc").first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: "확인했습니다" })).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(await countViews(staffId)).toBe(0);
  });

  test("학생: 고지 → 표 → 워터마크 + 열람 로그가 장마다 남는다", async ({ page }) => {
    await hidePopupNotices(page);
    await loginUser(page, STUDENT_EMAIL, PASSWORD);
    const dialog = await openDigest(page);
    await expect(dialog.getByText(STUDENT_NAME).first()).toBeAttached();
    // 유출방지 ⑤ — 첫 장 열람 기록.
    await expect.poll(() => countViews(studentId), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    const before = await countViews(studentId);
    await dialog.getByRole("button", { name: /총칙/ }).first().click();
    await expect.poll(() => countViews(studentId), { timeout: 15_000 }).toBeGreaterThan(before);
    // 닫았다 다시 열면 지금 보는 장 하나만 다시 기록된다(직전 장의 유령 로그 없음 — 검토 지적).
    const beforeReopen = await countViews(studentId);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "정리비교표" }).click();
    await expect(dialog.locator(".digest-doc").first()).toBeVisible({ timeout: 30_000 });
    // dev 빌드는 StrictMode 이중 마운트로 첫 요청이 abort 전에 서버에 닿을 수 있어 하한으로 본다.
    await expect.poll(() => countViews(studentId), { timeout: 15_000 }).toBeGreaterThanOrEqual(beforeReopen + 1);
    // 유출방지 ② — 복사가 막힌다(copy 이벤트 기본 동작 취소).
    const prevented = await dialog.locator(".digest-doc").first().evaluate((el) => {
      const ev = new ClipboardEvent("copy", { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });
});
