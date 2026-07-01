// GET /api/qna/target-resolve — 커뮤니티 Q&A 대상 선택기가 사람이 읽는 식별자를
// target_id 로 해석. 성공 시 표준 URL(/qna/new?targetType&targetId)로 이동한다.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import {
  resolveArticleTarget,
  resolveCaseTarget,
  resolveProblemTarget,
} from "../lib/target-resolve.server";

import type { Route } from "./+types/target-resolve";

const paramSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("article"),
    subject: z.string().min(1),
    articleNumber: z.string().min(1),
  }),
  z.object({
    type: z.literal("case"),
    caseNumber: z.string().min(1),
  }),
  z.object({
    type: z.literal("problem"),
    subject: z.string().min(1),
    examRound: z.enum(["first", "second"]),
    year: z.coerce.number().int().min(1900).max(2100),
    problemNumber: z.coerce.number().int().min(1).max(200),
    origin: z
      .enum(["past_exam", "past_exam_variant", "expected", "mock"])
      .optional(),
  }),
]);

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ ok: false as const, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = paramSchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsed.success) {
    return data({ ok: false as const, error: "invalid-input" }, { status: 400 });
  }

  const resolved =
    parsed.data.type === "article"
      ? await resolveArticleTarget(
          client,
          parsed.data.subject,
          parsed.data.articleNumber,
        )
      : parsed.data.type === "case"
        ? await resolveCaseTarget(client, parsed.data.caseNumber)
        : await resolveProblemTarget(client, {
            subject: parsed.data.subject,
            examRound: parsed.data.examRound,
            year: parsed.data.year,
            problemNumber: parsed.data.problemNumber,
            origin: parsed.data.origin,
          });

  if (!resolved) {
    return data({ ok: false as const, error: "not-found" });
  }
  return data({
    ok: true as const,
    targetType: resolved.targetType,
    targetId: resolved.targetId,
    label: resolved.label,
    href: resolved.href,
  });
}
