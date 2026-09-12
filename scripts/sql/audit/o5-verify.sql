-- 정정 확인 + 전 콘텐츠에 2019도14180 잔존 여부
select
  (select count(*) from public.problems
    where coalesce(explanation_md,'')||coalesce(model_answer_md,'')||
          coalesce(grading_rubric_md,'')||coalesce(rubric_items::text,'') like '%2019도14180%') as 잔존_problems,
  (select count(*) from public.cases
    where concat_ws(' ',summary_body_md,reasoning_md,comment_body_md,summary_items::text) like '%2019도14180%') as 잔존_cases,
  (select count(*) from public.case_diagrams
    where concat_ws(' ',facts_md,blocks::text) like '%2019도14180%') as 잔존_도식,
  (select count(*) from public.case_training_issues
    where concat_ws(' ',label,description_md,model_conclusion_md) like '%2019도14180%') as 잔존_훈련논점,
  (select count(*) from public.problems
    where grading_rubric_md like '%92도3350%') as 새번호_반영;
