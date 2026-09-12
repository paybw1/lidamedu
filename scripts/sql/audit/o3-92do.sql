-- 92도3350 — 네 곳 대조(① cases ② case_lower_courts ③ 교재 content_chunks ④ 본문 인용)
with hit as (
  select 'cases.case_number' as src, case_number as host, null::text as ctx
    from public.cases
   where regexp_replace(case_number,'\s','','g') ~ '(^|[^0-9])92도3350([^0-9]|$)'
  union all
  select 'case_lower_courts.number', lower_case_number, null
    from public.case_lower_courts
   where regexp_replace(coalesce(lower_case_number,''),'\s','','g') ~ '(^|[^0-9])92도3350([^0-9]|$)'
  union all
  select 'case_lower_courts.본문', coalesce(lower_case_number,'(번호없음)'),
         substring(regexp_replace(coalesce(body_text,''),'\s','','g')
           from greatest(1, position('92도3350' in regexp_replace(coalesce(body_text,''),'\s','','g')) - 60) for 150)
    from public.case_lower_courts
   where regexp_replace(coalesce(body_text,''),'\s','','g') ~ '(^|[^0-9])92도3350([^0-9]|$)'
  union all
  select 'cases 본문', case_number,
         substring(regexp_replace(concat_ws(' ',summary_body_md,reasoning_md,comment_body_md),'\s','','g')
           from greatest(1, position('92도3350' in regexp_replace(concat_ws(' ',summary_body_md,reasoning_md,comment_body_md),'\s','','g')) - 60) for 150)
    from public.cases
   where regexp_replace(concat_ws(' ',summary_body_md,reasoning_md,comment_body_md),'\s','','g') ~ '(^|[^0-9])92도3350([^0-9]|$)'
  union all
  select '교재 ' || source_type::text || '/' || coalesce(law_code,'-'), coalesce(heading_path,''),
         substring(regexp_replace(body_text,'\s','','g')
           from greatest(1, position('92도3350' in regexp_replace(body_text,'\s','','g')) - 70) for 170)
    from public.content_chunks
   where regexp_replace(body_text,'\s','','g') ~ '(^|[^0-9])92도3350([^0-9]|$)'
)
select src, count(*) as n, (array_agg(host))[1] as host, (array_agg(ctx))[1] as ctx
  from hit group by src order by src;
