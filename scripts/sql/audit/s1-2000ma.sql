select display_no,
       case when explanation_md like '%2000마7838%' then 'explanation ' else '' end ||
       case when model_answer_md like '%2000마7838%' then 'model_answer ' else '' end ||
       case when grading_rubric_md like '%2000마7838%' then 'rubric_md ' else '' end ||
       case when rubric_items::text like '%2000마7838%' then 'rubric_items' else '' end as fields,
       (length(coalesce(grading_rubric_md,'')) - length(replace(coalesce(grading_rubric_md,''),'2000마7838',''))) / length('2000마7838') as hits_rubric,
       substring(grading_rubric_md from greatest(1, position('2000마7838' in grading_rubric_md) - 150) for 320) as ctx
  from public.problems
 where deleted_at is null
   and coalesce(explanation_md,'')||coalesce(model_answer_md,'')||coalesce(grading_rubric_md,'')||coalesce(rubric_items::text,'') like '%2000마7838%';
