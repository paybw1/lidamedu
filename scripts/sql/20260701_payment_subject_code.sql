-- feat-8-027 Stage 4 — 자기학습 과목별 결제. 결제 row 에 과목 코드를 실어
-- confirm 시 user_subscriptions.subject_code 로 전달한다. null = 전체 플랜(레거시/cohort).
alter table public.payments
  add column if not exists subject_code text;
