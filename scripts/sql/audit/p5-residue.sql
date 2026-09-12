with w(no) as (values ('2021다257968'),('2011후2737'),('2011후3727'),('2011다108085'),('2011다15469'),('2019도14180'))
select w.no,
       (select count(*) from public.problems p
         where coalesce(p.explanation_md,'')||coalesce(p.model_answer_md,'')||
               coalesce(p.grading_rubric_md,'')||coalesce(p.rubric_items::text,'') like '%'||w.no||'%') as 잔존
  from w order by w.no;
