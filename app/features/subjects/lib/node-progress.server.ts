// 체계도 노드별 학습 진척도 산출 (feat-4-A 보강).
// 출력: article_id 별 단위 통계. 컴포넌트가 노드 트리 walking 시 subtree 합산.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  ArticleProgressUnit,
  NodeProgressByArticle,
} from "~/features/subjects/components/node-progress-gauge";

export type { ArticleProgressUnit, NodeProgressByArticle };

export async function buildNodeProgressByArticle(
  client: SupabaseClient<Database>,
  userId: string,
  articleIds: string[],
): Promise<NodeProgressByArticle> {
  const out: NodeProgressByArticle = {};
  for (const aid of articleIds) {
    out[aid] = {
      articleId: aid,
      viewed: false,
      caseTotal: 0,
      caseViewed: 0,
      problemTotal: 0,
      problemAttempts: 0,
      problemCorrect: 0,
    };
  }
  if (articleIds.length === 0) return out;

  // 1. 본인이 열람한 조문/판례 ids (study_sessions 기준).
  const [articleViewRows, caseLinkRows, problemRows] = await Promise.all([
    client
      .from("study_sessions")
      .select("scope")
      .eq("user_id", userId)
      .limit(5000),
    client
      .from("article_case_links")
      .select("article_id, case_id")
      .in("article_id", articleIds),
    client
      .from("problems")
      .select("problem_id, primary_article_id")
      .in("primary_article_id", articleIds)
      .is("deleted_at", null),
  ]);

  const viewedArticles = new Set<string>();
  const viewedCases = new Set<string>();
  for (const r of articleViewRows.data ?? []) {
    const scope = (r.scope ?? {}) as {
      target_type?: string;
      target_id?: string;
    };
    if (!scope.target_id) continue;
    if (scope.target_type === "article") viewedArticles.add(scope.target_id);
    else if (scope.target_type === "case") viewedCases.add(scope.target_id);
  }

  // 2. article→cases 매핑.
  const casesByArticle = new Map<string, Set<string>>();
  const allCaseIds = new Set<string>();
  for (const r of caseLinkRows.data ?? []) {
    if (!r.article_id || !r.case_id) continue;
    if (!casesByArticle.has(r.article_id))
      casesByArticle.set(r.article_id, new Set());
    casesByArticle.get(r.article_id)!.add(r.case_id);
    allCaseIds.add(r.case_id);
  }

  // 3. article→problems 매핑.
  const problemsByArticle = new Map<string, string[]>();
  const allProblemIds: string[] = [];
  for (const r of problemRows.data ?? []) {
    if (!r.primary_article_id) continue;
    if (!problemsByArticle.has(r.primary_article_id))
      problemsByArticle.set(r.primary_article_id, []);
    problemsByArticle.get(r.primary_article_id)!.push(r.problem_id);
    allProblemIds.push(r.problem_id);
  }

  // 4. 본인 문제 attempts.
  const attemptStats = new Map<
    string,
    { attempts: number; correct: number }
  >();
  if (allProblemIds.length > 0) {
    const { data: attempts } = await client
      .from("user_problem_attempts")
      .select("problem_id, is_correct")
      .eq("user_id", userId)
      .in("problem_id", allProblemIds);
    for (const a of attempts ?? []) {
      const s = attemptStats.get(a.problem_id) ?? {
        attempts: 0,
        correct: 0,
      };
      s.attempts += 1;
      if (a.is_correct) s.correct += 1;
      attemptStats.set(a.problem_id, s);
    }
  }

  // 5. 조립.
  for (const aid of articleIds) {
    const unit = out[aid];
    unit.viewed = viewedArticles.has(aid);
    const caseSet = casesByArticle.get(aid);
    if (caseSet) {
      unit.caseTotal = caseSet.size;
      for (const cid of caseSet) if (viewedCases.has(cid)) unit.caseViewed += 1;
    }
    const probs = problemsByArticle.get(aid) ?? [];
    unit.problemTotal = probs.length;
    for (const pid of probs) {
      const s = attemptStats.get(pid);
      if (!s) continue;
      unit.problemAttempts += s.attempts;
      unit.problemCorrect += s.correct;
    }
  }
  return out;
}
