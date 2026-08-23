// 공지 발행 → 알림 인박스 팬아웃 (2026-08-23).
//
// 종전에는 공지를 발행해도 알림이 생기지 않아, 학생이 커뮤니티 > 공지사항에 **직접**
// 들어가야만 볼 수 있었다(원장 확인: 발행 후 알림 큐 0건). 발행 시점에 대상자
// user_notifications 를 만들어 종 배지·인박스에 뜨게 한다.
//
// ★멱등 — 같은 공지로는 한 번만 보낸다. 언발행→재발행을 반복해도 중복 발송되지 않는다
//   (entity_id = announcement_id 로 기존 알림 존재 여부를 먼저 본다).

import adminClient from "~/core/lib/supa-admin-client.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

import type { AnnouncementAudienceKind, AnnouncementPlatformScope } from "./labels";

/** 한 번에 넣는 알림 row 수 — 대상이 커져도 insert 가 터지지 않게 나눈다. */
const FANOUT_CHUNK = 500;
/** 본문 미리보기 길이(알림 카드 한 줄). */
const PREVIEW_LEN = 120;

const STAFF_ROLES = ["instructor", "manager", "admin"] as const;

/** 공지 대상 → 수신자 profile_id 목록. */
async function resolveRecipients(
  announcementId: string,
  audienceKind: AnnouncementAudienceKind,
): Promise<string[]> {
  if (audienceKind === "all") {
    const { data } = await adminClient
      .from("profiles")
      .select("profile_id")
      .limit(20000);
    return (data ?? []).map((r) => r.profile_id);
  }
  if (audienceKind === "staff") {
    const { data } = await adminClient
      .from("profiles")
      .select("profile_id")
      .in("role", STAFF_ROLES)
      .limit(20000);
    return (data ?? []).map((r) => r.profile_id);
  }

  const { data: aud } = await adminClient
    .from("announcement_audiences")
    .select("audience_type, audience_id")
    .eq("announcement_id", announcementId);
  const ids = (aud ?? []).map((a) => a.audience_id);
  if (ids.length === 0) return [];

  if (audienceKind === "user") return ids;

  // cohort — 지정된 반의 현재 구성원.
  const { data: members } = await adminClient
    .from("cohort_members")
    .select("profile_id")
    .in("cohort_id", ids);
  return [...new Set((members ?? []).map((m) => m.profile_id))];
}

/** 공지가 실제로 보이는 화면 — 알림을 눌렀을 때 빈 목록으로 떨어지지 않게 한다. */
function hrefFor(scope: AnnouncementPlatformScope): string {
  return scope === "lecture" ? "/lecture/announcements" : "/announcements";
}

function preview(bodyHtml: string | null, bodyMd: string): string {
  const raw = bodyHtml ? bodyHtml.replace(/<[^>]*>/g, " ") : bodyMd;
  const text = raw.replace(/\s+/g, " ").trim();
  return text.length > PREVIEW_LEN ? `${text.slice(0, PREVIEW_LEN)}…` : text;
}

/**
 * 발행된 공지를 대상자 인박스에 넣는다. best-effort — 실패해도 발행 자체는 유효하다.
 * 호출부는 `runAfterResponse()` 로 감쌀 것(서버리스는 응답 후 함수가 종료된다).
 */
export async function notifyAnnouncementPublished(
  announcementId: string,
): Promise<void> {
  const { data: ann } = await adminClient
    .from("announcements")
    .select("title, body_md, body_html, audience_kind, platform_scope, published_at, deleted_at")
    .eq("announcement_id", announcementId)
    .maybeSingle();
  if (!ann || ann.deleted_at !== null || ann.published_at === null) return;

  // 멱등 — 이 공지로 이미 보냈으면 끝.
  const { count } = await adminClient
    .from("user_notifications")
    .select("*", { count: "exact", head: true })
    .eq("kind", "announcement")
    .eq("entity_type", "announcement")
    .eq("entity_id", announcementId);
  if ((count ?? 0) > 0) return;

  const recipientIds = await resolveRecipients(announcementId, ann.audience_kind);
  if (recipientIds.length === 0) return;

  const href = hrefFor(ann.platform_scope);
  const body = preview(ann.body_html, ann.body_md);
  for (let i = 0; i < recipientIds.length; i += FANOUT_CHUNK) {
    await createUserNotifications({
      recipientIds: recipientIds.slice(i, i + FANOUT_CHUNK),
      kind: "announcement",
      entityType: "announcement",
      entityId: announcementId,
      title: ann.title,
      body: body || undefined,
      href,
    });
  }
}
