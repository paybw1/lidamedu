-- feat-11-009 — 메인화면 모듈형 CMS (요청서_0901 §2).
-- /lecture/home 을 고정 JSX 가 아니라 블록 목록으로 조립한다.
--
-- ★기간 종료 자동 비노출은 상태 컬럼·크론이 아니라 **읽기 쿼리 필터**로 한다.
--   크론이 안 돌면 노출이 어긋나고, 어긋난 걸 아무도 모른다.
-- ★PC/모바일 분기는 서버가 아니라 CSS 로 한다(device → 래퍼 클래스).
--   User-Agent 로 나누면 CDN 캐시가 두 벌 필요해지고 오판이 생긴다.

create table if not exists public.main_page_modules (
  module_id  uuid primary key default gen_random_uuid(),
  kind       text not null,
  label      text,
  config     jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  starts_at  timestamptz,
  ends_at    timestamptz,
  device     text not null default 'all',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint main_page_modules_device_check check (device in ('all', 'pc', 'mobile'))
);

comment on table public.main_page_modules is
  'feat-11-009 강의 플랫폼 메인화면(/lecture/home) 블록. kind 는 app/features/landing/lib/main-modules.ts 가 SSOT.';
comment on column public.main_page_modules.config is
  'kind 별 설정. 스키마는 main-modules.ts 의 zod 가 소유(서버·클라이언트 공용).';
comment on column public.main_page_modules.label is
  '관리 목록에서 같은 종류 모듈을 구분하는 운영자 메모. 화면에는 노출하지 않는다.';

-- 살아 있는 행만 순서대로 — 공개 렌더의 유일한 정렬 경로.
create index if not exists main_page_modules_order_idx
  on public.main_page_modules (sort_order, created_at)
  where deleted_at is null;

alter table public.main_page_modules enable row level security;

drop policy if exists main_page_modules_read on public.main_page_modules;
create policy main_page_modules_read on public.main_page_modules
  for select using (
    deleted_at is null
    and (
      -- 공개: 노출 ON + 기간 안. staff 는 숨김·기간 밖도 본다(관리 목록·미리보기).
      (
        is_visible
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at > now())
      )
      or private.is_staff((select auth.uid()))
    )
  );

drop policy if exists main_page_modules_write on public.main_page_modules;
create policy main_page_modules_write on public.main_page_modules
  for all using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

-- updated_at 자동 갱신 — 기존 테이블과 같은 트리거 함수를 쓴다.
drop trigger if exists main_page_modules_touch on public.main_page_modules;
create trigger main_page_modules_touch
  before update on public.main_page_modules
  for each row execute function public.set_updated_at();
