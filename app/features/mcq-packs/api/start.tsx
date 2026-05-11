// MCQ 팩 응시 시작 — quiz_session 을 생성하고 첫 문제로 redirect.
// study 모드: 학습 (즉시 해설), 시간제한 없음.
// exam 모드: 모의고사 (타이머 기반, 시간 초과 시 일괄 제출).

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  getPackById,
  getPackProblemIds,
} from "~/features/mcq-packs/queries.server";
import {
  isMockKind,
  type McqPackSubjectScope,
} from "~/features/mcq-packs/labels";
import { createQuizSession } from "~/features/study/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/start";

const MODE_VALUES = ["study", "exam"] as const;

// subject_scope → 첫 problem 의 law_code 또는 science_subject 가 없을 때 fallback URL slug.
function fallbackSubjectSlug(scope: McqPackSubjectScope): string {
  switch (scope) {
    case "patent":
      return "patent";
    case "trademark":
      return "trademark";
    case "design":
      return "design";
    case "industrial":
      return "patent";
    case "civil":
      return "civil";
    case "civil_procedure":
      return "civil-procedure";
    case "science":
      return "science/physics";
  }
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

  const fd = await request.formData();
  const packId = String(fd.get("packId") ?? "");
  if (!z.string().uuid().safeParse(packId).success) {
    return data({ error: "Invalid packId" }, { status: 400 });
  }
  const modeRaw = String(fd.get("mode") ?? "study");
  if (!(MODE_VALUES as readonly string[]).includes(modeRaw)) {
    return data({ error: "Invalid mode" }, { status: 400 });
  }
  const mode = modeRaw as "study" | "exam";

  const pack = await getPackById(client, packId);
  if (!pack) return data({ error: "Pack not found" }, { status: 404 });

  // 모의 pack 인데 study 모드 요청 시 학습 진입 허용 (사용자 선택).
  // 단, exam 모드는 모의 pack 만.
  if (mode === "exam" && !isMockKind(pack.kind)) {
    return data({ error: "이 팩은 모의고사 모드를 지원하지 않습니다." }, {
      status: 400,
    });
  }

  const problemIds = await getPackProblemIds(client, packId);
  if (problemIds.length === 0) {
    return data({ error: "팩에 문제가 없습니다." }, { status: 400 });
  }

  // 첫 문제의 law_code / science_subject 로 viewer URL prefix 결정.
  const { data: firstRow } = await client
    .from("problems")
    .select("problem_id, science_subject, laws(law_code)")
    .eq("problem_id", problemIds[0])
    .maybeSingle();
  let subjectUrl: string;
  if (firstRow?.science_subject) {
    const sci = firstRow.science_subject;
    subjectUrl = `/subjects/science/${sci.replace("_", "-")}`;
  } else if (firstRow?.laws?.law_code) {
    subjectUrl = `/subjects/${firstRow.laws.law_code as LawSubjectSlug}`;
  } else {
    subjectUrl = `/subjects/${fallbackSubjectSlug(pack.subjectScope)}`;
  }

  // 자연과학 / 법률 둘 중 하나로 결정.
  const lawCode =
    firstRow?.laws?.law_code ?? undefined;
  const scienceSubject =
    (firstRow?.science_subject as
      | "physics"
      | "chemistry"
      | "biology"
      | "earth_science"
      | undefined) ?? undefined;
  if (!lawCode && !scienceSubject) {
    return data({ error: "문제의 과목 정보가 없습니다." }, { status: 400 });
  }

  const timeLimitSec =
    mode === "exam" && pack.durationMin && pack.durationMin > 0
      ? pack.durationMin * 60
      : null;

  const sessionId = await createQuizSession(client, user.id, {
    mode,
    lawCode: lawCode as LawSubjectSlug | undefined,
    scienceSubject,
    scopeType: "pack",
    scopePayload: { packId, packTitle: pack.title, kind: pack.kind },
    problemIds,
    timeLimitSec,
    packId,
  });

  // 첫 문제 viewer 로 redirect (자연과학은 science/:subject/problems/:id, 법률은 :subject/problems/:id).
  const firstProblemId = problemIds[0];
  let runnerUrl: string;
  if (scienceSubject) {
    const sci = scienceSubject.replace("_", "-");
    runnerUrl = `/subjects/science/${sci}/problems/${firstProblemId}?session=${sessionId}`;
  } else {
    runnerUrl = `${subjectUrl}/problems/${firstProblemId}?session=${sessionId}`;
  }
  return redirect(runnerUrl);
}
