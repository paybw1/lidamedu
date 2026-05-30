// feat-2-009 오늘의 학습 메뉴 — 클라이언트/서버 공용 타입.

export type DailyMenuKind =
  | "weak_problem"
  | "weak_article"
  | "unread_case"
  | "blank_due"
  | "gap_problems"
  | "cohort_track"
  | "article_review";

export type DailyMenuPriority = "high" | "medium" | "low";

export interface DailyMenuItem {
  kind: DailyMenuKind;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  estimatedMinutes: number;
  priority: DailyMenuPriority;
  /** kind-specific identifiers — problem_id 등. */
  metadata: Record<string, unknown>;
}

export const KIND_LABEL: Record<DailyMenuKind, string> = {
  weak_problem: "약점 재시도",
  weak_article: "약점 조문",
  unread_case: "미열람 판례",
  blank_due: "빈칸 학습",
  gap_problems: "진도 보충",
  cohort_track: "이번 주 트랙",
  article_review: "조문 복습",
};

const PRIORITY_ORDER: Record<DailyMenuPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortDailyMenu(items: DailyMenuItem[]): DailyMenuItem[] {
  return [...items].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );
}

export function totalEstimatedMinutes(items: DailyMenuItem[]): number {
  return items.reduce((sum, it) => sum + it.estimatedMinutes, 0);
}
