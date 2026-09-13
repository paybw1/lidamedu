select source_doc_id::text as id, kind::text as kind, edition, label, file_name,
       coalesce(paired_with_doc_id::text,'(없음)') as paired,
       (select count(*) from public.problems p where p.source_doc_id = d.source_doc_id and p.deleted_at is null) as 문항수
  from public.problem_source_docs d
 where label like '%예상문제%' or file_name like '%예상문제%' or label like '%객관식(Ⅱ)%'
 order by edition, kind;
