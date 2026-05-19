// feat-10-005 다과목 통합 1차 모의고사 E2E.
//
// 시나리오: 시험·교시(모의 팩)·문제를 service_role 로 시딩 → 학생 응시 시작 →
//   1교시 전 문항 정답(100점) → 2교시 전 문항 오답(0점) →
//   결과 화면에서 평균 50 · 과목 과락 불합격 · 등수 검증.
// 시드 데이터는 beforeAll 에서 생성, afterAll 에서 정리 — self-contained.

import { type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
// 실행마다 고유 이메일 — 재실행 시 createUser 충돌 방지.
const TEST_EMAIL = `feat10005-e2e-${Date.now()}@example.com`;
const TEST_PASSWORD = "Test1234!";
// 시드 데이터 식별용 — 제목 prefix 로 재실행 시 잔여물 정리.
const MARKER = "[E2E feat-10-005]";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must be set in .env",
  );
}

const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface SeedProblem {
  problemId: string;
  /** 정답 보기 choice_index. */
  correctIdx: number;
  /** 오답 보기 choice_index. */
  wrongIdx: number;
}

// 시드 결과 — beforeAll 이 채우고 test·afterAll 이 사용.
let examId = "";
let packAId = "";
let packBId = "";
let packAProblems: SeedProblem[] = [];
let packBProblems: SeedProblem[] = [];

// 이전 실행 잔여물 포함, feat10005-e2e-* 테스트 사용자를 전부 정리.
// 학습 데이터·profiles 행을 지운 뒤 auth 사용자를 삭제한다.
// auth.users 삭제(deleteUser)는 best-effort — 실행마다 고유 이메일이라 잔여물이
// 남아도 재실행에는 영향 없음. listUsers 는 빈 페이지가 나올 때까지 훑는다.
async function sweepTestUsers() {
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page });
    if (error) break;
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      if (!u.email?.startsWith("feat10005-e2e-")) continue;
      await admin
        .from("user_problem_attempts")
        .delete()
        .eq("user_id", u.id);
      await admin.from("quiz_sessions").delete().eq("user_id", u.id);
      await admin.from("mcq_exam_attempts").delete().eq("user_id", u.id);
      await admin.from("profiles").delete().eq("profile_id", u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  }
}

// 마커가 붙은 시험·팩 + 딸린 응시/세션/시도 전부 삭제 (FK 역순). 재실행 가능하게.
async function cleanupSeed() {
  const { data: exams } = await admin
    .from("mcq_exams")
    .select("exam_id")
    .like("title", `${MARKER}%`);
  const examIds = (exams ?? []).map((e) => e.exam_id);
  if (examIds.length > 0) {
    const { data: attempts } = await admin
      .from("mcq_exam_attempts")
      .select("attempt_id")
      .in("exam_id", examIds);
    const attemptIds = (attempts ?? []).map((a) => a.attempt_id);
    if (attemptIds.length > 0) {
      const { data: sessions } = await admin
        .from("quiz_sessions")
        .select("session_id")
        .in("exam_attempt_id", attemptIds);
      const sessionIds = (sessions ?? []).map((s) => s.session_id);
      if (sessionIds.length > 0) {
        await admin
          .from("user_problem_attempts")
          .delete()
          .in("session_id", sessionIds);
        await admin
          .from("quiz_sessions")
          .delete()
          .in("session_id", sessionIds);
      }
      await admin
        .from("mcq_exam_attempts")
        .delete()
        .in("attempt_id", attemptIds);
    }
    // mcq_exam_papers 는 mcq_exams on delete cascade.
    await admin.from("mcq_exams").delete().in("exam_id", examIds);
  }
  const { data: packs } = await admin
    .from("mcq_packs")
    .select("pack_id")
    .like("title", `${MARKER}%`);
  const packIds = (packs ?? []).map((p) => p.pack_id);
  if (packIds.length > 0) {
    await admin.from("mcq_pack_problems").delete().in("pack_id", packIds);
    await admin.from("mcq_packs").delete().in("pack_id", packIds);
  }
}

