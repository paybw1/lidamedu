// 강사 본인이 등록한 콘텐츠 카운트 — 운영자 허브 상단 카드용.
// 5종 콘텐츠 기여 건수.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export interface StaffContentStats {
  cases: number;
  problems: number;
  papers: number;
  bookUpdates: number;
  articleComments: number;
  // 본인이 발행에 참여한 법 개정 (article_revisions).
  articleRevisions: number;
}

export async function getStaffContentStats(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<StaffContentStats> {
  // 모두 deleted_at IS NULL (해당하는 테이블만) 조건 + created_by = userId.
  const [cases, problems, papers, bookUpdates, articleComments, revisions] =
    await Promise.all([
      client
        .from("cases")
        .select("case_id", { count: "exact", head: true })
        .eq("created_by", userId)
        .is("deleted_at", null),
      client
        .from("problems")
        .select("problem_id", { count: "exact", head: true })
        .eq("created_by", userId)
        .is("deleted_at", null),
      client
        .from("papers")
        .select("paper_id", { count: "exact", head: true })
        .eq("created_by", userId)
        .is("deleted_at", null),
      client
        .from("book_updates")
        .select("book_update_id", { count: "exact", head: true })
        .eq("created_by", userId)
        .is("deleted_at", null),
      client
        .from("content_comments")
        .select("comment_id", { count: "exact", head: true })
        .eq("author_id", userId)
        .eq("target_type", "article"),
      client
        .from("user_subjective_attempts")
        .select("attempt_id", { count: "exact", head: true })
        .eq("reviewer_id", userId)
        .not("review_completed_at", "is", null),
      client
        .from("article_revisions")
        .select("revision_id", { count: "exact", head: true })
        .eq("created_by", userId),
    ]);

  return {
    cases: cases.count ?? 0,
    problems: problems.count ?? 0,
    papers: papers.count ?? 0,
    bookUpdates: bookUpdates.count ?? 0,
    articleComments: articleComments.count ?? 0,
    articleRevisions: revisions.count ?? 0,
  };
}
