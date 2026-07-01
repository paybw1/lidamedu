// 클라이언트·서버 공용 타입.

import type { UserRole } from "~/core/lib/roles";

// feat-8-027 — 종합반 종류별 열람 범위. full=전체, self_study=자기학습 수준으로 제한.
export type CohortAccessScope = "full" | "self_study";

export const COHORT_ACCESS_SCOPE_LABEL: Record<CohortAccessScope, string> = {
  full: "전체 열람",
  self_study: "자기학습 범위",
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
