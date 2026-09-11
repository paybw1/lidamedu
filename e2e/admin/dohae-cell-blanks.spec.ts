// feat-2-037 S7 — 도해 표 **칸 가리기**(정리비교표식) E2E.
// staff 로 체계도 노드 → 도해 팝업(r1-3 절차의 불수리 — 행·열 목차가 둘 다 있는 2칸 표)
// → 저작권 고지 확인 → 「칸 가리기」 모드 켜기 → 열 목차 클릭(세로줄 가림) → 모서리(전체)
// → 행 목차(가로줄) → 내용칸 하나 토글 → 「전부 가리기」(접힌 절이 열리는지) → 낱말 빈칸
// 모드로 들어가면 칸 가리기가 꺼지는지 → 다시 켜기 → 모드를 끄면 풀리는지. 학생에게는 모드
// 단추도 손잡이도 없어야 한다(staff 선출시).
// ★정리비교표의 교훈: 따로 만든 재현은 되는데 진짜 팝업에서는 안 되는 사고가 전부였다 —
//   그래서 실제 화면을 그대로 띄워 누른다.
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

const STAFF_EMAIL = `e2e-dohaecell-${Date.now()}@test.local`;
const STUDENT_EMAIL = `e2e-dohaecell-s-${Date.now()}@test.local`;
const PASSWORD = "Test1234!";
const UNIT_KEY = "r1-3"; // 절차의 불수리(서류의 반려) — 「제 도 / 내 용」 10줄×2칸

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let staffId: string;
let studentId: string;
let unitId: string;
let nodeId: string;

/** 팝업 공지(있으면)만 닫는다 — 도해 팝업의 닫기는 누르지 않는다. */
async function dismissPopupNotices(page: Page) {
  for (let i = 0; i < 5; i++) {
    const close = page
      .getByRole("dialog")
      .filter({ hasNotText: "도해특허법" })
      .getByRole("button", { name: "닫기" })
      .first();
    if (!(await close.isVisible().catch(() => false))) break;
    await close.click();
    await page.waitForTimeout(300);
  }
}

