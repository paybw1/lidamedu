select problem_id::text as pid, display_no, grading_rubric_md,
       (length(grading_rubric_md) - length(replace(grading_rubric_md,'2019도14180',''))) / length('2019도14180') as anchor_count
  from public.problems where problem_id = 'be3003b8-9bbc-4b56-a0cd-96f86d164b53';
