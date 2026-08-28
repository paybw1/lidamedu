// feat-3-214 D단계 — 운영자 배치 관리(추가·대표 지정·본문 저장·삭제).
//
// UI 카드가 뜨는지 + 서버 intent 가 실제로 동작하는지 함께 본다. 배치 조작은
// 로그인 세션으로 /api/admin/case 에 직접 보낸다 — Radix Select 팝업 자동화가
// 불안정해서 UI 클릭에 의존하면 테스트가 깨진다(기능이 아니라 위젯 문제로).
//
// ★대상 판례는 검사 후 원상 복구한다(운영 DB).

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginUser } from "e2e/utils/test-helpers";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env");
}
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL = `e2e-tm-place-${Date.now()}@example.com`;
const TEST_PASSWORD = "Test1234!";
let userId = "";
let caseId = "";
let extraNodeId = "";

test.describe.serial("판례 배치 관리 (운영자)", () => {
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
        role: "admin",
      })
      .eq("profile_id", userId);

    // 단일 배치 판례로 검사 — 끝나면 추가분을 지운다.
    const { data: kase } = await admin
      .from("cases")
      .select("case_id")
      .eq("case_number", "2003후1260")
      .contains("subject_laws", ["trademark"])
      .is("deleted_at", null)
      .single();
    caseId = kase!.case_id;
    const { data: node } = await admin
      .from("systematic_nodes")
      .select("node_id")
      .eq("law_code", "trademark")
      .like("display_label", "주제19 %")
      .single();
    extraNodeId = node!.node_id;
  });

  test.afterAll(async () => {
    if (caseId && extraNodeId)
      await admin
        .from("case_systematic_links")
        .delete()
        .eq("case_id", caseId)
        .eq("node_id", extraNodeId);
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  });

  test("배치 카드가 뜨고 현재 자리를 보여 준다", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto(`/admin/cases/edit/${caseId}`);
    await expect(page.getByText("교재 수록 자리", { exact: false })).toBeVisible({
      timeout: 45000,
    });
    // 대표 배치가 표시된다(주제10 = 이 판례의 자리)
    await expect(page.getByText("주제10", { exact: false }).first()).toBeVisible();
  });

  test("추가 → 본문 저장 → 대표 지정 → 삭제 차단 → 되돌리기", async ({ page }) => {
    await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto(`/admin/cases/edit/${caseId}`);
    await expect(page.getByText("교재 수록 자리", { exact: false })).toBeVisible({
      timeout: 45000,
    });
    const post = (form: Record<string, string>) =>
      page.request.post("/api/admin/case", { form: { caseId, ...form } });

    // ① 추가
    expect((await post({ intent: "add_case_placement", nodeId: extraNodeId })).ok()).toBe(true);
    let links = await admin
      .from("case_systematic_links")
      .select("node_id, is_primary, book_sections")
      .eq("case_id", caseId);
    expect(links.data?.length).toBe(2);

    // ② 그 자리의 본문 저장
    const body = JSON.stringify([
      { key: "issues", label: "사안의 쟁점", blocks: [{ type: "p", text: "검사용 서술" }] },
    ]);
    expect(
      (await post({ intent: "save_case_placement_body", nodeId: extraNodeId, bookSections: body })).ok(),
    ).toBe(true);
    links = await admin
      .from("case_systematic_links")
      .select("node_id, is_primary, book_sections")
      .eq("case_id", caseId);
    const added = links.data?.find((l) => l.node_id === extraNodeId);
    expect(JSON.stringify(added?.book_sections)).toContain("검사용 서술");

    // ③ 대표 지정 → cases.primary_node_id 가 트리거로 따라온다
    expect((await post({ intent: "set_case_placement_primary", nodeId: extraNodeId })).ok()).toBe(true);
    const { data: kase } = await admin
      .from("cases")
      .select("primary_node_id")
      .eq("case_id", caseId)
      .single();
    expect(kase?.primary_node_id).toBe(extraNodeId);

    // ④ 대표 배치는 삭제가 막힌다
    // ★이 리소스 라우트는 오류를 200 + { error } 로 돌려준다(다른 intent 들도 같다).
    //   화면은 fetcher.data.error 를 읽으므로, 검사도 상태코드가 아니라 본문으로 한다.
    const blocked = await post({ intent: "remove_case_placement", nodeId: extraNodeId });
    expect(await blocked.text()).toContain("대표 배치는 삭제할 수 없습니다");
    const stillThere = await admin
      .from("case_systematic_links")
      .select("node_id")
      .eq("case_id", caseId)
      .eq("node_id", extraNodeId);
    expect(stillThere.data?.length, "막혔으면 행이 남아 있어야 한다").toBe(1);

    // ⑤ 원래 자리를 대표로 되돌리고 추가분 삭제
    const original = links.data?.find((l) => l.node_id !== extraNodeId)!;
    expect((await post({ intent: "set_case_placement_primary", nodeId: original.node_id })).ok()).toBe(true);
    expect((await post({ intent: "remove_case_placement", nodeId: extraNodeId })).ok()).toBe(true);
    const after = await admin
      .from("case_systematic_links")
      .select("node_id, is_primary")
      .eq("case_id", caseId);
    expect(after.data?.length).toBe(1);
    expect(after.data?.[0]?.is_primary).toBe(true);
    expect(after.data?.[0]?.node_id).toBe(original.node_id);
  });
});
