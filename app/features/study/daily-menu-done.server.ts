// 오늘의 학습 — 추천 항목 완료 판정(2026-08-15 신고 7dcd9ed7).
// 추천 메뉴는 하루 1회 합성 후 스냅샷 고정(user_daily_recommendations)이라, 학생이
// 항목을 수행하고 돌아와도 카드가 그대로 남아 "이미 한 걸 또 하라"고 보였다.
// 스냅샷은 그대로 두고(픽 고정 정책 유지), 오늘 활동 로그로 done 플래그만 파생한다.
//
// 판정 기준(전부 "오늘 KST 안의 활동"):
//   weak_problem / gap_problems → 해당 문제(들) 시도 기록
//   weak_article / article_review → 해당 조문 열람 세션
//   unread_case → 해당 판례 열람 세션
//   blank_due → 해당 빈칸 세트 입력 기록
//   cohort_track → 판정 대상 아님(과제 카드가 별도로 진행률을 보여줌)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { DailyMenuItem } from "~/features/study/lib/daily-menu";

/** 스냅샷 항목 + 오늘 완료 여부(markDailyMenuDone 이 항상 채움 — 테스트 fixture 호환 위해 optional). */
export type DailyMenuItemWithDone = DailyMenuItem & { done?: boolean };

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** 항목이 참조하는 대상 id 들을 종류별로 모은다. */
function collectTargets(items: DailyMenuItem[]) {
  const problemIds = new Set<string>();
  const articleIds = new Set<string>();
  const caseIds = new Set<string>();
  const setIds = new Set<string>();
  for (const it of items) {
    const m = it.metadata ?? {};
    switch (it.kind) {
      case "weak_problem": {
        const id = str(m.problemId);
        if (id) problemIds.add(id);
        break;
      }
      case "gap_problems": {
        for (const id of strList(m.problemIds)) problemIds.add(id);
        break;
      }
      case "weak_article":
      case "article_review": {
        const id = str(m.articleId);
        if (id) articleIds.add(id);
        break;
      }
      case "unread_case": {
        const id = str(m.caseId);
        if (id) caseIds.add(id);
        break;
      }
      case "blank_due": {
        const id = str(m.setId);
        if (id) setIds.add(id);
        break;
      }
      default:
        break;
    }
  }
  return { problemIds, articleIds, caseIds, setIds };
}

/**
 * 오늘 활동 기준으로 각 추천 항목에 done 플래그를 붙인다.
 * 조회는 대상이 있는 종류만 — 추천이 비어 있으면 쿼리 0회.
 */
export async function markDailyMenuDone(
  client: SupabaseClient<Database>,
  userId: string,
  items: DailyMenuItem[],
  date: string,
): Promise<DailyMenuItemWithDone[]> {
  if (items.length === 0) return [];
  const { problemIds, articleIds, caseIds, setIds } = collectTargets(items);
  const sinceIso = new Date(`${date}T00:00:00+09:00`).toISOString();

  const [attemptRes, sessionRes, blankRes] = await Promise.all([
    problemIds.size > 0
      ? client
          .from("user_problem_attempts")
          .select("problem_id")
          .eq("user_id", userId)
          .gte("attempted_at", sinceIso)
          .in("problem_id", [...problemIds])
      : Promise.resolve({ data: [] as { problem_id: string }[] }),
    articleIds.size > 0 || caseIds.size > 0
      ? client
          .from("study_sessions")
          .select("scope")
          .eq("user_id", userId)
          .gte("started_at", sinceIso)
      : Promise.resolve({ data: [] as { scope: unknown }[] }),
    setIds.size > 0
      ? client
          .from("user_blank_attempts")
          .select("set_id")
          .eq("user_id", userId)
          .gte("attempted_at", sinceIso)
          .in("set_id", [...setIds])
      : Promise.resolve({ data: [] as { set_id: string }[] }),
  ]);

  const attemptedProblems = new Set(
    (attemptRes.data ?? []).map((r) => r.problem_id),
  );
  const attemptedSets = new Set((blankRes.data ?? []).map((r) => r.set_id));
  // study_sessions.scope = { target_type, target_id, … } jsonb.
  const viewedTargets = new Set<string>();
  for (const row of sessionRes.data ?? []) {
    const scope = row.scope as { target_type?: unknown; target_id?: unknown } | null;
    const type = str(scope?.target_type);
    const id = str(scope?.target_id);
    if (type && id) viewedTargets.add(`${type}:${id}`);
  }

  return items.map((it) => {
    const m = it.metadata ?? {};
    let done = false;
    switch (it.kind) {
      case "weak_problem": {
        const id = str(m.problemId);
        done = !!id && attemptedProblems.has(id);
        break;
      }
      case "gap_problems": {
        const ids = strList(m.problemIds);
        // 진도 보충은 묶음(5문항) — 하나라도 풀면 착수한 것으로 본다.
        done = ids.length > 0 && ids.some((id) => attemptedProblems.has(id));
        break;
      }
      case "weak_article":
      case "article_review": {
        const id = str(m.articleId);
        done = !!id && viewedTargets.has(`article:${id}`);
        break;
      }
      case "unread_case": {
        const id = str(m.caseId);
        done = !!id && viewedTargets.has(`case:${id}`);
        break;
      }
      case "blank_due": {
        const id = str(m.setId);
        done = !!id && attemptedSets.has(id);
        break;
      }
      default:
        done = false;
    }
    return { ...it, done };
  });
}
