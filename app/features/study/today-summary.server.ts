// 오늘 요약 — [오늘] 화면 본문과 대시보드 최상단 "오늘 입구 카드" 가 공유.
// 두 화면이 동일한 숫자/모드를 보여주도록 단일 소유.
//
// 표시 규칙 (지시서 §3):
//  - 복습은 maxReviewsPerDay 상한 적용 후 카운트. 누적 due 그대로 노출 금지.
//  - 종합반 학생만 과제 카드 표시 (cohort_members 조회).
//  - 신규 학생(복습 0·추천 0·과제 0) 빈상태 가이드 트리거.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { listStudentAssignments } from "~/features/assignments/queries.server";
import {
  getDueCountsByType,
  getReviewQueue,
  isKindBacklogged,
} from "~/features/srs/srs.server";
import {
  getOrComposeDailyMenu,
  kstToday,
} from "~/features/study/daily-menu.server";
import type { DailyMenuItem } from "~/features/study/lib/daily-menu";
import {
  DAILY_REVIEW_BUDGET,
  splitReviewBudget,
} from "~/features/study/lib/srs";
import {
  getSrsCounts as getProblemSrsCounts,
} from "~/features/study/srs.server";

export interface TodayReviewSummary {
  /** v1 (객체별 SM-2) 오늘 노출 due 수 — 하루 상한 적용 후(오래된 것 우선). */
  problemDue: number;
  /** v1 실제 누적 due(상한 적용 전). 밀림 안내용. */
  problemDueTotal: number;
  /** v1 상한 초과로 오늘 안 보이는 밀린 문제 복습 수. */
  problemBacklog: number;
  /** 문제 복습 하루 상한(부담 조절). */
  problemBudget: number;
  /** v2 (능동 플래시카드) 큐의 due 항목 수 (상한 적용 후). */
  flashcardDue: number;
  /** v2 큐의 신규 항목 수 (상한 적용 후). */
  flashcardNew: number;
  /** 학생에게 보여줄 통합 표기 — 두 SRS 합산 (상한 적용 후). */
  totalToday: number;
  /** v2 일일 상한 설정. */
  maxPerDay: number;
  /** 누적 due 를 상한 때문에 다 못 보여줬는지(v1 또는 v2 밀림). */
  hasBacklog: boolean;
}

export interface TodayAssignmentSummary {
  /** 본인이 cohort 멤버인지. 아니면 모든 다른 필드 false/0/[]. */
  isCohortMember: boolean;
  /** 미완 과제 수 (cohort 비멤버 = 0). */
  pendingCount: number;
  /** 마감 ≤ 3일 임박 과제 수. */
  dueSoonCount: number;
  /** UI 미리보기용 — top 3. */
  topPending: Array<{
    assignmentId: string;
    title: string;
    dueAt: string;
    completedItems: number;
    totalItems: number;
  }>;
}

/** 오늘 진행률 — 복습(문제 SRS) 기준. completed/total 로 진행 바 렌더.
 *  추천은 "완료" 개념이 없어 제외, 암기 카드(v2)는 재활성화 단계에서 합산 예정. */
export interface TodayProgress {
  completed: number;
  total: number;
}

// feat-2-024 — 암기 카드 종류별 밀림(임계 초과한 종류만). 오늘 할 일 경고용.
export interface CardBacklogItem {
  kind: "article" | "case";
  label: string;
  due: number;
  oldestOverdueDays: number | null;
}

export interface TodaySummary {
  date: string; // YYYY-MM-DD (KST)
  review: TodayReviewSummary;
  recommendations: DailyMenuItem[];
  assignments: TodayAssignmentSummary;
  /** 오늘 복습 진행률(완료/전체). total=0 이면 진행 바 숨김. */
  progress: TodayProgress;
  /** 과거 학습 이력 유무 — 빈상태에서 신규(가이드) vs 완료(축하) 분기. */
  hasStudiedBefore: boolean;
  /** 할 일 없음(복습0·추천0·과제0). UI 빈상태 분기(+hasStudiedBefore). */
  isEmptyForNewUser: boolean;
  /** 암기 카드 종류별 밀림(임계 초과한 종류만). 비면 경고 없음. */
  cardBacklog: CardBacklogItem[];
}

/** 본인이 cohort 멤버인지 boolean. */
async function isCohortMember(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { count } = await client
    .from("cohort_members")
    .select("cohort_id", { head: true, count: "exact" })
    .eq("profile_id", userId);
  return (count ?? 0) > 0;
}

