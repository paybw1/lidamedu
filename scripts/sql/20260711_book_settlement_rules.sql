-- feat-8-029 P6 — 도서정산 배분규칙(관리자 입력).
-- 강사 배분규칙(instructor_share_rules)과 동일한 세대교체 모델:
-- 값 수정 대신 "새 규칙 + 기존 비활성" — 확정 정산의 지급 근거 보존.
-- 정산 계산/지급은 추후. 지금은 규칙 입력만.

create table if not exists public.book_settlement_rules (
  rule_id uuid primary key default gen_random_uuid(),
  -- null = 전체 기본 규칙, 값 = 특정 도서.
  book_id uuid references public.books(book_id) on delete cascade,
  -- 정산 대상(저자/출판사 등) — 자유 입력.
  payee_name text not null,
  share_kind text not null check (share_kind in ('percent', 'fixed')),
  share_value integer not null check (share_value >= 0),
  effective_from date not null default (now() at time zone 'Asia/Seoul')::date,
  memo text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(profile_id),
  created_at timestamptz not null default now()
);

create index if not exists book_settlement_rules_book_idx
  on public.book_settlement_rules (book_id, is_active);
create index if not exists book_settlement_rules_active_idx
  on public.book_settlement_rules (is_active, effective_from desc);

-- RLS: 정산 3테이블과 동일 정책(enable + 정책 없음 → service_role/adminClient 전용).
alter table public.book_settlement_rules enable row level security;
