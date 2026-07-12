// 체험→유료 전환 추적 (P1). manager+/수강생관리 접근 전용 — 호출부에서 게이트.
// 데이터: profiles.trial_ends_at(15일 체험) + 전환 신호(완료 결제 ∪ 활성 종합반 멤버).
// 별도 저장 없이 파생 집계 — DDL 불필요.

import adminClient from "~/core/lib/supa-admin-client.server";

const DAY_MS = 86_400_000;
export const TRIAL_EXPIRING_DAYS = 7; // 만료 임박 워크리스트 창
export const TRIAL_FOLLOWUP_DAYS = 30; // 최근 만료 미전환 팔로업 창
export const TRIAL_CONVERSION_WINDOW_DAYS = 90; // 전환율 산정 코호트 창

export interface TrialWorklistRow {
  profileId: string;
  name: string | null;
  memberNo: number | null;
  phone: string | null;
  trialEndsAt: string;
  createdAt: string;
  dDays: number; // 만료까지 남은 일수(음수 = 경과)
}

export interface TrialConversionOverview {
  activeTrials: number; // 진행 중 체험(미전환)
  expiringSoonDays: number;
  expiringSoon: TrialWorklistRow[]; // 임박 + 미전환(연락 대상)
  followupDays: number;
  followup: TrialWorklistRow[]; // 최근 만료 + 미전환(팔로업)
  conversion: {
    windowDays: number;
    endedCount: number; // 기간 내 체험 종료 학생 수
    convertedCount: number; // 그 중 전환(유료)
    ratePct: number | null;
  };
}

interface CandidateProfile {
  profile_id: string;
  name: string | null;
  member_no: number | null;
  phone_e164: string | null;
  trial_ends_at: string;
  created_at: string;
}

function dDays(trialEndsAt: string, nowMs: number): number {
  return Math.ceil((new Date(trialEndsAt).getTime() - nowMs) / DAY_MS);
}

function toRow(p: CandidateProfile, nowMs: number): TrialWorklistRow {
  return {
    profileId: p.profile_id,
    name: p.name,
    memberNo: p.member_no,
    phone: p.phone_e164,
    trialEndsAt: p.trial_ends_at,
    createdAt: p.created_at,
    dDays: dDays(p.trial_ends_at, nowMs),
  };
}

// 후보군(최근 90일 내 종료 또는 진행 중 체험 학생)에서 전환자 집합을 구한다.
// 전환 = 완료 결제 1건 이상 ∪ 활성(미보관·미삭제) 종합반 멤버.
async function resolveConvertedSet(
  candidateIds: string[],
): Promise<Set<string>> {
  const converted = new Set<string>();
  if (candidateIds.length === 0) return converted;
  // .in() URL 길이 방지 — 150개 배치.
  const BATCH = 150;
  for (let i = 0; i < candidateIds.length; i += BATCH) {
    const ids = candidateIds.slice(i, i + BATCH);
    const [pay, coh] = await Promise.all([
      adminClient
        .from("payments")
        .select("user_id")
        .eq("status", "completed")
        .in("user_id", ids),
      adminClient
        .from("cohort_members")
        .select("profile_id, cohorts!inner(is_archived, deleted_at)")
        .in("profile_id", ids),
    ]);
    for (const r of pay.data ?? []) converted.add(r.user_id);
    for (const r of (coh.data ?? []) as unknown as Array<{
      profile_id: string;
      cohorts: { is_archived: boolean; deleted_at: string | null };
    }>) {
      if (r.cohorts && !r.cohorts.is_archived && r.cohorts.deleted_at === null) {
        converted.add(r.profile_id);
      }
    }
  }
  return converted;
}

export async function getTrialConversionOverview(): Promise<TrialConversionOverview> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  // 후보 = 학생 · trial_ends_at 이 (지금-90일) 이후. 진행 중(미래 만료)과 최근 종료 모두 포함.
  const floorIso = new Date(
    nowMs - TRIAL_CONVERSION_WINDOW_DAYS * DAY_MS,
  ).toISOString();
  const { data, error } = await adminClient
    .from("profiles")
    .select("profile_id, name, member_no, phone_e164, trial_ends_at, created_at")
    .eq("role", "student")
    .not("trial_ends_at", "is", null)
    .gte("trial_ends_at", floorIso)
    .order("trial_ends_at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  const candidates = (data ?? []) as unknown as CandidateProfile[];
  const converted = await resolveConvertedSet(
    candidates.map((c) => c.profile_id),
  );

  const expiringCeil = nowMs + TRIAL_EXPIRING_DAYS * DAY_MS;
  const followupFloor = nowMs - TRIAL_FOLLOWUP_DAYS * DAY_MS;

  let activeTrials = 0;
  const expiringSoon: TrialWorklistRow[] = [];
  const followup: TrialWorklistRow[] = [];
  let endedCount = 0;
  let convertedCount = 0;

  for (const p of candidates) {
    const endMs = new Date(p.trial_ends_at).getTime();
    const isConverted = converted.has(p.profile_id);
    const isActive = endMs > nowMs;

    if (isActive && !isConverted) {
      activeTrials += 1;
      if (endMs <= expiringCeil) expiringSoon.push(toRow(p, nowMs));
    }
    if (!isActive) {
      // 체험 종료자 — 전환율 코호트(전 구간 후보가 90일 내이므로 전부 해당).
      endedCount += 1;
      if (isConverted) convertedCount += 1;
      else if (endMs >= followupFloor) followup.push(toRow(p, nowMs));
    }
  }

  // 임박 = 만료 가까운 순(오름차순), 팔로업 = 최근 만료 순(내림차순).
  expiringSoon.sort((a, b) => a.trialEndsAt.localeCompare(b.trialEndsAt));
  followup.sort((a, b) => b.trialEndsAt.localeCompare(a.trialEndsAt));

  return {
    activeTrials,
    expiringSoonDays: TRIAL_EXPIRING_DAYS,
    expiringSoon,
    followupDays: TRIAL_FOLLOWUP_DAYS,
    followup,
    conversion: {
      windowDays: TRIAL_CONVERSION_WINDOW_DAYS,
      endedCount,
      convertedCount,
      ratePct:
        endedCount > 0
          ? Math.round((convertedCount / endedCount) * 1000) / 10
          : null,
    },
  };
}
