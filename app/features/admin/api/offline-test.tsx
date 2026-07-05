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
import {
  addTestQuestions,
  createOfflineTest,
  listBlankCandidates,
  listMcqCandidates,
  listOxCandidates,
  moveTestQuestion,
  removeTestQuestion,
  setTestQuestionPoints,
  softDeleteOfflineTest,
  updateOfflineTest,
  type OfflineQuestionRef,
} from "~/features/offline-tests/queries.server";
import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";

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
    const lawParse = lawSubjectSlugSchema.safeParse(fd.get("lawCode"));
    if (!assignmentId || !title || !lawParse.success) {
      return data({ error: "제목·과목을 입력하세요" }, { status: 400 });
    }
    const testId = await createOfflineTest(client, {
      assignmentId,
      cohortId,
      title,
      lawCode: lawParse.data,
      createdBy: user.id,
    });
    return data({ ok: true, testId, cohortId, assignmentId });
  }

  const testId = String(fd.get("testId") ?? "");

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
    const lawParse = lawSubjectSlugSchema.safeParse(fd.get("lawCode"));
    if (!typeParse.success || !lawParse.success) {
      return data({ error: "유형·과목 오류" }, { status: 400 });
    }
    const n = Math.max(1, Math.min(50, Number(fd.get("n")) || 10));
    const nodeId = String(fd.get("nodeId") ?? "") || null;
    const minImportance = Math.max(0, Math.min(3, Number(fd.get("minImportance")) || 0));
    const filter = { lawCode: lawParse.data, nodeId, minImportance, limit: n * 4 };

    let refs: OfflineQuestionRef[] = [];
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
