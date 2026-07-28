-- feat-2-033: 주관식 시험 모드 응시 기록 (제한 시간·소요 시간)
ALTER TABLE public.user_subjective_attempts
  ADD COLUMN IF NOT EXISTS timed_limit_min integer
    CHECK (timed_limit_min IS NULL OR (timed_limit_min >= 1 AND timed_limit_min <= 180)),
  ADD COLUMN IF NOT EXISTS timed_elapsed_sec integer
    CHECK (timed_elapsed_sec IS NULL OR timed_elapsed_sec >= 0);

COMMENT ON COLUMN public.user_subjective_attempts.timed_limit_min IS '시험 모드 제한 시간(분). NULL=학습 모드 제출';
COMMENT ON COLUMN public.user_subjective_attempts.timed_elapsed_sec IS '시험 모드 실제 소요 시간(초)';
