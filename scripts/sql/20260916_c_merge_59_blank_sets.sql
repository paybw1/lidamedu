-- 오류신고 후속(2026-09-16, 원장 승인 C) — 특허법 제59조 빈칸 세트 정리 **[적용 완료: 아래 union 방식]**
-- 처음 안(고아 세트 이관 + 원장 옛 세트 삭제)은 실행 결과 옛 세트(2c719efd)를 offline_test_questions 2건이 참조해 delete 가드에 막혔다.
-- 그래서 삭제 없이 **두 세트 모두에 서로의 빈칸을 합쳐**(기존 idx 불변) 어느 쪽이 보이든 같은 7빈칸이 되게 했다.
--   862a93f4(삭제 계정 소유, 학생 기록 14·SRS 8·난이도 13·오프라인 1): idx1=심사 + 원장 6빈칸을 idx 2..7
--   2c719efd(원장, 오프라인 문항 2): idx1..6 + 심사를 idx 7
-- ★고아 세트 소유자 이관은 유일 제약(article×version×owner) 때문에 불가 — 세트 2개가 남아 있는 상태는 알려진 사실(domain_blanks 메모).

begin;
-- 어느 세트가 보이든 같은 7빈칸: 고아 세트(idx1=심사)에 원장 세트 6빈칸을 idx 2..7 로, 원장 세트(idx1..6)에 심사를 idx 7 로. 삭제 없음, 기존 idx 불변.
update article_blank_sets o
set blanks = o.blanks || (
      select jsonb_agg(jsonb_set(e.b, '{idx}', to_jsonb(((e.b->>'idx')::int) + 1)) order by (e.b->>'idx')::int)
      from article_blank_sets a, jsonb_array_elements(a.blanks) e(b)
      where a.set_id = '2c719efd-a51b-42ff-a8a0-078f858676e3'),
    updated_at = now()
where o.set_id = '862a93f4-a94f-4602-b370-d735407f707e'
  and jsonb_array_length(o.blanks) = 1 and o.blanks->0->>'answer' = '심사';
update article_blank_sets a
set blanks = a.blanks || jsonb_build_array(jsonb_build_object(
      'idx', 7, 'length', 4, 'answer', '심사',
      'before_context', '특허출원에 대한 ', 'after_context', '는 법 제59조제1항에 따른 ',
      'block_id', 'clause-1', 'block_index', 3, 'cum_offset', 9)),
    updated_at = now()
where a.set_id = '2c719efd-a51b-42ff-a8a0-078f858676e3'
  and jsonb_array_length(a.blanks) = 6
  and not exists (select 1 from jsonb_array_elements(a.blanks) e where e->>'answer' = '심사');
select json_build_object(
  'admin_set_deps', json_build_object(
    'tiers', (select count(*) from blank_tier_completions where set_id='2c719efd-a51b-42ff-a8a0-078f858676e3'),
    'assignments', (select count(*) from assignment_items where blank_set_id='2c719efd-a51b-42ff-a8a0-078f858676e3'),
    'curriculum', (select count(*) from curriculum_items where blank_set_id='2c719efd-a51b-42ff-a8a0-078f858676e3'),
    'offline', (select count(*) from offline_test_questions where blank_set_id='2c719efd-a51b-42ff-a8a0-078f858676e3')),
  'a59_sets', (select json_agg(json_build_object('set_id', set_id, 'owner', owner_id, 'n', jsonb_array_length(blanks), 'answers', (select jsonb_agg(e->>'answer' order by (e->>'idx')::int) from jsonb_array_elements(blanks) e))) from article_blank_sets where article_id='414fac63-3b1e-4dde-b302-bbc12bad745c')
) as r;
commit;
