// MCQ 팩 응시 시작 — quiz_session 을 생성하고 시험지(sheet) 페이지로 redirect.
// study 모드: 학습 (전 문항 한 페이지 + 채점/해설), 시간제한 없음.
// exam 모드: 모의고사 (타이머 기반, 시간 초과 시 일괄 제출).
// examAttemptId 가 붙으면 통합 시험(feat-10-005) 교시 응시 — exam 모드 강제 + 교시 게이트 검증.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getExamPaperStartDecision } from "~/features/mcq-exams/queries.server";
import {
  getPackById,
  getPackProblemIds,
} from "~/features/mcq-packs/queries.server";
import { isMockKind } from "~/features/mcq-packs/labels";
import { createQuizSession } from "~/features/study/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/start";

const MODE_VALUES = ["study", "exam"] as const;

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

  // 통합 시험 교시 응시 — examAttemptId 가 붙으면 exam 모드 강제.
  const examAttemptIdRaw = String(fd.get("examAttemptId") ?? "").trim();
  const examAttemptId = z.string().uuid().safeParse(examAttemptIdRaw).success
    ? examAttemptIdRaw
    : null;

  const modeRaw = examAttemptId ? "exam" : String(fd.get("mode") ?? "study");
  if (!(MODE_VALUES as readonly string[]).includes(modeRaw)) {
    return data({ error: "Invalid mode" }, { status: 400 });
  }
  const mode = modeRaw as "study" | "exam";

  const pack = await getPackById(client, packId);
  if (!pack) return data({ error: "Pack not found" }, { status: 404 });

  // 모의 pack 인데 study 모드 요청 시 학습 진입 허용 (사용자 선택).
  // 단, exam 모드는 모의 pack 만.
  if (mode === "exam" && !isMockKind(pack.kind)) {
    return data(
      { error: "이 문제집은 모의고사 모드를 지원하지 않습니다." },
      { status: 400 },
    );
  }

  // 교시 응시 — 응시 소유·교시 게이트 검증. 진행 중 세션이 있으면 그 시트로 복귀.
  if (examAttemptId) {
    const decision = await getExamPaperStartDecision(
      client,
      user.id,
      examAttemptId,
      packId,
    );
    if (decision.kind === "error") {
      return data({ error: decision.message }, { status: 400 });
    }
    if (decision.kind === "resume") {
      return redirect(`/latest/mcq/${packId}/sheet/${decision.sessionId}`);
    }
  }

  const problemIds = await getPackProblemIds(client, packId);
  if (problemIds.length === 0) {
    return data({ error: "문제집에 문제가 없습니다." }, { status: 400 });
  }

  // session 생성 시 law_code / science_subject 둘 중 하나가 필수 (DB check).
  // 시험지 view 자체는 과목과 무관하게 동작하므로 첫 문제 기준으로 결정만 한다.
  const { data: firstRow } = await client
    .from("problems")
    .select("problem_id, science_subject, laws(law_code)")
    .eq("problem_id", problemIds[0])
    .maybeSingle();
  const lawCode = firstRow?.laws?.law_code ?? undefined;
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
    examAttemptId,
  });

  // ?startAt=<problemId> 가 포함된 경우 시험지 안에서 해당 문항으로 스크롤 anchor.
  // exam 모드는 첫 문제부터 시작 — startAt 무시.
  const startAtRaw = String(fd.get("startAt") ?? "").trim();
  const startIdx =
    mode === "study" && z.string().uuid().safeParse(startAtRaw).success
      ? problemIds.indexOf(startAtRaw)
      : -1;
  const anchor = startIdx >= 0 ? `#p-${startIdx + 1}` : "";

  return redirect(`/latest/mcq/${packId}/sheet/${sessionId}${anchor}`);
}
