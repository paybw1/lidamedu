// 연속 학습 시작 — article 시작점으로부터 [article → cases → problems...] 큐 생성 후
// 첫 번째 case 단계로 redirect.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getRelatedCasesByArticle } from "~/features/relations/queries.server";
import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";
import {
  serializeFlow,
  stepHref,
  type FlowStep,
} from "~/features/study/lib/learning-flow";

import type { Route } from "./+types/start-flow";

const inputSchema = z.object({
  subject: lawSubjectSlugSchema,
  articleId: z.string().uuid(),
  articleNumber: z.string().min(1),
  maxCases: z.number().int().min(1).max(20).default(5),
  maxProblemsPerCase: z.number().int().min(1).max(10).default(3),
});

// 판례 → 그 판례를 다룬 문제 ids. problem_case_links 직접 매핑 + case-cited problems.
async function getProblemsForCase(
  client: ReturnType<typeof makeServerClient>[0],
  caseId: string,
  limit: number,
): Promise<string[]> {
  const { data: rows, error } = await client
    .from("problem_case_links")
    .select("problem_id")
    .eq("case_id", caseId)
    .limit(limit);
  if (error) throw error;
  return (rows ?? []).map((r) => r.problem_id).filter((x): x is string => !!x);
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
  const parsed = inputSchema.safeParse({
    subject: fd.get("subject"),
    articleId: fd.get("articleId"),
    articleNumber: fd.get("articleNumber"),
    maxCases: fd.get("maxCases") ? Number(fd.get("maxCases")) : undefined,
    maxProblemsPerCase: fd.get("maxProblemsPerCase")
      ? Number(fd.get("maxProblemsPerCase"))
      : undefined,
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { subject, articleId, articleNumber, maxCases, maxProblemsPerCase } =
    parsed.data;

  // 1. article 시작점 + 관련 판례 (중요도 desc).
  const cases = await getRelatedCasesByArticle(client, articleId);
  cases.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
  const selected = cases.slice(0, maxCases);

  // 2. 각 판례별 관련 문제.
  const steps: FlowStep[] = [{ type: "article", id: articleNumber }];
  for (const c of selected) {
    steps.push({ type: "case", id: c.caseId });
    const probs = await getProblemsForCase(client, c.caseId, maxProblemsPerCase);
    for (const pid of probs) steps.push({ type: "problem", id: pid });
  }

  if (steps.length < 2) {
    // 흐름이 단일 article 만 — 의미 없음.
    return data(
      { error: "이 조문에 연결된 판례가 없습니다" },
      { status: 400 },
    );
  }

  const flow = serializeFlow(steps);
  // 첫 step (article) 이후 → 두 번째 step 으로 이동.
  const firstNext = steps[1];
  const href = stepHref(subject, firstNext, { flow, step: "2" });
  throw redirect(href);
}
