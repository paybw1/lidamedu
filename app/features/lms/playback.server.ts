// feat-11-002 — 재생 판정 (서버 권위). 설계 §3.5.
// 판정 순서: 로그인(맛보기 예외) → 수강권 → 기간 → [M3] 배수 → [M3] 기기.
//
// ★M1 승인 단서 1 — M4 결제 오픈 전 반드시 전부 ON (M4 오픈 체크리스트 1번 항목):
//   ENFORCE_MULTIPLIER: M3 에서 구현·활성화 완료(watch_ledger 잔여 판정).
//   ENFORCE_DEVICE: 판정 로직 구현됨 — [벤더] 플레이어 기기 fingerprint 확정 후 ON
//   (fingerprint 없이 켜면 기기 특정이 불가해 전원 차단됨).
const ENFORCE_MULTIPLIER = true;
const ENFORCE_DEVICE = false; // [벤더] fingerprint 확정 시 ON — M4 오픈 체크리스트

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  detectDeviceKind,
  ensureDeviceForPlayback,
} from "~/features/lms/devices.server";
import { getRemainingSeconds } from "~/features/lms/watch.server";

const GRANT_TTL_MINUTES = 10;

export type PlaybackDenyReason =
  | "login_required"
  | "no_enrollment"
  | "expired"
  | "paused"
  | "lesson_blocked"
  | "not_published"
  | "no_video"
  | "multiplier_exhausted" // M3
  | "device_not_registered"; // M3

export type PlaybackJudgement =
  | {
      ok: true;
      grantId: string;
      expiresAt: string;
      isPreview: boolean;
      // [벤더] DRM 플레이어 임베드 파라미터는 벤더 확정 후 이 판정 결과로 서버에서 교환.
    }
  | { ok: false; reason: PlaybackDenyReason };

