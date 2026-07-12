import { describe, expect, it } from "vitest";

import type { WeakNodeItem } from "~/features/subjects/lib/weak-nodes.server";
import type { TodaySummary } from "~/features/study/today-summary.server";

import { buildNextActions } from "./next-actions";

const NOW = Date.parse("2026-07-12T00:00:00+09:00");

function today(over: Partial<TodaySummary> = {}): TodaySummary {
  return {
    date: "2026-07-12",
    review: {
      problemDue: 0,
      flashcardDue: 0,
      flashcardNew: 0,
      totalToday: 0,
      maxPerDay: 40,
      hasBacklog: false,
    },
    recommendations: [],
    assignments: {
      isCohortMember: false,
      pendingCount: 0,
      dueSoonCount: 0,
      topPending: [],
    },
    progress: { completed: 0, total: 0 },
    hasStudiedBefore: true,
    isEmptyForNewUser: false,
    cardBacklog: [],
    ...over,
  };
}

function weak(n = 1): WeakNodeItem[] {
  return Array.from({ length: n }, (_, i) => ({
    lawCode: "patent" as const,
    nodeId: `node-${i}`,
    displayLabel: `특허 §29 진보성 ${i}`,
    articleCount: 3,
    problemAttempts: 20,
    problemCorrect: 8,
    accuracyPct: 40,
    weaknessScore: 10,
  }));
}

const dueInDays = (d: number) =>
  new Date(NOW + d * 86_400_000).toISOString();

describe("buildNextActions 우선순위", () => {
  it("과제 마감(D-2) > 복습 > 약점 순으로 정렬", () => {
    const res = buildNextActions({
      today: today({
        review: {
          problemDue: 12,
          flashcardDue: 0,
          flashcardNew: 0,
          totalToday: 12,
          maxPerDay: 40,
          hasBacklog: false,
        },
        assignments: {
          isCohortMember: true,
          pendingCount: 1,
          dueSoonCount: 1,
          topPending: [
            {
              assignmentId: "a1",
              title: "진보성 과제",
              dueAt: dueInDays(2),
              completedItems: 3,
              totalItems: 10,
            },
          ],
        },
      }),
      weakNodes: weak(),
      nowMs: NOW,
    });
    expect(res.map((a) => a.key)).toEqual(["assignment", "review", "weak"]);
    expect(res[0].cta).toMatchObject({ kind: "link", href: "/assignments/a1" });
  });

  it("마감 지난 과제는 최상단(score 최고)", () => {
    const res = buildNextActions({
      today: today({
        assignments: {
          isCohortMember: true,
          pendingCount: 1,
          dueSoonCount: 1,
          topPending: [
            {
              assignmentId: "a1",
              title: "지난 과제",
              dueAt: dueInDays(-1),
              completedItems: 0,
              totalItems: 5,
            },
          ],
        },
      }),
      weakNodes: [],
      nowMs: NOW,
    });
    expect(res[0].key).toBe("assignment");
    expect(res[0].title).toContain("마감 지남");
  });

  it("밀린 복습은 약점보다 앞선다", () => {
    const res = buildNextActions({
      today: today({
        review: {
          problemDue: 30,
          flashcardDue: 10,
          flashcardNew: 0,
          totalToday: 40,
          maxPerDay: 40,
          hasBacklog: true,
        },
      }),
      weakNodes: weak(),
      nowMs: NOW,
    });
    expect(res.map((a) => a.key)).toEqual(["review", "weak"]);
    expect(res[0].title).toContain("밀림");
  });

  it("약점 행동은 POST(session-from-weakness) CTA", () => {
    const res = buildNextActions({
      today: today(),
      weakNodes: weak(),
      nowMs: NOW,
    });
    expect(res[0].key).toBe("weak");
    expect(res[0].cta).toMatchObject({
      kind: "post",
      action: "/api/study/session-from-weakness",
    });
  });

  it("신호가 전혀 없으면 기본 행동 1개 보장", () => {
    const res = buildNextActions({ today: today(), weakNodes: [], nowMs: NOW });
    expect(res).toHaveLength(1);
    expect(res[0].key).toBe("default");
  });

  it("최대 3개까지만", () => {
    const res = buildNextActions({
      today: today({
        review: {
          problemDue: 5,
          flashcardDue: 0,
          flashcardNew: 0,
          totalToday: 5,
          maxPerDay: 40,
          hasBacklog: false,
        },
        recommendations: [
          {
            kind: "weak_problem",
            title: "추천 문제",
            body: "본문",
            ctaLabel: "풀기",
            ctaUrl: "/x",
            estimatedMinutes: 10,
            priority: "medium",
            metadata: {},
          },
        ],
        assignments: {
          isCohortMember: true,
          pendingCount: 1,
          dueSoonCount: 1,
          topPending: [
            {
              assignmentId: "a1",
              title: "과제",
              dueAt: dueInDays(1),
              completedItems: 0,
              totalItems: 3,
            },
          ],
        },
      }),
      weakNodes: weak(),
      nowMs: NOW,
    });
    expect(res).toHaveLength(3);
    expect(res.map((a) => a.key)).toEqual(["assignment", "review", "weak"]);
  });
});
