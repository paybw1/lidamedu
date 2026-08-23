// 공지사항 (feat-7-011) 클라이언트·서버 공용 타입.

export type AnnouncementAudienceKind = "all" | "cohort" | "user";

/**
 * 공지를 어느 제품 플랫폼에 띄울지 — 학습 / 강의 / 둘 다.
 * ★표시 필터일 뿐 보안 경계가 아니다(누구에게 가는지는 audience_kind 가 권위).
 */
export type AnnouncementPlatformScope = "study" | "lecture" | "both";

/** 운영 폼·배지가 공유하는 단일 소스. */
export const ANNOUNCEMENT_PLATFORM_SCOPES: ReadonlyArray<{
  value: AnnouncementPlatformScope;
  label: string;
  hint: string;
}> = [
  { value: "study", label: "학습 플랫폼", hint: "조문·판례·문제 등 학습 화면에서만" },
  { value: "lecture", label: "강의 플랫폼", hint: "수강신청·도서 등 강의 화면에서만" },
  { value: "both", label: "둘 다", hint: "두 플랫폼 모두에 노출" },
];

export function announcementPlatformLabel(
  scope: AnnouncementPlatformScope,
): string {
  return (
    ANNOUNCEMENT_PLATFORM_SCOPES.find((s) => s.value === scope)?.label ?? scope
  );
}

/** 그 플랫폼 수신함이 보여줄 scope 목록 — 'both' 는 양쪽 모두에 낀다. */
export function scopesVisibleOn(
  platform: "study" | "lecture",
): AnnouncementPlatformScope[] {
  return [platform, "both"];
}

export interface AnnouncementListItem {
  announcementId: string;
  title: string;
  bodyMd: string;
  bodyHtml: string | null;
  authorId: string;
  authorName: string | null;
  audienceKind: AnnouncementAudienceKind;
  platformScope: AnnouncementPlatformScope;
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
