// feat-7-042 Q&A 답변 적립 — 강사 답변 확정 시 스레드당 1건 정액 적립.
// 적립·지급된 크레딧은 답변 수정·삭제·강사 변경과 무관하게 유지(저작권 이용 대가).
// adminClient 전용 테이블(RLS 정책 없음).

import adminClient from "~/core/lib/supa-admin-client.server";

export interface QnaRewardSettings {
  unitKrw: number;
  payoutThresholdKrw: number;
  isActive: boolean;
}

export async function getQnaRewardSettings(): Promise<QnaRewardSettings> {
  const { data, error } = await adminClient
    .from("qna_reward_settings")
    .select("unit_krw, payout_threshold_krw, is_active")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return {
    unitKrw: data?.unit_krw ?? 500,
    payoutThresholdKrw: data?.payout_threshold_krw ?? 50000,
    isActive: data?.is_active ?? false,
  };
}

/**
 * 답변 적립 — answerThread 성공 후 호출. 실패해도 답변 흐름은 막지 않는다(호출부 try/catch).
 * 스레드당 1건(unique thread_id) — 답변 수정 재호출은 무시. 강사(instructor) 역할만 적립.
 */
export async function accrueQnaAnswerCredit(
  answererId: string,
  threadId: string,
): Promise<void> {
  const settings = await getQnaRewardSettings();
  if (!settings.isActive || settings.unitKrw <= 0) return;
  const { data: prof } = await adminClient
    .from("profiles")
    .select("role")
    .eq("profile_id", answererId)
    .maybeSingle();
  if (prof?.role !== "instructor") return; // 원장·관리자 답변은 적립 대상 아님
  await adminClient.from("instructor_qna_credits").upsert(
    {
      instructor_id: answererId,
      thread_id: threadId,
      amount_krw: settings.unitKrw,
    },
    { onConflict: "thread_id", ignoreDuplicates: true },
  );
}
