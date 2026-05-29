// 자동 학습 추천 액션 생성 (feat-8-013).
// 순수 함수 — 이미 fetch 된 데이터 결합. priority 별 정렬, 최대 5개.
// 합격자 데이터(PasserBenchmark/PasserLawAverage)가 있으면 컨설팅 강도 ↑,
// 없으면 본인 약점/과제/streak 만 가지고 fallback recommendation 제공.

import type { PassPrediction } from "~/features/study/lib/pass-predict";
import type { WeakAreaItem } from "~/features/study/queries.server";
import type { WeakNodeItem } from "~/features/subjects/lib/weak-nodes.server";

import type {
  GroupBaseline,
  PasserBenchmark,
  PasserLawAverage,
} from "./analytics.server";

export type ActionPriority = "high" | "medium" | "low" | "celebrate";
export type ActionIcon =
  | "alert"
  | "trend"
  | "target"
  | "flame"
  | "star"
  | "trophy"
  | "calendar"
  | "spark";

export interface RecommendedAction {
  id: string;
  priority: ActionPriority;
  icon: ActionIcon;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  metric?: string; // 보조 라벨 (e.g. "-12% 격차")
}

interface PendingAssignmentLite {
  assignmentId: string;
  title: string;
  dueAt: string;
  completedItems: number;
  totalItems: number;
}

interface DailyStatsLite {
  currentStreak: number;
  totalActiveDays: number;
  avgHoursPerActiveDay: number;
}

export interface GenerateActionsInput {
  benchmark: PasserBenchmark | null;
  failerBaseline: GroupBaseline | null; // 비합격자 평균 — 위험 신호 판정용
  passerLawAverages: Record<string, PasserLawAverage>;
  weakAreas: WeakAreaItem[];
  weakNodes: WeakNodeItem[];
  pendingAssignments: PendingAssignmentLite[];
  dailyStats: DailyStatsLite;
  passPrediction: PassPrediction;
  hasExamPlan: boolean;
}

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  celebrate: 3,
};

