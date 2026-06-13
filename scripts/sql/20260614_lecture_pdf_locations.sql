-- 조문/판례 → 통합본 PDF "전역 페이지" 위치 매핑 (feat: 위치 링크).
-- 기존 조각(lecture_resources)과 병존 — 추가만, 조각/연결은 건드리지 않음.
-- 재추출은 source_pdf_id 단위 delete+insert (멱등). target 은 polymorphic·FK 없음(기존 일관),
-- source_pdf_id 만 실테이블 FK(lecture_source_pdfs).
-- 가산적·롤백 가능. 롤백: drop table public.lecture_pdf_locations;
create table if not exists public.lecture_pdf_locations (
  location_id   uuid primary key default gen_random_uuid(),
  target_type   resource_target_type not null,        -- 기존 enum 재사용(article/case/…)
  target_id     uuid not null,                          -- polymorphic, FK 없음
  source_pdf_id uuid not null references public.lecture_source_pdfs(source_pdf_id) on delete cascade,
  page          integer not null,                       -- 통합본 전역 페이지(=슬라이드 물리 idx, 1-based)
  label         text,                                   -- 조문/사건번호 표기(제목용)
  created_at    timestamptz not null default now(),
  unique (target_type, target_id, source_pdf_id, page)
);
create index if not exists lecture_pdf_locations_target_idx
  on public.lecture_pdf_locations (target_type, target_id);

alter table public.lecture_pdf_locations enable row level security;

-- RLS: authenticated read · staff write(insert/update/delete — 재계산 파생 테이블이라 delete 허용)
do $$ begin
  if not exists (select 1 from pg_policies where tablename='lecture_pdf_locations' and policyname='lecture_pdf_locations_authenticated_select') then
    create policy lecture_pdf_locations_authenticated_select on public.lecture_pdf_locations
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename='lecture_pdf_locations' and policyname='lecture_pdf_locations_staff_write') then
    create policy lecture_pdf_locations_staff_write on public.lecture_pdf_locations
      for all
      using (private.get_role() = any (array['instructor','manager','admin']))
      with check (private.get_role() = any (array['instructor','manager','admin']));
  end if;
end $$;
