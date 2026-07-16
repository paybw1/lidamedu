// feat-2-029 — 판례 뷰어 빈칸 인라인 편집 E2E.
// staff 로 판례 뷰어 → ①빈칸 → 편집 모드 → 기존 빈칸 × 제거(DB + 후보 rejected 동기화 확인)
// → 같은 텍스트 selection + mouseup → "새 빈칸" 플로팅 버튼 → 재추가 확인.
// afterAll 에서 세트 blanks·후보 상태를 스냅샷으로 원복 — 잔류 변경 없음.

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

const STAFF_EMAIL = `e2e-caseblankedit-${Date.now()}@test.local`;
const PASSWORD = "Test1234!";
const TARGET_CASE_NUMBER = "94후1558"; // '기출 유래' 세트 blank 1개("적법") 보유

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let staffId: string;
let caseId: string;
let subjectSlug: string;
let setId: string;
let blanksSnapshot: unknown[];
let candidateSnapshot: {
  candidate_id: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}[];
let blankAnswer: string;
let blankIdx: number;

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

test.describe.serial("판례 뷰어 빈칸 인라인 편집 (feat-2-029)", () => {
  test.beforeAll(async () => {
    staffId = await createConfirmedUser(STAFF_EMAIL, PASSWORD, "E2E 빈칸편집");
    await admin
      .from("profiles")
      .update({ role: "admin", access_approved_at: new Date().toISOString() })
      .eq("profile_id", staffId);

    const { data: kase } = await admin
      .from("cases")
      .select("case_id, subject_laws")
      .eq("case_number", TARGET_CASE_NUMBER)
      .contains("subject_laws", ["patent"])
      .limit(1)
      .single();
    caseId = kase!.case_id;
    subjectSlug = kase!.subject_laws?.[0] ?? "patent";

    const { data: set } = await admin
      .from("case_blank_sets")
      .select("set_id, blanks")
      .eq("case_id", caseId)
      .eq("display_name", "기출 유래")
      .single();
    setId = set!.set_id;
    blanksSnapshot = set!.blanks as unknown[];
    const first = (blanksSnapshot as { idx: number; answer: string; target: string }[]).find(
      (b) => b.target === "summary",
    );
    if (!first) throw new Error("summary blank 없음 — 대상 판례 재선정 필요");
    blankAnswer = first.answer;
    blankIdx = first.idx;

    const { data: cands } = await admin
      .from("case_blank_candidates")
      .select("candidate_id, status, reviewed_by, reviewed_at")
      .eq("case_id", caseId);
    candidateSnapshot = cands ?? [];
  });

  test.afterAll(async () => {
    // 세트·후보 상태 스냅샷 원복.
    await admin
      .from("case_blank_sets")
      .update({ blanks: blanksSnapshot as never })
      .eq("set_id", setId);
    for (const cand of candidateSnapshot) {
      await admin
        .from("case_blank_candidates")
        .update({
          status: cand.status,
          // 제거 API 가 reviewed_by 를 테스트 유저로 덮어씀 — 원복해야 유저 삭제 FK 통과.
          reviewed_by: cand.reviewed_by,
          reviewed_at: cand.reviewed_at,
        })
        .eq("candidate_id", cand.candidate_id);
    }
    await admin.from("case_blank_sets").delete().eq("owner_id", staffId);
    await deleteUser(STAFF_EMAIL);
  });

  test("편집 모드 — × 제거 → 후보 동기화 → 드래그 재추가", async ({ page }) => {
    test.setTimeout(240_000);
    await loginUser(page, STAFF_EMAIL, PASSWORD);

    // 1) 판례 뷰어 → ①빈칸 → 편집.
    await page.goto(`/subjects/${subjectSlug}/cases/${caseId}`);
    // hydration 전 클릭 무시 + 팝업 공지 뒤늦은 마운트 — 매 시도마다 팝업을 닫고 재클릭.
    const editBtn = page.getByRole("button", { name: "편집", exact: true });
    for (let i = 0; i < 15; i++) {
      await dismissPopupNotices(page);
      if (await editBtn.isVisible().catch(() => false)) break;
      await page
        .getByRole("button", { name: "① 빈칸" })
        .click({ timeout: 3000 })
        .catch(() => {});
      await page.waitForTimeout(1000);
    }
    await editBtn.click();
    await expect(page.getByText("빈칸 편집 모드")).toBeVisible();

    // 2) 기존 빈칸 chip × 제거.
    await page
      .getByRole("button", { name: `빈칸 "${blankAnswer}" 제거` })
      .click();
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("case_blank_sets")
            .select("blanks")
            .eq("set_id", setId)
            .single();
          const arr = (data?.blanks ?? []) as { idx: number }[];
          return arr.some((b) => b.idx === blankIdx);
        },
        { timeout: 15000 },
      )
      .toBe(false);

    // 같은 자리 승인 후보가 있었다면 rejected 동기화 확인.
    const approvedBefore = candidateSnapshot.filter((c) => c.status === "approved");
    if (approvedBefore.length > 0) {
      const { data: after } = await admin
        .from("case_blank_candidates")
        .select("candidate_id, status, answer")
        .eq("case_id", caseId)
        .eq("answer", blankAnswer);
      expect((after ?? []).every((c) => c.status === "rejected")).toBe(true);
    }

    // 3) UI revalidation 완료 대기 — chip 이 사라져 텍스트가 세그먼트로 복원된 뒤에 selection.
    await expect(
      page.getByRole("button", { name: `빈칸 "${blankAnswer}" 제거` }),
    ).toBeHidden({ timeout: 20000 });

    // 같은 텍스트를 selection 으로 잡고 mouseup → 플로팅 "새 빈칸" 버튼 → 재추가.
    await page.evaluate((answer) => {
      const spans = Array.from(
        document.querySelectorAll<HTMLElement>("span[data-cum]"),
      );
      const span = spans.find((s) => (s.textContent ?? "").includes(answer));
      if (!span || !span.firstChild) throw new Error("세그먼트 미발견");
      const textNode = span.firstChild;
      const at = (textNode.textContent ?? "").indexOf(answer);
      const range = document.createRange();
      range.setStart(textNode, at);
      range.setEnd(textNode, at + answer.length);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      span.parentElement!.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true }),
      );
    }, blankAnswer);
    await page.getByRole("button", { name: /새 빈칸/ }).click();

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("case_blank_sets")
            .select("blanks")
            .eq("set_id", setId)
            .single();
          const arr = (data?.blanks ?? []) as { answer: string }[];
          return arr.some((b) => b.answer === blankAnswer);
        },
        { timeout: 15000 },
      )
      .toBe(true);

    // 4) UI 에도 chip 이 다시 나타났는지 확인(revalidation).
    await expect(
      page.getByRole("button", { name: `빈칸 "${blankAnswer}" 제거` }),
    ).toBeVisible({ timeout: 10000 });
  });
});
