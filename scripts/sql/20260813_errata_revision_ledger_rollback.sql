-- errata Phase 1 롤백 — 트리거·함수만 제거 (지시서 v1.1 §4)
-- 원장 테이블·억제 창 테이블은 남긴다:
--   content_revisions        — 수집된 원장은 소실되면 복구 불가
--   revision_suppress_windows — 억제 이력 자체가 감사 자료 (v1.2.1 규칙 9)
-- 완전 제거는 별도 승인 후에만 (v1.1 §4 주석 참조).
begin;

drop trigger if exists log_revision_problem_choices on problem_choices;
drop trigger if exists log_revision_problems        on problems;
drop trigger if exists log_revision_article         on article_revisions;
drop trigger if exists log_revision_cases           on cases;

drop function if exists fn_log_revision_problem();
drop function if exists fn_log_revision_article();
drop function if exists fn_log_content_revision();
drop function if exists fn_problem_content_type(text);

-- 억제 인프라 함수는 유지해도 무해하나, 트리거 제거 시 참조가 없으므로 함께 정리.
drop function if exists fn_open_suppress_window(text, int, text[]);
drop function if exists fn_close_suppress_window(uuid);
drop function if exists fn_revision_suppressed(text);

commit;
