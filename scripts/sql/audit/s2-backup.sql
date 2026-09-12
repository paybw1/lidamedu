select display_no, problem_id::text as pid, grading_rubric_md,
       (length(grading_rubric_md) - length(replace(grading_rubric_md,'취소사유는 심결확정 전까지 유효(2000마7838)로 권리남용 불인정','')))
       / length('취소사유는 심결확정 전까지 유효(2000마7838)로 권리남용 불인정') as anchor_count
  from public.problems where display_no = 9646 and deleted_at is null;
