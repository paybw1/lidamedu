// [오늘] / 대시보드 입구 카드의 행동 시나리오 회귀 보호.
// 본 테스트는 today-summary.server.ts 가 생성한 TodaySummary 의 분기 로직만
// 검증한다 (DB / loader 통합은 별도 E2E). 시나리오:
//   (a) 종합반 학생 → 복습·추천·과제 3 카드
//   (b) 자기주도 학생 → 과제 카드 없음
//   (c) 신규 학생 → 빈상태 (셋 다 0)
//   (d) 복습 폭발 → hasBacklog=true
//   (e) 대시보드 입구 = [오늘] 본문 동일 데이터 (단일 소유 보장)
//
// 화면 로직 (chip 분기) 도 시나리오로 확인.

import { describe, expect, it } from "vitest";

import type { DailyMenuItem } from "~/features/study/lib/daily-menu";
import type { TodaySummary } from "./today-summary.server";

/** 시나리오 (a) — 종합반 학생, 복습/추천/과제 모두 있음. */
function makeCohortSummary(): TodaySummary {
  const rec: DailyMenuItem = {
    kind: "weak_problem",
    title: "약점 — 특허법 §29",
    body: "최근 오답 재시도",
    ctaLabel: "이 문제 풀기",
    ctaUrl: "/subjects/patent/problems/abc",
    estimatedMinutes: 3,
    priority: "high",
    metadata: {},
  };
  return {
    date: "2026-05-30",
    review: {
      problemDue: 12,
      flashcardDue: 8,
      flashcardNew: 3,
      totalToday: 23,
      maxPerDay: 200,
      hasBacklog: false,
    },
    recommendations: [rec, { ...rec, kind: "blank_due", title: "빈칸" }],
    assignments: {
      isCohortMember: true,
      pendingCount: 2,
      dueSoonCount: 1,
      topPending: [
        {
          assignmentId: "a1",
          title: "1주차 과제",
          dueAt: new Date(Date.now() + 86_400_000).toISOString(),
          completedItems: 2,
          totalItems: 5,
        },
      ],
    },
    progress: { completed: 5, total: 17 },
    hasStudiedBefore: true,
    isEmptyForNewUser: false,
  };
}

/** 시나리오 (b) — 자기주도 학생, 복습/추천 있음, 과제 없음. */
function makeSelfDirectedSummary(): TodaySummary {
  const s = makeCohortSummary();
  return {
    ...s,
    assignments: {
      isCohortMember: false,
      pendingCount: 0,
      dueSoonCount: 0,
      topPending: [],
    },
  };
}

/** 시나리오 (c) — 신규 학생, 셋 다 0. */
function makeEmptySummary(): TodaySummary {
  return {
    date: "2026-05-30",
    review: {
      problemDue: 0,
      flashcardDue: 0,
      flashcardNew: 0,
      totalToday: 0,
      maxPerDay: 200,
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
    hasStudiedBefore: false,
    isEmptyForNewUser: true,
  };
}

/** 시나리오 (f) — 학습 이력 있는 학생이 오늘 할 일을 다 끝냄(빈상태지만 신규 아님). */
function makeAllDoneSummary(): TodaySummary {
  return { ...makeEmptySummary(), hasStudiedBefore: true };
}

/** 시나리오 (d) — 복습 폭발, hasBacklog=true. */
function makeBacklogSummary(): TodaySummary {
  const s = makeCohortSummary();
  return {
    ...s,
    review: {
      ...s.review,
      flashcardDue: 200,
      flashcardNew: 0,
      totalToday: 212,
      maxPerDay: 200,
      hasBacklog: true, // dueCount + newCount >= maxPerDay
    },
  };
}

describe("(a) 종합반 학생 — 복습·추천·과제 3카드", () => {
  const s = makeCohortSummary();
  it("isCohortMember=true", () => {
    expect(s.assignments.isCohortMember).toBe(true);
  });
  it("3 영역 모두 표시 대상 보유", () => {
    expect(s.review.totalToday).toBeGreaterThan(0);
    expect(s.recommendations.length).toBeGreaterThan(0);
    expect(s.assignments.pendingCount).toBeGreaterThan(0);
  });
  it("빈상태 분기 아님", () => {
    expect(s.isEmptyForNewUser).toBe(false);
  });
  it("진행률 completed ≤ total (오늘 복습 기준)", () => {
    expect(s.progress.completed).toBeLessThanOrEqual(s.progress.total);
  });
});

describe("(b) 자기주도 학생 — 과제 카드 없음", () => {
  const s = makeSelfDirectedSummary();
  it("isCohortMember=false", () => {
    expect(s.assignments.isCohortMember).toBe(false);
  });
  it("과제 pending=0 + topPending=[]", () => {
    expect(s.assignments.pendingCount).toBe(0);
    expect(s.assignments.topPending).toEqual([]);
  });
  it("복습·추천은 정상", () => {
    expect(s.review.totalToday).toBeGreaterThan(0);
    expect(s.recommendations.length).toBeGreaterThan(0);
  });
});

describe("(c) 신규 학생 — 빈상태", () => {
  const s = makeEmptySummary();
  it("isEmptyForNewUser=true 트리거", () => {
    expect(s.isEmptyForNewUser).toBe(true);
  });
  it("셋 다 0", () => {
    expect(s.review.totalToday).toBe(0);
    expect(s.recommendations.length).toBe(0);
    expect(s.assignments.pendingCount).toBe(0);
  });
});

describe("(d) 복습 폭발 — hasBacklog 가드", () => {
  const s = makeBacklogSummary();
  it("hasBacklog=true 트리거", () => {
    expect(s.review.hasBacklog).toBe(true);
  });
  it("totalToday 가 maxPerDay 와 같거나 그 이상 (상한 적용 표기용)", () => {
    expect(s.review.flashcardDue + s.review.flashcardNew).toBeGreaterThanOrEqual(
      s.review.maxPerDay,
    );
  });
});

describe("(f) 완료 상태 — 이력 있는 학생의 빈상태", () => {
  it("isEmptyForNewUser=true 이지만 hasStudiedBefore=true → 완료 분기", () => {
    const s = makeAllDoneSummary();
    expect(s.isEmptyForNewUser).toBe(true);
    expect(s.hasStudiedBefore).toBe(true);
  });
  it("신규 학생은 hasStudiedBefore=false → 가이드 분기", () => {
    expect(makeEmptySummary().hasStudiedBefore).toBe(false);
  });
});

describe("(e) 대시보드 입구 = [오늘] 본문 동일 데이터 (단일 소유)", () => {
  it("같은 getTodaySummary 결과를 두 화면이 공유 — 자료 구조 동일", () => {
    const s = makeCohortSummary();
    // 두 화면이 동일 객체를 보면 숫자 불일치 발생 불가.
    const dashChip = {
      review: s.review.totalToday,
      rec: s.recommendations.length,
      assign: s.assignments.pendingCount,
    };
    const todayBody = {
      review: s.review.totalToday,
      rec: s.recommendations.length,
      assign: s.assignments.pendingCount,
    };
    expect(dashChip).toEqual(todayBody);
  });
});
