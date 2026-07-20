// 본인 약점 단원 → quiz_session 생성 후 첫 문제 redirect (학생 셀프 약점 보강, "D").
//   seam 재사용: getWeakNodes(개인) → pickProblemsFromWeakNodes(가중 배분) → createQuizSession.
//   강사 반 공통 약점(B)과 동일 선택 규칙, 소스(개인 약점)·싱크(세션)만 다름.
//   단일 과목 세션(최약점 과목)으로 — 러너 cross-subject nav 회피. RLS 요청 client(본인 데이터).
//   scope_type 은 기존 'filter'(맞춤 퀴즈) 재사용(신규 enum 미도입), source=weakness 로 구분.
import type { Route } from "./+types/session-from-weakness";

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { pickProblemsFromWeakNodes } from "~/features/problems/lib/problem-selection";
import { getSystematicNodeProblemSequence } from "~/features/problems/queries.server";
import { createQuizSession } from "~/features/study/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";
import { getWeakNodes } from "~/features/subjects/lib/weak-nodes.server";

const PER_PROBLEM_LIMIT_SEC = 90;

const schema = z.object({
  subject: z
    .enum(LAW_SUBJECT_SLUGS as unknown as [LawSubjectSlug, ...LawSubjectSlug[]])
    .optional(),
  mode: z.enum(["study", "exam"]).default("study"),
  n: z.coerce.number().int().min(1).max(50).default(20),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const parsed = schema.safeParse({
    subject: form.get("subject") || undefined,
    mode: form.get("mode") || undefined,
    n: form.get("n") || undefined,
  });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });

  const lawCodes = parsed.data.subject
    ? [parsed.data.subject]
    : [...LAW_SUBJECT_SLUGS];
  const weak = await getWeakNodes(client, user.id, lawCodes, 12);
  if (weak.length === 0) {
    return data(
      {
        error:
          "아직 약점 데이터가 부족합니다. 문제를 더 풀면 약점 단원을 기반으로 추천해 드립니다.",
      },
      { status: 400 },
    );
  }

  // 단일 과목 세션(지정 과목 또는 최약점 과목) — 러너 cross-subject nav 회피.
  const sessionLaw = parsed.data.subject ?? weak[0].lawCode;
  const weakInSubject = weak.filter((w) => w.lawCode === sessionLaw);

  // 노드별 후보 problem_id(체계도 시퀀스) → approved 필터.
  const seqs = await Promise.all(
    weakInSubject.map((w) =>
      getSystematicNodeProblemSequence(client, w.nodeId),
    ),
  );
  const allIds = new Set<string>();
  const rawByNode = new Map<string, string[]>();
  weakInSubject.forEach((w, i) => {
    const ids = (seqs[i]?.problems ?? []).map((p) => p.problemId);
    rawByNode.set(w.nodeId, ids);
    for (const id of ids) allIds.add(id);
  });
  const approved = new Set<string>();
  const idArr = [...allIds];
  for (let i = 0; i < idArr.length; i += 200) {
    const { data: rows } = await client
      .from("problems")
      .select("problem_id")
      .in("problem_id", idArr.slice(i, i + 200))
      .eq("review_status", "approved")
      .is("deleted_at", null);
    for (const r of rows ?? []) approved.add(r.problem_id);
  }
  const problemsByNode = new Map<string, string[]>();
  for (const [nid, ids] of rawByNode)
    problemsByNode.set(
      nid,
      ids.filter((id) => approved.has(id)),
    );

  const problemIds = pickProblemsFromWeakNodes(
    weakInSubject.map((w) => ({
      nodeId: w.nodeId,
      weaknessScore: w.weaknessScore,
    })),
    problemsByNode,
    { totalN: parsed.data.n },
  );
  if (problemIds.length === 0) {
    return data(
      { error: "약점 단원에 아직 풀 수 있는 문제가 없습니다." },
      { status: 400 },
    );
  }

  const sessionId = await createQuizSession(client, user.id, {
    mode: parsed.data.mode,
    lawCode: sessionLaw,
    scopeType: "filter",
    scopePayload: {
      source: "weakness",
      weakNodeCount: weakInSubject.length,
      requestedAt: new Date().toISOString(),
    },
    problemIds,
    timeLimitSec:
      parsed.data.mode === "exam"
        ? Math.max(60, problemIds.length * PER_PROBLEM_LIMIT_SEC)
        : null,
  });

  const params = new URLSearchParams();
  params.set("session", sessionId);
  params.set("mode", parsed.data.mode);
  return redirect(
    `/subjects/${sessionLaw}/problems/${problemIds[0]}?${params.toString()}`,
  );
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
