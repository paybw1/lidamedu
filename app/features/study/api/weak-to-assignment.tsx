// 본인 약점 단원 → 개인 과제(target_profile_id) 직접 생성. 종합반 학생 전용
//   (비종합반은 과제 인프라 없음 → 대신 session-from-weakness 로 안내).
//   pickWeakProblemsForUser(공용 seam) → createAssignment(self-target) → addAssignmentProblemItems.
//   ★adminClient(RLS 우회) 안전근거: cohortId=본인 소속 반·targetProfileId=본인·createdBy=본인 을
//   서버에서 강제 → 학생은 '자기 반에 자기 대상' 과제만 만들 수 있다.
import type { Route } from "./+types/weak-to-assignment";

import { data, redirect } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  addAssignmentProblemItems,
  createAssignment,
} from "~/features/assignments/queries.server";
import {
  WEAK_ASSIGNMENT_TITLE_PREFIX,
  pickWeakProblemsForUser,
} from "~/features/assignments/weak-personal.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

const N = 20;
const DUE_DAYS = 7;

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  // 본인 소속(활성) 반 — 없으면 과제 불가.
  const { data: membership } = await adminClient
    .from("cohort_members")
    .select("cohort_id, cohorts!inner(is_archived, deleted_at)")
    .eq("profile_id", user.id)
    .limit(20);
  const active = (
    (membership ?? []) as unknown as Array<{
      cohort_id: string;
      cohorts: { is_archived: boolean; deleted_at: string | null } | null;
    }>
  ).find((m) => m.cohorts && !m.cohorts.is_archived && m.cohorts.deleted_at === null);
  if (!active) {
    return data(
      {
        error:
          "종합반 수강생만 과제로 추가할 수 있어요. ‘약점 20문항 풀기’로 바로 학습하세요.",
      },
      { status: 400 },
    );
  }
  const cohortId = active.cohort_id;

  // 이미 진행 중(마감 전)인 본인 약점 과제가 있으면 그쪽으로 — 중복 생성 방지.
  const { data: existing } = await adminClient
    .from("assignments")
    .select("assignment_id")
    .eq("cohort_id", cohortId)
    .eq("target_profile_id", user.id)
    .like("title", `${WEAK_ASSIGNMENT_TITLE_PREFIX}%`)
    .is("deleted_at", null)
    .gte("due_at", new Date().toISOString())
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return redirect(`/assignments/${existing.assignment_id}`);

  // 약점 문제 추출 — RLS 요청 client(본인 데이터 + 공개 문제).
  const picked = await pickWeakProblemsForUser(client, user.id, { n: N });
  if (!picked || picked.problemIds.length === 0) {
    return data(
      {
        error:
          "아직 약점 데이터가 부족합니다. 문제를 더 풀면 약점 기반 과제를 만들 수 있습니다.",
      },
      { status: 400 },
    );
  }

  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const label = `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
  const created = await createAssignment(adminClient, {
    cohortId,
    title: `${WEAK_ASSIGNMENT_TITLE_PREFIX} — ${LAW_SUBJECTS[picked.lawCode].name} (${label} 직접추가)`,
    descriptionMd: "내 약점 단원에서 직접 추가한 개인 보충 과제입니다.",
    dueAt: new Date(Date.now() + DUE_DAYS * 86_400_000).toISOString(),
    createdBy: user.id,
    targetProfileId: user.id,
  });
  if (!created.ok) {
    return data({ error: created.error }, { status: 500 });
  }
  await addAssignmentProblemItems(adminClient, created.assignmentId, picked.problemIds);
  return redirect(`/assignments/${created.assignmentId}`);
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
