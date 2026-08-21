// 클라이언트·서버 공용 타입.

import type { UserRole } from "~/core/lib/roles";

// feat-8-027 — 종합반 종류별 열람 범위. full=전체, self_study=자기학습 수준으로 제한.
export type CohortAccessScope = "full" | "self_study";

export const COHORT_ACCESS_SCOPE_LABEL: Record<CohortAccessScope, string> = {
  full: "전체 열람",
  self_study: "자기학습 범위",
};

// feat-7-048 — 반의 대상 차수. 계획·상담 화면의 법과목 목록이 여기서 파생된다
// (1차는 민사소송법 숨김). 값 이름은 개인 차수 profiles.next_exam_round 와 맞춘다.
export type CohortExamRound = "first" | "second";

export const COHORT_EXAM_ROUND_LABEL: Record<CohortExamRound, string> = {
  first: "1차 종합반",
  second: "2차 종합반",
};

export interface CohortListItem {
  cohortId: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  isArchived: boolean;
  accessScope: CohortAccessScope;
  examRound: CohortExamRound;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CohortMember {
  profileId: string;
  name: string;
  role: UserRole;
  email: string | null;
  joinedAt: string;
}
