-- 목록 노출 수동 고정 (원장 지시 2026-08-21).
-- 규칙 백필 스크립트를 다시 돌려도 원장이 손으로 켜고 끈 판례는 유지되어야 한다.
--   list_visible_pinned = true  → apply-case-list-visibility.mjs 가 건너뛴다.
alter table public.cases
  add column if not exists list_visible_pinned boolean not null default false;

comment on column public.cases.list_visible_pinned is
  '목록 노출을 수동 고정. true 면 규칙 백필(apply-case-list-visibility.mjs)이 list_visible 을 덮지 않는다.';
