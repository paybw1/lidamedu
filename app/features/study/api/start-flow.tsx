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
//
// ★가시성 필터는 학습과목 문제탭(loader.server.ts listProblemsBySubject)과 같은 기준이다 —
//   exam_round='first'(1차 객관식) · review_status='approved' · soft delete 제외 ·
//   미공개 mock 제외. 이걸 빼면 학생이 닿을 수 없는 문제가 큐에 섞인다. 특히
//   2차 주관식(exam_round='second')은 problem-viewer 가 학생을 과목 홈으로 돌려보내므로,
//   흐름이 그 단계에서 끊긴 것처럼 보였다(신고 b0c74de6).
// ★정렬을 주지 않으면 같은 조문에서도 요청마다 다른 큐가 만들어져 재현이 안 된다.
async function getProblemsForCase(
  client: ReturnType<typeof makeServerClient>[0],
  caseId: string,
  limit: number,
): Promise<string[]> {
  const { data: rows, error } = await client
    .from("problem_case_links")
    .select("problem_id, problems!inner(display_no, exam_round, review_status)")
    .eq("case_id", caseId)
    .eq("problems.exam_round", "first")
    .eq("problems.review_status", "approved")
    .is("problems.deleted_at", null)
    .or("origin.neq.mock,released_at.not.is.null", {
      referencedTable: "problems",
    });
  if (error) throw error;
  return (rows ?? [])
    .filter((r) => !!r.problem_id && !!r.problems)
    .sort((a, b) => (a.problems!.display_no ?? 0) - (b.problems!.display_no ?? 0))
    .slice(0, limit)
    .map((r) => r.problem_id!);
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
  // ★한 판례가 여러 주제로 배치되면 article_case_links 에 행이 둘 이상 생긴다
  //   (case-multi-placement). 그대로 두면 같은 판례가 큐에 두 번 들어가 단계만
  //   잡아먹으므로 caseId 로 중복을 걷어낸 뒤 자른다.
  const cases = await getRelatedCasesByArticle(client, articleId);
  const seen = new Set<string>();
  const unique = cases.filter((c) =>
    seen.has(c.caseId) ? false : (seen.add(c.caseId), true),
  );
  unique.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
  const selected = unique.slice(0, maxCases);

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

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
