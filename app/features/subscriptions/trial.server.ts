// feat-8-027 Stage 3 — 체험(가입 15일) 만료 임박 인박스 공지.
// 크론에 의존하지 않고 대시보드 진입 시 지연 트리거(runAfterResponse)로 1회 발송.
// 자동 강등은 등급 리졸버(getMembershipAccess)가 trial_ends_at 경과 시 무료회원으로 파생 — 별도 DB 작업 불필요.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

// 만료 D-N 이내면 1회 공지. (배너는 체험 시작일부터 상시 노출 — 사전공지 역할)
export const TRIAL_EXPIRY_NOTICE_DAYS = 3;

const admin = adminClient as SupabaseClient<Database>;

// 체험 만료 임박 시 인박스 알림 1회 발송 + 플래그 세팅. 조건 미충족이면 no-op.
// 호출자(대시보드 로더)가 이미 grade==="trial" 확정 후 runAfterResponse 로 부른다.
export async function notifyTrialExpiryIfDue(userId: string): Promise<void> {
  const { data: prof } = await admin
    .from("profiles")
    .select("trial_ends_at, trial_expiry_notified_at")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!prof?.trial_ends_at || prof.trial_expiry_notified_at) return;

  const daysLeft =
    (new Date(prof.trial_ends_at).getTime() - Date.now()) / 86_400_000;
  if (daysLeft <= 0 || daysLeft > TRIAL_EXPIRY_NOTICE_DAYS) return;

  await createUserNotifications({
    recipientIds: [userId],
    kind: "trial_expiry_warning",
    entityType: "trial",
    entityId: userId,
    title: "무료 체험이 곧 종료됩니다",
    body: "체험 기간이 끝나면 학습과목(조문·판례·문제) 열람이 비활성화되고 무료회원으로 전환됩니다. 계속 학습하려면 구독을 시작하세요.",
    href: "/pricing",
    payload: { trialEndsAt: prof.trial_ends_at },
  });

  await admin
    .from("profiles")
    .update({ trial_expiry_notified_at: new Date().toISOString() })
    .eq("profile_id", userId);
}
