with w(no) as (values ('2011다57548'),('2000마7838'))
select w.no,
  (select count(*) from public.cases c where regexp_replace(c.case_number,'\s','','g') ~ ('(^|[^0-9])'||w.no||'([^0-9]|$)')) as in_cases,
  (select count(*) from public.case_lower_courts x where regexp_replace(coalesce(x.body_text,''),'\s','','g') ~ ('(^|[^0-9])'||w.no||'([^0-9]|$)')) as in_판결문원문,
  (select count(*) from public.content_chunks k where regexp_replace(k.body_text,'\s','','g') ~ ('(^|[^0-9])'||w.no||'([^0-9]|$)')) as in_교재,
  (select string_agg(distinct p.display_no::text, ', ') from public.problems p
    where p.deleted_at is null and
      coalesce(p.explanation_md,'')||coalesce(p.model_answer_md,'')||coalesce(p.grading_rubric_md,'')||coalesce(p.rubric_items::text,'') like '%'||w.no||'%') as 문항
 from w order by w.no;
