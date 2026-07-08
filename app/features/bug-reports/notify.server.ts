// 오류 신고 신규 접수 → staff 인앱 알림 fanout.
// best-effort: 실패해도 신고 접수 자체는 정상 처리(호출부에서 runAfterResponse 로 감쌈).
// supa-admin 사용 — 다른 사용자(staff)·신고자 프로필을 RLS 우회로 조회.

import adminClient from "~/core/lib/supa-admin-client.server";
import { getDutyRecipientIds } from "~/features/admin/lib/duties.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

const MAX_BODY = 200;

interface NewBugReportPayload {
  reportId: string;
  url: string;
  message: string;
  reporterId: string;
}

/** 오류신고 담당자(관리자 관리 지정, 없으면 staff 전체)에게 — 신고자 본인 제외 — 인앱 알림. */
export async function notifyStaffNewBugReport(
  payload: NewBugReportPayload,
): Promise<void> {
  const recipientIds = (await getDutyRecipientIds("bug_report")).filter(
    (id) => id !== payload.reporterId,
  );
  if (recipientIds.length === 0) return;

  // 신고자 이름 (제목용, best-effort).
  const { data: reporter } = await adminClient
    .from("profiles")
    .select("name")
    .eq("profile_id", payload.reporterId)
    .maybeSingle();
  const reporterName = reporter?.name ?? "사용자";

  const body =
    payload.message.length > MAX_BODY
      ? payload.message.slice(0, MAX_BODY) + "…"
      : payload.message;

  await createUserNotifications({
    recipientIds,
    kind: "bug_report_created",
    entityType: "bug_report",
    entityId: payload.reportId,
    title: `${reporterName} 님의 오류 신고`,
    body,
    href: "/admin/bug-reports",
    payload: { url: payload.url, reporterName },
  });
}

/** 오류신고 완료 처리 → 신고자 인박스 알림. best-effort(runAfterResponse 로 감쌈). */
export async function notifyReporterBugResolved(payload: {
  reportId: string;
  reporterId: string;
  url: string;
  message: string;
}): Promise<void> {
  const body =
    payload.message.length > MAX_BODY
      ? payload.message.slice(0, MAX_BODY) + "…"
      : payload.message;
  // 신고 url 은 보통 절대 URL(window.location.href) — 앱 내 경로로 변환해
  // 신고했던 화면으로 돌아가 확인할 수 있게 한다.
  let href = "/me/inbox";
  try {
    const u = new URL(payload.url);
    href = u.pathname + u.search;
  } catch {
    if (payload.url.startsWith("/")) href = payload.url;
  }
  await createUserNotifications({
    recipientIds: [payload.reporterId],
    kind: "bug_report_resolved",
    entityType: "bug_report",
    entityId: payload.reportId,
    title: "신고하신 오류가 처리되었습니다",
    body: `신고 내용: ${body}`,
    href,
    payload: { url: payload.url },
  });
}
