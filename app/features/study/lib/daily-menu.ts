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
  unread_case: "안 본 판례",
  blank_due: "빈칸 학습",
  gap_problems: "진도 보충",
  cohort_track: "이번 주 트랙",
  article_review: "조문 복습",
};

export const ALL_DAILY_MENU_KINDS: DailyMenuKind[] = [
  "weak_problem",
  "weak_article",
  "unread_case",
  "blank_due",
  "gap_problems",
  "cohort_track",
  "article_review",
];

/** prefs jsonb 를 슬롯 enabled map 으로 변환. 미지정/true 는 enabled. */
export function parseRecommendationPrefs(
  prefs: unknown,
): Record<DailyMenuKind, boolean> {
  const out: Record<DailyMenuKind, boolean> = {
    weak_problem: true,
    weak_article: true,
    unread_case: true,
    blank_due: true,
    gap_problems: true,
    cohort_track: true,
    article_review: true,
  };
  if (prefs && typeof prefs === "object") {
    const p = prefs as Record<string, unknown>;
    for (const k of ALL_DAILY_MENU_KINDS) {
      if (p[k] === false) out[k] = false;
    }
  }
  return out;
}

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
