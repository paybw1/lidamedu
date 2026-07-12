// 대시보드 "다음 행동" 카드 — 흩어져 있던 신호(복습 도래·과제 마감·약점 단원·추천)를
// 하나의 우선순위 목록으로 합쳐 "지금 뭘 먼저 할지 + 원클릭 시작"을 제시한다.
// 순수 함수 — 서버 호출 없음. 입력은 전부 대시보드 loaderData 에 이미 존재.
//
// 우선순위(점수): 마감 임박 과제 > 밀린 복습 > 일반 복습 > 약점 단원 > 추천 > 기본.
// 마감·밀림 같은 '시간 민감' 신호가 개선형(약점)보다 앞선다.

import type { WeakNodeItem } from "~/features/subjects/lib/weak-nodes.server";
import type { TodaySummary } from "~/features/study/today-summary.server";

export type NextActionTone = "urgent" | "review" | "improve" | "default";

export type NextActionCta =
  | { kind: "link"; label: string; href: string }
  | {
      kind: "post";
      label: string;
      action: string;
      fields?: Record<string, string>;
    };

export interface NextAction {
  key: string;
  score: number;
  tone: NextActionTone;
  title: string;
  subtitle: string;
  cta: NextActionCta;
}

const DAY_MS = 86_400_000;

export function buildNextActions(input: {
  today: TodaySummary;
  weakNodes: WeakNodeItem[];
  nowMs?: number;
}): NextAction[] {
  const { today, weakNodes } = input;
  const nowMs = input.nowMs ?? Date.now();
  const actions: NextAction[] = [];

  // ① 과제 마감 임박(종합반) — 가장 시간 민감.
  const a = today.assignments;
  if (a.isCohortMember && a.topPending.length > 0) {
    const top = a.topPending[0];
    const dDays = Math.ceil((new Date(top.dueAt).getTime() - nowMs) / DAY_MS);
    const overdue = dDays < 0;
    const score = overdue
      ? 110
      : dDays === 0
        ? 100
        : dDays <= 1
          ? 92
          : dDays <= 3
            ? 74
            : 58;
    const title = overdue
      ? `과제 마감 지남 · D+${-dDays}`
      : dDays === 0
        ? "과제 오늘 마감"
        : `과제 마감 D-${dDays}`;
    actions.push({
      key: "assignment",
      score,
      tone: "urgent",
      title,
      subtitle: `${top.title} · ${top.completedItems}/${top.totalItems} 완료`,
      cta: { kind: "link", label: "과제 풀기", href: `/assignments/${top.assignmentId}` },
    });
  }

  // ② 복습 도래(SRS) — 밀려 있으면 우선순위 상승(간격 반복은 미루면 손해).
  const r = today.review;
  if (r.totalToday > 0) {
    const backlog = r.hasBacklog || today.cardBacklog.length > 0;
    const detail = [
      r.problemDue > 0 ? `문제 ${r.problemDue}` : null,
      r.flashcardDue > 0 ? `카드 ${r.flashcardDue}` : null,
      r.flashcardNew > 0 ? `신규 ${r.flashcardNew}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    actions.push({
      key: "review",
      score: backlog ? 82 : 52,
      tone: "review",
      title: `복습 ${r.totalToday}개 도래${backlog ? " · 밀림" : ""}`,
      subtitle: detail || "오늘 복습을 시작하세요",
      cta: { kind: "link", label: "복습 시작", href: "/study/srs" },
    });
  }

  // ③ 약점 단원 — 개선형. 원클릭으로 20문항 세션 생성(session-from-weakness).
  if (weakNodes.length > 0) {
    const w = weakNodes[0];
    actions.push({
      key: "weak",
      score: 40,
      tone: "improve",
      title: "약점 단원 20문항 정복",
      subtitle: `${w.displayLabel} · 정답률 ${Math.round(w.accuracyPct)}%`,
      cta: {
        kind: "post",
        label: "약점 풀기",
        action: "/api/study/session-from-weakness",
        fields: { n: "20", mode: "study" },
      },
    });
  }

  // ④ 추천(오늘의 메뉴 최상단) — 채우기용.
  const rec = today.recommendations[0];
  if (rec) {
    actions.push({
      key: `rec-${rec.kind}`,
      score: 30,
      tone: "default",
      title: rec.title,
      subtitle: rec.body,
      cta: { kind: "link", label: rec.ctaLabel || "시작", href: rec.ctaUrl || "/study/today" },
    });
  }

  actions.sort((x, y) => y.score - x.score);
  const top3 = actions.slice(0, 3);

  // 항상 최소 1개 — 아무 신호도 없으면 기본 진입(빈상태는 카드 자체를 숨기므로 여기 도달 드묾).
  if (top3.length === 0) {
    top3.push({
      key: "default",
      score: 10,
      tone: "default",
      title: "오늘 학습 시작",
      subtitle: "복습·추천이 아직 없어요. 새 학습을 시작해 보세요.",
      cta: { kind: "link", label: "학습 시작", href: "/study/today" },
    });
  }
  return top3;
}
