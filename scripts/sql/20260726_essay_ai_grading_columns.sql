-- feat-2-032 S3 — 2차 기출 답안(user_subjective_attempts)에 AI 채점 초안 컬럼.
--   3축 점수(논점/구성/논증 0~100) + 종합 + 피드백. 강사 확정 전 초안(reviewer_* 와 별개).
alter table public.user_subjective_attempts
  add column if not exists ai_overall_score numeric,        -- 0~100 종합(가중합)
  add column if not exists ai_axis_scores jsonb,            -- {issue,structure,writing} 각 0~100
  add column if not exists ai_feedback_md text,             -- 총평(강점·보완·다음 학습) 마크다운
  add column if not exists ai_graded_at timestamptz;
