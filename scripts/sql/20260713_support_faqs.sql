-- 고객센터 FAQ — /lecture/support 상단 "자주 묻는 질문". 운영자 CRUD, 공개 읽기.
create table if not exists public.support_faqs (
  faq_id      uuid primary key default gen_random_uuid(),
  category    text not null default '기타',
  question    text not null check (length(question) between 1 and 300),
  answer      text not null default '',
  sort_order  int not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists support_faqs_public_idx
  on public.support_faqs (category, sort_order)
  where deleted_at is null and published;

drop trigger if exists set_updated_at on public.support_faqs;
create trigger set_updated_at before update on public.support_faqs
  for each row execute function public.set_updated_at();

alter table public.support_faqs enable row level security;
grant select on public.support_faqs to anon, authenticated;
grant insert, update on public.support_faqs to authenticated;

drop policy if exists support_faqs_read on public.support_faqs;
create policy support_faqs_read on public.support_faqs for select to anon, authenticated
  using (deleted_at is null and (published or private.is_staff((select auth.uid()))));
drop policy if exists support_faqs_write on public.support_faqs;
create policy support_faqs_write on public.support_faqs for all to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));
