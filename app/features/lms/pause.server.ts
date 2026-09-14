// 수강권 일시정지 재개 — **운영자 재개와 자동 재개가 같은 함수를 쓴다** (feat-11-012 P6-b).
//
// ★고치기 전 증상: 일시정지에는 종료일(enrollment_pauses.ends_on)이 **이미 저장돼 있는데**
//   그 날짜를 보는 코드가 없었다. 그래서 정지 기간이 끝나도 상태가 paused 로 남아,
//   학생이 고객센터에 연락해 운영자가 손으로 풀어 줄 때까지 재생이 막혔다.
//   정지할 때 expires_at 을 정지 일수만큼 이미 밀어 뒀으므로 재개는 **상태만** 되돌리면 된다
//   (기간 계산을 다시 하지 않는다 — 두 번 밀면 공짜 연장이 된다).
//
// ★저장 축은 바꾸지 않는다 — 컬럼을 새로 만들지 않고 있던 ends_on 판정만 되살린다.
// ★운영자 「재개」 버튼과 자동 재개는 **완전히 같은 두 쓰기**다(enrollments.status +
//   enrollment_pauses.resumed_at). 복사본을 병존시키면 한쪽만 고쳐져 어긋난다.

import { kstToday } from "~/core/lib/kst";
import adminClient from "~/core/lib/supa-admin-client.server";
import { logEnrollmentAdminAction } from "~/features/lms/queries.server";

/** 한 번에 훑는 정지 건수 상한 — 밀린 건이 많아도 한 요청을 붙들지 않는다. */
const SWEEP_LIMIT = 500;

/**
 * 일시정지 재개 — 운영자 버튼·자동 재개 공용.
 *
 * @param actorId 사람이 누른 재개는 그 운영자, 자동 재개는 null(시스템).
 * @returns 실제로 재개됐는가. 이미 paused 가 아니면 false(멱등 — 두 번 불려도 안전하다).
 */
export async function resumeEnrollment(input: {
  enrollmentId: string;
  actorId: string | null;
  reason: string;
}): Promise<boolean> {
  // ① 상태 — paused 인 것만 되돌린다(경합 시 한 쪽만 성공하는 가드 겸용).
  const { data: updated, error } = await adminClient
    .from("enrollments")
    .update({ status: "active" })
    .eq("enrollment_id", input.enrollmentId)
    .eq("status", "paused")
    .select("enrollment_id");
  if (error) throw error;
  if (!updated || updated.length === 0) return false;

  // ② 가장 최근 미재개 정지에 재개 시각 기록.
  const { data: lastPause } = await adminClient
    .from("enrollment_pauses")
    .select("pause_id")
    .eq("enrollment_id", input.enrollmentId)
    .is("resumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastPause) {
    await adminClient
      .from("enrollment_pauses")
      .update({ resumed_at: new Date().toISOString() })
      .eq("pause_id", lastPause.pause_id);
  }

  await logEnrollmentAdminAction({
    enrollmentId: input.enrollmentId,
    actorId: input.actorId,
    action: "resume",
    reason: input.reason,
  });
  return true;
}

/**
 * 종료일이 지난 정지를 쓸어 재개한다 — **조회 시점 + cron 이중**(무통장 기한 만료 선례).
 *
 * 조회 시점: 학생이 내 강의실을 열 때·운영자가 수강권 목록을 열 때 그 자리에서 푼다.
 * cron: 아무도 화면을 열지 않아도 상태가 현실과 어긋나 있지 않도록 매일 한 번 훑는다.
 *
 * ★날짜 비교는 **한국 날짜**로 한다 — ends_on 은 date 컬럼이고 정지 신청도 한국 날짜로
 *   받았다. 서버의 UTC 날짜로 비교하면 매일 아홉 시간 동안 하루가 어긋난다(P5-c 와 같은 함정).
 * ★멱등하다 — resumeEnrollment 이 status=paused 인 건만 되돌리므로 두 번 불려도 안전하다.
 */
export async function resumeOverduePauses(): Promise<number> {
  const today = kstToday();
  const { data: overdue } = await adminClient
    .from("enrollment_pauses")
    .select("enrollment_id, ends_on")
    .is("resumed_at", null)
    .lt("ends_on", today)
    .limit(SWEEP_LIMIT);
  if (!overdue || overdue.length === 0) return 0;

  let resumed = 0;
  for (const id of new Set(overdue.map((p) => p.enrollment_id))) {
    try {
      if (
        await resumeEnrollment({
          enrollmentId: id,
          actorId: null,
          reason: "일시정지 종료일 경과 — 자동 재개",
        })
      ) {
        resumed += 1;
      }
    } catch (e) {
      // 한 건이 실패해도 나머지는 푼다 — 화면 로딩을 막지 않는다.
      console.error("[lms/pause] 자동 재개 실패:", id, e);
    }
  }
  return resumed;
}
