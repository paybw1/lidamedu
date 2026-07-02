-- Q&A 스레드에 과학 단원(science_sections) 캡처 — 법 과목 node_id 와 대칭.
-- 과학 문제는 systematic_nodes 가 아니라 science_sections 체계라 별도 컬럼.
--   과학 문제 질문 → problems.science_section_id 를 저장. 그 외 → null.

alter table public.qna_threads
  add column if not exists science_section_id uuid
    references public.science_sections(section_id) on delete set null;

create index if not exists qna_threads_science_section_id_idx
  on public.qna_threads (science_section_id);

comment on column public.qna_threads.science_section_id is
  'Q&A 대상이 과학 문제일 때의 science_sections 단원 — 학습분석 과학 축 집계용.';
