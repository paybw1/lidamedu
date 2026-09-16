// feat-11-002 — 재생 판정 (서버 권위). 설계 §3.5.
// 판정 순서: 로그인(맛보기 예외) → 수강권 → 기간(시작일·만료일) → [M3] 배수 → [M3] 기기.
//
// ★M1 승인 단서 1 — M4 결제 오픈 전 반드시 전부 ON (M4 오픈 체크리스트 1번 항목):
//   ENFORCE_MULTIPLIER: M3 에서 구현·활성화 완료(watch_ledger 잔여 판정).
//   ENFORCE_DEVICE: 판정 로직 구현됨 — [벤더] 플레이어 기기 fingerprint 확정 후 ON.
//     ★env 구동 — 벤더 확정+플레이어가 deviceFingerprint 를 전달하도록 배선한 뒤,
//     코드 배포 없이 Vercel 환경변수 `ENFORCE_DEVICE=true` 로 즉시 켠다.
//     (fingerprint 없이 켜도 ensureDeviceForPlayback 이 통과 처리하므로 안전하나 실효 없음
//     — 반드시 플레이어 fingerprint 배선 후 켤 것.)
// ★시간(배수) 제한 폐지(2026-07-22). ★재생 제한 재정의(feat-11-008 P6, 2026-08-07 원장 확정):
//   강의 단위 courses.max_plays(null=무제한, 기본 2)를 각 회차에 동일 적용하고,
//   차감은 실제 학습시간 비례 — 학습초 >= max_plays × 회차 길이면 차단("하루 1회" 규칙 폐지).
const ENFORCE_MULTIPLIER = false;
const ENFORCE_DEVICE = process.env.ENFORCE_DEVICE === "true";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  detectDeviceKind,
  ensureDeviceForPlayback,
} from "~/features/lms/devices.server";
import { buildKollusWebTokenUrl } from "~/features/lms/lib/kollus-token.server";
import type { PlaybackDenyReason } from "~/features/lms/lib/lock-notice";
import { getPlayLimitForLesson } from "~/features/lms/play-limit.server";
import { getRemainingSeconds } from "~/features/lms/watch.server";

const GRANT_TTL_MINUTES = 10;
// 재생 URL(JWT expt) 유효기간 — 긴 강의도 끊기지 않게 구간 보고 창(6h)에 맞춘다.
const PLAY_TOKEN_TTL_SECONDS = 6 * 3600;

// 사유 타입·문구는 **서버 밖**(lib/lock-notice.ts)에 있다 — 강의실 목록과 재생 화면이
// 같은 말을 해야 하는데, 화면이 서버 모듈을 import 하면 build 가 깨진다(feat-11-012 P6-b).
export type { PlaybackDenyReason } from "~/features/lms/lib/lock-notice";
export { PLAYBACK_DENY_MESSAGE } from "~/features/lms/lib/lock-notice";

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
    // ★course_lessons.max_plays 는 빼 뒀다 — 판정 권위는 courses.max_plays 다(feat-11-008 P6).
    //   회차 쪽 컬럼은 쓰기 경로가 0개인 죽은 컬럼이라 select 에 남겨 두면 오해를 부른다.
    .select("lesson_id, course_id, is_preview, is_published, deleted_at")
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
  // (구) 세션 차감 플래그 — 시간 비례 판정으로 대체돼 항상 false. grant 이력 컬럼 호환용.
  const countsAsPlay = false;

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
    // 3) 수강권 — active + 기간 내(시작일 경과·만료 전) + 회차 차단 아님
    // ★starts_at 도 본다(feat-11-013 P3-b) — 정규 유형의 개강 전 결제는 starts_at 이 미래다.
    //   expires_at 만 보면 개강 전에 전 회차를 볼 수 있고, 그 시청은 환불 계산의 이용이력 창
    //   (usage_starts_at = 개강일부터) 밖이라 「유료 이용이력 없음」으로 전액환불된다.
    const { data: enrollments } = await adminClient
      .from("enrollments")
      .select("enrollment_id, status, starts_at, expires_at, blocked_lesson_ids")
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
        Date.parse(e.starts_at) <= now &&
        Date.parse(e.expires_at) > now &&
        !(e.blocked_lesson_ids ?? []).includes(input.lessonId),
    );
    if (!usable) {
      const active = candidates.filter((e) => e.status === "active");
      if (active.length > 0 && active.every((e) => Date.parse(e.expires_at) <= now)) {
        return { ok: false, reason: "expired" };
      }
      if (active.length > 0 && active.every((e) => Date.parse(e.starts_at) > now)) {
        return { ok: false, reason: "not_started" };
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

    // 4) 재생 제한 — feat-11-008 P6(원장 확정 2026-08-07): "하루 1회 차감" 폐지.
    //   강의(에디션) 단위 max_plays(null=무제한, 기본 2)를 소속 각 회차에 동일 적용하고,
    //   차감은 횟수가 아니라 **실제 학습시간 비례** — 회차 허용량 = max_plays × 강의 길이(초).
    //   누적 학습시간(watch_ledger)이 허용량 이상이면 차단. 길이 미확인 회차는 fail-open.
    //   ★소비량은 watch_ledger 기준 — 관리자 '사용량 초기화'(reset 행)가 그대로 반영된다.
    //   ★판정은 play-limit.server 하나로 모았다(feat-11-012 P6-a) — 강의실 목록·하트비트
    //   차감 가드·관리자 CS 조회가 같은 함수를 읽는다. grant 는 이력으로만 남긴다.
    {
      const limit = await getPlayLimitForLesson({
        enrollmentId,
        courseId: lesson.course_id,
        lessonId: input.lessonId,
        durationSeconds: video.duration_seconds ?? 0,
      });
      if (limit.exhausted) {
        return { ok: false, reason: "play_limit_exhausted" };
      }
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
