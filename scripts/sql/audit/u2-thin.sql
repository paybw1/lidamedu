select pr.display_no, pr.problem_number, pr.exam_number,
       length(pr.explanation_md) as len, pr.explanation_md as body,
       left(regexp_replace(pr.body_md, '\s+', ' ', 'g'), 70) as 발문
  from public.problems pr join public.laws l on l.law_id = pr.law_id
 where pr.deleted_at is null and pr.explanation_md is not null
   and l.law_code = 'patent' and pr.origin = 'expected'
   and length(pr.explanation_md) < 20
 order by len limit 12;
