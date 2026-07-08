-- Disk IO 고갈 사후 조치 (2026-07-08 인시던트) — 반복 seq scan 2곳 인덱스.
-- 근거: pg_stat_user_tables — cases seq_scan 6,973회(43MB, subject_laws 배열 contains 필터),
--       qna_threads seq_scan 9,692회(19MB, 목록 정렬·필터).

-- 판례 목록/필터: .contains(subject_laws, [law]) — text[] GIN
create index if not exists cases_subject_laws_gin
  on public.cases using gin (subject_laws);

-- Q&A 목록 기본 경로: deleted_at is null + created_at desc 정렬
create index if not exists qna_threads_visible_created_idx
  on public.qna_threads (created_at desc, thread_id desc)
  where deleted_at is null;

-- 아카이브·대상 필터 보조 (target_type/target_id 조회가 많음)
create index if not exists qna_threads_target_idx
  on public.qna_threads (target_type, target_id)
  where deleted_at is null;

analyze public.cases;
analyze public.qna_threads;
