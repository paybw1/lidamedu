// 합격자 비교 기능 활성 게이트.
// 1년차 플랫폼에는 실 합격자가 0명이므로 게이트는 OFF 상태로 시작한다.
// 내년 합격자 발표 후 실(비합성) 동의 합격자가 PASSER_BENCHMARK_MIN_SAMPLE 명
// 이상으로 누적되면 코드 배포 없이 자동 ON 으로 전환된다.
//
// 사용처:
//  - dashboard.tsx · goals.tsx · study/srs.tsx · passer-trend.tsx 의 loader 가
//    isPasserBenchmarkEnabled() 를 호출해 OFF 면 합격자 풀 호출 자체를 skip.
//  - recommendations.ts 는 benchmark 가 null 이면 합격 기준 기반 액션으로
//    자동 재구성 (별도 게이트 불필요).
//
// 임계값 출처: pass-criteria.ts PASSER_BENCHMARK_MIN_SAMPLE.
// 향후 app_settings 키(`passer_benchmark_min_sample`) 로 운영자 조정 가능.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import {
  PASSER_BENCHMARK_MIN_SAMPLE,
  type ExamRound,
} from "./pass-criteria";

export interface PasserBenchmarkGate {
  enabled: boolean;
  /** 실(비합성) 동의 합격자 수. */
  realSampleSize: number;
  /** 활성화까지 필요한 추가 표본 수. */
  needed: number;
  /** 게이트 임계값. */
  minSample: number;
  /** OFF 사유 — 학생 화면에 노출용. */
  offReason: string | null;
}

/**
 * 합격자 비교 기능 활성 여부.
 * @param round  null = 전체 합격자 풀 기준. 지정 시 해당 차수만 카운트.
 * @param year   null = 모든 연도. 지정 시 해당 연도만.
 */
export async function isPasserBenchmarkEnabled(
  round: ExamRound | null = null,
  year: number | null = null,
): Promise<PasserBenchmarkGate> {
  const admin = adminClient as SupabaseClient<Database>;

  let q = admin
    .from("exam_results")
    .select(
      "user_id, profiles!exam_results_user_id_fkey(pool_consent_at, is_synthetic, role)",
    )
    .eq("status", "passed");
  if (round) q = q.eq("exam_round", round);
  if (year) q = q.eq("exam_year", year);

  const { data, error } = await q.limit(2000);
  if (error) {
    // fail-closed — 에러 시 게이트 OFF 로 안전 측면.
    return {
      enabled: false,
      realSampleSize: 0,
      needed: PASSER_BENCHMARK_MIN_SAMPLE,
      minSample: PASSER_BENCHMARK_MIN_SAMPLE,
      offReason: "합격자 표본 조회 실패",
    };
  }

  // 운영자/강사의 자가신고 합격은 실 합격자 풀에서 제외 — 학생만 카운트.
  const realSampleSize = (data ?? []).filter(
    (r) =>
      r.profiles?.pool_consent_at !== null &&
      r.profiles?.is_synthetic !== true &&
      r.profiles?.role === "student",
  ).length;

  const enabled = realSampleSize >= PASSER_BENCHMARK_MIN_SAMPLE;
  return {
    enabled,
    realSampleSize,
    needed: Math.max(0, PASSER_BENCHMARK_MIN_SAMPLE - realSampleSize),
    minSample: PASSER_BENCHMARK_MIN_SAMPLE,
    offReason: enabled
      ? null
      : `실 합격자 데이터 누적 후 제공 (현재 ${realSampleSize}/${PASSER_BENCHMARK_MIN_SAMPLE})`,
  };
}
