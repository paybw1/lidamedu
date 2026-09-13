-- 예상문제 134건의 소스 문서 + 초단문 해설 목록.
select d.source_doc_id::text as doc_id, d.file_name, d.label, d.kind::text as kind,
       d.edition, d.metadata::text as meta, count(pr.problem_id) as 문항수
  from public.problem_source_docs d
  join public.problems pr on pr.source_doc_id = d.source_doc_id
  join public.laws l on l.law_id = pr.law_id
 where pr.deleted_at is null and pr.explanation_md is not null
   and l.law_code = 'patent' and pr.origin = 'expected'
 group by 1,2,3,4,5,6;
