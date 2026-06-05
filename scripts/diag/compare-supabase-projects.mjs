// 두 Supabase 프로젝트 한 방 비교 — mcgdoplo (.env DATABASE_URL) vs nctokynz (MCP).
// 사용자가 던진 점검 지시서 §1 "한 방 비교" 쿼리를 mcgdoplo 에 돌리고 결과 출력.
// nctokynz 는 MCP execute_sql 로 따로 확인하여 비교.

import pg from "pg";
import "dotenv/config";

const { Client } = pg;
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const Q = `
select 'extensions'      as object, count(*) as cnt from pg_extension
union all
select 'functions(public)', count(*) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all
select 'triggers(non-internal)', count(*) from pg_trigger where not tgisinternal
union all
select 'tables(public)', count(*) from pg_tables where schemaname = 'public'
union all
select 'rls_policies', count(*) from pg_policies
union all
select 'indexes(public)', count(*) from pg_indexes where schemaname = 'public'
union all
select 'sequences(public)', count(*) from pg_sequences where schemaname = 'public'
union all
select 'views(public)', count(*) from information_schema.views where table_schema = 'public'
union all
select 'matviews', count(*) from pg_matviews
union all
select 'enums', count(distinct typname) from pg_type t join pg_enum e on t.oid = e.enumtypid
order by 1;
`;

const r = await c.query(Q);
console.log("=== mcgdoplovrjgklbxmozi (.env DATABASE_URL) ===");
console.table(r.rows);
await c.end();
