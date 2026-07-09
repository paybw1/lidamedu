// feat-6-011 고객센터 문의 알림 — 접수 시 담당자, 답변 시 작성자. best-effort(runAfterResponse).
import adminClient from "~/core/lib/supa-admin-client.server";
import { getDutyRecipientIds } from "~/features/admin/lib/duties.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

import { CS_CATEGORY_LABEL, type CsCategory } from "./labels";

const MAX = 160;
const clip = (s: string) => (s.length > MAX ? s.slice(0, MAX) + "…" : s);

/** 신규 문의 → 담당자(cs_inquiry duty, 0명이면 manager/admin) 인박스 알림. 작성자 제외. */
export async function notifyStaffNewInquiry(payload: {
  inquiryId: string;
  displayNo: number;
  category: CsCategory;
  title: string;
  authorId: string;
}): Promise<void> {
  const recipientIds = (await getDutyRecipientIds("cs_inquiry")).filter(
    (id) => id !== payload.authorId,
  );
  if (recipientIds.length === 0) return;
  await createUserNotifications({
    recipientIds,
    kind: "cs_inquiry_created",
    entityType: "cs_inquiry",
    entityId: payload.inquiryId,
    title: `고객센터 문의 #${payload.displayNo} · ${CS_CATEGORY_LABEL[payload.category]}`,
    body: clip(payload.title),
    href: "/admin/cs-inquiries",
    payload: { displayNo: payload.displayNo, category: payload.category },
  });
}

/** staff 답변 → 문의 작성자 인박스 알림. */
export async function notifyAuthorAnswered(payload: {
  inquiryId: string;
  displayNo: number;
  title: string;
  authorId: string | null;
  answerExcerpt: string;
}): Promise<void> {
  if (!payload.authorId) return;
  await createUserNotifications({
    recipientIds: [payload.authorId],
    kind: "cs_inquiry_answered",
    entityType: "cs_inquiry",
    entityId: payload.inquiryId,
    title: `문의 #${payload.displayNo} 에 답변이 등록되었습니다`,
    body: clip(payload.answerExcerpt || payload.title),
    href: `/lecture/support/${payload.inquiryId}`,
    payload: { displayNo: payload.displayNo },
  });
}

// authorId 조회 헬퍼 없이도 staff 답변 액션에서 문의 author 를 알 수 있도록(adminClient 로 안전 조회).
export async function getInquiryAuthorId(
  inquiryId: string,
): Promise<string | null> {
  const { data } = await adminClient
    .from("cs_inquiries")
    .select("author_id")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();
  return data?.author_id ?? null;
}
