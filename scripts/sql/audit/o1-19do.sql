-- 2019도14180 이 정확히 어느 문항·어느 필드에 있는가.
with p as (
  select p.problem_id, p.display_no, p.year, p.exam_round::text as round,
         p.subject_type::text as stype, l.law_code, p.subjective_kind::text as skind,
         p.deleted_at is not null as deleted,
         p.explanation_md, p.model_answer_md, p.grading_rubric_md, p.rubric_items::text as rubric_items
    from public.problems p left join public.laws l on l.law_id = p.law_id
)
select display_no, year, round, law_code, skind, deleted,
       case when explanation_md    like '%2019도14180%' then 'O' else '-' end as in_explanation,
       case when model_answer_md   like '%2019도14180%' then 'O' else '-' end as in_model_answer,
       case when grading_rubric_md like '%2019도14180%' then 'O' else '-' end as in_rubric_md,
       case when rubric_items      like '%2019도14180%' then 'O' else '-' end as in_rubric_items,
       problem_id::text as pid
  from p
 where coalesce(explanation_md,'') || coalesce(model_answer_md,'') ||
       coalesce(grading_rubric_md,'') || coalesce(rubric_items,'') like '%2019도14180%';
