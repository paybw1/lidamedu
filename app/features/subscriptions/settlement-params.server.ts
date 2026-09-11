// feat-8-031 — 정산 파라미터: PG 수수료율(전체 1개, settlement_settings) + 강사별 세금 유형
// (instructor_settlement_profiles). 두 표 모두 RLS 정책 없음 → adminClient 전용, 호출부 manager+ 검증 필수.
// 값은 정산 생성 때 정산서에 스냅샷으로 복사된다(확정 후 파라미터를 바꿔도 지급 근거 불변).
import adminClient from "~/core/lib/supa-admin-client.server";

import {
  DEFAULT_TAX_PROFILE,
  type TaxProfile,
  type TaxType,
} from "./settlement-engine";

export interface SettlementParams {
  feeRateBp: number;
  /** instructorId → 세금 유형. 없으면 DEFAULT_TAX_PROFILE. */
  taxProfiles: Map<string, TaxProfile>;
}

export async function getSettlementParams(): Promise<SettlementParams> {
  const [settingRes, profRes] = await Promise.all([
    adminClient
      .from("settlement_settings")
      .select("pg_fee_rate_bp")
      .eq("id", 1)
      .maybeSingle(),
    adminClient
      .from("instructor_settlement_profiles")
      .select("instructor_id, tax_type, tax_rate_bp")
      .limit(1000),
  ]);
  if (settingRes.error) throw settingRes.error;
  if (profRes.error) throw profRes.error;
  return {
    feeRateBp: settingRes.data?.pg_fee_rate_bp ?? 0,
    taxProfiles: new Map(
      (profRes.data ?? []).map((r) => [
        r.instructor_id,
        { taxType: r.tax_type as TaxType, taxRateBp: r.tax_rate_bp },
      ]),
    ),
  };
}

export function taxProfileFor(
  params: SettlementParams,
  instructorId: string,
): TaxProfile {
  return params.taxProfiles.get(instructorId) ?? DEFAULT_TAX_PROFILE;
}

export async function setPgFeeRate(
  feeRateBp: number,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(feeRateBp) || feeRateBp < 0 || feeRateBp > 10000)
    return { ok: false, error: "수수료율은 0~100% 범위" };
  const { error } = await adminClient.from("settlement_settings").upsert({
    id: 1,
    pg_fee_rate_bp: feeRateBp,
    updated_at: new Date().toISOString(),
    updated_by: actorId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface TaxProfileRow {
  instructorId: string;
  instructorName: string | null;
  taxType: TaxType;
  taxRateBp: number;
  memo: string | null;
  updatedAt: string;
}

export async function listTaxProfiles(): Promise<TaxProfileRow[]> {
  const { data, error } = await adminClient
    .from("instructor_settlement_profiles")
    .select(
      "instructor_id, tax_type, tax_rate_bp, memo, updated_at, profiles!instructor_id(name)",
    )
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    instructorId: r.instructor_id,
    instructorName: r.profiles?.name ?? null,
    taxType: r.tax_type as TaxType,
    taxRateBp: r.tax_rate_bp,
    memo: r.memo,
    updatedAt: r.updated_at,
  }));
}

export async function upsertTaxProfile(input: {
  instructorId: string;
  taxType: TaxType;
  taxRateBp: number;
  memo: string | null;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    !Number.isInteger(input.taxRateBp) ||
    input.taxRateBp < 0 ||
    input.taxRateBp > 10000
  )
    return { ok: false, error: "세율은 0~100% 범위" };
  const { error } = await adminClient
    .from("instructor_settlement_profiles")
    .upsert({
      instructor_id: input.instructorId,
      tax_type: input.taxType,
      tax_rate_bp: input.taxRateBp,
      memo: input.memo,
      updated_at: new Date().toISOString(),
      updated_by: input.actorId,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
