select (select count(*) from public.problems
         where deleted_at is null and
           coalesce(explanation_md,'')||coalesce(model_answer_md,'')||
           coalesce(grading_rubric_md,'')||coalesce(rubric_items::text,'') like '%2000마7838%') as 잔존,
       (select substring(grading_rubric_md from
                 greatest(1, position('취소사유는 심결확정' in grading_rubric_md) - 40) for 130)
          from public.problems where display_no = 9646 and deleted_at is null) as 고친_줄;