export function generateRecommendedActions(
  input: GenerateActionsInput,
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  // ─── 1) 마감 임박 과제 (high) ───
  const now = Date.now();
  for (const a of input.pendingAssignments) {
    const due = new Date(a.dueAt).getTime();
    const daysLeft = Math.floor((due - now) / 86_400_000);
    const pct =
      a.totalItems > 0
        ? Math.round((a.completedItems / a.totalItems) * 100)
        : 0;
    const overdue = daysLeft < 0;
    if (overdue) {
      actions.push({
        id: `assignment-overdue-${a.assignmentId}`,
        priority: "high",
        icon: "alert",
        title: `🚨 과제 마감 지남 — ${a.title}`,
        body: `진척 ${pct}%. 마감일이 지났습니다. 지금 풀이 시작 권장.`,
        ctaLabel: "과제 풀러가기",
        ctaUrl: `/assignments/${a.assignmentId}`,
        metric: `${a.completedItems}/${a.totalItems}`,
      });
    } else if (daysLeft <= 3 && pct < 70) {
      actions.push({
        id: `assignment-due-${a.assignmentId}`,
        priority: "high",
        icon: "calendar",
        title: `마감 D-${daysLeft} — ${a.title}`,
        body: `진척 ${pct}%. 마감일까지 ${daysLeft}일 남았습니다.`,
        ctaLabel: "과제 풀러가기",
        ctaUrl: `/assignments/${a.assignmentId}`,
        metric: `${a.completedItems}/${a.totalItems}`,
      });
    }
  }

  // ─── 2) 합격자 비교 기반 액션 (benchmark 있을 때) ───
  if (input.benchmark) {
    const b = input.benchmark;
    // 학습 시간 격차
    if (
      b.studyHours.user !== null &&
      b.studyHours.passerMean !== null &&
      b.studyHours.passerMean > 0
    ) {
      const ratio = b.studyHours.user / b.studyHours.passerMean;
      const deltaH = Math.round(b.studyHours.passerMean - b.studyHours.user);
      if (ratio < 0.5 && deltaH > 50) {
        actions.push({
          id: "study-hours-gap-high",
          priority: "high",
          icon: "trend",
          title: "학습 시간이 합격자 평균의 절반 미만",
          body: `합격자 평균 ${Math.round(b.studyHours.passerMean)}시간, 본인 ${Math.round(b.studyHours.user)}시간. 일일 학습 시간을 늘려 합격선에 다가가세요.`,
          ctaLabel: "학습 목표 설정",
          ctaUrl: "/goals",
          metric: `-${deltaH}h`,
        });
      } else if (ratio < 0.8 && deltaH > 30) {
        actions.push({
          id: "study-hours-gap-mid",
          priority: "medium",
          icon: "trend",
          title: "학습 시간 격차 좁히기",
          body: `합격자 평균 대비 ${Math.round((1 - ratio) * 100)}% 부족. +${deltaH}시간을 목표로 속도 조정 권장.`,
          ctaLabel: "학습 목표",
          ctaUrl: "/goals",
          metric: `-${deltaH}h`,
        });
      }
    }

    // 정답률 격차
    if (
      b.accuracyPct.user !== null &&
      b.accuracyPct.passerMean !== null
    ) {
      const delta = b.accuracyPct.passerMean - b.accuracyPct.user;
      if (delta >= 10) {
        // 가장 약한 노드 url 찾기
        const fallbackNode = input.weakNodes[0];
        const url = fallbackNode
          ? `/subjects/${fallbackNode.lawCode}/systematic/${fallbackNode.nodeId}`
          : "/study/wrong-note";
        actions.push({
          id: "accuracy-gap-high",
          priority: "high",
          icon: "target",
          title: "정답률 합격자 평균보다 낮음",
          body: `합격자 평균 ${Math.round(b.accuracyPct.passerMean)}%, 본인 ${Math.round(b.accuracyPct.user)}%. 약점 단원을 집중 복습하면 가장 빨리 좁힐 수 있습니다.`,
          ctaLabel: fallbackNode ? "약점 단원 학습" : "오답노트 시작",
          ctaUrl: url,
          metric: `-${Math.round(delta)}%p`,
        });
      } else if (delta >= 5) {
        actions.push({
          id: "accuracy-gap-mid",
          priority: "medium",
          icon: "target",
          title: "정답률 살짝 부족",
          body: `합격자 평균 ${Math.round(b.accuracyPct.passerMean)}%까지 ${Math.round(delta)}%p. 오답노트 + 비슷한 문제 재풀이가 효과적입니다.`,
          ctaLabel: "오답노트",
          ctaUrl: "/study/wrong-note",
          metric: `-${Math.round(delta)}%p`,
        });
      }
    }

    // 풀이 회수 격차
    if (
      b.problemAttempts.user !== null &&
      b.problemAttempts.passerMean !== null &&
      b.problemAttempts.passerMean > 0
    ) {
      const ratio = b.problemAttempts.user / b.problemAttempts.passerMean;
      const delta = Math.round(
        b.problemAttempts.passerMean - b.problemAttempts.user,
      );
      if (ratio < 0.7 && delta > 200) {
        actions.push({
          id: "problem-attempts-gap",
          priority: "medium",
          icon: "spark",
          title: "문제 풀이량 늘리기",
          body: `합격자 평균 ${Math.round(b.problemAttempts.passerMean).toLocaleString("ko-KR")}회, 본인 ${Math.round(b.problemAttempts.user).toLocaleString("ko-KR")}회. 맞춤 퀴즈 모드로 풀이 회수를 빠르게 누적해 보세요.`,
          ctaLabel: "맞춤 퀴즈",
          ctaUrl: "/subjects/patent/quiz/setup",
          metric: `-${delta.toLocaleString("ko-KR")}회`,
        });
      }
    }

    // 모든 지표 합격자 이상 — celebrate
    const aheadAll =
      (b.studyHours.user ?? 0) >= (b.studyHours.passerMean ?? 0) &&
      (b.accuracyPct.user ?? 0) >= (b.accuracyPct.passerMean ?? 0) &&
      (b.problemAttempts.user ?? 0) >= (b.problemAttempts.passerMean ?? 0);
    if (aheadAll && b.sampleSize >= 3) {
      actions.push({
        id: "celebrate-ahead",
        priority: "celebrate",
        icon: "trophy",
        title: "✨ 합격자 평균 모든 지표 상회",
        body: "현재 속도를 유지하시면 충분합니다. 시험 직전엔 새 자료보다 익숙한 자료를 반복하세요.",
        ctaLabel: "합격자 후기 보기",
        ctaUrl: "/study/passer-summaries",
      });
    }
  }

  // ─── 2.5) 비합격자 패턴 경고 (high) — 본인 metric 이 비합격자 평균 이하 ───
  if (input.failerBaseline && input.failerBaseline.sampleSize >= 3) {
    const fb = input.failerBaseline;
    const b = input.benchmark;
    const dangerSignals: string[] = [];

    if (
      b?.problemAttempts.user !== null &&
      b?.problemAttempts.user !== undefined &&
      fb.problemAttemptsMean !== null &&
      b.problemAttempts.user < fb.problemAttemptsMean
    ) {
      dangerSignals.push(
        `풀이 회수 ${Math.round(b.problemAttempts.user).toLocaleString("ko-KR")}회 < 비합격 평균 ${Math.round(fb.problemAttemptsMean).toLocaleString("ko-KR")}회`,
      );
    }
    if (
      b?.accuracyPct.user !== null &&
      b?.accuracyPct.user !== undefined &&
      fb.accuracyPctMean !== null &&
      b.accuracyPct.user < fb.accuracyPctMean
    ) {
      dangerSignals.push(
        `정답률 ${Math.round(b.accuracyPct.user)}% < 비합격 평균 ${Math.round(fb.accuracyPctMean)}%`,
      );
    }
    if (
      b?.studyHours.user !== null &&
      b?.studyHours.user !== undefined &&
      fb.studyHoursMean !== null &&
      b.studyHours.user < fb.studyHoursMean
    ) {
      dangerSignals.push(
        `학습 시간 ${Math.round(b.studyHours.user)}h < 비합격 평균 ${Math.round(fb.studyHoursMean)}h`,
      );
    }
    // 2개 이상 위험 신호 시 high priority 경고
    if (dangerSignals.length >= 2) {
      actions.push({
        id: "failure-pattern-warning",
        priority: "high",
        icon: "alert",
        title: "⚠️ 비합격자 패턴 위험 신호",
        body: `현재 학습 지표가 비합격자 평균(${fb.sampleSize}명)에도 못 미칩니다: ${dangerSignals.join(", ")}. 학습량/풀이 우선 늘리기 권장.`,
        ctaLabel: "학습 목표 재설정",
        ctaUrl: "/goals",
      });
    } else if (dangerSignals.length === 1) {
      actions.push({
        id: "failure-pattern-mild",
        priority: "medium",
        icon: "alert",
        title: "한 지표에서 비합격자 평균에 근접",
        body: `${dangerSignals[0]}. 다른 지표는 양호하지만 이 항목을 끌어올리면 안정권 진입.`,
        ctaLabel: "전체 통계 보기",
        ctaUrl: "/study/stats",
      });
    }
  }

  // ─── 3) 약점 단원 (medium) — 합격자 평균 정보 결합 ───
  for (const node of input.weakNodes.slice(0, 2)) {
    const lawAvg = input.passerLawAverages[node.lawCode];
    const hint = lawAvg
      ? `합격자는 이 과목에서 평균 ${lawAvg.avgAttempts}회 풀이${lawAvg.avgAccuracyPct !== null ? ` · 정답률 ${lawAvg.avgAccuracyPct}%` : ""}. `
      : "";
    actions.push({
      id: `weak-node-${node.nodeId}`,
      priority: "medium",
      icon: "alert",
      title: `약점 단원: ${node.displayLabel}`,
      body: `${hint}본인 정답률 ${node.accuracyPct}% (${node.problemAttempts}회 풀이). 이 단원만 모은 모드로 집중 학습해 보세요.`,
      ctaLabel: "단원 학습",
      ctaUrl: `/subjects/${node.lawCode}/systematic/${node.nodeId}`,
      metric: `${node.accuracyPct}%`,
    });
  }

  // ─── 4) 슬럼프 — 최근 활동 적고 streak 끊김 ───
  if (
    input.dailyStats.currentStreak === 0 &&
    input.dailyStats.totalActiveDays > 5
  ) {
    actions.push({
      id: "slump-recovery",
      priority: "medium",
      icon: "flame",
      title: "오늘부터 작은 시작",
      body: "최근 학습 streak 가 끊겼습니다. 합격자도 슬럼프 후 회복하는 패턴이 흔합니다. 오늘은 10문제만 풀어 보세요.",
      ctaLabel: "빠른 퀴즈 시작",
      ctaUrl: "/subjects/patent/quiz/setup",
    });
  } else if (
    input.dailyStats.currentStreak >= 14 &&
    input.dailyStats.avgHoursPerActiveDay >= 2
  ) {
    actions.push({
      id: "streak-good",
      priority: "celebrate",
      icon: "flame",
      title: `🔥 ${input.dailyStats.currentStreak}일 연속 학습 중`,
      body: "꾸준함이 합격의 기본기. 속도를 무너뜨리지 마시고 계속 가세요.",
      ctaLabel: "오늘 학습 시작",
      ctaUrl: "/dashboard",
    });
  }

  // ─── 5) 합격 진단 점수 낮음 ───
  if (input.passPrediction.score < 40) {
    actions.push({
      id: "predict-low",
      priority: "high",
      icon: "alert",
      title: "합격 진단 '취약' 단계",
      body: `현재 진단 점수 ${input.passPrediction.score}점. ${input.passPrediction.hint}`,
      ctaLabel: "통계 자세히 보기",
      ctaUrl: "/study/stats",
      metric: `${input.passPrediction.score}점`,
    });
  }

  // ─── 6) 차기 응시 계획 미설정 ───
  if (!input.hasExamPlan) {
    actions.push({
      id: "plan-missing",
      priority: "low",
      icon: "calendar",
      title: "차기 응시 계획 설정",
      body: "다음 응시 연도/차수를 설정하시면 합격자 비교 카드가 정확한 표본으로 활성화됩니다.",
      ctaLabel: "설정하러 가기",
      ctaUrl: "/me/exam-results",
    });
  }

  // ─── 7) 합격자 표본 없음 — 안내 ───
  if (!input.benchmark) {
    actions.push({
      id: "no-benchmark",
      priority: "low",
      icon: "spark",
      title: "합격자 데이터 모이는 중",
      body: "분석 동의 합격자가 모이면 자동으로 비교 컨설팅이 활성화됩니다. 본인도 합격 후 결과를 입력해 후배에게 도움이 되어주세요.",
      ctaLabel: "합격자 후기 보기",
      ctaUrl: "/study/passer-summaries",
    });
  }

  // ─── 정렬 & 상한 ───
  actions.sort((a, b) => {
    const pri = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pri !== 0) return pri;
    return 0;
  });
  return actions.slice(0, 5);
}
