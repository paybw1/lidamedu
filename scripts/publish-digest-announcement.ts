// 정리비교표 공지 발행 — 앱의 /api/admin/announcement publish 분기와 같은 일을 한다:
// published_at 기록 → 대상자 인박스 팬아웃(notifyAnnouncementPublished, 멱등) → 감사 로그.
// ★SQL 로 published_at 만 바꾸면 알림이 누락된다(메모 bug-report-reply-tone) — 반드시 이 경로로.
//   npx tsx scripts/publish-digest-announcement.ts            # dry-run(대상 확인만)
//   npx tsx scripts/publish-digest-announcement.ts --commit
import "dotenv/config";

import adminClient from "~/core/lib/supa-admin-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { notifyAnnouncementPublished } from "~/features/announcements/notify.server";

const url = process.env.SUPABASE_URL!;
if (!new URL(url).host.includes("mcgdoplo")) throw new Error("ABORT: not prod");
const commit = process.argv.includes("--commit");
const AUTHOR = "e20ac99a-bfa6-4862-94dd-23c063189463"; // 임병웅(admin)
const TITLE = "특허법 정리비교표를 조문 화면에서 바로 볼 수 있습니다";

const { data: ann, error } = await adminClient
  .from("announcements")
  .select("announcement_id, title, published_at, audience_kind, platform_scope, is_pinned")
  .eq("title", TITLE)
  .is("deleted_at", null)
  .maybeSingle();
if (error) throw error;
if (!ann) throw new Error("공지 초안이 없다 — scripts/seed-guide-digest.mjs 먼저");
console.log(ann.published_at ? "이미 발행됨" : "초안", ann.announcement_id, ann.audience_kind, ann.platform_scope, "pin=" + ann.is_pinned);
if (ann.published_at) process.exit(0);
if (!commit) {
  console.log("--commit 없이 끝냈다(발행 안 함).");
  process.exit(0);
}

const now = new Date().toISOString();
const { error: upErr } = await adminClient
  .from("announcements")
  .update({ published_at: now, updated_at: now })
  .eq("announcement_id", ann.announcement_id);
if (upErr) throw upErr;
await notifyAnnouncementPublished(ann.announcement_id);
await logAuditEvent({
  actorId: AUTHOR,
  actorRole: "admin",
  action: "announcement.publish",
  entityType: "announcement",
  entityId: ann.announcement_id,
  metadata: { title: ann.title, via: "scripts/publish-digest-announcement.ts" },
});
const { count } = await adminClient
  .from("user_notifications")
  .select("*", { count: "exact", head: true })
  .eq("kind", "announcement")
  .eq("entity_id", ann.announcement_id);
console.log("발행 완료", now, "알림 팬아웃", count ?? 0, "건");
