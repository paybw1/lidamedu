// GET /api/qna/target-resolve — 커뮤니티 Q&A 대상 선택기가 사람이 읽는 식별자를
// target_id 로 해석. 성공 시 표준 URL(/qna/new?targetType&targetId)로 이동한다.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import {
  resolveArticleTarget,
  resolveCaseTarget,
  resolveNodeTarget,
  resolveProblemByDisplayNo,
  resolveProblemTarget,
} from "../lib/target-resolve.server";

import type { Route } from "./+types/target-resolve";

// 문제는 by(exam/systematic) 로 갈리므로 type 단일 discriminator 로는 부족 → z.union 사용.
const paramSchema = z.union([
  z.object({
    type: z.literal("article"),
    subject: z.string().min(1),
    articleNumber: z.string().min(1),
  }),
  z.object({
    type: z.literal("node"),
    nodeId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("case"),
    caseNumber: z.string().min(1),
  }),
  z.object({
    type: z.literal("problem_code"),
    displayNo: z.coerce.number().int().min(1),
  }),
  // 문제 — 기출번호(연도+시험번호) 로 특정.
  z.object({
    type: z.literal("problem"),
    by: z.literal("exam"),
    subject: z.string().min(1),
    year: z.coerce.number().int().min(1900).max(2100),
    examNumber: z.coerce.number().int().min(1).max(200),
  }),
  // 문제 — 체계번호(출처+체계도 노드+노드 내 순번) 로 특정.
  z.object({
    type: z.literal("problem"),
    by: z.literal("systematic"),
    subject: z.string().min(1),
    origin: z.enum(["past_exam", "past_exam_variant", "expected", "mock"]),
    primaryNodeId: z.string().uuid(),
    problemNumber: z.coerce.number().int().min(1).max(200),
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
      : parsed.data.type === "node"
        ? await resolveNodeTarget(client, parsed.data.nodeId)
        : parsed.data.type === "case"
          ? await resolveCaseTarget(client, parsed.data.caseNumber)
          : parsed.data.type === "problem_code"
          ? await resolveProblemByDisplayNo(client, parsed.data.displayNo)
          : parsed.data.by === "exam"
            ? await resolveProblemTarget(client, {
                subject: parsed.data.subject,
                by: "exam",
                year: parsed.data.year,
                examNumber: parsed.data.examNumber,
              })
            : await resolveProblemTarget(client, {
                subject: parsed.data.subject,
                by: "systematic",
                origin: parsed.data.origin,
                primaryNodeId: parsed.data.primaryNodeId,
                problemNumber: parsed.data.problemNumber,
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
    nodes: resolved.nodes ?? null,
  });
}
