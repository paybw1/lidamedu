// feat-7-046 Stage 5(B) — 발송 로그. 메일·알림톡 발송 지점에서 성공/실패를 기록.
// ★로깅은 발송을 절대 깨지 않는다 — 모든 쓰기를 try/catch 로 삼킨다.
// 쓰기는 서버 권위(adminClient = service_role). RLS 는 staff read.

import adminClient from "~/core/lib/supa-admin-client.server";
import resendClient from "~/core/lib/resend-client.server";

export interface RecordMessageSendInput {
  channel: "email" | "kakao" | "sms";
  provider: string;
  recipientId: string | null;
  toAddress: string | null;
  kind: string | null;
  subject: string | null;
  status: "sent" | "failed";
  error: string | null;
}

export async function recordMessageSend(
  input: RecordMessageSendInput,
): Promise<void> {
  try {
    await adminClient.from("message_send_logs").insert({
      recipient_id: input.recipientId,
      channel: input.channel,
      provider: input.provider,
      kind: input.kind,
      to_address: input.toAddress,
      subject: input.subject,
      status: input.status,
      error: input.error,
    });
  } catch {
    // 로깅 실패가 발송/응답을 깨지 않게 삼킨다.
  }
}

type EmailParams = Parameters<typeof resendClient.emails.send>[0];

// Resend 이메일 발송 + 로그. 반환값은 resendClient.emails.send 와 동일한 { error } 형상이라
// 기존 호출부(res.error 검사)가 그대로 동작한다. 내부에서 throw 를 잡아 로그 후 { error } 로 정규화.
export async function sendLoggedEmail(
  params: EmailParams,
  ctx: { recipientId?: string | null; kind: string },
): Promise<{ error: { message: string } | null }> {
  let error: { message: string } | null = null;
  try {
    const res = await resendClient.emails.send(params);
    error = res.error ? { message: res.error.message } : null;
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }
  const to = params.to;
  const toAddress = Array.isArray(to) ? to.join(", ") : (to ?? null);
  void recordMessageSend({
    channel: "email",
    provider: "resend",
    recipientId: ctx.recipientId ?? null,
    toAddress,
    kind: ctx.kind,
    subject: params.subject ?? null,
    status: error ? "failed" : "sent",
    error: error?.message ?? null,
  });
  return { error };
}
