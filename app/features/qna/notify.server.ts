// Q&A 알림 디스패처. 각 수신자의 notify_channels 에 따라 이메일/카카오로 fanout.
// best-effort: 한 채널 실패가 다른 채널/다른 수신자에게 영향을 주지 않는다.
// supa-admin 사용 — 다른 사용자(staff/asker)의 이메일·전화·채널 선호를 RLS 우회로 조회.

import { render } from "@react-email/render";

import adminClient from "~/core/lib/supa-admin-client.server";
import { sendLoggedEmail } from "~/core/lib/message-log.server";
import { getDutyRecipientIds } from "~/features/admin/lib/duties.server";
import { createStaffNotifications } from "~/features/notifications/queries.server";
import QnaNewAnswerEmail from "../../../transactional-emails/emails/qna-new-answer";
import QnaNewQuestionEmail from "../../../transactional-emails/emails/qna-new-question";

import { QNA_QUALITY_LABEL, QNA_TARGET_LABEL, type QnaQualityGrade, type QnaTargetType } from "./labels";
import {
  getAnswererIdsForCategory,
  resolveAnswererCategory,
} from "./answerers.server";
import {
  KakaoNotConfigured,
  sendKakaoAlimtalk,
  type KakaoTemplateKey,
} from "./notify-kakao.server";

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
  targetId: string | null;
  subject: string | null;
  title: string;
  questionMd: string;
  askerName: string | null;
}

// 라우팅 모델: 질문의 답변자 카테고리에 지정된 담당자에게만 발송.
//   담당자 미지정(또는 공통/미해결)이면 전체 staff 풀 fallback — 질문 유실 방지.
export async function notifyNewQuestion(
  payload: NewQuestionPayload,
  excludeProfileId: string,
): Promise<void> {
  try {
    const category = await resolveAnswererCategory(adminClient, {
      targetType: payload.targetType,
      targetId: payload.targetId,
      subject: payload.subject,
    });
    const assignedIds = category
      ? await getAnswererIdsForCategory(adminClient, category)
      : [];
    // 카테고리 답변자 지정 → 그 담당자에게만.
    // 미지정 → 관리자 관리의 Q&A 담당자(그것도 미지정이면 전체 staff 풀).
    const targetIds =
      assignedIds.length > 0
        ? assignedIds
        : await getDutyRecipientIds("qna_question");
    const staffIds = targetIds.filter((id) => id !== excludeProfileId);
    const recipients = await fetchRecipients(staffIds);
    if (recipients.length === 0) return;

    const link = `${APP_URL}/qna/${payload.threadId}`;
    const targetLabel = QNA_TARGET_LABEL[payload.targetType];
    const askerName = payload.askerName ?? "학생";

    // in-app fanout — 강사 인박스 카드. best-effort.
    void createStaffNotifications({
      recipientIds: recipients.map((r) => r.profileId),
      kind: "qna_new_question",
      entityType: "qna_thread",
      entityId: payload.threadId,
      title: `${askerName} — [${targetLabel}] ${payload.title}`,
      body:
        payload.questionMd.length > 200
          ? payload.questionMd.slice(0, 200) + "…"
          : payload.questionMd,
      href: `/qna/${payload.threadId}`,
      payload: { askerName, targetLabel },
    });

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
      subject: `[리담변리사학원] 새 ${targetLabel} 질문: ${payload.title}`,
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
        // (링크) 템플릿 WL 버튼 URL 변수 — https://…/qna/#{threadId}.
        threadId: payload.threadId,
      },
      fallbackText: `[리담변리사학원] 새 ${targetLabel} 질문 — ${payload.title}\n${excerpt}\n${link}`,
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

    // 학생(질문자) in-app 카드.
    void createStaffNotifications({
      recipientIds: [payload.askerProfileId],
      kind: "qna_new_answer",
      entityType: "qna_thread",
      entityId: payload.threadId,
      title: `${answererName} — [${targetLabel}] ${payload.title}`,
      body:
        payload.answerMd.length > 200
          ? payload.answerMd.slice(0, 200) + "…"
          : payload.answerMd,
      href: `/qna/${payload.threadId}`,
      payload: { answererName, targetLabel, qualityGrade: payload.qualityGrade },
    });

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
      subject: `[리담변리사학원] ${targetLabel} 질문에 답변이 도착했습니다: ${payload.title}`,
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
        // (링크) 템플릿 WL 버튼 URL 변수 — https://…/qna/#{threadId}.
        threadId: payload.threadId,
      },
      fallbackText: `[리담변리사학원] ${targetLabel} 답변 도착 — ${payload.title}\n수준: ${gradeLabel}\n${excerpt}\n${link}`,
    };

    await Promise.all(
      recipients.map((r) => dispatch(r, emailPayload, kakaoPayload)),
    );
  } catch (err) {
    console.error("[qna] notifyNewAnswer failed:", err);
  }
}
