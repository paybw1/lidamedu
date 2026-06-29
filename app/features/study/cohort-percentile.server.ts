// feat-2-027 Phase 3 — 공부량 코호트 구간 (★비교 = 안전 최우선). 파생(신규 테이블 없음).
//  - cohort_members 는 학생 self-read RLS 없음 → adminClient 필수, 코드가 유일 방어선.
//  - 호출 전 loader 가 hasPoolConsent(요청자 B동의)로 게이트. 여기선 대칭 표본(B동의 peer만) + 표본 가드.
//  - 반환은 집계값(구간·상위%·표본수)만 — 개인 식별자/개별 학습시간 미반환(격리).
//  - 모집단 = 내 코호트(반) — 같은 반 = 비슷한 조건 → 공정(★4b, 여러 반 열려도 cross-mix 0).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import { bandForTopPercent, computeTopPercent } from "./lib/study-volume";

// ★데이터 플래그: B동의 멤버가 이 수 이상일 때만 구간 노출(런타임 N-체크 = 자동 활성화).
//   현재 코호트 B동의 1명 → 잠김(본인 성장만). 정식 오픈·동의 증가 시 코드 변경 0으로 자동 ON.
export const MIN_COHORT_PERCENTILE_SAMPLE = 10;

export type CohortStudyBand =
  | { state: "ok"; band: string; topPercent: number; sampleSize: number }
  | { state: "locked"; current: number; needed: number }
  | { state: "off" }; // 코호트 미소속 등 — 비교 없음

// 주어진 사용자들의 user_problem_attempts.time_spent_ms 합계 맵.
// range 페이징(유일키 attempt_id 정렬). pool/전체 두 산출이 공유.
async function sumTimeMsByUser(
  admin: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, number>> {
  const msByUser = new Map<string, number>();
  for (const id of userIds) msByUser.set(id, 0);
  if (userIds.length === 0) return msByUser;
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("user_problem_attempts")
      .select("attempt_id, user_id, time_spent_ms")
      .in("user_id", userIds)
      .order("attempt_id", { ascending: true })
      .range(from, from + 999);
    if (!data?.length) break;
    for (const r of data) {
      if (r.time_spent_ms && msByUser.has(r.user_id)) {
        msByUser.set(
          r.user_id,
          (msByUser.get(r.user_id) ?? 0) + r.time_spent_ms,
        );
      }
    }
    if (data.length < 1000) break;
  }
  return msByUser;
}

export async function getCohortStudyPercentile(
  userId: string,
): Promise<CohortStudyBand> {
  const admin = adminClient as SupabaseClient<Database>;

  // 1) 본인 코호트(들) — 학생 RLS 못 읽음 → admin. 모집단 = 내 코호트(공정).
  const { data: myRows } = await admin
    .from("cohort_members")
    .select("cohort_id, cohorts!inner(deleted_at)")
    .eq("profile_id", userId);
  const cohortIds = (myRows ?? [])
    .filter((r) => !r.cohorts?.deleted_at)
    .map((r) => r.cohort_id);
  if (cohortIds.length === 0) return { state: "off" };
  const cohortId = cohortIds[0]; // v1: 첫(대개 유일) 코호트

  // 2) 코호트 멤버 + B동의 대칭 필터(동의자만 표본). is_synthetic 제외.
  const { data: members } = await admin
    .from("cohort_members")
    .select(
      "profile_id, profiles!cohort_members_profile_id_fkey(pool_consent_at, is_synthetic)",
    )
    .eq("cohort_id", cohortId);
  const consented = (members ?? [])
    .filter(
      (m) =>
        m.profiles?.pool_consent_at != null &&
        m.profiles?.is_synthetic !== true,
    )
    .map((m) => m.profile_id);

  // 요청자가 동의 표본에 없으면 off(이중 방어 — loader 가 이미 hasPoolConsent 게이트).
  if (!consented.includes(userId)) return { state: "off" };
  // ★표본 가드 — 미만이면 잠금(본인 성장만). 인원 늘면 자동 ON.
  if (consented.length < MIN_COHORT_PERCENTILE_SAMPLE) {
    return {
      state: "locked",
      current: consented.length,
      needed: MIN_COHORT_PERCENTILE_SAMPLE,
    };
  }

  // 3) 동의 멤버 학습시간(time_spent_ms) bulk 합.
  const msByUser = await sumTimeMsByUser(admin, consented);

  const myMs = msByUser.get(userId) ?? 0;
  const peerMs = [...msByUser.entries()]
    .filter(([id]) => id !== userId)
    .map(([, ms]) => ms);
  const topPercent = computeTopPercent(myMs, peerMs);
  return {
    state: "ok",
    band: bandForTopPercent(topPercent).label,
    topPercent,
    sampleSize: consented.length,
  };
}

