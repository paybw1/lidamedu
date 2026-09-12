-- 사건번호 빈도 필터 (READ ONLY) — audit-case-citations.mjs 의 스캔 규칙을 SQL 로 옮긴 것.
--   · 대상 4표·필드: TARGETS 와 동일
--   · 추출 정규식: CASE_NO_RE = \b\d{2,4}(?!조|항|호|목)[가-힣]{1,3}\d+\b (공백 불허)
--     ★JS 의 \b 는 한글을 낱말문자로 보지 않는다 — Postgres \y 로 옮기면 "선고2009다123" 을
--     놓친다(실측 630종 vs 도구 675종). ASCII 낱말문자 lookaround 로 같은 뜻을 만든다.
--   · 부호 판정: markOf = 앞뒤 숫자 제거, CASE_MARKS 화이트리스트
--   · DB 대조: cases.case_number / case_lower_courts.lower_case_number 를 [,·/] 로 쪼개 공백 제거
--   · ★도구는 소프트삭제를 거르지 않는다 — 675종을 재현하려면 여기서도 거르지 않는다.
WITH
corpus AS (
  SELECT '2차 훈련 논점'::text AS src, issue_id::text AS row_id, (deleted_at IS NOT NULL) AS is_deleted,
         concat_ws(E'\n', label, description_md, model_conclusion_md) AS body, ''::text AS self_no
    FROM public.case_training_issues
  UNION ALL
  SELECT '판례 도식', diagram_id::text, (deleted_at IS NOT NULL),
         concat_ws(E'\n', facts_md, blocks::text), ''
    FROM public.case_diagrams
  UNION ALL
  SELECT '문제 해설·모범답안', problem_id::text, (deleted_at IS NOT NULL),
         concat_ws(E'\n', explanation_md, model_answer_md, grading_rubric_md, rubric_items::text), ''
    FROM public.problems
  UNION ALL
  -- ★자기 사건번호는 당연히 나오므로 뺀다(TARGETS.selfField).
  SELECT '판례 서술', case_id::text, (deleted_at IS NOT NULL),
         concat_ws(E'\n', summary_body_md, reasoning_md, comment_body_md, summary_items::text),
         regexp_replace(coalesce(case_number,''), '\s', '', 'g')
    FROM public.cases
),
raw AS (
  SELECT c.src, c.row_id, c.is_deleted, c.self_no, x[1] AS case_no
    FROM corpus c,
         regexp_matches(c.body, '((?<![0-9A-Za-z_])\d{2,4}(?!조|항|호|목)[가-힣]{1,3}\d+(?![0-9A-Za-z_]))', 'g') x
   WHERE c.body IS NOT NULL
),
-- ★DISTINCT 를 쓰면 total_hits 가 distinct_rows 와 같아져 single_row 판정이 죽는다.
--   한 행에 같은 번호가 두 번 나오는 것도 신호이므로 원시 출현을 남긴다.
cited AS (
  SELECT src, row_id, is_deleted, case_no,
         regexp_replace(regexp_replace(case_no, '^\d+', ''), '\d+$', '') AS code
    FROM raw
   WHERE case_no <> self_no
),
tool_marks AS (
  SELECT unnest(ARRAY['후','다','도','두','마','카','므','그','오','초','재다','재후','허',
                      '가합','가단','가소','나','라','고합','고단','고정','노','로',
                      '구합','구단','누','카합','카단','카기','즈합','즈단','비','드합','드단']) AS m
),
extra_marks AS (  -- 도구에는 없고 이번 템플릿이 보강한 부호
  SELECT unnest(ARRAY['재누','헌가','헌나','헌마','헌바','헌사','헌아','즈기','드','르','스']) AS m
),
court AS (
  SELECT c.*, (c.code IN (SELECT m FROM tool_marks)) AS mark_in_tool
    FROM cited c
   WHERE c.code IN (SELECT m FROM tool_marks) OR c.code IN (SELECT m FROM extra_marks)
),
agg AS (
  SELECT case_no, code, bool_or(mark_in_tool) AS mark_in_tool,
         count(*)                               AS total_hits,
         count(DISTINCT row_id)                 AS distinct_rows,
         count(DISTINCT src)                    AS distinct_srcs,
         count(*) FILTER (WHERE NOT is_deleted) AS live_hits,
         array_agg(DISTINCT src)                AS srcs
    FROM court GROUP BY case_no, code
),
known AS (
  SELECT DISTINCT regexp_replace(part, '\s', '', 'g') AS case_no
    FROM public.cases, regexp_split_to_table(coalesce(case_number,''), '[,·/]') part
   WHERE regexp_replace(part, '\s', '', 'g') <> ''
  UNION
  SELECT DISTINCT regexp_replace(part, '\s', '', 'g')
    FROM public.case_lower_courts, regexp_split_to_table(coalesce(lower_case_number,''), '[,·/]') part
   WHERE regexp_replace(part, '\s', '', 'g') <> ''
),
scored AS (
  SELECT a.*,
         (k.case_no IS NOT NULL) AS in_db,
         (a.code IN ('허','후'))  AS source_blind,
         CASE WHEN a.distinct_rows = 1 AND a.total_hits = 1 THEN 'singleton'
              WHEN a.distinct_rows = 1                      THEN 'single_row'
              WHEN a.distinct_rows <= 2                     THEN 'low'
              ELSE                                               'recurring' END AS freq_class
    FROM agg a LEFT JOIN known k ON k.case_no = a.case_no
)
-- 판례 서술(cases)에서만 나오고 · DB 미수록 · blind=N(허·후 아님) · singleton 인 사건번호 20종.
-- ★재현 가능성: 정렬키가 md5(case_no) 라 입력이 같으면 언제 돌려도 같은 20종이 나온다.
--   (case_no 오름차순은 연도 앞쪽에만 쏠려 표본으로 나쁘다.)
SELECT case_no, code, total_hits, distinct_rows, live_hits,
       array_to_string(srcs,'+') AS srcs,
       (SELECT count(*) FROM scored z
         WHERE NOT z.in_db AND NOT z.source_blind AND z.freq_class = 'singleton'
           AND z.srcs = ARRAY['판례 서술']::text[]) AS pool_size
  FROM scored
 WHERE NOT in_db
   AND NOT source_blind
   AND freq_class = 'singleton'
   AND srcs = ARRAY['판례 서술']::text[]
 ORDER BY md5(case_no)
 LIMIT 20;
