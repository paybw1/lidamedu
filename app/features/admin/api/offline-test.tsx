// feat-7-042 — 오프라인 테스트 CRUD + 문항 조합 API. staff 전용 + 반 소유권 게이트
// (api/assignment.tsx 와 동일 원칙 — 강사는 본인 소유 반만, 원장/관리자=전체).
// 쓰기는 요청 클라이언트(RLS staff 정책이 백스톱), adminClient 는 소유권 역추적 읽기만.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";
import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { parseOfflineTestSubject } from "~/features/offline-tests/labels";
import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";
import {
  addTestQuestions,
  createOfflineTest,
  getOfflineTestWithQuestions,
  listBlankCandidates,
  listMcqCandidates,
  listOxCandidates,
  listScienceMcqCandidates,
  moveTestQuestion,
  removeTestQuestion,
  setTestQuestionPoints,
  softDeleteOfflineTest,
  updateOfflineTest,
  type OfflineQuestionRef,
} from "~/features/offline-tests/queries.server";
import { saveOfflineTestResults } from "~/features/offline-tests/results.server";
import {
  assignTestToSeries,
  createSeries,
} from "~/features/offline-tests/series.server";

import type { Route } from "./+types/offline-test";

const refSchema = z.object({
  questionType: z.enum(["mcq", "ox", "blank"]),
  problemId: z.string().uuid().optional(),
  oxRefType: z.enum(["choice", "box"]).optional(),
  oxRefId: z.string().uuid().optional(),
  oxProblemId: z.string().uuid().optional(),
  blankSetId: z.string().uuid().optional(),
});

