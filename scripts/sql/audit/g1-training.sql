-- case_training_issues 에 실제로 텍스트가 있는가 — 필드별 채움률과 길이.
select
  count(*)                                                        as rows_total,
  count(*) filter (where deleted_at is not null)                  as soft_deleted,
  count(*) filter (where label is not null and label <> '')       as has_label,
  count(*) filter (where description_md is not null and description_md <> '')       as has_desc,
  count(*) filter (where model_conclusion_md is not null and model_conclusion_md <> '') as has_concl,
  round(avg(length(coalesce(description_md,''))))                 as desc_len_avg,
  max(length(coalesce(description_md,'')))                        as desc_len_max,
  round(avg(length(coalesce(model_conclusion_md,''))))            as concl_len_avg,
  max(length(coalesce(model_conclusion_md,'')))                   as concl_len_max
from public.case_training_issues;
