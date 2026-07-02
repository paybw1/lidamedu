-- Q&A 스레드에 체계도 노드(단원) 캡처 — 과목·단원별 학습분석 집계용.
-- 질문 생성 시 대상에서 노드를 해석해 저장(재계산이 아니라 캡처).
--   조문→article_systematic_links 첫 노드 / 판례·문제→primary_node_id /
--   쟁점→자기 자신 / 공부방법·일반→null.

alter table public.qna_threads
  add column if not exists node_id uuid
    references public.systematic_nodes(node_id) on delete set null;

create index if not exists qna_threads_node_id_idx
  on public.qna_threads (node_id);

comment on column public.qna_threads.node_id is
  'Q&A 대상의 체계도 노드(단원) — 생성 시 대상에서 해석해 저장. 학습분석 집계용.';
