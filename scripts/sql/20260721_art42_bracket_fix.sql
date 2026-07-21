-- 특허법 제42조 제1항 제2호 대리인 특칙 대괄호 복원(import 오류 정정, 원장 승인 2026-07-21).
--   "소재지대리인이…성명" → "소재지[대리인이…성명]". 공식 특허법 원문의 대괄호 누락 복구.
--   조문 불변 보호 트리거를 이 정정 1건에 한해 원자적으로 비활성→수정→재활성.
--   빈칸(21, 컨텍스트 앵커)·하이라이트(7, snippet reanchor)는 대리인 절과 무관해 자가 복원.
begin;
alter table public.article_revisions disable trigger article_revisions_protect_in_force;

update public.article_revisions
set body_json = replace(
  body_json::text,
  '"대리인이 특허법인·특허법인(유한)인 경우에는 그 명칭, 사무소의 소재지 및 지정된 변리사의 성명"',
  '"[대리인이 특허법인·특허법인(유한)인 경우에는 그 명칭, 사무소의 소재지 및 지정된 변리사의 성명]"'
)::jsonb
where revision_id = 'a535f21b-0281-46a1-b844-a6d0f53494e0';

alter table public.article_revisions enable trigger article_revisions_protect_in_force;
commit;

-- 검증: 정정된 텍스트 노드 확인.
select jsonb_path_query_first(
         body_json,
         '$.** ? (@.type == "text" && @.text like_regex "지정된 변리사의 성명")'
       )->>'text' as fixed_text
from public.article_revisions
where revision_id = 'a535f21b-0281-46a1-b844-a6d0f53494e0';
