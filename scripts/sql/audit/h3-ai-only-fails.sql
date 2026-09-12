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
, fails(no) AS (VALUES
  ('1995다42195'),
  ('2000나13085'),
  ('2000마7838'),
  ('2000허2460'),
  ('2000허4947'),
  ('2000허6127'),
  ('2000후2439'),
  ('2001다4981'),
  ('2001도1682'),
  ('2001허1433'),
  ('2001후1655'),
  ('2001후2474'),
  ('2001후2542'),
  ('2002가합5333'),
  ('2002후2545'),
  ('2002후987'),
  ('2003가합96420'),
  ('2003구합4546'),
  ('2003다11516'),
  ('2003허571'),
  ('2003후1218'),
  ('2003후1673'),
  ('2003후1970'),
  ('2003후1987'),
  ('2004허7142'),
  ('2004허7760'),
  ('2004후1533'),
  ('2004후1663'),
  ('2004후2123'),
  ('2004후3133'),
  ('2005라726'),
  ('2005허10879'),
  ('2005허8081'),
  ('2005허9473'),
  ('2005후2656'),
  ('2006가합12384'),
  ('2006다17758'),
  ('2006허010661'),
  ('2006허1438'),
  ('2006허5294'),
  ('2006후1100'),
  ('2006후2653'),
  ('2006후3391'),
  ('2006후3472'),
  ('2006후367'),
  ('2006후688'),
  ('2007가합86087'),
  ('2007다3844'),
  ('2007다5069'),
  ('2007허11692'),
  ('2007허12497'),
  ('2007후2759'),
  ('2007후449'),
  ('2008가합550'),
  ('2008허2763'),
  ('2008허7003'),
  ('2008후13299'),
  ('2008후2770'),
  ('2008후4561'),
  ('2009허1965'),
  ('2009허4513'),
  ('2009허7673'),
  ('2009허7680'),
  ('2009후1125'),
  ('2010가합96947'),
  ('2010후1459'),
  ('2010후2094'),
  ('2010후2377'),
  ('2010후36'),
  ('2011가합4396'),
  ('2011구합21942'),
  ('2011나98503'),
  ('2011다108085'),
  ('2011다15469'),
  ('2011허12319'),
  ('2011허1258'),
  ('2011허7898'),
  ('2011후2596'),
  ('2011후2737'),
  ('2011후3727'),
  ('2012가합63163'),
  ('2012허1088'),
  ('2012허5387'),
  ('2012허6793'),
  ('2012허818'),
  ('2012허8393'),
  ('2012후1156'),
  ('2012후1613'),
  ('2012후2142'),
  ('2013카합1294'),
  ('2013허1832'),
  ('2013허242'),
  ('2013허8956'),
  ('2013후2477'),
  ('2014가합3026'),
  ('2014가합53215'),
  ('2014가합556560'),
  ('2014가합584121'),
  ('2014가합69019'),
  ('2014고정2370'),
  ('2014카합10056'),
  ('2014카합194'),
  ('2014허5633'),
  ('2014허7356'),
  ('2014허9338'),
  ('2014후2009'),
  ('2015가합503488'),
  ('2015가합51026'),
  ('2015가합54049'),
  ('2015가합558143'),
  ('2015가합565189'),
  ('2015가합568829'),
  ('2015가합578109'),
  ('2015나2021422'),
  ('2015라20318'),
  ('2015허2327'),
  ('2015허4231'),
  ('2015허4613'),
  ('2015허4804'),
  ('2015허5210'),
  ('2015허6848'),
  ('2015허8059'),
  ('2015허8226'),
  ('2015후727'),
  ('2016가합521605'),
  ('2016가합525317'),
  ('2016가합530982'),
  ('2016가합573859'),
  ('2016허106'),
  ('2016허2249'),
  ('2016허5729'),
  ('2016허8827'),
  ('2016허9790'),
  ('2016후2355'),
  ('2017가합509596'),
  ('2017가합541729'),
  ('2017가합557878'),
  ('2017다245789'),
  ('2017다259599'),
  ('2017허1342'),
  ('2017허2123'),
  ('2017허4716'),
  ('2017후1465'),
  ('2017후462'),
  ('2018카합21302'),
  ('2018허6351'),
  ('2018허8517'),
  ('2019가합509637'),
  ('2019가합578947'),
  ('2019가합582502'),
  ('2019다222799'),
  ('2019도14180'),
  ('2019허1643'),
  ('2019허4147'),
  ('2019허8095'),
  ('2020가합508241'),
  ('2020가합591823'),
  ('2020라21505'),
  ('2020카합21291'),
  ('2020허5948'),
  ('2020허6675'),
  ('2020허7005'),
  ('2020후10285'),
  ('2020후11325'),
  ('2021가합533152'),
  ('2021가합542835'),
  ('2021가합551723'),
  ('2021가합584518'),
  ('2021가합585191'),
  ('2021다257968'),
  ('2021허3666'),
  ('2021후10749'),
  ('2022구합89524'),
  ('2022카합21201'),
  ('2022허1148'),
  ('2022허3588'),
  ('2022허4376'),
  ('2024나10034'),
  ('2024나10096'),
  ('2024카합20193'),
  ('2024허14162'),
  ('2024허15899'),
  ('2025후10217'),
  ('66다1456'),
  ('67누21'),
  ('68다758'),
  ('69다1568'),
  ('70다877'),
  ('71마757'),
  ('76후7'),
  ('78다2342'),
  ('79후74'),
  ('81가합466'),
  ('81다549'),
  ('82누1'),
  ('85후106'),
  ('86후52'),
  ('89후1257'),
  ('90카1197'),
  ('90후1468'),
  ('91후536'),
  ('92노5251'),
  ('92후711'),
  ('93고단3547'),
  ('93카합1398'),
  ('94다24229'),
  ('96후1576'),
  ('96후1699'),
  ('97후3005'),
  ('98다54434'),
  ('98허10161'),
  ('98허3804'),
  ('98허6292'),
  ('98후232'),
  ('98후2696'),
  ('98후751'),
  ('98후96'),
  ('99가합31563'),
  ('99나59391'),
  ('99허5654'),
  ('99허6428'),
  ('99허6640'),
  ('99후468')
)
SELECT f.no AS case_no, s.code,
  CASE WHEN substring(f.no from '^\d{2,4}')::int < 100
       THEN (CASE WHEN substring(f.no from '^\d{2,4}')::int > 50 THEN 1900 ELSE 2000 END
             + substring(f.no from '^\d{2,4}')::int)
       ELSE substring(f.no from '^\d{2,4}')::int END AS yr,
  s.total_hits, s.distinct_rows, s.live_hits, array_to_string(s.srcs,'+') AS srcs
FROM fails f JOIN scored s ON s.case_no = f.no
WHERE NOT ('판례 서술' = ANY(s.srcs))
ORDER BY yr DESC, f.no;
