-- feat-11-008 P5 — ①강의그룹 구성 정션(content_group_items): 하나의 콘텐츠를 여러 그룹에
-- 연결(260807 요청서). 기존 video_contents.group_id(1:N)를 백필 후 읽기 경로 전환(컬럼 보존·쓰기 중단).
-- ②판매 상품 상세 섹션(detail_sections jsonb): 기본설명~환불 안내 9영역 에디터 저장.

create table if not exists public.content_group_items (
  item_id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.content_groups (group_id) on delete cascade,
  content_id uuid not null references public.video_contents (content_id) on delete cascade,
  seq integer not null default 0,
  lesson_no integer,
  title text,
  is_preview boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  -- 동일 그룹에 같은 콘텐츠 중복 추가 방지(요청서: 중복 경고).
  unique (group_id, content_id)
);
comment on table public.content_group_items is '강의그룹 구성(라이브러리 콘텐츠 M:N + 회차·순서) (feat-11-008)';
create index if not exists content_group_items_group_idx
  on public.content_group_items (group_id, seq);
create index if not exists content_group_items_content_idx
  on public.content_group_items (content_id);

alter table public.content_group_items enable row level security;
drop policy if exists content_group_items_staff on public.content_group_items;
create policy content_group_items_staff on public.content_group_items
  for all using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

-- 기존 1:N 연결 백필(멱등 — unique 충돌 시 무시).
insert into public.content_group_items (group_id, content_id, seq, title)
select vc.group_id, vc.content_id,
       row_number() over (partition by vc.group_id order by vc.created_at),
       vc.title
from public.video_contents vc
where vc.group_id is not null and vc.deleted_at is null
on conflict (group_id, content_id) do nothing;

-- 상세 섹션(9영역) — {key: html} jsonb. 기존 detail_html 은 '상세설명' 폴백으로 병존.
alter table public.subscription_plans
  add column if not exists detail_sections jsonb not null default '{}'::jsonb;
comment on column public.subscription_plans.detail_sections is '상세페이지 섹션별 HTML(기본설명·소개·수강대상 등 9종) (feat-11-008)';