export async function requestPlaybackGrant(
  client: SupabaseClient<Database>,
  input: {
    lessonId: string;
    userId: string | null; // null = 비로그인
    clientIp?: string | null;
    userAgent?: string | null;
    deviceFingerprint?: string | null; // [벤더] 플레이어 기기 ID — 확정 전 null
  },
): Promise<PlaybackJudgement> {
  // 1) 회차·영상 확인 (adminClient — drm 필드는 학생 RLS 로 안 보임)
  const { data: lesson } = await adminClient
    .from("course_lessons")
    .select("lesson_id, course_id, is_preview, is_published, deleted_at")
    .eq("lesson_id", input.lessonId)
    .maybeSingle();
  if (!lesson || lesson.deleted_at || !lesson.is_published) {
    return { ok: false, reason: "not_published" };
  }
  const { data: video } = await adminClient
    .from("lesson_videos")
    .select("video_id")
    .eq("lesson_id", input.lessonId)
    .eq("is_active", true)
    .maybeSingle();
  if (!video) return { ok: false, reason: "no_video" };

  let enrollmentId: string | null = null;
  let deviceId: string | null = null;

  if (lesson.is_preview) {
    // 맛보기 — 비로그인 허용, 수강권·배수 검사 없음(차감 예외의 근거).
  } else {
    // 2) 로그인
    if (!input.userId) return { ok: false, reason: "login_required" };
    // 3) 수강권 — active + 기간 내 + 회차 차단 아님
    const { data: enrollments } = await adminClient
      .from("enrollments")
      .select("enrollment_id, status, expires_at, blocked_lesson_ids")
      .eq("user_id", input.userId)
      .eq("course_id", lesson.course_id)
      .in("status", ["active", "paused"]);
    const candidates = enrollments ?? [];
    if (candidates.length === 0) return { ok: false, reason: "no_enrollment" };
    if (candidates.every((e) => e.status === "paused")) {
      return { ok: false, reason: "paused" };
    }
    const now = Date.now();
    const usable = candidates.find(
      (e) =>
        e.status === "active" &&
        Date.parse(e.expires_at) > now &&
        !(e.blocked_lesson_ids ?? []).includes(input.lessonId),
    );
    if (!usable) {
      const active = candidates.filter((e) => e.status === "active");
      if (active.length > 0 && active.every((e) => Date.parse(e.expires_at) <= now)) {
        return { ok: false, reason: "expired" };
      }
      if (
        active.length > 0 &&
        active.every((e) => (e.blocked_lesson_ids ?? []).includes(input.lessonId))
      ) {
        return { ok: false, reason: "lesson_blocked" };
      }
      return { ok: false, reason: "no_enrollment" };
    }
    enrollmentId = usable.enrollment_id;

    // 4) 배수 — watch_ledger 잔여(파생 뷰). 잔여 null=배수 미적용(무제한).
    if (ENFORCE_MULTIPLIER) {
      const remaining = await getRemainingSeconds(enrollmentId);
      if (remaining != null && remaining <= 0) {
        return { ok: false, reason: "multiplier_exhausted" };
      }
    }
    // 5) 기기 — fingerprint 대조·빈 슬롯 자동 등록(정책은 plan_policies).
    if (ENFORCE_DEVICE) {
      let maxPc: number | null = null;
      let maxMobile: number | null = null;
      const { data: enr } = await adminClient
        .from("enrollments")
        .select("plan_id")
        .eq("enrollment_id", enrollmentId)
        .maybeSingle();
      if (enr?.plan_id) {
        const { data: policy } = await adminClient
          .from("plan_policies")
          .select("max_devices_pc, max_devices_mobile")
          .eq("plan_id", enr.plan_id)
          .maybeSingle();
        maxPc = policy?.max_devices_pc ?? null;
        maxMobile = policy?.max_devices_mobile ?? null;
      }
      const device = await ensureDeviceForPlayback({
        userId: input.userId,
        kind: detectDeviceKind(input.userAgent ?? null),
        fingerprint: input.deviceFingerprint ?? null,
        maxPc,
        maxMobile,
      });
      if (!device.ok) return { ok: false, reason: "device_not_registered" };
      deviceId = device.deviceId;
    }
    void client; // 중복 로그인 제한은 기존 단일 세션 미들웨어가 요청 레벨에서 이미 차단
  }

  // 6) grant 발급 — 클라이언트에는 grant_id(불투명)만. drm_video_id 비노출.
  const expiresAt = new Date(Date.now() + GRANT_TTL_MINUTES * 60_000).toISOString();
  const { data: grant, error } = await adminClient
    .from("playback_grants")
    .insert({
      user_id: input.userId,
      enrollment_id: enrollmentId,
      lesson_id: input.lessonId,
      video_id: video.video_id,
      device_id: deviceId,
      expires_at: expiresAt,
      client_ip: input.clientIp ?? null,
      user_agent: input.userAgent?.slice(0, 500) ?? null,
    })
    .select("grant_id")
    .single();
  if (error) throw error;
  return {
    ok: true,
    grantId: grant.grant_id,
    expiresAt,
    isPreview: lesson.is_preview,
  };
}

export const PLAYBACK_DENY_MESSAGE: Record<PlaybackDenyReason, string> = {
  login_required: "로그인 후 시청할 수 있습니다.",
  no_enrollment: "수강권이 없습니다. 수강 신청 후 이용해 주세요.",
  expired: "수강 기간이 만료되었습니다.",
  paused: "수강권이 일시정지 상태입니다. 재개 후 시청할 수 있습니다.",
  lesson_blocked: "이 회차는 재생이 제한되어 있습니다. 문의해 주세요.",
  not_published: "준비 중인 강의입니다.",
  no_video: "영상이 아직 등록되지 않았습니다.",
  multiplier_exhausted: "시청 가능 시간을 모두 사용했습니다.",
  device_not_registered: "등록되지 않은 기기입니다. 기기 관리에서 등록해 주세요.",
};
