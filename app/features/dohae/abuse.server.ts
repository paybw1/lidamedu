// 도해 유출방지 ③ — 열람 로그 기록 + 이상 패턴(단시간 대량 열람) staff 알림.
// api/dohae/unit 이 응답 후(runAfterResponse) 호출. best-effort — 실패해도 팝업 렌더에
// 영향 없다. staff 열람은 호출측에서 제외한다.
//
// ★강의노트(lectures/abuse.server.ts)와 집계 단위가 다르다 — 강의노트는 '페이지 창',
//   도해는 '유닛'. 그래서 로그 테이블도 임계도 따로 둔다.

import adminClient from "~/core/lib/supa-admin-client.server";
import { getDutyRecipientIds } from "~/features/admin/lib/duties.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

const ABUSE_WINDOW_MIN = 10;
// 전체 94유닛 기준 — 10분 안에 이만큼 열면 정독이 아니라 훑어 담는 것으로 본다.
const ABUSE_UNITS_THRESHOLD = 40;
// 학생 본인에게 '감지 중' 안내를 띄우는(soft) 임계 — staff 알림보다 먼저 경고.
export const STUDENT_WARN_UNITS = 25;
export const STUDENT_WARN_WINDOW_MIN = ABUSE_WINDOW_MIN;
// 같은 사용자 재알림 억제 기간.
const RENOTIFY_HOURS = 24;

/** 최근 windowMin 분간 연 '고유 유닛' 수. 같은 유닛 재열람은 한 번으로 센다. */
export async function countRecentUniqueUnits(
  profileId: string,
  windowMin: number = ABUSE_WINDOW_MIN,
): Promise<number> {
  const since = new Date(Date.now() - windowMin * 60 * 1000).toISOString();
  const { data } = await adminClient
    .from("dohae_unit_views")
    .select("unit_id")
    .eq("profile_id", profileId)
    .gte("viewed_at", since);
  return new Set((data ?? []).map((r) => r.unit_id)).size;
}

export async function logDohaeUnitView(input: {
  profileId: string;
  unitId: string;
}): Promise<void> {
  const { error } = await adminClient.from("dohae_unit_views").insert({
    profile_id: input.profileId,
    unit_id: input.unitId,
  });
  if (error) return; // best-effort

  const units = await countRecentUniqueUnits(input.profileId);
  if (units < ABUSE_UNITS_THRESHOLD) return;

  // 재알림 억제 — 24h 내 같은 사용자 대상 알림이 있으면 skip.
  const dedupSince = new Date(
    Date.now() - RENOTIFY_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { count } = await adminClient
    .from("user_notifications")
    .select("*", { count: "exact", head: true })
    .eq("kind", "dohae_abuse")
    .eq("entity_id", input.profileId)
    .gte("created_at", dedupSince);
  if ((count ?? 0) > 0) return;

  // 수신자 = 강의노트와 같은 담당(lecture_abuse_alert) — 성격이 같은 유출 경보다.
  const [recipientIds, { data: viewer }] = await Promise.all([
    getDutyRecipientIds("lecture_abuse_alert"),
    adminClient
      .from("profiles")
      .select("name, member_no")
      .eq("profile_id", input.profileId)
      .maybeSingle(),
  ]);
  if (recipientIds.length === 0) return;

  const who = [
    viewer?.name ?? "학생",
    viewer?.member_no != null ? `No.${viewer.member_no}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  await createUserNotifications({
    recipientIds,
    kind: "dohae_abuse",
    entityType: "profile",
    entityId: input.profileId,
    title: `도해 이상 열람 감지 — ${who}`,
    body: `최근 ${ABUSE_WINDOW_MIN}분간 도해 ${units}개 단원을 열었습니다. 대량 복사 시도 가능성을 확인하세요.`,
    href: `/admin/students/${input.profileId}`,
    payload: { units, windowMin: ABUSE_WINDOW_MIN },
  });
}
