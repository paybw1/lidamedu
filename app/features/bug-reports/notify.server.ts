// 오류 신고 신규 접수 → staff 인앱 알림 fanout.
// best-effort: 실패해도 신고 접수 자체는 정상 처리(호출부에서 runAfterResponse 로 감쌈).
// supa-admin 사용 — 다른 사용자(staff)·신고자 프로필을 RLS 우회로 조회.

import adminClient from "~/core/lib/supa-admin-client.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

const MAX_BODY = 200;

interface NewBugReportPayload {
  reportId: string;
  url: string;
  message: string;
  reporterId: string;
}

/** 모든 instructor + manager + admin 에게 (신고자 본인 제외) 인앱 알림. */
export async function notifyStaffNewBugReport(
  payload: NewBugReportPayload,
): Promise<void> {
  // staff 수신자 — 신고자 본인 제외.
  const { data: staff, error } = await adminClient
    .from("profiles")
    .select("profile_id")
    .in("role", ["instructor", "manager", "admin"]);
  if (error || !staff) return;
  const recipientIds = staff
    .map((s) => s.profile_id)
    .filter((id) => id !== payload.reporterId);
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
