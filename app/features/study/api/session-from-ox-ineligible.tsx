// 과목의 "정오문제 불가" 문제(OX 드릴에서 완전히 빠지는, ox_ineligible 체크돼 OX-eligible
// 항목이 없는 문제 — 순서나열·개수형 등) → quiz_session 생성 후 일반 객관식으로 풀게 redirect.
// subject 허브 문제탭 런처. session-from-srs 와 동일 패턴(scope='filter' + scopePayload).

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { getOxIneligibleProblemIds } from "~/features/problems/queries.server";
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

  // staff 면 draft 포함(학생은 승인분만).
  const role = await getStaffRole(client, user.id);
  const problemIds = await getOxIneligibleProblemIds(client, subject, {
    includeUnapproved: role !== null,
  });
  if (problemIds.length === 0) {
    return data(
      { error: "정오문제 불가로 분류된 문제가 없습니다." },
      { status: 400 },
    );
  }

  const sessionId = await createQuizSession(client, user.id, {
    mode: "study",
    lawCode: subject,
    scopeType: "filter",
    scopePayload: {
      source: "ox_ineligible",
      originLabel: "정오문제 불가 문제",
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
