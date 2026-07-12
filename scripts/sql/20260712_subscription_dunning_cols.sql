-- feat-8-030 dunning — 결제 실패 재시도/유예 상태 컬럼.
-- 자동갱신 청구 실패 시 재시도 스케줄·유예 만료·최근 실패 사유를 구독에 기록.
alter table public.user_subscriptions
  add column if not exists failure_count integer not null default 0,
  add column if not exists last_failure_at timestamptz,
  add column if not exists last_failure_reason text,
  add column if not exists next_retry_at timestamptz,
  add column if not exists grace_until timestamptz;

-- 재시도 대상 조회용 부분 인덱스 — 회수 중(next_retry_at 설정) 구독만.
create index if not exists idx_user_subscriptions_retry
  on public.user_subscriptions (next_retry_at)
  where next_retry_at is not null;
