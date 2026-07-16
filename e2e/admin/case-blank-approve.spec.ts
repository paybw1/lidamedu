// feat-2-029 S5 — 판례 빈칸 후보 승인 큐 E2E.
// staff 로 /admin/blanks/cases 진입 → 첫 pending 후보 승인 → case_blank_sets '기출 유래'
// 세트에 blank 기록 확인 → 승인됨 탭에서 되돌리기 → 후보 pending 복귀 + 세트에서 제거 확인.
// 실 DB 후보를 승인 후 즉시 되돌리므로 잔류 변경 없음.

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

// deleteUser 가 실환경에서 noop 인 이력이 있어 실행마다 고유 이메일 사용(메모: e2e-deleteuser-noop).
const STAFF_EMAIL = `e2e-caseblank-${Date.now()}@test.local`;
const PASSWORD = "Test1234!";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let staffId: string;

// 팝업 공지 모달이 떠 있으면 전부 닫는다 — 행 버튼 클릭을 가로채는 오버레이 방지.
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

test.describe.serial("판례 빈칸 후보 승인 큐 (feat-2-029 S5)", () => {
  test.beforeAll(async () => {
    staffId = await createConfirmedUser(STAFF_EMAIL, PASSWORD, "E2E 판례빈칸");
    const { error } = await admin
      .from("profiles")
      .update({ role: "admin", access_approved_at: new Date().toISOString() })
      .eq("profile_id", staffId);
    if (error) throw error;
  });

  test.afterAll(async () => {
    // 혹시 되돌리기 단계 전에 실패했다면 이 사용자가 승인한 후보를 pending 으로 원복.
    const { data: leftovers } = await admin
      .from("case_blank_candidates")
      .select("candidate_id, case_id, answer")
      .eq("reviewed_by", staffId);
    for (const cand of leftovers ?? []) {
      const { data: sets } = await admin
        .from("case_blank_sets")
        .select("set_id, blanks")
        .eq("case_id", cand.case_id)
        .eq("display_name", "기출 유래");
      for (const s of sets ?? []) {
        const blanks = (Array.isArray(s.blanks) ? s.blanks : []) as {
          answer?: string;
        }[];
        await admin
          .from("case_blank_sets")
          .update({
            blanks: blanks.filter((b) => b.answer !== cand.answer) as never,
          })
          .eq("set_id", s.set_id);
      }
      await admin
        .from("case_blank_candidates")
        .update({ status: "pending", reviewed_at: null, reviewed_by: null })
        .eq("candidate_id", cand.candidate_id);
    }
    // 테스트 유저 소유로 생성된(이 시점엔 빈) 세트 제거 — owner FK 가 유저 삭제를 막는다.
    await admin.from("case_blank_sets").delete().eq("owner_id", staffId);
    await deleteUser(STAFF_EMAIL);
  });

  test("승인 → 세트 기록 → 되돌리기 → 원복", async ({ page }) => {
    test.setTimeout(240_000);
    await loginUser(page, STAFF_EMAIL, PASSWORD);

    // 1) 대기 큐 진입 — 후보 목록 노출.
    await page.goto("/admin/blanks/cases");
    await expect(
      page.getByRole("heading", { name: "판례 빈칸 승인" }),
    ).toBeVisible();
    await dismissPopupNotices(page);
    const approveButtons = page.getByRole("button", { name: "승인", exact: true });
    await expect(approveButtons.first()).toBeVisible();

    // 2) 첫 후보 승인.
    await approveButtons.first().click();

    // 서버 반영 확인 — 이 테스트 사용자가 승인한 후보 1건.
    let approved: {
      candidate_id: string;
      case_id: string;
      answer: string;
      target: string;
      source_display_no: number | null;
    } | null = null;
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("case_blank_candidates")
            .select("candidate_id, case_id, answer, target, source_display_no")
            .eq("reviewed_by", staffId)
            .eq("status", "approved")
            .limit(1);
          approved = data?.[0] ?? null;
          return approved ? 1 : 0;
        },
        { timeout: 15000 },
      )
      .toBe(1);

    // 3) '기출 유래' 세트에 blank 기록 확인.
    const { data: sets } = await admin
      .from("case_blank_sets")
      .select("blanks")
      .eq("case_id", approved!.case_id)
      .eq("display_name", "기출 유래");
    const blanks = (
      Array.isArray(sets?.[0]?.blanks) ? sets![0].blanks : []
    ) as { answer?: string }[];
    expect(blanks.some((b) => b.answer === approved!.answer)).toBe(true);

    // 4) 승인됨 탭 — 해당 행 되돌리기.
    await page.goto("/admin/blanks/cases?status=approved");
    await dismissPopupNotices(page);
    const approvedRow = page
      .getByRole("row")
      .filter({ hasText: `P-${approved!.source_display_no}` })
      .filter({ hasText: "승인됨" })
      .first();
    await approvedRow.getByRole("button", { name: "되돌리기" }).click();

    // 5) 원복 확인 — 후보 pending + 세트에서 blank 제거.
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("case_blank_candidates")
            .select("status, reviewed_by")
            .eq("candidate_id", approved!.candidate_id)
            .single();
          return data?.status;
        },
        { timeout: 15000 },
      )
      .toBe("pending");
    const { data: setsAfter } = await admin
      .from("case_blank_sets")
      .select("blanks")
      .eq("case_id", approved!.case_id)
      .eq("display_name", "기출 유래");
    const blanksAfter = (
      Array.isArray(setsAfter?.[0]?.blanks) ? setsAfter![0].blanks : []
    ) as { answer?: string }[];
    expect(blanksAfter.some((b) => b.answer === approved!.answer)).toBe(false);
  });
});
