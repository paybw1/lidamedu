select display_no, problem_id::text as pid, explanation_md, model_answer_md, grading_rubric_md
  from public.problems where display_no in (9698, 8971, 9768, 9646) and deleted_at is null
 order by display_no;
