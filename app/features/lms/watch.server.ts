// feat-11-003 — 시청 구간 보고(하트비트)·배수 회계·이어보기·진도 파생. 설계 §3.6·§4.
// 전 함수 서버 전용. 이벤트/원장 쓰기는 adminClient — 학생 RLS 에 쓰기 정책 없음(서버 권위).
// ★append-only 규약: watch_events/watch_ledger 에 UPDATE/DELETE 경로를 만들지 않는다.

import adminClient from "~/core/lib/supa-admin-client.server";

// 하트비트 주기 15~30초 × 배속 상한 2배 + 여유 — 1회 보고 길이 상한(§4.3).
const MAX_REPORT_SECONDS = 120;
// grant 는 재생 시작 판정용(수 분 만료)이지만 구간 보고는 재생이 이어지는 동안 허용 —
// granted_at 기준 이 시간 안에서만 보고 접수(넘으면 플레이어가 grant 재요청).
const GRANT_REPORT_WINDOW_HOURS = 6;

export type HeartbeatResult =
  | { ok: true; duplicated: boolean; remainingSeconds: number | null }
  | {
      ok: false;
      reason:
        | "grant_not_found"
        | "grant_window_closed"
        | "not_owner"
        | "invalid_interval";
    };

/** 시청 구간 보고 — 검증 → watch_events + (차감 대상이면) watch_ledger debit + 이어보기 upsert. */
export async function reportWatchInterval(input: {
  grantId: string;
  userId: string | null;
  clientSeq: number;
  fromSeconds: number;
  toSeconds: number;
  positionSeconds?: number | null;
}): Promise<HeartbeatResult> {
  const { data: grant } = await adminClient
    .from("playback_grants")
    .select("grant_id, user_id, enrollment_id, lesson_id, video_id, granted_at")
    .eq("grant_id", input.grantId)
    .maybeSingle();
  if (!grant) return { ok: false, reason: "grant_not_found" };
  // 소유 검증 — 로그인 grant 는 본인만, 비로그인(맛보기) grant 는 비로그인 보고만.
  if ((grant.user_id ?? null) !== (input.userId ?? null)) {
    return { ok: false, reason: "not_owner" };
  }
  const windowMs = GRANT_REPORT_WINDOW_HOURS * 3600_000;
  if (Date.now() - Date.parse(grant.granted_at) > windowMs) {
    return { ok: false, reason: "grant_window_closed" };
  }
  // 구간 정합: 범위·길이 상한·영상 길이 초과 금지
  const { data: video } = await adminClient
    .from("lesson_videos")
    .select("duration_seconds")
    .eq("video_id", grant.video_id)
    .maybeSingle();
  const duration = video?.duration_seconds ?? 0;
  const len = input.toSeconds - input.fromSeconds;
  if (
    input.fromSeconds < 0 ||
    len <= 0 ||
    len > MAX_REPORT_SECONDS ||
    input.toSeconds > duration + 5 // 인코딩 오차 여유
  ) {
    return { ok: false, reason: "invalid_interval" };
  }

  // 멱등 insert — (grant_id, client_seq) unique. 중복 재전송은 차감 없이 ok.
  const { data: event, error: insErr } = await adminClient
    .from("watch_events")
    .insert({
      grant_id: grant.grant_id,
      user_id: grant.user_id,
      enrollment_id: grant.enrollment_id,
      lesson_id: grant.lesson_id,
      video_id: grant.video_id,
      from_seconds: input.fromSeconds,
      to_seconds: input.toSeconds,
      client_seq: input.clientSeq,
    })
    .select("event_id")
    .single();
  if (insErr) {
    if (insErr.code === "23505") {
      return {
        ok: true,
        duplicated: true,
        remainingSeconds: await getRemainingSeconds(grant.enrollment_id),
      };
    }
    throw insErr;
  }

  // 차감 — 맛보기·무료(enrollment_id null)는 예외(§4.3-4). 이벤트는 남고 원장만 스킵.
  if (grant.enrollment_id) {
    const { error: ledgerErr } = await adminClient.from("watch_ledger").insert({
      enrollment_id: grant.enrollment_id,
      lesson_id: grant.lesson_id,
      video_id: grant.video_id,
      kind: "debit",
      seconds: len,
      source_event_id: event.event_id,
    });
    if (ledgerErr) {
      // 원장 실패는 심각 — 이벤트는 남았으므로 사후 복구 가능. 로그 후 전파.
      console.error("[lms/watch] ledger debit failed:", ledgerErr.message);
      throw ledgerErr;
    }
  }

  // 이어보기 upsert (맛보기 포함 — 로그인 사용자만)
  if (grant.user_id && input.positionSeconds != null && input.positionSeconds >= 0) {
    await adminClient.from("watch_positions").upsert(
      {
        user_id: grant.user_id,
        lesson_id: grant.lesson_id,
        video_id: grant.video_id,
        position_seconds: Math.min(input.positionSeconds, duration),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lesson_id" },
    );
  }

  return {
    ok: true,
    duplicated: false,
    remainingSeconds: await getRemainingSeconds(grant.enrollment_id),
  };
}

/** 이어보기 위치(초). 기록 없으면 0. (회차 뷰어 진입 시 안내·이어보기용) */
export async function getResumePosition(
  userId: string,
  lessonId: string,
): Promise<number> {
  const { data } = await adminClient
    .from("watch_positions")
    .select("position_seconds")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  return data?.position_seconds ?? 0;
}

/** 잔여 시청량(초). null = 배수 미적용(무제한) 또는 enrollment 없음(맛보기). */
export async function getRemainingSeconds(
  enrollmentId: string | null,
): Promise<number | null> {
  if (!enrollmentId) return null;
  const { data } = await adminClient
    .from("v_enrollment_watch_balance")
    .select("remaining_seconds")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  return data?.remaining_seconds ?? null;
}

// ── 관리자 회계 조치 (§4.4) — credit(복구)/reset(초기화)/adjust(모수 조정) ──

export async function insertLedgerAdjustment(input: {
  enrollmentId: string;
  kind: "credit" | "adjust" | "reset";
  seconds: number; // credit/reset 은 사용량을 줄이는 음수, adjust 는 부호 자유
  lessonId?: string | null;
  reason: string;
  actorId: string;
}): Promise<void> {
  const { error } = await adminClient.from("watch_ledger").insert({
    enrollment_id: input.enrollmentId,
    lesson_id: input.lessonId ?? null,
    kind: input.kind,
    seconds: input.seconds,
    reason: input.reason,
    actor_id: input.actorId,
  });
  if (error) throw error;
}

/** 관리자 초기화 — 현재 사용량 전체를 상쇄하는 reset 행 1개(§4.4). 사용량 0 이면 no-op. */
export async function resetWatchUsage(input: {
  enrollmentId: string;
  reason: string;
  actorId: string;
}): Promise<{ offsetSeconds: number }> {
  const { data } = await adminClient
    .from("v_enrollment_watch_balance")
    .select("used_seconds")
    .eq("enrollment_id", input.enrollmentId)
    .maybeSingle();
  const used = data?.used_seconds ?? 0;
  if (used === 0) return { offsetSeconds: 0 };
  await insertLedgerAdjustment({
    enrollmentId: input.enrollmentId,
    kind: "reset",
    seconds: -used,
    reason: input.reason,
    actorId: input.actorId,
  });
  return { offsetSeconds: used };
}

// ── 진도 파생 (§3.6) — 구간 union 병합. 소비: 학생 수강 화면(M4)·학습현황 연계 ──

export interface LessonProgress {
  lessonId: string;
  watchedSeconds: number; // 병합(중복 제외) 시청 길이
  durationSeconds: number;
  progressRatio: number; // 0~1
  completed: boolean;
}

const COMPLETE_THRESHOLD = 0.9; // 완강 판정 기본값 — 콘텐츠에 completion_threshold 없을 때

export async function getLessonProgressForUser(
  userId: string,
  lessonIds: string[],
): Promise<Map<string, LessonProgress>> {
  const out = new Map<string, LessonProgress>();
  if (lessonIds.length === 0) return out;
  // active 영상 길이 + 완강 인정 기준(콘텐츠별 — feat-11-006. content_id 없으면 기본값)
  const durByLesson = new Map<string, number>();
  const thresholdByLesson = new Map<string, number>();
  for (let i = 0; i < lessonIds.length; i += 150) {
    const { data: vids } = await adminClient
      .from("lesson_videos")
      .select("lesson_id, duration_seconds, content:video_contents(completion_threshold)")
      .in("lesson_id", lessonIds.slice(i, i + 150))
      .eq("is_active", true);
    for (const v of vids ?? []) {
      durByLesson.set(v.lesson_id, v.duration_seconds);
      const content = v.content as { completion_threshold: number } | null;
      thresholdByLesson.set(
        v.lesson_id,
        content ? Number(content.completion_threshold) : COMPLETE_THRESHOLD,
      );
    }
  }
  // 구간 수집 → union 병합
  const intervals = new Map<string, Array<[number, number]>>();
  for (let i = 0; i < lessonIds.length; i += 150) {
    const { data: events } = await adminClient
      .from("watch_events")
      .select("lesson_id, from_seconds, to_seconds")
      .eq("user_id", userId)
      .in("lesson_id", lessonIds.slice(i, i + 150))
      .limit(20000);
    for (const e of events ?? []) {
      const arr = intervals.get(e.lesson_id) ?? [];
      arr.push([e.from_seconds, e.to_seconds]);
      intervals.set(e.lesson_id, arr);
    }
  }

  // feat-7-046 — 관리자 수동 완료 override(lesson_completions). 완료를 '추가'만 한다.
  const manualComplete = new Set<string>();
  for (let i = 0; i < lessonIds.length; i += 150) {
    const { data: mc } = await adminClient
      .from("lesson_completions")
      .select("lesson_id")
      .eq("user_id", userId)
      .in("lesson_id", lessonIds.slice(i, i + 150));
    for (const r of mc ?? []) manualComplete.add(r.lesson_id);
  }
  for (const lessonId of lessonIds) {
    const duration = durByLesson.get(lessonId) ?? 0;
    const arr = (intervals.get(lessonId) ?? []).sort((a, b) => a[0] - b[0]);
    let watched = 0;
    let curFrom = -1;
    let curTo = -1;
    for (const [f, t] of arr) {
      if (f > curTo) {
        if (curTo > curFrom) watched += curTo - curFrom;
        curFrom = f;
        curTo = t;
      } else if (t > curTo) {
        curTo = t;
      }
    }
    if (curTo > curFrom) watched += curTo - curFrom;
    const ratio = duration > 0 ? Math.min(1, watched / duration) : 0;
    const threshold = thresholdByLesson.get(lessonId) ?? COMPLETE_THRESHOLD;
    out.set(lessonId, {
      lessonId,
      watchedSeconds: watched,
      durationSeconds: duration,
      progressRatio: ratio,
      completed: ratio >= threshold || manualComplete.has(lessonId),
    });
  }
  return out;
}

// ── 회원별 영상 시청 기록 상세(운영자) — 강의·회차별 시청시간 + 최초/마지막 재생일 ──

export interface UserWatchLesson {
  lessonId: string;
  lessonNo: number;
  title: string;
  watchedSeconds: number;
  durationSeconds: number;
  progressRatio: number;
  firstAt: string | null;
  lastAt: string | null;
  // feat-11-008 P6 — 시간 비례 재생 제한 CS 조회용.
  usedSeconds: number; // 실제 학습(반복 포함) 누적 초
  usedPlays: number; // 환산 사용 횟수 = 학습초 / 회차 길이
}
export interface UserWatchCourse {
  courseId: string;
  courseLabel: string;
  lessons: UserWatchLesson[];
  totalWatchedSeconds: number;
  // feat-11-008 P6 — 강의에 설정된 최대 재생횟수(null=무제한).
  maxPlays: number | null;
}

// 회원의 강의별·회차별 시청 상세. 시청 활동(구간 보고)이 있는 회차만 포함.
export async function getUserWatchHistory(
  userId: string,
): Promise<UserWatchCourse[]> {
  // 대상 강의 = 회원의 수강권 강의.
  const { data: enrolls } = await adminClient
    .from("enrollments")
    .select("course_id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  const courseIds = [...new Set((enrolls ?? []).map((e) => e.course_id))];
  if (courseIds.length === 0) return [];

  const { data: courses } = await adminClient
    .from("courses")
    .select(
      "course_id, edition_label, max_plays, series:course_series!courses_series_id_fkey(title)",
    )
    .in("course_id", courseIds);
  const courseMaxPlays = new Map<string, number | null>();
  for (const c of courses ?? []) courseMaxPlays.set(c.course_id, c.max_plays ?? null);
  const courseLabel = new Map<string, string>();
  for (const c of courses ?? []) {
    const title = (c.series as { title: string } | null)?.title ?? "";
    courseLabel.set(
      c.course_id,
      `${title} ${c.edition_label}`.trim() || c.course_id,
    );
  }

  const { data: lessons } = await adminClient
    .from("course_lessons")
    .select("lesson_id, course_id, lesson_no, title")
    .in("course_id", courseIds)
    .is("deleted_at", null)
    .order("sort_order")
    .order("lesson_no");
  const lessonRows = lessons ?? [];
  const lessonIds = lessonRows.map((l) => l.lesson_id);
  if (lessonIds.length === 0) return [];

  const progress = await getLessonProgressForUser(userId, lessonIds);
  // feat-11-008 P6 — 실제 학습시간(반복 포함) — 환산 사용 횟수 산출용.
  const usedByLesson = await getWatchedSecondsByLesson(userId, lessonIds);

  // 회차별 최초/마지막 재생일 — watch_events reported_at min/max(JS 집계).
  const firstAt = new Map<string, string>();
  const lastAt = new Map<string, string>();
  for (let i = 0; i < lessonIds.length; i += 150) {
    const { data: events } = await adminClient
      .from("watch_events")
      .select("lesson_id, reported_at")
      .eq("user_id", userId)
      .in("lesson_id", lessonIds.slice(i, i + 150))
      .limit(50000);
    for (const e of events ?? []) {
      const prevFirst = firstAt.get(e.lesson_id);
      if (!prevFirst || e.reported_at < prevFirst)
        firstAt.set(e.lesson_id, e.reported_at);
      const prevLast = lastAt.get(e.lesson_id);
      if (!prevLast || e.reported_at > prevLast)
        lastAt.set(e.lesson_id, e.reported_at);
    }
  }

  const byCourse = new Map<string, UserWatchLesson[]>();
  for (const l of lessonRows) {
    const p = progress.get(l.lesson_id);
    const watched = p?.watchedSeconds ?? 0;
    const first = firstAt.get(l.lesson_id) ?? null;
    if (watched <= 0 && !first) continue; // 시청 활동 없는 회차 제외
    const arr = byCourse.get(l.course_id) ?? [];
    arr.push({
      lessonId: l.lesson_id,
      lessonNo: l.lesson_no,
      title: l.title,
      watchedSeconds: watched,
      durationSeconds: p?.durationSeconds ?? 0,
      progressRatio: p?.progressRatio ?? 0,
      firstAt: first,
      lastAt: lastAt.get(l.lesson_id) ?? null,
      usedSeconds: usedByLesson.get(l.lesson_id) ?? 0,
      usedPlays:
        (p?.durationSeconds ?? 0) > 0
          ? (usedByLesson.get(l.lesson_id) ?? 0) / (p?.durationSeconds ?? 1)
          : 0,
    });
    byCourse.set(l.course_id, arr);
  }

  const out: UserWatchCourse[] = [];
  for (const cid of courseIds) {
    const ls = byCourse.get(cid);
    if (!ls || ls.length === 0) continue;
    out.push({
      courseId: cid,
      courseLabel: courseLabel.get(cid) ?? cid,
      lessons: ls,
      totalWatchedSeconds: ls.reduce((s, l) => s + l.watchedSeconds, 0),
      maxPlays: courseMaxPlays.get(cid) ?? null,
    });
  }
  return out;
}

/** 회차별 실제 학습(재생) 누적 초 — feat-11-008 P6 시간 비례 재생 제한 판정용.
 *  watch_events 의 보고 구간 합계(중복 구간 포함 — 반복 시청도 소비로 계산).
 *  진도율(getLessonProgressForUser)의 union 병합과 목적이 다르다(그쪽은 중복 제외). */
export async function getWatchedSecondsForLesson(
  userId: string,
  lessonId: string,
): Promise<number> {
  const { data } = await adminClient
    .from("watch_events")
    .select("from_seconds, to_seconds")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .limit(20000);
  let total = 0;
  for (const e of data ?? []) {
    const span = (e.to_seconds ?? 0) - (e.from_seconds ?? 0);
    if (span > 0) total += span;
  }
  return total;
}

/** 여러 회차의 학습 누적 초 — 관리자 CS 조회(회차별 사용 현황)용. */
export async function getWatchedSecondsByLesson(
  userId: string,
  lessonIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (lessonIds.length === 0) return out;
  for (let i = 0; i < lessonIds.length; i += 150) {
    const { data } = await adminClient
      .from("watch_events")
      .select("lesson_id, from_seconds, to_seconds")
      .eq("user_id", userId)
      .in("lesson_id", lessonIds.slice(i, i + 150))
      .limit(20000);
    for (const e of data ?? []) {
      const span = (e.to_seconds ?? 0) - (e.from_seconds ?? 0);
      if (span > 0) out.set(e.lesson_id, (out.get(e.lesson_id) ?? 0) + span);
    }
  }
  return out;
}
