// 강의노트 유출방지 ③ — 열람 로그 기록 + 이상 패턴(단시간 대량 서명) staff 알림.
// /api/lecture-note-pages 가 응답 후(runAfterResponse) 호출. best-effort — 실패해도
// 페이지 서빙에는 영향 없다. staff 열람은 호출측에서 제외.

import adminClient from "~/core/lib/supa-admin-client.server";
import { getDutyRecipientIds } from "~/features/admin/lib/duties.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

// 최근 10분간 '고유' 페이지 수가 이 값을 넘으면 자동화 캡처 의심.
// (겹치는 창 재조회는 중복 집계하지 않는다 — 실제 열람 페이지 기준)
const ABUSE_WINDOW_MIN = 10;
const ABUSE_PAGES_THRESHOLD = 250;
// 학생 본인에게 '감지 중' 안내를 띄우는(soft) 임계 — staff 알림보다 먼저 경고.
export const STUDENT_WARN_PAGES = 180;
export const STUDENT_WARN_WINDOW_MIN = ABUSE_WINDOW_MIN;
// 같은 사용자 재알림 억제 기간.
const RENOTIFY_HOURS = 24;

// 최근 windowMin 분간 열람한 '고유 페이지' 수(노트별 페이지 union). 겹치는 창 중복 제거.
export async function countRecentUniquePages(
  profileId: string,
  windowMin: number = ABUSE_WINDOW_MIN,
): Promise<number> {
  const since = new Date(Date.now() - windowMin * 60 * 1000).toISOString();
  const { data: recent } = await adminClient
    .from("lecture_note_views")
    .select("target_id, from_page, to_page")
    .eq("profile_id", profileId)
    .gte("viewed_at", since);
  const seen = new Set<string>();
  for (const r of recent ?? []) {
    const from = Math.max(1, r.from_page);
    const to = Math.min(r.to_page, from + 100); // 방어적 상한(창 ≤30)
    for (let p = from; p <= to; p++) seen.add(`${r.target_id}:${p}`);
  }
  return seen.size;
}

export async function logLectureNoteView(input: {
  profileId: string;
  kind: "src" | "res";
  targetId: string;
  fromPage: number;
  toPage: number;
}): Promise<void> {
  const { error } = await adminClient.from("lecture_note_views").insert({
    profile_id: input.profileId,
    kind: input.kind,
    target_id: input.targetId,
    from_page: input.fromPage,
    to_page: input.toPage,
  });
  if (error) return; // best-effort

  // ── 이상 탐지 — 최근 10분 '고유' 페이지 수(겹치는 창 중복 제거) ──
  const pages = await countRecentUniquePages(input.profileId);
  if (pages < ABUSE_PAGES_THRESHOLD) return;

  // ── 재알림 억제 — 24h 내 같은 사용자 대상 알림이 있으면 skip ──
  const dedupSince = new Date(
    Date.now() - RENOTIFY_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { count } = await adminClient
    .from("user_notifications")
    .select("*", { count: "exact", head: true })
    .eq("kind", "lecture_note_abuse")
    .eq("entity_id", input.profileId)
    .gte("created_at", dedupSince);
  if ((count ?? 0) > 0) return;

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
    kind: "lecture_note_abuse",
    entityType: "profile",
    entityId: input.profileId,
    title: `강의노트 이상 열람 감지 — ${who}`,
    body: `최근 ${ABUSE_WINDOW_MIN}분간 강의노트 ${pages}페이지를 조회했습니다. 자동화 캡처(대량 유출 시도) 가능성을 확인하세요.`,
    href: `/admin/students/${input.profileId}`,
    payload: { pages, windowMin: ABUSE_WINDOW_MIN },
  });
}
