SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND (table_name ILIKE '%sci%' OR table_name ILIKE '%jayeon%')
 ORDER BY table_name;