/** 도해 팝업을 열어 본문(표)이 그려질 때까지 — 첫 열람 고지가 있으면 확인한다. */
async function openDohae(page: Page) {
  await page.goto(`/subjects/patent/systematic/${nodeId}?dohae=${unitId}`);
  await dismissPopupNotices(page);
  const dialog = page.getByRole("dialog").filter({ hasText: "도해특허법" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // ★고지는 유닛이 로드된 뒤에야 뜬다 — 먼저 보이는 쪽(고지 또는 표)을 기다린다.
  const gate = dialog.getByRole("button", { name: "확인했습니다" });
  const table = dialog.locator("table").first();
  await expect(gate.or(table).first()).toBeVisible({ timeout: 30_000 });
  if (await gate.isVisible().catch(() => false)) await gate.click();
  await expect(table).toBeAttached({ timeout: 30_000 });
  // 접힌 절을 모두 편다 — 접힌 안의 칸은 클릭할 수 없다.
  await dialog.locator("details").evaluateAll((els) => {
    for (const d of els) (d as HTMLDetailsElement).open = true;
  });
  // ★공지 팝업은 데이터보다 늦게 뜰 수 있다 — 표가 그려진 뒤 한 번 더 닫는다(칸을 덮으면 클릭이 빗나간다).
  await dismissPopupNotices(page);
  return dialog;
}

test.describe.serial("도해 표 칸 가리기 (feat-2-037 S7)", () => {
  test.setTimeout(240_000);
  test.beforeAll(async () => {
    staffId = await createConfirmedUser(STAFF_EMAIL, PASSWORD, "E2E 칸가리기");
    await admin
      .from("profiles")
      .update({
        role: "admin",
        access_approved_at: new Date().toISOString(),
        service_data_consent_at: new Date().toISOString(),
      })
      .eq("profile_id", staffId);
    studentId = await createConfirmedUser(
      STUDENT_EMAIL,
      PASSWORD,
      "E2E 칸가리기 학생",
    );
    await admin
      .from("profiles")
      .update({
        role: "student",
        access_approved_at: new Date().toISOString(),
        service_data_consent_at: new Date().toISOString(),
        // 필수정보 온보딩 게이트(features/onboarding/screens/profile.tsx) — 비어 있으면 /onboarding 으로 보낸다.
        phone_e164: "+821000000000",
        address: "E2E",
        profile_completed_at: new Date().toISOString(),
      })
      .eq("profile_id", studentId);

    const { data: unit } = await admin
      .from("dohae_units")
      .select("unit_id")
      .eq("unit_key", UNIT_KEY)
      .single();
    unitId = unit!.unit_id;
    const { data: link } = await admin
      .from("dohae_unit_nodes")
      .select("node_id")
      .eq("unit_id", unitId)
      .limit(1)
      .single();
    nodeId = link!.node_id;
  });

  test.afterAll(async () => {
    // 열람 로그(dohae_unit_views) FK 로 삭제가 막힐 수 있다 — 실패해도 넘어간다(이메일은 실행마다 고유).
    await deleteUser(STAFF_EMAIL).catch(() => undefined);
    await deleteUser(STUDENT_EMAIL).catch(() => undefined);
  });

  test("staff: 칸 가리기 모드에서 목차칸을 누르면 그 줄·그 칸이 가려지고, 낱말 빈칸과 배타다", async ({
    page,
  }) => {
    // 화면이 통째로 비는 사고를 잡기 위해 — 페이지 오류·콘솔 오류를 모은다.
    const events: string[] = [];
    page.on("pageerror", (e) => events.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error")
        events.push(`console.error: ${m.text().slice(0, 300)}`);
    });
    const dump = () => console.log("[events]\n" + events.join("\n"));
    await loginUser(page, STAFF_EMAIL, PASSWORD);
    const dialog = await openDohae(page);

    const hidden = dialog.locator(".dg-blank");
    const heads = dialog.locator("[data-dg-blank]");
    const cells = dialog.locator("[data-dh-cell]");
    const modeBtn = dialog.getByRole("button", { name: "칸 가리기" });

    // ⓪ 모드가 꺼져 있으면 손잡이가 없다 — 읽기 화면은 그대로.
    await expect(modeBtn).toBeVisible();
    await expect(cells).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "전부 가리기" }),
    ).toHaveCount(0);
    await modeBtn.click();
    await expect(modeBtn).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => heads.count()).toBeGreaterThan(0);
    await expect(hidden).toHaveCount(0);

    // 행·열 목차가 둘 다 있는 첫 표 — 첫 줄 th 둘(제도/내용) + 줄마다 첫 열 라벨.
    const table = dialog
      .locator("table")
      .filter({ has: page.locator("th[data-dg-blank]") })
      .first();
    const colHeads = table.locator("th[data-dg-blank]");
    await expect.poll(() => colHeads.count()).toBeGreaterThanOrEqual(2);
    // 내용칸(가릴 수 있는 칸) 수 — 2칸 표라 세로줄 하나가 곧 내용 전체다.
    const contentCount = await table.locator("td[data-dh-blankable]").count();
    expect(contentCount).toBeGreaterThan(0);

    // ① 열 목차(「내 용」) → 그 세로줄 전부.
    await colHeads.nth(1).click();
    await expect(hidden).toHaveCount(contentCount);
    await expect(dialog.getByText(`가린 칸 ${contentCount} / `)).toBeVisible();
    // 같은 목차를 다시 누르면 도로 보기.
    await colHeads.nth(1).click();
    await expect(hidden).toHaveCount(0);

    // ② 모서리 → 표 전체.
    await colHeads.nth(0).click();
    await expect(hidden).toHaveCount(contentCount);
    await dialog.getByRole("button", { name: "모두 보기" }).click();
    await expect(hidden).toHaveCount(0);

    // ③ 행 목차 → 그 가로줄(2칸 표라 한 칸).
    const rowHead = table.locator("td[data-dg-blank]").first();
    await rowHead.click();
    await expect(hidden).toHaveCount(1);
    // 가려진 칸을 직접 누르면 펴진다.
    await hidden.first().click();
    await expect(hidden).toHaveCount(0);

    // ④ 내용칸 하나 토글.
    const cell = table.locator("td[data-dh-blankable]").first();
    await cell.click();
    await expect(hidden).toHaveCount(1);
    await cell.click();
    await expect(hidden).toHaveCount(0);

    // ⑤ 전부 가리기 — 접힌 절도 열린다. 수는 머리 띠의 N 과 같다.
    //   본문의 절만 접는다(오른쪽 학습 툴의 details 는 토글 handler 가 있다).
    await dialog.locator(".dohae-doc details").evaluateAll((els) => {
      for (const d of els) (d as HTMLDetailsElement).open = false;
    });
    await dialog
      .getByRole("button", { name: "전부 가리기" })
      .click({ timeout: 20_000 });
    const bar = dialog.getByText(/가린 칸 (\d+) \/ (\d+)/);
    await expect(bar).toBeVisible();
    const m = /가린 칸 (\d+) \/ (\d+)/.exec((await bar.textContent()) ?? "");
    expect(m).not.toBeNull();
    expect(m![1]).toBe(m![2]);
    await expect(hidden).toHaveCount(Number(m![2]));
    await expect(dialog.locator(".dohae-doc details:not([open])")).toHaveCount(
      0,
    );

    // ⑥ 낱말 빈칸 모드로 들어가면 칸 가리기는 꺼진다(손잡이·가림·단추 소멸). 읽기로 돌아와도
    //   꺼진 채 — 다시 켜야 손잡이가 돌아오고, 가린 칸은 비어 있다.
    const blankBtn = dialog.getByRole("button", { name: /^빈칸$/ });
    if (await blankBtn.isEnabled().catch(() => false)) {
      await blankBtn.click();
      await expect(
        dialog.getByRole("button", { name: "읽기로" }),
      ).toBeVisible();
      await expect(cells).toHaveCount(0);
      await expect(hidden).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "전부 가리기" }),
      ).toHaveCount(0);
      await dialog.getByRole("button", { name: "읽기로" }).click();
      await expect(modeBtn).toHaveAttribute("aria-pressed", "false");
      await expect(cells).toHaveCount(0);
      await modeBtn.click();
      await expect.poll(() => heads.count()).toBeGreaterThan(0);
      await expect(hidden).toHaveCount(0);
      // 칸 가리기를 켜면 낱말 빈칸은 꺼져 있다(단추가 「빈칸」으로 돌아와 있다).
      await expect(blankBtn).toBeVisible();
    } else {
      await dialog.getByRole("button", { name: "모두 보기" }).click();
      await expect(hidden).toHaveCount(0);
    }

    // ⑦ 회귀 — 오른쪽 학습 툴의 details 를 연달아 토글해도 화면이 죽지 않는다.
    //   (setState 갱신 함수 안에서 e.currentTarget.open 을 늦게 읽던 결함, 2026-09-11 수정)
    for (const open of [false, true, false]) {
      await dialog.locator("aside details").evaluateAll((els, v) => {
        for (const d of els) (d as HTMLDetailsElement).open = v;
      }, open);
    }
    await expect(dialog).toBeVisible();
    await expect(page.getByText("문제가 발생했습니다")).toHaveCount(0);

    // ⑧ 모드를 끄면 가린 칸이 풀리고 손잡이가 사라진다.
    await colHeads.nth(0).click();
    await expect(hidden).toHaveCount(contentCount);
    await modeBtn.click();
    await expect(cells).toHaveCount(0);
    await expect(hidden).toHaveCount(0);
    dump();
  });

  test("학생: 모드 단추도 손잡이도 없다 (staff 선출시)", async ({ page }) => {
    await loginUser(page, STUDENT_EMAIL, PASSWORD);
    const dialog = await openDohae(page);
    await expect(dialog.locator("table").first()).toBeAttached();
    await expect(dialog.getByRole("button", { name: "칸 가리기" })).toHaveCount(
      0,
    );
    await expect(dialog.locator("[data-dh-cell]")).toHaveCount(0);
    await expect(dialog.locator("[data-dg-blank]")).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "전부 가리기" }),
    ).toHaveCount(0);
  });
});
