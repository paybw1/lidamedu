// 과목의 "정오문제 불가" 문제(OX 드릴에서 완전히 빠지는, ox_ineligible 체크돼 OX-eligible
// 항목이 없는 문제 — 순서나열·개수형 등) → quiz_session 생성 후 일반 객관식으로 풀게 redirect.
// subject 허브 문제탭 런처. session-from-srs 와 동일 패턴(scope='filter' + scopePayload).

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getOxIneligibleProblemIds,
  getSystematicNodeProblemSequence,
} from "~/features/problems/queries.server";
import { createQuizSession } from "~/features/study/queries.server";
import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/session-from-ox-ineligible";

const schema = z.object({ subject: lawSubjectSlugSchema });

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
  const parsed = schema.safeParse({ subject: form.get("subject") });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }
  const { subject } = parsed.data;

  // 체계도 범위(선택) — 문제탭 1·2단계 노드. 주면 그 부분트리 문제로 한정, 없으면 과목 전체.
  const rawNode = form.get("nodeId");
  const nodeId =
    typeof rawNode === "string" && rawNode.trim() !== ""
      ? rawNode.trim()
      : null;

  // staff 면 draft 포함(학생은 승인분만).
  const role = await getStaffRole(client, user.id);
  let problemIds = await getOxIneligibleProblemIds(client, subject, {
    includeUnapproved: role !== null,
  });

  // 노드 범위 — 부분트리 문제 집합과 교집합. seq 의 problemId 매핑은 문제탭 노드 필터와 동일 로직.
  let originLabel = "정오문제 불가 문제";
  if (nodeId) {
    const seq = await getSystematicNodeProblemSequence(client, nodeId);
    const nodeSet = new Set((seq?.problems ?? []).map((p) => p.problemId));
    problemIds = problemIds.filter((id) => nodeSet.has(id));
    if (seq?.node.displayLabel) {
      originLabel = `정오문제 불가 · ${seq.node.displayLabel}`;
    }
  }

  if (problemIds.length === 0) {
    return data(
      {
        error: nodeId
          ? "선택한 체계 범위에는 정오문제 불가 문제가 없습니다."
          : "정오문제 불가로 분류된 문제가 없습니다.",
      },
      { status: 400 },
    );
  }

  const sessionId = await createQuizSession(client, user.id, {
    mode: "study",
    lawCode: subject,
    scopeType: "filter",
    scopePayload: {
      source: "ox_ineligible",
      originLabel,
      backHref: `/subjects/${subject}?tab=problems`,
      requestedAt: new Date().toISOString(),
    },
    problemIds,
    timeLimitSec: null,
  });

  const params = new URLSearchParams();
  params.set("session", sessionId);
  params.set("mode", "study");
  return redirect(
    `/subjects/${subject}/problems/${problemIds[0]}?${params.toString()}`,
  );
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
