-- 오류신고 후속(2026-09-16, 원장 승인 C) — 특허법 제59조 빈칸 세트 병합.
-- 삭제된 계정 소유 세트(862a93f4, 학생 풀이 14·SRS 8·난이도 완료 13·오프라인 문항 1 보유)를 원장 소유로 이관하고,
-- 원장의 기록 없는 옛 세트(2c719efd) 6빈칸을 idx 2..7 로 합친다(idx 1 = 심사 유지 → 기존 풀이 기록 보존).
-- 유일 제약 article_blank_sets_unique(article_id, version, owner_id) 때문에 옛 세트 정리가 먼저다.
-- 실행: node scripts/run-prod-sql.mjs scripts/sql/20260916_c_merge_59_blank_sets.sql
-- 롤백: 원본 백업 = scratchpad bug-fix-backup-20260916.json (set_2c719efd 없음 — 아래 tmp 로 보존되는 6빈칸은 이 파일 주석에 기록)
--   2c719efd blanks: 누구든지 / 청구범위 / 3년 / 국어번역문 / 30일 / 취하 (idx 1~6, 좌표 없음)
begin;
create temp table tmp_admin_blanks on commit drop as
  select blanks from article_blank_sets where set_id = '2c719efd-a51b-42ff-a8a0-078f858676e3';
-- C-1) 기록 없는 원장 옛 세트 정리 — 어떤 학습·과제·시험 기록도 참조하지 않을 때만
delete from article_blank_sets s
where s.set_id = '2c719efd-a51b-42ff-a8a0-078f858676e3'
  and not exists (select 1 from user_blank_attempts x where x.set_id = s.set_id)
  and not exists (select 1 from user_blank_srs x where x.set_id = s.set_id)
  and not exists (select 1 from blank_tier_completions x where x.set_id = s.set_id)
  and not exists (select 1 from assignment_items x where x.blank_set_id = s.set_id)
  and not exists (select 1 from curriculum_items x where x.blank_set_id = s.set_id)
  and not exists (select 1 from offline_test_questions x where x.blank_set_id = s.set_id);
-- C-2) 고아 세트 → 원장 소유 이관 + 옛 세트 6빈칸을 idx 2..7 로 합침
update article_blank_sets o
set owner_id = 'e20ac99a-bfa6-4862-94dd-23c063189463',
    blanks = o.blanks || (
      select jsonb_agg(jsonb_set(e.b, '{idx}', to_jsonb(((e.b->>'idx')::int) + 1)) order by (e.b->>'idx')::int)
      from tmp_admin_blanks t, jsonb_array_elements(t.blanks) e(b)),
    updated_at = now()
where o.set_id = '862a93f4-a94f-4602-b370-d735407f707e'
  and o.owner_id = '2e94bae5-b53c-4665-8732-622fce5c8521'
  and jsonb_array_length(o.blanks) = 1
  and (select count(*) from tmp_admin_blanks) = 1
  and not exists (select 1 from article_blank_sets where set_id = '2c719efd-a51b-42ff-a8a0-078f858676e3');
-- A-보강) 상표 ⑤ 해설 '정답없음'(띄어쓰기 없는 변형) 1건 — 백업 후 같은 규칙으로 정리
insert into problem_choices_expl_backup_20260916 (choice_id, problem_id, choice_index, explanation_md, backed_up_at)
select c.choice_id, c.problem_id, c.choice_index, c.explanation_md, now()
from problem_choices c join problems p on p.problem_id = c.problem_id
where p.display_no = 9987 and c.choice_index = 5 and c.explanation_md ~ ' \|\s*\n\| --- \| --- \|\n\|  \|  \|\n\|  \| 정답없음 \|';
update problem_choices c
set explanation_md = regexp_replace(c.explanation_md, ' \|\s*\n\| --- \|.*$', '')
from problems p
where p.problem_id = c.problem_id and p.display_no = 9987 and c.choice_index = 5
  and c.explanation_md ~ ' \|\s*\n\| --- \| --- \|\n\|  \|  \|\n\|  \| 정답없음 \|';
select json_build_object(
  'a59_sets', (select json_agg(json_build_object('set_id', set_id, 'owner', owner_id, 'n', jsonb_array_length(blanks), 'answers', (select jsonb_agg(e->>'answer') from jsonb_array_elements(blanks) e))) from article_blank_sets where article_id='414fac63-3b1e-4dde-b302-bbc12bad745c'),
  'orphan_attempts_kept', (select count(*) from user_blank_attempts where set_id='862a93f4-a94f-4602-b370-d735407f707e'),
  'backup_rows', (select count(*) from problem_choices_expl_backup_20260916),
  'remaining_garbage', (select count(*) from problem_choices c join problems p on p.problem_id=c.problem_id where p.deleted_at is null and c.explanation_md ~ '\n\| --- \|')
) as r;
commit;
