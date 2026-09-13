SELECT t.tgname AS 트리거, p.proname AS 함수, pg_get_triggerdef(t.oid) AS 정의
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE c.relname = 'content_revisions' AND NOT t.tgisinternal
 ORDER BY t.tgname;
