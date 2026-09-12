select source_type::text as stype, coalesce(law_code,'(없음)') as law, count(*) as chunks
  from public.content_chunks group by 1,2 order by 1,3 desc;
