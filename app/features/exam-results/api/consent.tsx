// feat-8-026b — 학습 데이터 분석 동의(A/B) 토글 전용 action.
// 화면(대시보드 등) 어디서든 fetcher 가 여기로 제출 — UI 위치와 무관(단일 진입점).
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  setMyAnalysisConsent,
  setPoolConsent,
} from "~/features/exam-results/queries.server";

import type { Route } from "./+types/consent";

// A=consentA(my_analysis), B=consentB(pool). consented 는 "true"/"false" 문자열 명시 비교
// (z.coerce.boolean 은 Boolean("false")===true 라 철회가 안 됨).
const schema = z.object({
  intent: z.enum(["consentA", "consentB"]),
  consented: z.enum(["true", "false"]),
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

  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });

  const consented = parsed.data.consented === "true";
  const res =
    parsed.data.intent === "consentA"
      ? await setMyAnalysisConsent(client, user.id, consented)
      : await setPoolConsent(client, user.id, consented);
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
