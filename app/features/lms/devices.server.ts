// feat-11-003 — 기기 등록·초기화 (설계 §3.7).
// 세션 축(기존 단일 세션)과 독립 — 기기 축은 재생 판정에서만 검사.
// [벤더] fingerprint 확정 전에는 UA 기반 kind 만 기록(판정 강제는 playback ENFORCE_DEVICE 플래그).

import adminClient from "~/core/lib/supa-admin-client.server";

const DEFAULT_MAX_PC = 1;
const DEFAULT_MAX_MOBILE = 1;
// 본인 초기화 월 제한(★★★) — 관리자 강제 초기화는 제한 무시.
const SELF_RESET_MONTHLY_LIMIT = 1;

export type DeviceKind = "pc" | "mobile" | "tablet";

export function detectDeviceKind(userAgent: string | null): DeviceKind {
  const ua = (userAgent ?? "").toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|android|iphone/.test(ua)) return "mobile";
  return "pc";
}

/**
 * 재생 시 기기 확보 — fingerprint 가 있으면 등록 기기 대조, 빈 슬롯이면 자동 등록.
 * 반환: 사용할 device_id, 또는 슬롯 초과 거부.
 */
export async function ensureDeviceForPlayback(input: {
  userId: string;
  kind: DeviceKind;
  fingerprint: string | null; // [벤더] 확정 전 null — null 이면 kind 슬롯만 검사 없이 통과 기록
  deviceName?: string | null;
  maxPc?: number | null;
  maxMobile?: number | null;
}): Promise<{ ok: true; deviceId: string | null } | { ok: false }> {
  // fingerprint 없으면(벤더 미확정) 기기 특정 불가 — 등록·강제 없이 통과(플래그 OFF 상태와 짝).
  if (!input.fingerprint) return { ok: true, deviceId: null };

  const { data: existing } = await adminClient
    .from("user_devices")
    .select("device_id, kind")
    .eq("user_id", input.userId)
    .eq("device_fingerprint", input.fingerprint)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing) {
    await adminClient
      .from("user_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("device_id", existing.device_id);
    return { ok: true, deviceId: existing.device_id };
  }

  // 빈 슬롯 검사 — pc 슬롯 / mobile+tablet 슬롯(모바일 계열 합산)
  const { data: devices } = await adminClient
    .from("user_devices")
    .select("device_id, kind")
    .eq("user_id", input.userId)
    .is("revoked_at", null);
  const pcCount = (devices ?? []).filter((d) => d.kind === "pc").length;
  const mobileCount = (devices ?? []).filter((d) => d.kind !== "pc").length;
  const maxPc = input.maxPc ?? DEFAULT_MAX_PC;
  const maxMobile = input.maxMobile ?? DEFAULT_MAX_MOBILE;
  const slotFree =
    input.kind === "pc" ? pcCount < maxPc : mobileCount < maxMobile;
  if (!slotFree) return { ok: false };

  const { data: created, error } = await adminClient
    .from("user_devices")
    .insert({
      user_id: input.userId,
      kind: input.kind,
      device_fingerprint: input.fingerprint,
      device_name: input.deviceName ?? null,
    })
    .select("device_id")
    .single();
  if (error) throw error;
  return { ok: true, deviceId: created.device_id };
}

/** 초기화(해제) — actor 본인이면 월 제한 검사, staff 는 무제한(강제 초기화). */
export async function resetDevice(input: {
  deviceId: string;
  actorId: string;
  actorIsStaff: boolean;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: device } = await adminClient
    .from("user_devices")
    .select("device_id, user_id, revoked_at")
    .eq("device_id", input.deviceId)
    .maybeSingle();
  if (!device || device.revoked_at) return { ok: false, error: "기기를 찾을 수 없습니다." };
  const isSelf = device.user_id === input.actorId;
  if (!isSelf && !input.actorIsStaff) return { ok: false, error: "권한이 없습니다." };

  if (isSelf && !input.actorIsStaff) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { count } = await adminClient
      .from("device_reset_logs")
      .select("log_id", { count: "exact", head: true })
      .eq("user_id", device.user_id)
      .eq("actor_id", input.actorId)
      .gte("created_at", monthStart.toISOString());
    if ((count ?? 0) >= SELF_RESET_MONTHLY_LIMIT) {
      return {
        ok: false,
        error: `기기 변경은 월 ${SELF_RESET_MONTHLY_LIMIT}회까지 가능합니다. 필요 시 고객센터로 문의해 주세요.`,
      };
    }
  }

  const { error } = await adminClient
    .from("user_devices")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: isSelf ? "self" : "admin",
    })
    .eq("device_id", input.deviceId);
  if (error) return { ok: false, error: error.message };
  await adminClient.from("device_reset_logs").insert({
    user_id: device.user_id,
    device_id: input.deviceId,
    actor_id: input.actorId,
    reason: input.reason,
  });
  return { ok: true };
}
