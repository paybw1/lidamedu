-- 민법 공동 편집 전환 후 중복 빈칸 세트 정리(2건: 제1조·제11조). 사용자 승인 후 실행.
-- 참조(user_blank_attempts/srs·assignment·curriculum·offline·tier) 0건 확인 완료 → 삭제 안전.
--   제1조: 중복 세트의 '조리'는 정본에 이미 존재 → 병합 없이 중복 세트만 삭제.
--   제11조: 중복 세트의 '성년후견인'을 정본(f85df250)에 idx=max+1 로 병합 후 중복 삭제.
begin;

-- 제11조 병합 — 성년후견인 blank 을 정본에 append(idx 재부여).
update public.article_blank_sets t
set blanks = t.blanks || jsonb_build_array(
  (src.blank - 'idx') || jsonb_build_object(
    'idx',
    (select coalesce(max((b->>'idx')::int), 0) + 1
       from jsonb_array_elements(t.blanks) b)
  )
)
from (
  select b as blank
  from public.article_blank_sets s, jsonb_array_elements(s.blanks) b
  where s.set_id = 'eec94d85-16c6-4903-a720-c50d49084205'
    and b->>'answer' = '성년후견인'
  limit 1
) src
where t.set_id = 'f85df250-ad1f-4249-b002-985dd5d1456c';

-- 중복 세트 삭제(참조 0 확인).
delete from public.article_blank_sets
where set_id in (
  'fe5b5a53-94f7-4762-b2e9-0ba87a6e6511',  -- 제1조 리담관리자('조리'=정본 중복)
  'eec94d85-16c6-4903-a720-c50d49084205'   -- 제11조 리담관리자('성년후견인'=병합 완료)
);

commit;
