// Q&A 알림 디스패처. 각 수신자의 notify_channels 에 따라 이메일/카카오로 fanout.
// best-effort: 한 채널 실패가 다른 채널/다른 수신자에게 영향을 주지 않는다.
// supa-admin 사용 — 다른 사용자(staff/asker)의 이메일·전화·채널 선호를 RLS 우회로 조회.

import { render } from "@react-email/render";

import adminClient from "~/core/lib/supa-admin-client.server";
import resendClient from "~/core/lib/resend-client.server";
import QnaNewAnswerEmail from "../../../transactional-emails/emails/qna-new-answer";
import QnaNewQuestionEmail from "../../../transactional-emails/emails/qna-new-question";

import { QNA_QUALITY_LABEL, QNA_TARGET_LABEL, type QnaQualityGrade, type QnaTargetType } from "./labels";
import {
  KakaoNotConfigured,
  sendKakaoAlimtalk,
  type KakaoTemplateKey,
} from "./notify-kakao.server";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@lidamedu.com";
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

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

async function fetchStaffProfileIds(): Promise<string[]> {
  const { data, error } = await adminClient
    .from("profiles")
    .select("profile_id")
    .in("role", ["instructor", "admin"]);
  if (error || !data) return [];
  return data.map((r) => r.profile_id);
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
        try {
          await resendClient.emails.send({
            from: FROM_EMAIL,
            to: recipient.email!,
            subject: email.subject,
            html: email.html,
          });
        } catch (err) {
          console.error(
            `[qna:notify] email send failed (profile=${recipient.profileId}):`,
            err,
          );
        }
      })(),
    );
  }

  if (recipient.channels.includes("kakao") && recipient.phoneE164) {
    tasks.push(
      (async () => {
        try {
          await sendKakaoAlimtalk({
            to: recipient.phoneE164!,
            template: kakao.template,
            variables: kakao.variables,
            fallbackText: kakao.fallbackText,
          });
        } catch (err) {
          // 카카오 미설정(KakaoNotConfigured) 은 활성화 전 정상 상태이므로 조용히.
          if (!(err instanceof KakaoNotConfigured)) {
            console.error(
              `[qna:notify] kakao send failed (profile=${recipient.profileId}):`,
              err,
            );
          }
        }
      })(),
    );
  }

  await Promise.all(tasks);
}

interface NewQuestionPayload {
  threadId: string;
  targetType: QnaTargetType;
  title: string;
  questionMd: string;
  askerName: string | null;
}

// 풀 모델: 모든 instructor + admin 에게 (질문자 본인 제외) 알림 발송.
export async function notifyNewQuestion(
  payload: NewQuestionPayload,
  excludeProfileId: string,
): Promise<void> {
  try {
    const staffIds = (await fetchStaffProfileIds()).filter(
      (id) => id !== excludeProfileId,
    );
    const recipients = await fetchRecipients(staffIds);
    if (recipients.length === 0) return;

    const link = `${APP_URL}/qna/${payload.threadId}`;
    const targetLabel = QNA_TARGET_LABEL[payload.targetType];
    const askerName = payload.askerName ?? "수험생";

    const emailHtml = await render(
      QnaNewQuestionEmail({
        link,
        title: payload.title,
        targetLabel,
        questionMd: payload.questionMd,
        askerName,
      }),
    );
    const emailPayload: EmailPayload = {
      subject: `[Lidam Edu] 새 ${targetLabel} 질문: ${payload.title}`,
      html: emailHtml,
    };

    const excerpt =
      payload.questionMd.length > 80
        ? payload.questionMd.slice(0, 80) + "…"
        : payload.questionMd;
    const kakaoPayload: KakaoPayload = {
      template: "new-question",
      variables: {
        targetLabel,
        title: payload.title,
        askerName,
        excerpt,
        link,
      },
      fallbackText: `[Lidam Edu] 새 ${targetLabel} 질문 — ${payload.title}\n${excerpt}\n${link}`,
    };

    await Promise.all(
      recipients.map((r) => dispatch(r, emailPayload, kakaoPayload)),
    );
  } catch (err) {
    console.error("[qna] notifyNewQuestion failed:", err);
  }
}

interface NewAnswerPayload {
  threadId: string;
  targetType: QnaTargetType;
  title: string;
  answerMd: string;
  qualityGrade: QnaQualityGrade;
  askerProfileId: string;
  answererName: string | null;
}

export async function notifyNewAnswer(payload: NewAnswerPayload): Promise<void> {
  try {
    const recipients = await fetchRecipients([payload.askerProfileId]);
    if (recipients.length === 0) return;

    const link = `${APP_URL}/qna/${payload.threadId}`;
    const targetLabel = QNA_TARGET_LABEL[payload.targetType];
    const answererName = payload.answererName ?? "강사";
    const gradeLabel = QNA_QUALITY_LABEL[payload.qualityGrade];

    const emailHtml = await render(
      QnaNewAnswerEmail({
        link,
        title: payload.title,
        targetLabel,
        answerMd: payload.answerMd,
        qualityGrade: payload.qualityGrade,
        answererName,
      }),
    );
    const emailPayload: EmailPayload = {
      subject: `[Lidam Edu] ${targetLabel} 질문에 답변이 도착했습니다: ${payload.title}`,
      html: emailHtml,
    };

    const excerpt =
      payload.answerMd.length > 80
        ? payload.answerMd.slice(0, 80) + "…"
        : payload.answerMd;
    const kakaoPayload: KakaoPayload = {
      template: "new-answer",
      variables: {
        targetLabel,
        title: payload.title,
        answererName,
        gradeLabel,
        excerpt,
        link,
      },
      fallbackText: `[Lidam Edu] ${targetLabel} 답변 도착 — ${payload.title}\n수준: ${gradeLabel}\n${excerpt}\n${link}`,
    };

    await Promise.all(
      recipients.map((r) => dispatch(r, emailPayload, kakaoPayload)),
    );
  } catch (err) {
    console.error("[qna] notifyNewAnswer failed:", err);
  }
}
