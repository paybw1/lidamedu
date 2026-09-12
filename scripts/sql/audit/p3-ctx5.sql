with w(no) as (values ('2021다257968'),('2011후2737'),('2011후3727'),('2011다108085'),('2011다15469')),
f(fld) as (values ('explanation_md'),('model_answer_md'),('grading_rubric_md'))
select w.no, p.display_no, f.fld,
       (length(t.txt) - length(replace(t.txt, w.no, ''))) / length(w.no) as hits,
       substring(t.txt from greatest(1, position(w.no in t.txt) - 120) for 280) as ctx
  from w
  cross join f
  join public.problems p on p.deleted_at is null
  join lateral (select case f.fld
          when 'explanation_md' then coalesce(p.explanation_md,'')
          when 'model_answer_md' then coalesce(p.model_answer_md,'')
          else coalesce(p.grading_rubric_md,'') end as txt) t on true
 where t.txt like '%'||w.no||'%'
 order by w.no, p.display_no, f.fld;
