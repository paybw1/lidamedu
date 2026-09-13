-- ★문서 쌍 전수 점검 — 쌍의 한쪽만 0건 적재인 경우를 전 과목에서 찾는다.
--   이번 특허 예상문제 누락(문제편 592 / 해설편 0)과 같은 패턴이 다른 과목에도 있는가.
WITH cnt AS (
  SELECT d.source_doc_id, d.label, d.kind::text AS kind, d.file_name, d.paired_with_doc_id,
         count(p.problem_id)                                              AS 문항수,
         count(p.problem_id) FILTER (WHERE p.explanation_md IS NOT NULL)  AS 해설있음,
         (SELECT string_agg(DISTINCT l.law_code, ',')
            FROM public.problems p2 JOIN public.laws l ON l.law_id = p2.law_id
           WHERE p2.source_doc_id = d.source_doc_id AND p2.deleted_at IS NULL) AS 과목
    FROM public.problem_source_docs d
    LEFT JOIN public.problems p
      ON p.source_doc_id = d.source_doc_id AND p.deleted_at IS NULL
   GROUP BY d.source_doc_id, d.label, d.kind, d.file_name, d.paired_with_doc_id
)
SELECT coalesce(a.과목, b.과목, '(미적재)') AS 과목,
       a.label AS 문서, a.kind, a.문항수, a.해설있음,
       b.label AS 짝문서, b.kind AS 짝kind, b.문항수 AS 짝문항수, b.해설있음 AS 짝해설있음,
       CASE WHEN b.source_doc_id IS NULL             THEN '짝 없음'
            WHEN a.문항수 = 0 OR b.문항수 = 0        THEN '★한쪽 0건'
            ELSE 'ok' END AS 판정
  FROM cnt a
  LEFT JOIN cnt b ON b.source_doc_id = a.paired_with_doc_id
 ORDER BY (CASE WHEN b.source_doc_id IS NOT NULL AND (a.문항수 = 0 OR b.문항수 = 0) THEN 0 ELSE 1 END),
          coalesce(a.과목, b.과목, ''), a.label;
