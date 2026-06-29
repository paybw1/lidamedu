-- feat-7-040 후속 P3 — 모의(exam) 점수 불변 스냅샷.
-- 기존엔 exam 점수를 user_problem_attempts 에서 매번 라이브 재계산 → 시도 편집/삭제 시
-- 과거 모의 점수가 흔들림. 완료 시점 점수를 quiz_sessions 에 스냅샷(불변)으로 기록한다.
-- nullable: 기존 세션은 null → 조회 시 라이브 폴백.
ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS score_correct integer,
  ADD COLUMN IF NOT EXISTS score_total integer;

COMMENT ON COLUMN public.quiz_sessions.score_correct IS
  'feat-7-040: 완료 시 정답 수 스냅샷(불변, 라이브 재계산 아님). null=미스냅샷(라이브 폴백).';
COMMENT ON COLUMN public.quiz_sessions.score_total IS
  'feat-7-040: 완료 시 채점 대상(응답) 수 스냅샷(불변). null=미스냅샷.';