// 재사용할 mc_short 문제 4개 — 보기 4개 이상, 정답 정확히 1개.
async function pickReusableProblems(): Promise<SeedProblem[]> {
  const { data, error } = await admin
    .from("problems")
    .select("problem_id, problem_choices(choice_index, is_correct)")
    .eq("format", "mc_short")
    .not("law_id", "is", null)
    .is("deleted_at", null)
    .limit(60);
  if (error) throw error;
  const picked: SeedProblem[] = [];
  for (const p of data ?? []) {
    const choices = p.problem_choices ?? [];
    const correct = choices.filter((c) => c.is_correct);
    if (choices.length < 4 || correct.length !== 1) continue;
    const wrong = choices.find((c) => !c.is_correct);
    if (!wrong) continue;
    picked.push({
      problemId: p.problem_id,
      correctIdx: correct[0].choice_index,
      wrongIdx: wrong.choice_index,
    });
    if (picked.length === 4) break;
  }
  if (picked.length < 4) {
    throw new Error("재사용 가능한 mc_short 문제가 부족합니다 (4개 필요).");
  }
  return picked;
}

// 한 교시(시험지) 응시 — 모든 문항을 mode 대로 답하고 끝낸다.
async function answerPaper(
  page: Page,
  problems: SeedProblem[],
  mode: "correct" | "wrong",
) {
  // 교시 응시 시작 → 시험지(sheet).
  await page.getByTestId("paper-start").click();
  await page.waitForURL("**/latest/mcq/*/sheet/*", { timeout: 15000 });
  await expect(page.getByTestId("sheet-finish")).toBeVisible({
    timeout: 15000,
  });

  // 문항별 답안 — attempt POST 응답까지 대기 (단일 fetcher 의 in-flight abort 방지).
  for (let i = 0; i < problems.length; i++) {
    const choiceIdx =
      mode === "correct" ? problems[i].correctIdx : problems[i].wrongIdx;
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/problems/attempt") &&
          r.request().method() === "POST",
      ),
      page.getByTestId(`sheet-choice-${i + 1}-${choiceIdx}`).click(),
    ]);
  }

  // 시험 끝내기 → session-complete → 시험 러너로 복귀.
  await page.getByTestId("sheet-finish").click();
  await page.waitForURL(`**/latest/mcq/exam/${examId}`, { timeout: 20000 });
}

