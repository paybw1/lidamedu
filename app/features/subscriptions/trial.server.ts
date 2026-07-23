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

/** 체험 재부여 기간(일) — 기존 학생 1회 재체험. */
export const TRIAL_REGRANT_DAYS = 15;

// 기존 가입 학생 1회 체험 재부여 — 재접속 시 만료된 체험을 15일 다시 열어준다.
//   대상: 아직 재부여받지 않은(trial_regranted_at is null) 학생. 호출자가 grade==="free_member"
//   (구독·종합반 없음)을 확정한 뒤 호출한다 → 결제/종합반 사용자는 건드리지 않는다.
//   재부여 시 trial_ends_at=now+15d, 재부여 마커 기록, 만료/종료 통지 플래그 초기화(새 종료일에 재발화).
//   실제 재부여했으면 true. (멱등 — 이미 재부여했으면 no-op false)
export async function regrantTrialIfEligible(userId: string): Promise<boolean> {
  const { data: prof } = await admin
    .from("profiles")
    .select("trial_regranted_at")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!prof || prof.trial_regranted_at) return false;
  const now = new Date();
  const ends = new Date(now.getTime() + TRIAL_REGRANT_DAYS * 86_400_000);
  const { error } = await admin
    .from("profiles")
    .update({
      trial_ends_at: ends.toISOString(),
      trial_regranted_at: now.toISOString(),
      trial_expiry_notified_at: null,
      trial_ended_notified_at: null,
    })
    .eq("profile_id", userId)
    .is("trial_regranted_at", null); // 동시요청 경쟁 방어
  return !error;
}

/** 체험 종료 후 대시보드 배너 노출 기간(일) — 전환 넛지 창. */
export const TRIAL_ENDED_BANNER_DAYS = 7;

// 체험 종료(무료회원 강등) 후 인박스 알림 1회 발송 + 플래그 세팅.
// 호출자(대시보드 로더)가 grade==="free_member" 확정 후 runAfterResponse 로 부른다 —
// 구독·종합반 전환자에게는 발송되지 않는다.
export async function notifyTrialEndedIfDue(userId: string): Promise<void> {
  const { data: prof } = await admin
    .from("profiles")
    .select("trial_ends_at, trial_ended_notified_at")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!prof?.trial_ends_at || prof.trial_ended_notified_at) return;
  if (new Date(prof.trial_ends_at).getTime() > Date.now()) return;

  await createUserNotifications({
    recipientIds: [userId],
    kind: "trial_ended",
    entityType: "trial",
    entityId: userId,
    title: "무료 체험이 종료되었습니다",
    body: "무료회원으로 전환되어 학습과목(조문·판례·문제) 열람이 비활성화되었습니다. 학습 기록은 그대로 보관 중이니 구독을 시작하면 이어서 학습할 수 있습니다.",
    href: "/pricing",
    payload: { trialEndsAt: prof.trial_ends_at },
  });

  await admin
    .from("profiles")
    .update({ trial_ended_notified_at: new Date().toISOString() })
    .eq("profile_id", userId);
}
