// 세그먼트 대량 메시징(broadcast) — 운영자가 특정 대상군에 인앱+이메일 안내 발송.
// 대상 = 기존 파생 세그먼트 재사용(체험 임박/팔로업·미승인·전체 학생). 카카오는 알림톡
// 템플릿 승인 종속이라 이 버전은 인앱+이메일만(카카오는 승인 후 후속).
// 접근·집계는 전부 adminClient(service_role) — 호출부(manager+ loader/action)에서 게이트.

import adminClient from "~/core/lib/supa-admin-client.server";
import resendClient from "~/core/lib/resend-client.server";
import { createUserNotifications } from "~/features/notifications/queries.server";
import { getTrialConversionOverview } from "~/features/admin/queries/trial-conversion.server";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@lidamedu.com";
const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO_EMAIL ?? "bwyim@lidamip.com";

export type BroadcastSegmentKey =
  | "trial_expiring"
  | "trial_followup"
  | "unapproved"
  | "all_students";

export type BroadcastChannel = "in_app" | "email";

export const BROADCAST_SEGMENTS: {
  key: BroadcastSegmentKey;
  label: string;
  desc: string;
}[] = [
  {
    key: "trial_expiring",
    label: "체험 만료 임박",
    desc: "무료 체험이 곧 끝나는 미전환 학생 (전환 유도)",
  },
  {
    key: "trial_followup",
    label: "체험 만료 미전환",
    desc: "최근 체험이 끝났으나 전환하지 않은 학생 (팔로업)",
  },
  {
    key: "unapproved",
    label: "이용 승인 대기",
    desc: "가입 후 이용 승인이 나지 않은 학생",
  },
  {
    key: "all_students",
    label: "전체 학생",
    desc: "모든 수험생 계정 (공지·안내)",
  },
];

function segmentLabel(key: BroadcastSegmentKey): string {
  return BROADCAST_SEGMENTS.find((s) => s.key === key)?.label ?? key;
}

// 세그먼트별 수신 profile_id 목록.
async function resolveSegmentIds(
  key: BroadcastSegmentKey,
): Promise<string[]> {
  if (key === "trial_expiring" || key === "trial_followup") {
    const ov = await getTrialConversionOverview();
    const rows = key === "trial_expiring" ? ov.expiringSoon : ov.followup;
    return rows.map((r) => r.profileId);
  }
  if (key === "unapproved") {
    const { data } = await adminClient
      .from("profiles")
      .select("profile_id")
      .eq("role", "student")
      .is("access_approved_at", null)
      .limit(5000);
    return (data ?? []).map((r) => r.profile_id);
  }
  // all_students
  const { data } = await adminClient
    .from("profiles")
    .select("profile_id")
    .eq("role", "student")
    .limit(20000);
  return (data ?? []).map((r) => r.profile_id);
}

// 컴포즈 UI 용 — 세그먼트별 대상 수.
export async function getSegmentCounts(): Promise<
  Record<BroadcastSegmentKey, number>
> {
  const [ov, unapproved, allStudents] = await Promise.all([
    getTrialConversionOverview(),
    adminClient
      .from("profiles")
      .select("profile_id", { count: "exact", head: true })
      .eq("role", "student")
      .is("access_approved_at", null),
    adminClient
      .from("profiles")
      .select("profile_id", { count: "exact", head: true })
      .eq("role", "student"),
  ]);
  return {
    trial_expiring: ov.expiringSoon.length,
    trial_followup: ov.followup.length,
    unapproved: unapproved.count ?? 0,
    all_students: allStudents.count ?? 0,
  };
}

export interface BroadcastRow {
  broadcastId: string;
  senderName: string | null;
  segmentKey: string;
  segmentLabel: string;
  title: string;
  channels: string[];
  recipientCount: number;
  emailSent: number;
  createdAt: string;
}

