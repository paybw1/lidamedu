// 주관식 첨삭 알림 (feat-3-402) — Q&A 의 notify.server.ts 패턴 재사용.
// 요청 시: 모든 staff (instructor/admin) 에게 fanout. 본인 채널 선호(email/kakao)에 따라.
// 완료 시: 학생 본인에게.
// best-effort — 실패해도 본 작업(요청/완료 DB 갱신) 진행에는 영향 없음.

import { render } from "@react-email/render";

import adminClient from "~/core/lib/supa-admin-client.server";
import { sendLoggedEmail } from "~/core/lib/message-log.server";
import { getDutyRecipientIds } from "~/features/admin/lib/duties.server";
import { createStaffNotifications } from "~/features/notifications/queries.server";
import {
  KakaoNotConfigured,
  sendKakaoAlimtalk,
  type KakaoTemplateKey,
} from "~/features/qna/notify-kakao.server";
import ReviewCompletedEmail from "../../../transactional-emails/emails/review-completed";
import ReviewRequestedEmail from "../../../transactional-emails/emails/review-requested";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@lidamedu.com";
const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO_EMAIL ?? "bwyim@lidamip.com";
// APP_URL 미설정 배포에서 이메일/알림톡 링크가 localhost 로 나가지 않도록 SITE_URL 폴백.
const APP_URL = (
  process.env.APP_URL ??
  process.env.SITE_URL ??
  "http://localhost:5173"
).replace(/\/$/, "");

type NotifyChannel = "email" | "kakao";

interface Recipient {
  profileId: string;
  name: string | null;
  email: string | null;
  phoneE164: string | null;
  channels: NotifyChannel[];
}

async function fetchRecipients(profileIds: string[]): Promise<Recipient[]> {
  if (profileIds.length === 0) return [];
  const { data: profiles, error } = await adminClient
    .from("profiles")
    .select("profile_id, name, phone_e164, notify_channels")
    .in("profile_id", profileIds);
  if (error || !profiles) return [];
  const out: Recipient[] = [];
  for (const profile of profiles) {
    let email: string | null = null;
    try {
      const { data, error: authErr } = await adminClient.auth.admin.getUserById(
        profile.profile_id,
      );
      if (!authErr && data?.user?.email) email = data.user.email;
    } catch {
      // 이메일 lookup 실패는 카카오 채널만 시도하도록 진행.
    }
    const validChannels = profile.notify_channels.filter(
      (c): c is NotifyChannel => c === "email" || c === "kakao",
    );
    out.push({
      profileId: profile.profile_id,
      name: profile.name,
      email,
      phoneE164: profile.phone_e164,
      channels: validChannels,
    });
  }
  return out;
}

// 담당자(관리자 관리 지정, 없으면 staff 전체) — 인박스·이메일·알림톡 공통 명단.
async function fetchStaffProfileIds(): Promise<string[]> {
  return getDutyRecipientIds("review_request");
}

interface EmailPayload {
  subject: string;
  html: string;
}

interface KakaoPayload {
  template: KakaoTemplateKey;
  variables: Record<string, string>;
  fallbackText: string;
}

