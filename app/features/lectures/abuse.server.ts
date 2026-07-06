// 강의노트 유출방지 ③ — 열람 로그 기록 + 이상 패턴(단시간 대량 서명) staff 알림.
// /api/lecture-note-pages 가 응답 후(runAfterResponse) 호출. best-effort — 실패해도
// 페이지 서빙에는 영향 없다. staff 열람은 호출측에서 제외.

import adminClient from "~/core/lib/supa-admin-client.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

// 최근 10분간 서명된 페이지 수가 이 값을 넘으면 자동화 캡처 의심.
// (정상 열람은 창 13p 단위 — 250p/10분은 20초당 1창 이상 연속 소비 수준)
const ABUSE_WINDOW_MIN = 10;
const ABUSE_PAGES_THRESHOLD = 250;
// 같은 사용자 재알림 억제 기간.
const RENOTIFY_HOURS = 24;

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

  // ── 이상 탐지 — 최근 10분 창 합산(중복 창은 근사 허용) ──
  const since = new Date(
    Date.now() - ABUSE_WINDOW_MIN * 60 * 1000,
  ).toISOString();
  const { data: recent } = await adminClient
    .from("lecture_note_views")
    .select("from_page, to_page")
    .eq("profile_id", input.profileId)
    .gte("viewed_at", since);
  const pages = (recent ?? []).reduce(
    (s, r) => s + (r.to_page - r.from_page + 1),
    0,
  );
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

  const [{ data: staff }, { data: viewer }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("profile_id")
      .in("role", ["manager", "admin"]),
    adminClient
      .from("profiles")
      .select("name, member_no")
      .eq("profile_id", input.profileId)
      .maybeSingle(),
  ]);
  const recipientIds = (staff ?? []).map((s) => s.profile_id);
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
