select c.relname as tbl, string_agg(a.attname, ',' order by k.ord) as pk
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join lateral unnest(con.conkey) with ordinality k(att, ord) on true
join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
where con.contype = 'p' and c.relname in
 ('user_problem_attempts','article_case_links','papers','book_updates','community_posts','cases')
group by c.relname order by c.relname;
