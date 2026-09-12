select p.display_no, p.subjective_topic, left(p.body_md, 200) as 발문,
       substring(p.grading_rubric_md from
         greatest(1, position('2019도14180' in p.grading_rubric_md) - 420) for 800) as rubric_ctx
  from public.problems p
 where p.problem_id = 'be3003b8-9bbc-4b56-a0cd-96f86d164b53';
