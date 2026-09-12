with w(no) as (values ('2021다257968'),('2011후2737'),('2011후3727'),('2011다108085'),('2011다15469'))
select w.no, p.display_no, coalesce(l.law_code,'-') as law, p.exam_round::text as round,
       case when p.explanation_md    like '%'||w.no||'%' then 'explanation ' else '' end ||
       case when p.model_answer_md   like '%'||w.no||'%' then 'model_answer ' else '' end ||
       case when p.grading_rubric_md like '%'||w.no||'%' then 'rubric_md ' else '' end ||
       case when p.rubric_items::text like '%'||w.no||'%' then 'rubric_items' else '' end as fields,
       p.problem_id::text as pid
  from w join public.problems p
    on coalesce(p.explanation_md,'')||coalesce(p.model_answer_md,'')||
       coalesce(p.grading_rubric_md,'')||coalesce(p.rubric_items::text,'') like '%'||w.no||'%'
  left join public.laws l on l.law_id = p.law_id
 where p.deleted_at is null
 order by w.no, p.display_no;
