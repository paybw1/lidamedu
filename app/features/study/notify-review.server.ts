// 주관식 첨삭 알림 (feat-3-402) — Q&A 의 notify.server.ts 패턴 재사용.
// 요청 시: 모든 staff (instructor/admin) 에게 이메일.
// 완료 시: 학생 본인에게 이메일.
// best-effort — 실패해도 본 작업(요청/완료 DB 갱신) 진행에는 영향 없음.

import { render } from "@react-email/render";

import adminClient from "~/core/lib/supa-admin-client.server";
import resendClient from "~/core/lib/resend-client.server";
import ReviewCompletedEmail from "../../../transactional-emails/emails/review-completed";
import ReviewRequestedEmail from "../../../transactional-emails/emails/review-requested";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@lidamedu.com";
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

async function fetchEmail(profileId: string): Promise<string | null> {
  try {
    const { data, error } = await adminClient.auth.admin.getUserById(profileId);
    if (error || !data?.user?.email) return null;
    return data.user.email;
  } catch {
    return null;
  }
}

async function fetchStaffEmails(): Promise<
  Array<{ profileId: string; email: string }>
> {
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("profile_id")
    .in("role", ["instructor", "admin"]);
  if (!profiles) return [];
  const list: Array<{ profileId: string; email: string }> = [];
  for (const p of profiles) {
    const email = await fetchEmail(p.profile_id);
    if (email) list.push({ profileId: p.profile_id, email });
  }
  return list;
}

async function fetchProfileName(profileId: string): Promise<string | null> {
  const { data } = await adminClient
    .from("profiles")
    .select("name")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data?.name ?? null;
}

interface ReviewRequestedPayload {
  studentId: string;
  problemId: string;
  problemLabel: string;
  excerpt: string;
}

export async function notifyReviewRequested(
  payload: ReviewRequestedPayload,
): Promise<void> {
  try {
    const [studentName, recipients] = await Promise.all([
      fetchProfileName(payload.studentId),
      fetchStaffEmails(),
    ]);
    if (recipients.length === 0) return;
    const link = `${APP_URL}/admin/subjective-reviews`;
    const html = await render(
      ReviewRequestedEmail({
        link,
        studentName: studentName ?? "수험생",
        problemLabel: payload.problemLabel,
        excerpt: payload.excerpt,
      }),
    );
    const subject = `[Lidam Edu] 새 주관식 첨삭 요청 — ${payload.problemLabel}`;
    await Promise.all(
      recipients.map(async (r) => {
        try {
          await resendClient.emails.send({
            from: FROM_EMAIL,
            to: r.email,
            subject,
            html,
          });
        } catch (err) {
          console.error(
            `[review:notify] requested email failed (profile=${r.profileId}):`,
            err,
          );
        }
      }),
    );
  } catch (err) {
    console.error("[review] notifyReviewRequested failed:", err);
  }
}

interface ReviewCompletedPayload {
  studentId: string;
  reviewerId: string;
  problemId: string;
  problemLabel: string;
  problemHref: string;
  score: number | null;
  commentMd: string | null;
}

export async function notifyReviewCompleted(
  payload: ReviewCompletedPayload,
): Promise<void> {
  try {
    const [studentEmail, reviewerName] = await Promise.all([
      fetchEmail(payload.studentId),
      fetchProfileName(payload.reviewerId),
    ]);
    if (!studentEmail) return;
    const link = `${APP_URL}${payload.problemHref}`;
    const html = await render(
      ReviewCompletedEmail({
        link,
        reviewerName: reviewerName ?? "강사",
        problemLabel: payload.problemLabel,
        score: payload.score,
        commentMd: payload.commentMd,
      }),
    );
    const subject = `[Lidam Edu] 주관식 첨삭 완료 — ${payload.problemLabel}`;
    try {
      await resendClient.emails.send({
        from: FROM_EMAIL,
        to: studentEmail,
        subject,
        html,
      });
    } catch (err) {
      console.error("[review:notify] completed email failed:", err);
    }
  } catch (err) {
    console.error("[review] notifyReviewCompleted failed:", err);
  }
}
