// 오류 신고(bug_reports) 신규 접수 → staff 인앱 알림용 enum 값 추가.
//   staff_notification_kind 에 'bug_report_created' 추가.
//   node scripts/migrations/2026-06-08-bug-report-notification-kind.mjs --apply
import { config as loadEnv } from "dotenv";
import pg from "pg";
loadEnv();
const APPLY = process.argv.includes("--apply");
const du = new URL(process.env.DATABASE_URL);
const ref = du.hostname.split(".")[1];
const pwd = decodeURIComponent(du.password);
const c = new pg.Client({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(pwd)}@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const before = await c.query(
  `select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='staff_notification_kind' order by e.enumsortorder`,
);
const has = before.rows.some((r) => r.enumlabel === "bug_report_created");
console.log("has bug_report_created (before):", has);
if (!APPLY) {
  console.log("(dry-run — --apply 로 적용)");
  await c.end();
  process.exit(0);
}
if (!has) {
  await c.query(`ALTER TYPE public.staff_notification_kind ADD VALUE IF NOT EXISTS 'bug_report_created'`);
}
const after = await c.query(
  `select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='staff_notification_kind' order by e.enumsortorder`,
);
console.log("values (after):", after.rows.map((r) => r.enumlabel).join(", "));
await c.end();
console.log("완료");
