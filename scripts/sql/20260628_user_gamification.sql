-- feat-2-027 Phase 2 — 게임화 상태 테이블 (스트릭 영속 + 레벨업 1회 알림 상태).
-- ★DRY-RUN: 사용자 승인 후 적용(CLAUDE.md 스키마 변경 게이트). 적용 시 npm run db:typegen 동반.
--
-- 설계 근거:
--  - 현재 스트릭·레벨 값은 파생(getDailyStudyStats.currentStreak / getNodeMastery mastered 수) → 저장 안 함.
--  - 이 테이블은 "파생이 아닌 상태"만 최소 저장:
--      longest_streak_days       : 최장 연속 학습 기록(영속 성취 — 과거 attempt 정리돼도 보존)
--      last_active_date          : 마지막 활동일(KST) — 주간 케이던스/연속 계산·freeze 충전 기준
--      streak_freezes_remaining  : 회복용 보호(주간 1회 충전) — 단일 결석에 스트릭 안 끊김
--      level_seen                : 마지막으로 본 레벨(레벨업 조용한 알림 1회용)
--  - user_problem_srs 미러: user_id = auth.uid(), FK 없음(기존 user_* 테이블 관행), self R/W RLS.
--  - backfill 없음(신규) — 행은 활동 시 lazy upsert. 행 없어도 현재/최장 스트릭은 attempt에서 파생 표시 가능.
--  - soft-delete 불필요(학습데이터 아님, 파생 가능한 게임화 상태).

create table if not exists public.user_gamification (
  user_id uuid primary key,
  longest_streak_days integer not null default 0,
  last_active_date date,
  streak_freezes_remaining smallint not null default 1,
  level_seen smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_gamification enable row level security;

create policy user_gamification_self_select on public.user_gamification
  for select using (user_id = auth.uid());
create policy user_gamification_self_insert on public.user_gamification
  for insert with check (user_id = auth.uid());
create policy user_gamification_self_update on public.user_gamification
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- delete 정책 없음: 게임화 상태는 사용자가 직접 삭제하지 않음(파생 가능, soft-delete 무관).
