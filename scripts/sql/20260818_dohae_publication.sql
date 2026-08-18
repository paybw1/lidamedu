-- 도해특허법 판본 등록 + 유닛 ↔ 페이지 매핑 (원장 지시 2026-08-18)
--
-- 추록·정오표 시트(v_errata_sheet)는 publication_content_map 을 INNER JOIN 한다.
-- 매핑이 없으면 발행해도 어느 시트에도 안 실린다 — 그래서 판본과 매핑이 선행이다.
-- 페이지는 파싱 때 확보한 dohae_units.pdf_page 를 그대로 쓴다(원본 대조용으로 이미 검증됨).

begin;

insert into public.publications (title, subject_code, track)
values ('도해특허법', 'patent', '공통')
on conflict do nothing;

insert into public.publication_editions
  (publication_id, edition_label, edition_seq, target_exam_year, target_exam_date, status)
select p.publication_id, '제20판', 20, e.target_exam_year, e.target_exam_date, 'frozen'
  from public.publications p
  -- 시험 차수는 기존 판본과 같은 값을 따른다(차수 SSOT 를 새로 만들지 않는다).
  cross join lateral (
    select target_exam_year, target_exam_date
      from public.publication_editions
     order by created_at limit 1
  ) e
 where p.title = '도해특허법'
   and not exists (
     select 1 from public.publication_editions x
      where x.publication_id = p.publication_id and x.edition_label = '제20판'
   );

-- 유닛 → 페이지 매핑. toc_path = "제N장 / 주제제목", sort_key = 유닛 순서(참고자료는 소수).
insert into public.publication_content_map
  (edition_id, content_type, content_id, page_no, toc_path, sort_key)
select
  ed.edition_id,
  'dohae',
  u.unit_id::text,
  u.pdf_page,
  '제' || u.chapter_no || '장 ' || u.chapter_title || ' / ' || u.title,
  -- 주제는 정수(unit_no), 참고자료는 그 장 안 소수 자리로 — 시트 정렬이 책 순서를 따른다.
  coalesce(u.unit_no::numeric,
           u.chapter_no * 1000 + coalesce(nullif(split_part(u.ref_no, '.', 2), '')::numeric, 0) / 100)
from public.dohae_units u
join public.publications p on p.title = '도해특허법'
join public.publication_editions ed
  on ed.publication_id = p.publication_id and ed.edition_label = '제20판'
where u.book_code = 'dohae_patent_20'
on conflict (edition_id, content_type, content_id) do update
  set page_no = excluded.page_no,
      toc_path = excluded.toc_path,
      sort_key = excluded.sort_key;

commit;

select
  (select count(*) from public.publication_content_map where content_type='dohae') as dohae_maps,
  (select count(*) from public.publication_content_map where content_type='dohae' and page_no is null) as no_page,
  (select json_agg(x) from (
     select toc_path, page_no, sort_key
       from public.publication_content_map
      where content_type='dohae' order by sort_key limit 4) x) as sample;
