-- 해설이 들어갈 수 있는 나머지 자리 — 실제로 차 있는지 본다.
SELECT 'problem_explanation_drafts.content_md' AS 자리, count(*) AS 행,
       count(*) FILTER (WHERE btrim(coalesce(content_md,'')) <> '') AS 내용있음,
       sum(length(coalesce(content_md,''))) AS 총자,
       count(DISTINCT problem_id) AS 문항수
  FROM public.problem_explanation_drafts
UNION ALL
SELECT 'problem_explanation_drafts.ai_answer', count(*),
       count(*) FILTER (WHERE btrim(coalesce(ai_answer,'')) <> ''),
       sum(length(coalesce(ai_answer,''))), count(DISTINCT problem_id)
  FROM public.problem_explanation_drafts
UNION ALL
SELECT 'problem_grading_notes.body_md', count(*),
       count(*) FILTER (WHERE btrim(coalesce(body_md,'')) <> ''),
       sum(length(coalesce(body_md,''))), count(DISTINCT problem_id)
  FROM public.problem_grading_notes
UNION ALL
SELECT 'problem_grading_notes.example_answer_md', count(*),
       count(*) FILTER (WHERE btrim(coalesce(example_answer_md,'')) <> ''),
       sum(length(coalesce(example_answer_md,''))), count(DISTINCT problem_id)
  FROM public.problem_grading_notes
UNION ALL
SELECT 'problem_text_drafts.stem_md', count(*),
       count(*) FILTER (WHERE btrim(coalesce(stem_md,'')) <> ''),
       sum(length(coalesce(stem_md,''))), count(DISTINCT problem_id)
  FROM public.problem_text_drafts
UNION ALL
SELECT 'problems.model_answer_md', count(*),
       count(*) FILTER (WHERE btrim(coalesce(model_answer_md,'')) <> ''),
       sum(length(coalesce(model_answer_md,''))), count(DISTINCT problem_id)
  FROM public.problems WHERE deleted_at IS NULL
UNION ALL
SELECT 'problems.grading_rubric_md', count(*),
       count(*) FILTER (WHERE btrim(coalesce(grading_rubric_md,'')) <> ''),
       sum(length(coalesce(grading_rubric_md,''))), count(DISTINCT problem_id)
  FROM public.problems WHERE deleted_at IS NULL
UNION ALL
SELECT 'problems.rubric_items(jsonb)', count(*),
       count(*) FILTER (WHERE rubric_items IS NOT NULL AND rubric_items::text NOT IN ('null','[]','{}')),
       sum(length(coalesce(rubric_items::text,''))), count(DISTINCT problem_id)
  FROM public.problems WHERE deleted_at IS NULL
UNION ALL
SELECT 'problem_choices.ox_body_md', count(*),
       count(*) FILTER (WHERE btrim(coalesce(ox_body_md,'')) <> ''),
       sum(length(coalesce(ox_body_md,''))), count(DISTINCT problem_id)
  FROM public.problem_choices
ORDER BY 1;