/** 오늘(KST) 복습한 문제 SRS 수 — last_reviewed_at >= KST 자정. */
async function countProblemsReviewedToday(
  client: SupabaseClient<Database>,
  userId: string,
  date: string,
): Promise<number> {
  const kstMidnightIso = new Date(`${date}T00:00:00+09:00`).toISOString();
  const { count } = await client
    .from("user_problem_srs")
    .select("problem_id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .gte("last_reviewed_at", kstMidnightIso);
  return count ?? 0;
}

/** 학습 이력 유무 — 조문/판례 열람(study_sessions)이나 문제 시도가 하나라도 있으면 true. */
async function checkHasStudiedBefore(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const [sess, att] = await Promise.all([
    client
      .from("study_sessions")
      .select("user_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .limit(1),
    client
      .from("user_problem_attempts")
      .select("user_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .limit(1),
  ]);
  return (sess.count ?? 0) > 0 || (att.count ?? 0) > 0;
}

export async function getTodaySummary(
  client: SupabaseClient<Database>,
  userId: string,
  date: string = kstToday(),
): Promise<TodaySummary> {
  const [
    problemSrs,
    flashcardQueue,
    recommendations,
    assignments,
    cohortFlag,
    reviewedTodayProblem,
    studiedBefore,
    dueByType,
  ] = await Promise.all([
    getProblemSrsCounts(client, userId),
    getReviewQueue(client, userId),
    getOrComposeDailyMenu(client, userId, date),
    listStudentAssignments(userId),
    isCohortMember(client, userId),
    countProblemsReviewedToday(client, userId, date),
    checkHasStudiedBefore(client, userId),
    getDueCountsByType(client, userId),
  ]);

  // v2 큐는 maxReviewsPerDay 상한 적용 후 items[] 반환. backlog 는 누적 due > 상한 응답 합계.
  const flashcardDue = flashcardQueue.dueCount;
  const flashcardNew = flashcardQueue.newCount;
  const flashcardTotalShown = flashcardDue + flashcardNew;
  // v2 의 누적 due 와 표시값 비교는 비싸므로 단순 추정: 표시값이 상한과 같으면 backlog 가능성.
  const flashcardBacklog =
    flashcardTotalShown >= flashcardQueue.settings.maxReviewsPerDay;

  // feat-2-031 — 문제 복습(v1)에 하루 노출 상한 적용. 밀린 due 전부 헤드라인에 얹어 "산더미"로
  //   보이던 것을, 오늘 상한만큼만 노출하고 나머지는 '밀림'으로 부드럽게 안내한다.
  const { shown: problemShown, backlog: problemBacklog } = splitReviewBudget(
    problemSrs.due,
  );

  const review: TodayReviewSummary = {
    problemDue: problemShown,
    problemDueTotal: problemSrs.due,
    problemBacklog,
    problemBudget: DAILY_REVIEW_BUDGET,
    flashcardDue,
    flashcardNew,
    totalToday: problemShown + flashcardTotalShown,
    maxPerDay: flashcardQueue.settings.maxReviewsPerDay,
    hasBacklog: flashcardBacklog || problemBacklog > 0,
  };

  // 과제 — cohort 멤버 아니면 모두 0/빈배열.
  let assignmentsSummary: TodayAssignmentSummary;
  if (!cohortFlag) {
    assignmentsSummary = {
      isCohortMember: false,
      pendingCount: 0,
      dueSoonCount: 0,
      topPending: [],
    };
  } else {
    const pending = assignments.filter(
      (a) => a.submission?.status !== "completed",
    );
    const now = Date.now();
    const dueSoonMs = 3 * 86_400_000;
    const dueSoon = pending.filter((a) => {
      const due = new Date(a.dueAt).getTime();
      return due - now <= dueSoonMs;
    });
    assignmentsSummary = {
      isCohortMember: true,
      pendingCount: pending.length,
      dueSoonCount: dueSoon.length,
      topPending: pending.slice(0, 3).map((a) => ({
        assignmentId: a.assignmentId,
        title: a.title,
        dueAt: a.dueAt,
        completedItems: a.submission?.completedItems ?? 0,
        totalItems: a.submission?.totalItems ?? a.itemCount,
      })),
    };
  }

  const isEmptyForNewUser =
    review.totalToday === 0 &&
    recommendations.length === 0 &&
    assignmentsSummary.pendingCount === 0;

  // 진행률 — 오늘 복습(문제 SRS) 기준. 완료=오늘 복습 수, 전체=완료+남은 due.
  const progress: TodayProgress = {
    completed: reviewedTodayProblem,
    total: reviewedTodayProblem + review.problemDue,
  };

  // 암기 카드 종류별 밀림 — 임계(개수/경과일) 초과한 종류만 경고로.
  const cardBacklog: CardBacklogItem[] = [];
  for (const k of [
    { kind: "article" as const, label: "조문" },
    { kind: "case" as const, label: "판례" },
  ]) {
    const s = dueByType[k.kind];
    if (isKindBacklogged(s))
      cardBacklog.push({
        kind: k.kind,
        label: k.label,
        due: s.due,
        oldestOverdueDays: s.oldestOverdueDays,
      });
  }

  return {
    date,
    review,
    recommendations,
    assignments: assignmentsSummary,
    progress,
    hasStudiedBefore: studiedBefore,
    isEmptyForNewUser,
    cardBacklog,
  };
}
