// feat-11-002 — 재생 판정 (서버 권위). 설계 §3.5.
// 판정 순서: 로그인(맛보기 예외) → 수강권 → 기간 → [M3] 배수 → [M3] 기기.
//
// ★M1 승인 단서 1 — M4 결제 오픈 전 반드시 전부 ON (M4 오픈 체크리스트 1번 항목):
//   ENFORCE_MULTIPLIER: M3 에서 구현·활성화 완료(watch_ledger 잔여 판정).
//   ENFORCE_DEVICE: 판정 로직 구현됨 — [벤더] 플레이어 기기 fingerprint 확정 후 ON.
//     ★env 구동 — 벤더 확정+플레이어가 deviceFingerprint 를 전달하도록 배선한 뒤,
//     코드 배포 없이 Vercel 환경변수 `ENFORCE_DEVICE=true` 로 즉시 켠다.
//     (fingerprint 없이 켜도 ensureDeviceForPlayback 이 통과 처리하므로 안전하나 실효 없음
//     — 반드시 플레이어 fingerprint 배선 후 켤 것.)
// ★시간(배수) 제한 폐지(2026-07-22) — 회차별 재생 "횟수" 제한(course_lessons.max_plays)으로 대체.
//   watch_ledger/used_seconds 추적은 통계용으로 남기되, 재생 차단은 하지 않는다.
const ENFORCE_MULTIPLIER = false;
const ENFORCE_DEVICE = process.env.ENFORCE_DEVICE === "true";
// 재생 "1회" 정의 — 같은 회차의 직전 재생과 이 간격 이상 떨어져 시작하면 새 재생 세션(1회 차감).
//   그 안의 재개·새로고침·이어보기는 같은 세션으로 무차감(재생 토큰 수명과 정합).
const PLAY_SESSION_GAP_MS = 6 * 3600 * 1000;

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  detectDeviceKind,
  ensureDeviceForPlayback,
} from "~/features/lms/devices.server";
import { buildKollusWebTokenUrl } from "~/features/lms/lib/kollus-token.server";
import { getRemainingSeconds } from "~/features/lms/watch.server";

const GRANT_TTL_MINUTES = 10;
// 재생 URL(JWT expt) 유효기간 — 긴 강의도 끊기지 않게 구간 보고 창(6h)에 맞춘다.
const PLAY_TOKEN_TTL_SECONDS = 6 * 3600;

export type PlaybackDenyReason =
  | "login_required"
  | "no_enrollment"
  | "expired"
  | "paused"
  | "lesson_blocked"
  | "not_published"
  | "no_video"
  | "multiplier_exhausted" // (폐지) 시간 제한 — 잔존 호환용
  | "play_limit_exhausted" // 회차별 재생 횟수 소진
  | "device_not_registered"; // M3

export type PlaybackJudgement =
  | {
      ok: true;
      grantId: string;
      expiresAt: string;
      isPreview: boolean;
      // Kollus 웹플레이어 임베드 URL(서버 서명). env 키·mckey 미설정이면 null(=재생 설정 대기).
      playbackUrl: string | null;
      durationSeconds: number; // 하트비트 구간 상한(플레이어 클라이언트용)
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
    .select("lesson_id, course_id, is_preview, is_published, deleted_at, max_plays")
    .eq("lesson_id", input.lessonId)
    .maybeSingle();
  if (!lesson || lesson.deleted_at || !lesson.is_published) {
    return { ok: false, reason: "not_published" };
  }
  const { data: video } = await adminClient
    .from("lesson_videos")
    .select("video_id, drm_provider, drm_video_id, duration_seconds")
    .eq("lesson_id", input.lessonId)
    .eq("is_active", true)
    .maybeSingle();
  if (!video) return { ok: false, reason: "no_video" };

  let enrollmentId: string | null = null;
  let deviceId: string | null = null;
  // 이 재생이 새 세션(1회 차감) 인지 — 학생 정규 재생일 때만 true 가능(맛보기·스태프 무차감).
  let countsAsPlay = false;

  // 운영 스태프(강사·매니저·원장) 여부 — 검수·모니터링 목적으로 수강권·배수·기기
  // 게이트를 면제한다(강의 자료 다운로드 material-download 와 동일 기준). enrollment_id 는
  // null 로 남겨 하트비트가 watch_ledger 차감을 스킵한다(맛보기와 동일 경로).
  const isStaff = input.userId
    ? (await getStaffRole(client, input.userId)) !== null
    : false;

  if (lesson.is_preview) {
    // 맛보기 — 비로그인 허용, 수강권·배수 검사 없음(차감 예외의 근거).
  } else if (isStaff) {
    // 운영 스태프 — 로그인만 확인(위에서 userId 확정), 수강권·배수·기기 게이트 면제.
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

    // 4) 재생 횟수 — 회차별 max_plays. "1회" = 새 재생 세션(직전 재생과 gap 이상).
    //   같은 세션 내 재개/새로고침은 무차감. 소진 후 새 세션 시작만 차단.
    {
      const maxPlays = lesson.max_plays ?? 2;
      const { data: prior } = await adminClient
        .from("playback_grants")
        .select("granted_at, counts_as_play")
        .eq("user_id", input.userId)
        .eq("lesson_id", input.lessonId)
        .order("granted_at", { ascending: false })
        .limit(500);
      const playsUsed = (prior ?? []).filter((g) => g.counts_as_play).length;
      const lastAt = prior?.[0]?.granted_at
        ? Date.parse(prior[0].granted_at)
        : null;
      const isNewSession =
        lastAt == null || now - lastAt > PLAY_SESSION_GAP_MS;
      if (isNewSession && playsUsed >= maxPlays) {
        return { ok: false, reason: "play_limit_exhausted" };
      }
      countsAsPlay = isNewSession;
    }
    // (배수/시간 제한 폐지 — ENFORCE_MULTIPLIER=false)
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
      counts_as_play: countsAsPlay,
    })
    .select("grant_id")
    .single();
  if (error) throw error;

  // 7) Kollus 웹플레이어 재생 URL 서명 — drm_video_id(mckey) + 학생 user id(cuid).
  //    provider 가 kollus 가 아니거나 env 키 미설정이면 null → 화면이 "재생 설정 대기" 안내.
  //    cuid: 로그인 사용자 id, 비로그인(맛보기)은 grant_id 기반 임시 식별.
  const playbackUrl =
    video.drm_provider === "kollus"
      ? buildKollusWebTokenUrl({
          mckey: video.drm_video_id,
          cuid: input.userId ?? `preview-${grant.grant_id}`,
          expireSeconds: PLAY_TOKEN_TTL_SECONDS,
        })
      : null;

  return {
    ok: true,
    grantId: grant.grant_id,
    expiresAt,
    isPreview: lesson.is_preview,
    playbackUrl,
    durationSeconds: video.duration_seconds,
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
  play_limit_exhausted: "이 회차의 재생 가능 횟수를 모두 사용했습니다.",
  device_not_registered: "등록되지 않은 기기입니다. 기기 관리에서 등록해 주세요.",
};
