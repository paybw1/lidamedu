select display_no, left(problem_id::text, 8) as pid8, problem_id::text as pid
  from public.problems where display_no in (9698, 9768, 9646) and deleted_at is null order by display_no;
