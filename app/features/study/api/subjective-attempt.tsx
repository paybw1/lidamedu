// 주관식 3단계 훈련 저장 (feat-2-032 개편 2026-08-18).
//   ① 논점 추출 ② 목차 구성 ③ 사안의 포섭·결론 — 세 칸을 항상 함께 보낸다(부분 저장 없음).
// intent=autosave : 3단계 본문만 갱신.
// intent=timed    : 3단계 본문 + 시험 모드 응시 기록(제한·소요) 갱신.
// intent=cancel   : soft delete + 상태 초기화.
import type { Route } from "./+types/subjective-attempt";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  cancelSubjectiveAttempt,
  upsertSubjectiveAttempt,
} from "~/features/study/queries.server";

// 한 칸당 상한 — 완성 답안이 아니라 논점·목차·포섭이라 20k 로도 넉넉하다.
const STAGE_MAX = 20000;

const baseSchema = z.object({
  problemId: z.string().uuid(),
  issuesMd: z.string().max(STAGE_MAX),
  outlineMd: z.string().max(STAGE_MAX),
  analysisMd: z.string().max(STAGE_MAX),
});

const timedSchema = baseSchema.extend({
  timedLimitMin: z.coerce.number().int().min(1).max(180),
  timedElapsedSec: z.coerce.number().int().min(0),
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

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "autosave");
  const stages = {
    problemId: fd.get("problemId"),
    issuesMd: fd.get("issuesMd") ?? "",
    outlineMd: fd.get("outlineMd") ?? "",
    analysisMd: fd.get("analysisMd") ?? "",
  };

  if (intent === "autosave") {
    const parsed = baseSchema.safeParse(stages);
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    const attempt = await upsertSubjectiveAttempt(
      client,
      user.id,
      parsed.data.problemId,
      {
        issuesMd: parsed.data.issuesMd,
        outlineMd: parsed.data.outlineMd,
        analysisMd: parsed.data.analysisMd,
      },
    );
    return data({ ok: true, attempt });
  }

  if (intent === "timed") {
    const parsed = timedSchema.safeParse({
      ...stages,
      timedLimitMin: fd.get("timedLimitMin"),
      timedElapsedSec: fd.get("timedElapsedSec"),
    });
    if (!parsed.success)
      return data({ error: "Invalid input" }, { status: 400 });
    const attempt = await upsertSubjectiveAttempt(
      client,
      user.id,
      parsed.data.problemId,
      {
        issuesMd: parsed.data.issuesMd,
        outlineMd: parsed.data.outlineMd,
        analysisMd: parsed.data.analysisMd,
        timed: {
          limitMin: parsed.data.timedLimitMin,
          elapsedSec: parsed.data.timedElapsedSec,
        },
      },
    );
    return data({ ok: true, attempt });
  }

  // 작성 취소 — soft delete + 상태 초기화.
  if (intent === "cancel") {
    const problemId = String(fd.get("problemId") ?? "");
    if (!z.string().uuid().safeParse(problemId).success)
      return data({ error: "Invalid input" }, { status: 400 });
    const result = await cancelSubjectiveAttempt(client, user.id, problemId);
    if (!result.ok) return data({ error: result.error }, { status: 400 });
    return data({ ok: true, canceled: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
