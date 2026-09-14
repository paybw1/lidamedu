// 회차 재생 허용량 — **판정 단일 진입점** (feat-11-012 P6-a). 서버 전용.
//
// 「이 회차를 얼마나 썼고 잠겼는가」에 답하는 곳은 여기 하나다. 네 호출처가 모두 이걸 읽는다:
//   ① 강의실 목록(lecture-room)  ② 재생 시작 판정(playback.server)
//   ③ 하트비트 차감 가드(watch.server)  ④ 관리자 CS 조회(getUserWatchHistory)
//
// ★순환 참조를 피하려고 **사용량 집계까지 함께** 옮겼다. 판정만 옮기면
//   watch.server → playback.server → watch.server 로 돈다(재생 판정이 이미 기록 모듈을
//   부르고, 이제 기록 모듈도 판정을 불러야 하므로). 이 모듈은 adminClient 외엔 아무것도
//   import 하지 않는다 — 잎 노드로 둔다.

import adminClient from "~/core/lib/supa-admin-client.server";
import { type PlayLimit, computePlayLimit } from "~/features/lms/lib/play-limit";

export type { PlayLimit } from "~/features/lms/lib/play-limit";

/** 회차별 재생 사용 초 — 집계 대상은 **watch_ledger**(설계 SSOT D7·P6b).
 *  하트비트 debit 에 관리자 조정(credit)·초기화(reset)가 함께 반영되므로, 초기화하면
 *  제한이 실제로 풀린다. 합계는 DB(RPC)에서 — 클라이언트 행 상한 과소집계가 없다.
 *  진도율(getLessonProgressForUser)의 union 병합과는 목적이 다르다(그쪽은 중복 제외). */
export async function getLessonUsageSeconds(
  enrollmentId: string,
  lessonIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (lessonIds.length === 0) return out;
  for (let i = 0; i < lessonIds.length; i += 150) {
    const { data, error } = await adminClient.rpc("lms_lesson_usage_seconds", {
      p_enrollment_id: enrollmentId,
      p_lesson_ids: lessonIds.slice(i, i + 150),
    });
    if (error) throw error;
    for (const r of data ?? []) out.set(r.lesson_id, r.seconds);
  }
  return out;
}

/** 회차 하나의 재생 사용 초. */
export async function getLessonUsageForLesson(
  enrollmentId: string,
  lessonId: string,
): Promise<number> {
  return (await getLessonUsageSeconds(enrollmentId, [lessonId])).get(lessonId) ?? 0;
}

/** 강의 단위 최대 재생 횟수. null = 무제한. ★권위는 courses 쪽이다(course_lessons 아님). */
async function getCourseMaxPlays(courseId: string): Promise<number | null> {
  const { data } = await adminClient
    .from("courses")
    .select("max_plays")
    .eq("course_id", courseId)
    .maybeSingle();
  return data?.max_plays ?? null;
}

/** 회차별 활성 영상 길이(초). 영상이 없거나 비활성이면 키가 없다. */
async function getActiveDurations(
  lessonIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < lessonIds.length; i += 150) {
    const { data } = await adminClient
      .from("lesson_videos")
      .select("lesson_id, duration_seconds")
      .in("lesson_id", lessonIds.slice(i, i + 150))
      .eq("is_active", true);
    for (const v of data ?? []) out.set(v.lesson_id, v.duration_seconds ?? 0);
  }
  return out;
}

/**
 * 강의실 목록용 — 한 수강권의 여러 회차를 한 번에 판정한다.
 * 회차가 목록에 없으면(=영상 없음) 길이 0 으로 fail-open 판정이 나온다.
 */
export async function getPlayLimitsForLessons(input: {
  enrollmentId: string;
  courseId: string;
  lessonIds: string[];
}): Promise<Map<string, PlayLimit>> {
  const out = new Map<string, PlayLimit>();
  if (input.lessonIds.length === 0) return out;
  const [maxPlays, durations, used] = await Promise.all([
    getCourseMaxPlays(input.courseId),
    getActiveDurations(input.lessonIds),
    getLessonUsageSeconds(input.enrollmentId, input.lessonIds),
  ]);
  for (const lessonId of input.lessonIds) {
    out.set(
      lessonId,
      computePlayLimit({
        maxPlays,
        durationSeconds: durations.get(lessonId) ?? 0,
        usedSeconds: used.get(lessonId) ?? 0,
      }),
    );
  }
  return out;
}

/**
 * 회차 하나 판정 — 재생 시작·하트비트 차감 가드 공용.
 * 길이를 이미 알고 있으면 넘겨서 조회를 아낀다(재생 판정은 이미 들고 있다).
 */
export async function getPlayLimitForLesson(input: {
  enrollmentId: string;
  courseId: string;
  lessonId: string;
  durationSeconds?: number;
}): Promise<PlayLimit> {
  const [maxPlays, duration, used] = await Promise.all([
    getCourseMaxPlays(input.courseId),
    input.durationSeconds != null
      ? Promise.resolve(input.durationSeconds)
      : getActiveDurations([input.lessonId]).then(
          (m) => m.get(input.lessonId) ?? 0,
        ),
    getLessonUsageForLesson(input.enrollmentId, input.lessonId),
  ]);
  return computePlayLimit({
    maxPlays,
    durationSeconds: duration,
    usedSeconds: used,
  });
}