test.describe(`${MARKER} 통합 모의고사`, () => {
  test.beforeAll(async () => {
    await cleanupSeed();
    await sweepTestUsers();

    // 테스트 사용자.
    const { data: created, error: userErr } =
      await admin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
    if (userErr || !created.user) {
      throw userErr ?? new Error("test user 생성 실패");
    }

    const problems = await pickReusableProblems();
    packAProblems = problems.slice(0, 2);
    packBProblems = problems.slice(2, 4);

    // 모의 팩 2개 (교시).
    const { data: packA, error: aErr } = await admin
      .from("mcq_packs")
      .insert({
        kind: "mock_full",
        subject_scope: "industrial",
        title: `${MARKER} 1교시 산업재산권법`,
        is_published: true,
        duration_min: 120,
      })
      .select("pack_id")
      .single();
    if (aErr || !packA) throw aErr ?? new Error("pack A 생성 실패");
    packAId = packA.pack_id;

    const { data: packB, error: bErr } = await admin
      .from("mcq_packs")
      .insert({
        kind: "mock_full",
        subject_scope: "civil",
        title: `${MARKER} 2교시 민법`,
        is_published: true,
        duration_min: 120,
      })
      .select("pack_id")
      .single();
    if (bErr || !packB) throw bErr ?? new Error("pack B 생성 실패");
    packBId = packB.pack_id;

    // 팩별 문제 매핑 (ord 순서 = 시험지 문항 순서).
    const { error: mapErr } = await admin.from("mcq_pack_problems").insert([
      { pack_id: packAId, problem_id: packAProblems[0].problemId, ord: 0 },
      { pack_id: packAId, problem_id: packAProblems[1].problemId, ord: 1 },
      { pack_id: packBId, problem_id: packBProblems[0].problemId, ord: 0 },
      { pack_id: packBId, problem_id: packBProblems[1].problemId, ord: 1 },
    ]);
    if (mapErr) throw mapErr;

    // 통합 시험 + 교시 매핑 (평균 합격선 60, 과락선 40).
    const { data: exam, error: exErr } = await admin
      .from("mcq_exams")
      .insert({
        title: `${MARKER} 통합 1차 모의고사`,
        pass_average: 60,
        is_published: true,
      })
      .select("exam_id")
      .single();
    if (exErr || !exam) throw exErr ?? new Error("exam 생성 실패");
    examId = exam.exam_id;

    const { error: paperErr } = await admin.from("mcq_exam_papers").insert([
      { exam_id: examId, pack_id: packAId, ord: 0, fail_floor: 40 },
      { exam_id: examId, pack_id: packBId, ord: 1, fail_floor: 40 },
    ]);
    if (paperErr) throw paperErr;
  });

  test.afterAll(async () => {
    await cleanupSeed();
    await sweepTestUsers();
  });

  test("응시 시작 → 1교시 정답 → 2교시 오답 → 과목 과락 불합격", async ({
    page,
  }) => {
    // 시험 끝내기 confirm 자동 수락.
    page.on("dialog", (d) => void d.accept());

    // 로그인.
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/", { timeout: 15000 });

    // 시험 러너 — 응시 전: 교시 2개 + 응시 시작 버튼.
    await page.goto(`/latest/mcq/exam/${examId}`);
    await expect(page.getByTestId("exam-paper-card")).toHaveCount(2);
    await expect(page.getByTestId("exam-start")).toBeVisible();

    // 응시 시작 → 1교시만 응시 가능, 2교시 잠김.
    await page.getByTestId("exam-start").click();
    await expect(page.getByTestId("paper-start")).toHaveCount(1);
    await expect(page.getByTestId("exam-paper-card").nth(0)).toHaveAttribute(
      "data-status",
      "available",
    );
    await expect(page.getByTestId("exam-paper-card").nth(1)).toHaveAttribute(
      "data-status",
      "locked",
    );

    // 1교시 — 전 문항 정답.
    await answerPaper(page, packAProblems, "correct");

    // 러너 복귀 — 1교시 완료, 2교시 응시 가능.
    await expect(page.getByTestId("exam-paper-card").nth(0)).toHaveAttribute(
      "data-status",
      "completed",
    );
    await expect(page.getByTestId("exam-paper-card").nth(1)).toHaveAttribute(
      "data-status",
      "available",
    );

    // 2교시 — 전 문항 오답.
    await answerPaper(page, packBProblems, "wrong");

    // 전 교시 완료 → 결과 보기.
    await expect(page.getByText("전 교시 응시 완료")).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("link", { name: /결과 보기/ }).click();
    await page.waitForURL(`**/latest/mcq/exam/${examId}/result/**`, {
      timeout: 15000,
    });

    // 결과 — 평균 50점, 불합격(과목 과락).
    await expect(page.getByTestId("exam-average")).toHaveText("50");
    const verdict = page.getByTestId("exam-verdict");
    await expect(verdict).toContainText("불합격");
    await expect(verdict).toContainText("과목 과락");

    // 교시별 점수 — 1교시 100점 통과, 2교시 0점 과락.
    const rows = page.getByTestId("exam-paper-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("100점");
    await expect(rows.nth(0)).toContainText("통과");
    await expect(rows.nth(1)).toContainText("0점");
    await expect(rows.nth(1)).toContainText("과락");

    // 등수 — 응시자 1명 중 1등.
    await expect(page.getByText(/1등/)).toBeVisible();
  });
});
