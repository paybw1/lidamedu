// 클라이언트·서버 공용 타입.

export interface CohortListItem {
  cohortId: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  isArchived: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CohortMember {
  profileId: string;
  name: string;
  role: "student" | "instructor" | "admin";
  email: string | null;
  joinedAt: string;
}