// ★반 전체 표본 가드 — 미만이면 위치 비노출(노이즈 차단). pool 표본(10)보다 낮음:
//   전체 모집단이라 작은 반에서도 강사 지도엔 유의미하고, 개별 식별자도 반환하지 않음.
export const MIN_COHORT_RANK_SAMPLE = 5;

// feat-7-040 P1 — 관리자(강사) 시점 공부량 반내 위치. ★getCohortStudyPercentile 과 모델이 다르다:
//   - getCohortStudyPercentile = B(pool) 동의 대칭(요청자·표본 모두 B동의) — 학생 본인 시점.
//   - 이 함수 = 약관 제7조(지도 목적 열람) 근거 → B동의 무관 + 표본 = 반 전체(synthetic 제외).
//     강사는 제7조상 담당 수강생 전원의 공부량을 이미 볼 수 있으므로, 그 집계 랭킹 노출도 제7조 범위.
//   - 호출부(admin-student-detail loader)가 자기 반 owner 게이트를 선행(횡적 누출 방지).
//   - 반환은 집계값(구간·상위%·표본수)만 — 개별 식별자/개별 학습시간 미반환(격리).
export async function getStudentCohortStudyRank(
  profileId: string,
): Promise<CohortStudyBand> {
  const admin = adminClient as SupabaseClient<Database>;

  // 1) 대상 학생의 코호트(들) — 첫(대개 유일) 코호트를 모집단으로.
  const { data: myRows } = await admin
    .from("cohort_members")
    .select("cohort_id, cohorts!inner(deleted_at)")
    .eq("profile_id", profileId);
  const cohortIds = (myRows ?? [])
    .filter((r) => !r.cohorts?.deleted_at)
    .map((r) => r.cohort_id);
  if (cohortIds.length === 0) return { state: "off" };
  const cohortId = cohortIds[0];

  // 2) 반 전체 멤버(synthetic 제외). ★B동의 필터 없음 — 제7조 근거.
  const { data: members } = await admin
    .from("cohort_members")
    .select("profile_id, profiles!cohort_members_profile_id_fkey(is_synthetic)")
    .eq("cohort_id", cohortId);
  const memberIds = (members ?? [])
    .filter((m) => m.profiles?.is_synthetic !== true)
    .map((m) => m.profile_id);
  if (!memberIds.includes(profileId)) return { state: "off" };
  if (memberIds.length < MIN_COHORT_RANK_SAMPLE) {
    return {
      state: "locked",
      current: memberIds.length,
      needed: MIN_COHORT_RANK_SAMPLE,
    };
  }

  // 3) 반 전체 학습시간 합 → 대상의 상위 % + 구간.
  const msByUser = await sumTimeMsByUser(admin, memberIds);
  const myMs = msByUser.get(profileId) ?? 0;
  const peerMs = [...msByUser.entries()]
    .filter(([id]) => id !== profileId)
    .map(([, ms]) => ms);
  const topPercent = computeTopPercent(myMs, peerMs);
  return {
    state: "ok",
    band: bandForTopPercent(topPercent).label,
    topPercent,
    sampleSize: memberIds.length,
  };
}