export async function listBroadcasts(limit = 30): Promise<BroadcastRow[]> {
  const { data, error } = await adminClient
    .from("broadcasts")
    .select(
      "broadcast_id, segment_key, segment_label, title, channels, recipient_count, email_sent, created_at, sender:profiles!broadcasts_sender_id_fkey(name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (
    (data ?? []) as unknown as Array<{
      broadcast_id: string;
      segment_key: string;
      segment_label: string;
      title: string;
      channels: string[] | null;
      recipient_count: number;
      email_sent: number;
      created_at: string;
      sender: { name: string | null } | null;
    }>
  ).map((r) => ({
    broadcastId: r.broadcast_id,
    senderName: r.sender?.name ?? null,
    segmentKey: r.segment_key,
    segmentLabel: r.segment_label,
    title: r.title,
    channels: r.channels ?? [],
    recipientCount: r.recipient_count,
    emailSent: r.email_sent,
    createdAt: r.created_at,
  }));
}

// 발송 — 로그 + 인앱 알림(동기). 이메일은 호출부가 runAfterResponse 로 감싼다.
export async function sendBroadcast(input: {
  senderId: string;
  segmentKey: BroadcastSegmentKey;
  title: string;
  bodyMd: string;
  channels: BroadcastChannel[];
}): Promise<
  | { ok: true; broadcastId: string; recipientIds: string[] }
  | { ok: false; error: string }
> {
  const title = input.title.trim();
  const body = input.bodyMd.trim();
  if (title.length < 2) return { ok: false, error: "제목을 입력해 주세요." };
  if (body.length < 2) return { ok: false, error: "내용을 입력해 주세요." };

  const recipientIds = await resolveSegmentIds(input.segmentKey);
  if (recipientIds.length === 0) {
    return { ok: false, error: "대상이 0명입니다." };
  }

  const { data: row, error } = await adminClient
    .from("broadcasts")
    .insert({
      sender_id: input.senderId,
      segment_key: input.segmentKey,
      segment_label: segmentLabel(input.segmentKey),
      title,
      body_md: body,
      channels: input.channels,
      recipient_count: recipientIds.length,
    })
    .select("broadcast_id")
    .single();
  if (error || !row) {
    return { ok: false, error: error?.message ?? "발송 기록 실패" };
  }

  // 인앱 알림 — 항상.
  await createUserNotifications({
    recipientIds,
    kind: "broadcast_message",
    entityType: "broadcast",
    entityId: row.broadcast_id,
    title,
    body,
    href: "/dashboard",
  });

  return { ok: true, broadcastId: row.broadcast_id, recipientIds };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// 이메일 fanout — 수신자 이메일 조회(notify_channels 에 email 있는 경우만) 후 발송.
// best-effort: 개별 실패는 건너뛰고 성공 수를 broadcasts.email_sent 에 기록.
export async function sendBroadcastEmails(
  broadcastId: string,
  recipientIds: string[],
  title: string,
  bodyMd: string,
): Promise<void> {
  const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
    <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h2>
    <div style="white-space:pre-wrap;line-height:1.6;font-size:14px">${escapeHtml(bodyMd)}</div>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="color:#888;font-size:12px;margin:0">리담변리사학원</p>
  </div>`;

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("profile_id, notify_channels")
    .in("profile_id", recipientIds);
  let sent = 0;
  for (const p of profiles ?? []) {
    const channels = (p.notify_channels ?? []) as string[];
    if (!channels.includes("email")) continue; // 이메일 수신 동의자만
    let email: string | null = null;
    try {
      const { data } = await adminClient.auth.admin.getUserById(p.profile_id);
      email = data?.user?.email ?? null;
    } catch {
      email = null;
    }
    if (!email) continue;
    try {
      const res = await resendClient.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO_EMAIL,
        to: email,
        subject: `[리담변리사학원] ${title}`,
        html,
      });
      if (!res.error) sent += 1;
    } catch {
      // best-effort — 개별 실패 무시.
    }
  }
  await adminClient
    .from("broadcasts")
    .update({ email_sent: sent })
    .eq("broadcast_id", broadcastId);
}
