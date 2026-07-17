// 조문 뷰어 빈칸 인라인 편집 E2E (feat-2-029 후속 — 조문 이식).
// staff 로 ?blankMode=1&blankEdit=1 직행(URL 모드 유지 경로 검증 겸) → 본문 selection →
// "새 빈칸" → 내 세트 자동 생성 확인 → chip 클릭 → "빈칸 제거" → 세트 빈칸 0 확인.
// 테스트 유저 소유 세트만 만들어지므로 afterAll 에서 세트·유저 삭제 — 잔류 변경 없음.

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

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

const STAFF_EMAIL = `e2e-artblank-${Date.now()}@test.local`;
const PASSWORD = "Test1234!";
const ARTICLE_URL = "/subjects/patent/articles/1?blankMode=1&blankEdit=1";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let staffId: string;

async function dismissPopupNotices(page: Page) {
  for (let i = 0; i < 5; i++) {
    const close = page
      .getByRole("dialog")
      .getByRole("button", { name: "닫기" })
      .first();
    if (!(await close.isVisible().catch(() => false))) break;
    await close.click();
    await page.waitForTimeout(300);
  }
}

test.describe.serial("조문 뷰어 빈칸 인라인 편집", () => {
  test.beforeAll(async () => {
    staffId = await createConfirmedUser(STAFF_EMAIL, PASSWORD, "E2E 조문빈칸");
    await admin
      .from("profiles")
      .update({ role: "admin", access_approved_at: new Date().toISOString() })
      .eq("profile_id", staffId);
  });

  test.afterAll(async () => {
    await admin.from("article_blank_sets").delete().eq("owner_id", staffId);
    await deleteUser(STAFF_EMAIL);
  });

  test("드래그 추가 → 내 세트 생성 → chip 제거", async ({ page }) => {
    test.setTimeout(240_000);

    // 팝업 공지는 마운트 타이밍이 불규칙해 클릭을 가로챈다 — localStorage 억제값을
    // 선주입해 모달 자체가 뜨지 않게 한다("never:" = 앞으로 보지 않기, 컴포넌트 규약).
    const { data: notices } = await admin.from("popup_notices").select("notice_id");
    const noticeIds = (notices ?? []).map((n) => n.notice_id);
    await page.addInitScript((ids: string[]) => {
      for (const id of ids) {
        window.localStorage.setItem(
          `popupNoticeHiddenUntil:${id}`,
          "never:32503680000000",
        );
      }
    }, noticeIds);

    await loginUser(page, STAFF_EMAIL, PASSWORD);

    // 1) URL 파라미터로 빈칸 편집 모드 직행(팝업 늦은 마운트 대응 재시도 루프).
    await page.goto(ARTICLE_URL);
    const editBanner = page.getByText("빈칸 편집 모드");
    for (let i = 0; i < 15; i++) {
      await dismissPopupNotices(page);
      if (await editBanner.isVisible().catch(() => false)) break;
      await page.waitForTimeout(1000);
    }
    await expect(editBanner).toBeVisible();

    // 2) 본문 text node 하나를 selection 으로 잡고 mouseup → "새 빈칸".
    const answer = await page.evaluate(() => {
      const root = document.querySelector("[data-blank-edit-root]");
      if (!root) throw new Error("편집 컨테이너 미발견");
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const text = node.textContent ?? "";
        // 공백 없는 6자 이상 연속 구간을 찾는다(안정적 정답 후보).
        const m = /[가-힣]{6,}/.exec(text);
        if (m) {
          // fixed 플로팅 버튼이 뷰포트 안에 오도록 먼저 스크롤.
          node.parentElement?.scrollIntoView({ block: "center" });
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const sel = window.getSelection()!;
          sel.removeAllRanges();
          sel.addRange(range);
          (node.parentElement ?? root).dispatchEvent(
            new MouseEvent("mouseup", { bubbles: true }),
          );
          return m[0];
        }
        node = walker.nextNode();
      }
      throw new Error("본문 텍스트 미발견");
    });
    await page.getByRole("button", { name: /새 빈칸/ }).click();

    // 3) DB — 내 세트 자동 생성 + blank 1개.
    let setId = "";
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("article_blank_sets")
            .select("set_id, blanks")
            .eq("owner_id", staffId);
          const set = data?.[0];
          if (!set) return "no-set";
          setId = set.set_id;
          const blanks = (set.blanks ?? []) as { answer?: string }[];
          return blanks.some((b) => b.answer === answer) ? "ok" : "no-blank";
        },
        { timeout: 20000 },
      )
      .toBe("ok");

    // 4) UI revalidation — 빈칸 chip(정답 텍스트 placeholder 버튼) 등장 대기 후 클릭 → 제거.
    const chip = page.locator("[data-blank-idx]").first();
    await expect(chip).toBeVisible({ timeout: 20000 });
    await chip.click();
    await page.getByRole("button", { name: /빈칸 제거/ }).click();

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("article_blank_sets")
            .select("blanks")
            .eq("set_id", setId)
            .single();
          return ((data?.blanks ?? []) as unknown[]).length;
        },
        { timeout: 20000 },
      )
      .toBe(0);
  });
});
