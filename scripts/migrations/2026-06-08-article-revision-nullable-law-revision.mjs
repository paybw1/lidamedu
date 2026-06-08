// 빠른편집이 law_revision(개정 이력) 없이 article_revision 만 생성할 수 있도록
// article_revisions.law_revision_id 를 nullable 로. (직접편집 = 법 개정 아님)
//   node scripts/migrations/2026-06-08-article-revision-nullable-law-revision.mjs --apply
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
  `select is_nullable from information_schema.columns where table_name='article_revisions' and column_name='law_revision_id'`,
);
console.log("law_revision_id is_nullable (before):", before.rows[0]?.is_nullable);
if (!APPLY) { console.log("(dry-run — --apply 로 적용)"); await c.end(); process.exit(0); }
await c.query(`alter table public.article_revisions alter column law_revision_id drop not null`);
const after = await c.query(
  `select is_nullable from information_schema.columns where table_name='article_revisions' and column_name='law_revision_id'`,
);
console.log("law_revision_id is_nullable (after):", after.rows[0]?.is_nullable);
await c.end();
console.log("완료");
