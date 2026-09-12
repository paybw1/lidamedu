-- 도해 테이블 RLS — 학생(authenticated)이 읽을 수 있는가.
select c.relname as tbl,
       c.relrowsecurity as rls_on,
       p.polname,
       p.polcmd,
       pg_get_expr(p.polqual, p.polrelid) as using_expr,
       (select array_agg(pg_get_userbyid(r)) from unnest(p.polroles) r) as roles
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
 where n.nspname = 'public' and c.relname like 'dohae%'
 order by c.relname, p.polname;
