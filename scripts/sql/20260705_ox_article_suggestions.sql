-- 정오문제 조문 매칭 2단계 — AI 후보 저장 + 운영자 결정 큐.
-- 신뢰성 원칙: 후보는 자동 노출되지 않고, 운영자가 승인해 related_article 이 실제로
-- 기입된 지문만 학생(조문 뷰어 정오문제 패널)에 노출된다.
-- RLS enable + 정책 없음 = service_role 전용 (관리 화면 loader/action 은 adminClient).

create table if not exists public.ox_article_suggestions (
  suggestion_id uuid primary key default gen_random_uuid(),
  ref_type text not null check (ref_type in ('choice','box')),
  ref_id uuid not null,
  problem_id uuid not null references public.problems(problem_id) on delete cascade,
  law_code text not null,
  -- null = "직접 근거 조문 특정 불가(판례 법리·이론)" 제안
  suggested_article_number text,
  rationale text,
  -- 검증 패스(조문 원문 vs 지문 명제 대조) 통과 여부
  verified boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','no_article')),
  decided_by uuid references public.profiles(profile_id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ref_type, ref_id)
);

comment on table public.ox_article_suggestions is
  '정오문제 지문 조문 매칭 AI 후보 — 운영자 승인 후에만 related_article 반영(학생 노출)';

create index if not exists ox_article_suggestions_law_status_idx
  on public.ox_article_suggestions (law_code, status);

alter table public.ox_article_suggestions enable row level security;
