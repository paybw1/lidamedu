// 공지사항 (feat-7-011) 클라이언트·서버 공용 타입.

export type AnnouncementAudienceKind = "all" | "cohort" | "user";

export interface AnnouncementListItem {
  announcementId: string;
  title: string;
  bodyMd: string;
  authorId: string;
  authorName: string | null;
  audienceKind: AnnouncementAudienceKind;
  isPinned: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  audienceCount: number;
  readCount: number;
  isUnread?: boolean;
}

export interface AnnouncementAudienceRow {
  audienceType: "cohort" | "user";
  audienceId: string;
  label: string;
}

export interface AnnouncementDetail extends AnnouncementListItem {
  audiences: AnnouncementAudienceRow[];
}