async function dispatch(
  recipient: Recipient,
  email: EmailPayload,
  kakao: KakaoPayload,
): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (recipient.channels.includes("email") && recipient.email) {
    tasks.push(
      (async () => {
        await sendLoggedEmail(
          {
            from: FROM_EMAIL,
            replyTo: REPLY_TO_EMAIL,
            to: recipient.email!,
            subject: email.subject,
            html: email.html,
          },
          { recipientId: recipient.profileId, kind: kakao.template },
        );
      })(),
    );
  }
  if (recipient.channels.includes("kakao") && recipient.phoneE164) {
    tasks.push(
      (async () => {
        try {
          await sendKakaoAlimtalk({
            to: recipient.phoneE164!,
            recipientId: recipient.profileId,
            template: kakao.template,
            variables: kakao.variables,
            fallbackText: kakao.fallbackText,
          });
        } catch (err) {
          if (!(err instanceof KakaoNotConfigured)) {
            console.error(
              `[review:notify] kakao failed (profile=${recipient.profileId}):`,
              err,
            );
          }
        }
      })(),
    );
  }
  await Promise.all(tasks);
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
    const [staffIds, studentRecipients] = await Promise.all([
      fetchStaffProfileIds(),
      fetchRecipients([payload.studentId]),
    ]);
    const studentName = studentRecipients[0]?.name ?? "수험생";

    const recipients = await fetchRecipients(
      staffIds.filter((id) => id !== payload.studentId),
    );
    if (recipients.length === 0) return;

    // in-app fanout — 강사 인박스 카드. best-effort.
    void createStaffNotifications({
      recipientIds: recipients.map((r) => r.profileId),
      kind: "subjective_review_request",
      entityType: "problem",
      entityId: payload.problemId,
      title: `${studentName} — ${payload.problemLabel} 첨삭 요청`,
      body:
        payload.excerpt.length > 200
          ? payload.excerpt.slice(0, 200) + "…"
          : payload.excerpt,
      href: "/admin/subjective-reviews",
      payload: { studentName, problemLabel: payload.problemLabel },
    });

    const link = `${APP_URL}/admin/subjective-reviews`;
    const html = await render(
      ReviewRequestedEmail({
        link,
        studentName,
        problemLabel: payload.problemLabel,
        excerpt: payload.excerpt,
      }),
    );
    const emailPayload: EmailPayload = {
      subject: `[리담변리사학원] 새 주관식 첨삭 요청 — ${payload.problemLabel}`,
      html,
    };

    const excerptShort =
      payload.excerpt.length > 80
        ? payload.excerpt.slice(0, 80) + "…"
        : payload.excerpt;
    // ★변수명은 승인 템플릿(#{targetLabel}/#{title}/#{askerName}/#{excerpt}) 기준 —
    //   studentName/problemLabel 로 보내면 변수 불일치로 발송이 거부된다.
    const kakaoPayload: KakaoPayload = {
      template: "review-requested",
      variables: {
        targetLabel: "주관식 문제",
        title: payload.problemLabel,
        askerName: studentName,
        excerpt: excerptShort,
        link,
      },
      fallbackText: `[리담변리사학원] 새 주관식 첨삭 요청 — ${payload.problemLabel}\n${studentName} 님\n${excerptShort}\n${link}`,
    };

    await Promise.all(
      recipients.map((r) => dispatch(r, emailPayload, kakaoPayload)),
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
    const [recipients, reviewerRecipients] = await Promise.all([
      fetchRecipients([payload.studentId]),
      fetchRecipients([payload.reviewerId]),
    ]);
    if (recipients.length === 0) return;
    const reviewerName = reviewerRecipients[0]?.name ?? "강사";

    // 학생 본인에게 in-app 카드.
    void createStaffNotifications({
      recipientIds: [payload.studentId],
      kind: "subjective_review_completed",
      entityType: "problem",
      entityId: payload.problemId,
      title: `${reviewerName} 강사 — ${payload.problemLabel} 첨삭 완료`,
      body:
        payload.score !== null
          ? `점수: ${payload.score}점${payload.commentMd ? ` · ${payload.commentMd.slice(0, 80)}` : ""}`
          : payload.commentMd
            ? payload.commentMd.slice(0, 120)
            : "코멘트가 도착했습니다.",
      href: payload.problemHref,
      payload: {
        reviewerName,
        score: payload.score,
        problemLabel: payload.problemLabel,
      },
    });

    const link = `${APP_URL}${payload.problemHref}`;
    const html = await render(
      ReviewCompletedEmail({
        link,
        reviewerName,
        problemLabel: payload.problemLabel,
        score: payload.score,
        commentMd: payload.commentMd,
      }),
    );
    const emailPayload: EmailPayload = {
      subject: `[리담변리사학원] 주관식 첨삭 완료 — ${payload.problemLabel}`,
      html,
    };

    const commentExcerpt = (() => {
      const t = (payload.commentMd ?? "").trim();
      if (t.length === 0) return "(코멘트 없이 점수만 등록)";
      return t.length > 80 ? t.slice(0, 80) + "…" : t;
    })();
    const scoreText =
      payload.score !== null ? `${payload.score}점` : "점수 미입력";
    // ★변수명은 승인 템플릿(#{targetLabel}/#{title}/#{answererName}/#{excerpt}) 기준.
    const kakaoPayload: KakaoPayload = {
      template: "review-completed",
      variables: {
        targetLabel: "주관식 문제",
        title: payload.problemLabel,
        answererName: reviewerName,
        excerpt: `${scoreText} · ${commentExcerpt}`,
        link,
        // (링크) 템플릿 WL 버튼 URL 변수 — https://…#{path}.
        path: payload.problemHref,
      },
      fallbackText: `[리담변리사학원] 주관식 첨삭 완료 — ${payload.problemLabel}\n강사: ${reviewerName} · ${scoreText}\n${commentExcerpt}\n${link}`,
    };

    await Promise.all(
      recipients.map((r) => dispatch(r, emailPayload, kakaoPayload)),
    );
  } catch (err) {
    console.error("[review] notifyReviewCompleted failed:", err);
  }
}
