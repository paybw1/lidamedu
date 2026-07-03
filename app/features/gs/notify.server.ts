// 동료 채점 배정 알림 — 한 학생에게 N건이 배정되면 묶어서 1통 발송.
// best-effort, fire-and-forget. supa-admin 사용 — 다른 사용자의 이메일/전화는 RLS 우회로만 조회 가능.

import { render } from "@react-email/render";

import adminClient from "~/core/lib/supa-admin-client.server";
import resendClient from "~/core/lib/resend-client.server";
import GsPeerAssignmentEmail from "../../../transactional-emails/emails/gs-peer-assignment";

import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@lidamedu.com";
const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO_EMAIL ?? "bwyim@lidamip.com";
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

interface NewAssignmentRow {
  reviewerUserId: string;
  assignmentId: string; // 이메일 안 링크는 일반 /gs 로 보내고, 클릭 후 학생이 채점 목록에서 선택.
  roundId: string;
}

interface RoundContext {
  roundId: string;
  title: string;
  subject: string;
  endAt: string;
}

// 운영자 배정 액션 호출 후 새로 생성된 배정에 대해 1회 알림.
// 같은 reviewer 가 여러 답안을 받았으면 묶어서 1통.
export async function notifyPeerAssignments(
  newAssignments: NewAssignmentRow[],
  rounds: RoundContext[],
): Promise<void> {
  if (newAssignments.length === 0) return;
  try {
    const byReviewer = new Map<string, NewAssignmentRow[]>();
    for (const a of newAssignments) {
      const list = byReviewer.get(a.reviewerUserId) ?? [];
      list.push(a);
      byReviewer.set(a.reviewerUserId, list);
    }

    const reviewerIds = [...byReviewer.keys()];
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("profile_id, name, notify_channels")
      .in("profile_id", reviewerIds);
    const profileById = new Map<
      string,
      {
        profileId: string;
        name: string | null;
        channels: ("email" | "kakao")[];
        email: string | null;
      }
    >();
    for (const p of profiles ?? []) {
      let email: string | null = null;
      try {
        const { data } = await adminClient.auth.admin.getUserById(
          p.profile_id,
        );
        email = data?.user?.email ?? null;
      } catch {
        // ignore
      }
      const channels = (p.notify_channels ?? []).filter(
        (c): c is "email" | "kakao" => c === "email" || c === "kakao",
      );
      profileById.set(p.profile_id, {
        profileId: p.profile_id,
        name: p.name,
        channels,
        email,
      });
    }

    const roundById = new Map<string, RoundContext>();
    for (const r of rounds) roundById.set(r.roundId, r);

    const tasks: Promise<void>[] = [];
    for (const [reviewerId, list] of byReviewer.entries()) {
      const profile = profileById.get(reviewerId);
      if (!profile) continue;
      if (!profile.channels.includes("email") || !profile.email) continue;
      // 한 reviewer 가 여러 회차에 동시 배정될 수 있으나, 보통 한 회차. 첫 회차 기준 메일 한 통.
      const firstRoundId = list[0].roundId;
      const round = roundById.get(firstRoundId);
      if (!round) continue;
      tasks.push(sendEmail(profile.email, round, list.length));
    }
    await Promise.allSettled(tasks);
  } catch (err) {
    console.error("[gs:notify] notifyPeerAssignments failed:", err);
  }
}

async function sendEmail(
  to: string,
  round: RoundContext,
  assignedCount: number,
): Promise<void> {
  try {
    const subjectMeta = LAW_SUBJECTS[round.subject as keyof typeof LAW_SUBJECTS];
    const subjectName = subjectMeta?.name ?? round.subject;
    const deadline = new Date(round.endAt).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const html = await render(
      GsPeerAssignmentEmail({
        link: `${APP_URL}/gs`,
        roundTitle: round.title,
        subjectName,
        assignedCount,
        deadline,
      }),
    );
    await resendClient.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO_EMAIL,
      to,
      subject: `[리담변리사학원] 동료 채점 ${assignedCount}건 배정 — ${round.title}`,
      html,
    });
  } catch (err) {
    console.error(`[gs:notify] email send failed (${to}):`, err);
  }
}
