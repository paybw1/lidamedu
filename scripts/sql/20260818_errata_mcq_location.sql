-- 정오표 객관식 위치 표기 보강 (2026-08-15 사용자 지시)
-- 문제: 객관식 항목이 정오표에 "수록순 N" 으로만 나와 수험생이 교재에서 못 찾음.
-- 해결: ① 매핑에 단원 경로(toc_path) 백필 ② 뷰에 source_ref 노출(지문 번호 표기용)
--   → PDF 가 "출원공개제도 · 문제 3 · 지문 ④" 형태로 렌더한다.
-- 파생 정보 채우기라 비파괴 — 기존 page_no/sort_key 는 그대로 둔다.

begin;

-- ① mcq 매핑 toc_path 백필 — 문제의 체계도 단원 라벨(상위 장 포함).
--    [01] 같은 장식 번호는 제거하고 "장 > 단원" 형태로 정리.
with node_label as (
  select
    m.map_id,
    nullif(regexp_replace(coalesce(top.display_label, ''), '^\s*\d+\s*', ''), '') as chapter,
    nullif(regexp_replace(sn.display_label, '^\s*(\[\d+\]|\d+)\s*', ''), '') as unit
  from publication_content_map m
  join problems pr on pr.problem_id = m.content_id::uuid
  join systematic_nodes sn on sn.node_id = pr.primary_node_id
  left join systematic_nodes top
    on top.law_code = sn.law_code
   and top.path::text = 'patent.' || split_part(sn.path::text, '.', 2)
   and top.node_id <> sn.node_id
  where m.content_type = 'mcq'
    and m.toc_path is null
)
update publication_content_map m
   set toc_path = case
         when nl.chapter is not null and nl.unit is not null then nl.chapter || ' > ' || nl.unit
         else coalesce(nl.unit, nl.chapter)
       end
  from node_label nl
 where m.map_id = nl.map_id
   and coalesce(nl.unit, nl.chapter) is not null;

-- ② 뷰에 source_ref 추가 — 지문 번호(source_ref.choice_no) 표기에 필요.
create or replace view public.v_errata_sheet as
 SELECT r.revision_id,
    r.content_type,
    r.content_id,
    r.errata_kind,
    r.errata_severity,
    r.errata_title,
    r.errata_payload,
    r.errata_reason,
    r.effective_date,
    r.published_at,
    r.withdrawn_at,
    r.notice_status,
    r.withdraws_revision_id,
    m.edition_id,
    m.page_no,
    m.page_no_end,
    m.line_hint,
    m.toc_path,
    m.sort_key,
    e.edition_label,
    e.target_exam_date,
    p.title AS publication_title,
        CASE
            WHEN e.target_exam_date IS NULL THEN 'unknown'::text
            WHEN r.effective_date IS NULL THEN 'applicable'::text
            WHEN r.effective_date <= e.target_exam_date THEN 'applicable'::text
            ELSE 'future'::text
        END AS exam_scope,
    -- 신규 열은 기존 열 순서를 바꾸지 않도록 끝에 추가(뷰 재정의 제약).
    r.source_ref
   FROM content_revisions r
     JOIN publication_content_map m ON m.content_type = r.content_type AND m.content_id = r.content_id
     JOIN publication_editions e ON e.edition_id = m.edition_id
     JOIN publications p ON p.publication_id = e.publication_id
  WHERE r.notice_status = ANY (ARRAY['published'::text, 'withdrawn'::text]);

commit;