async function resolveCohortId(
  admin: SupabaseClient<Database>,
  intent: string,
  fd: FormData,
): Promise<string | null> {
  if (intent === "create_test") {
    const aid = String(fd.get("assignmentId") ?? "");
    if (!aid) return null;
    const { data: a } = await admin
      .from("assignments")
      .select("cohort_id")
      .eq("assignment_id", aid)
      .maybeSingle();
    return a?.cohort_id ?? null;
  }
  if (intent === "create_series") {
    return String(fd.get("cohortId") ?? "") || null;
  }
  const testId = String(fd.get("testId") ?? "");
  if (!testId) return null;
  const { data: t } = await admin
    .from("offline_tests")
    .select("cohort_id")
    .eq("test_id", testId)
    .maybeSingle();
  return t?.cohort_id ?? null;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  // 반 소유권 게이트 — 모든 intent 공통.
  const cohortId = await resolveCohortId(adminClient, intent, fd);
  if (!cohortId) {
    return data({ error: "대상을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!roleAtLeast(role, "manager")) {
    const cohort = await getCohortById(adminClient, cohortId);
    if (!cohort || cohort.ownerId !== user.id) {
      return data({ error: "본인 소유 반만 접근 가능합니다" }, { status: 403 });
    }
  }

  if (intent === "create_test") {
    const assignmentId = String(fd.get("assignmentId") ?? "");
    const title = String(fd.get("title") ?? "").trim().slice(0, 200);
    // 과목 값: "patent" 같은 법률 슬러그 또는 "science:physics".
    const subject = parseOfflineTestSubject(String(fd.get("subject") ?? ""));
    if (!assignmentId || !title || !subject) {
      return data({ error: "제목·과목을 입력하세요" }, { status: 400 });
    }
    const testId = await createOfflineTest(client, {
      assignmentId,
      cohortId,
      title,
      subject,
      createdBy: user.id,
    });
    return data({ ok: true, testId, cohortId, assignmentId });
  }

  // feat-7-044 — 시리즈 생성 (반 단위).
  if (intent === "create_series") {
    const title = String(fd.get("title") ?? "").trim().slice(0, 200);
    if (!title) return data({ error: "시리즈 이름을 입력하세요" }, { status: 400 });
    const seriesId = await createSeries(client, {
      cohortId,
      title,
      createdBy: user.id,
    });
    return data({ ok: true, seriesId });
  }

  const testId = String(fd.get("testId") ?? "");

  // feat-7-044 — 테스트 ↔ 시리즈 연결/해제. seriesId 빈값 = 해제.
  if (intent === "set_series") {
    const seriesId = String(fd.get("seriesId") ?? "") || null;
    const roundRaw = String(fd.get("roundNo") ?? "");
    const roundNo = roundRaw === "" ? null : Math.max(1, Math.min(999, Number(roundRaw) || 0));
    if (seriesId) {
      // 시리즈가 이 반 소유인지 확인 (교차 반 연결 차단).
      const { data: s } = await adminClient
        .from("offline_test_series")
        .select("cohort_id")
        .eq("series_id", seriesId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!s || s.cohort_id !== cohortId) {
        return data({ error: "시리즈를 찾을 수 없습니다" }, { status: 404 });
      }
    }
    await assignTestToSeries(client, testId, seriesId, roundNo);
    return data({ ok: true });
  }

  if (intent === "update_test") {
    const title = fd.get("title") ? String(fd.get("title")).trim().slice(0, 200) : undefined;
    const durationRaw = fd.get("durationMin");
    const instructionsRaw = fd.get("instructionsMd");
    await updateOfflineTest(client, testId, {
      ...(title !== undefined ? { title } : {}),
      ...(durationRaw !== null
        ? { durationMin: String(durationRaw) === "" ? null : Math.max(1, Math.min(600, Number(durationRaw) || 0)) }
        : {}),
      ...(instructionsRaw !== null
        ? { instructionsMd: String(instructionsRaw).trim().slice(0, 2000) || null }
        : {}),
    });
    return data({ ok: true });
  }

  if (intent === "delete_test") {
    await softDeleteOfflineTest(client, testId);
    return data({ ok: true });
  }

  if (intent === "add_questions") {
    const parsed = z
      .array(refSchema)
      .max(100)
      .safeParse(JSON.parse(String(fd.get("refs") ?? "[]")));
    if (!parsed.success) {
      return data({ error: "문항 참조 형식 오류" }, { status: 400 });
    }
    const added = await addTestQuestions(
      client,
      testId,
      parsed.data as OfflineQuestionRef[],
    );
    return data({ ok: true, added });
  }

  // 조건(유형·파트·중요도)에서 N문항 자동 추출 — 중요도 내림차순, 동률은 후보 순.
  if (intent === "auto_pick") {
    const typeParse = z.enum(["mcq", "ox", "blank"]).safeParse(fd.get("type"));
    if (!typeParse.success) {
      return data({ error: "유형 오류" }, { status: 400 });
    }
    const test = await getOfflineTestWithQuestions(client, testId);
    if (!test) return data({ error: "테스트를 찾을 수 없습니다" }, { status: 404 });
    const n = Math.max(1, Math.min(50, Number(fd.get("n")) || 10));
    const nodeId = String(fd.get("nodeId") ?? "") || null;
    const minImportance = Math.max(0, Math.min(3, Number(fd.get("minImportance")) || 0));

    let refs: OfflineQuestionRef[] = [];
    if (test.scienceSubject) {
      // 자연과학 — 객관식만 (OX·빈칸 없음). 파트 = science_sections.
      if (typeParse.data !== "mcq") {
        return data({ error: "자연과학은 객관식만 지원합니다" }, { status: 400 });
      }
      const cands = await listScienceMcqCandidates(client, {
        scienceSubject: test.scienceSubject,
        sectionId: nodeId,
        limit: n * 4,
      });
      refs = cands.map((c) => ({ questionType: "mcq" as const, problemId: c.problemId }));
    } else {
      // ?subject= 로 시험지 과목 외 다른 법률 과목 문항도 자동 추출 가능(피커 과목 선택 연동).
      const subjParse = lawSubjectSlugSchema.safeParse(fd.get("subject"));
      const lawCode = subjParse.success ? subjParse.data : test.lawCode;
      if (!lawCode) return data({ error: "과목을 확인해 주세요" }, { status: 400 });
      const filter = { lawCode, nodeId, minImportance, limit: n * 4 };
      if (typeParse.data === "mcq") {
        const cands = await listMcqCandidates(client, filter);
        refs = cands.map((c) => ({ questionType: "mcq" as const, problemId: c.problemId }));
      } else if (typeParse.data === "ox") {
        const cands = await listOxCandidates(client, filter);
        refs = cands.map((c) => ({
          questionType: "ox" as const,
          oxRefType: c.refType,
          oxRefId: c.refId,
          oxProblemId: c.problemId,
        }));
      } else {
        const cands = await listBlankCandidates(client, filter);
        refs = cands.map((c) => ({ questionType: "blank" as const, blankSetId: c.setId }));
      }
    }
    if (refs.length === 0) {
      return data({ error: "조건에 맞는 문항 후보가 없습니다" }, { status: 400 });
    }
    const added = await addTestQuestions(client, testId, refs.slice(0, n));
    return data({ ok: true, added });
  }

  if (intent === "remove_question") {
    const questionId = String(fd.get("questionId") ?? "");
    if (!questionId) return data({ error: "questionId 누락" }, { status: 400 });
    await removeTestQuestion(client, testId, questionId);
    return data({ ok: true });
  }

  if (intent === "move_question") {
    const questionId = String(fd.get("questionId") ?? "");
    const dirParse = z.enum(["up", "down"]).safeParse(fd.get("dir"));
    if (!questionId || !dirParse.success) {
      return data({ error: "입력 오류" }, { status: 400 });
    }
    await moveTestQuestion(client, testId, questionId, dirParse.data);
    return data({ ok: true });
  }

  // ── 3단계: 오프라인 채점 결과 저장 (문항별 정오 → 학습 신호 합류) ──
  // adminClient 로 학생 명의 기록을 쓰는 의도적 예외 — 위 staff+반 소유권 게이트에
  // 더해, 대상 학생 전원이 이 반 멤버인지 재검증(fail-closed) 후에만 실행.
  if (intent === "save_results") {
    const entriesSchema = z
      .array(
        z.object({
          userId: z.string().uuid(),
          status: z.enum(["taken", "absent"]),
          wrongOrds: z.array(z.number().int().min(0).max(998)).max(500),
          // 온라인 응시 불러오기 행 — 스냅샷만 기록(시도 재기록 없음).
          onlineSessionId: z.string().uuid().optional(),
        }),
      )
      .min(1)
      .max(300);
    let entriesRaw: unknown;
    try {
      entriesRaw = JSON.parse(String(fd.get("entries") ?? "[]"));
    } catch {
      return data({ error: "결과 형식 오류" }, { status: 400 });
    }
    const parsed = entriesSchema.safeParse(entriesRaw);
    if (!parsed.success) {
      return data({ error: "결과 형식 오류" }, { status: 400 });
    }
    const takenAt = String(fd.get("takenAt") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(takenAt)) {
      return data({ error: "응시일을 입력하세요" }, { status: 400 });
    }

    const { data: members, error: mErr } = await adminClient
      .from("cohort_members")
      .select("profile_id")
      .eq("cohort_id", cohortId);
    if (mErr) return data({ error: "멤버 조회 실패" }, { status: 500 });
    const memberIds = new Set((members ?? []).map((m) => m.profile_id));
    if (parsed.data.some((e) => !memberIds.has(e.userId))) {
      return data(
        { error: "이 반 학생이 아닌 대상이 포함되어 있습니다" },
        { status: 403 },
      );
    }

    const summary = await saveOfflineTestResults(adminClient, {
      testId,
      entries: parsed.data,
      takenAt,
      enteredBy: user.id,
    });
    return data({ ok: true, ...summary });
  }

  if (intent === "set_points") {
    const questionId = String(fd.get("questionId") ?? "");
    const points = Number(fd.get("points"));
    if (!questionId || !Number.isFinite(points) || points < 0.5 || points > 100) {
      return data({ error: "배점은 0.5~100 사이여야 합니다" }, { status: 400 });
    }
    await setTestQuestionPoints(client, testId, questionId, points);
    return data({ ok: true });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}
