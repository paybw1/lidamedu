-- 통합 강의노트 통짜 PDF "원본" 메타 테이블 (feat: 원본 보관 토대).
-- 진단(docs/survey/강의자료-처리현황.md)의 "원본 보관 미구현" 해소.
-- 가산적(additive) · 멱등 재실행 가능. 기존 lecture_resources/조각 데이터는 건드리지 않음.
-- 롤백: drop table public.lecture_source_pdfs;
create table if not exists public.lecture_source_pdfs (
  source_pdf_id   uuid primary key,            -- 결정적 UUID(책 이름 sha1) — lecture_resources.source_pdf_id 와 동일 id-space
  subject_law     text not null,               -- 'patent'
  title           text not null,               -- '리담특허법 강의노트 (제10판)'
  edition         text,                        -- '제10판'
  source_filename text,                        -- '특허법 강의노트(제10판).pptx'
  storage_bucket  text not null default 'lecture-notes',
  storage_path    text not null,               -- 'original/patent-lecture-v10.pdf'
  total_pages     integer not null,
  slide_count     integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.lecture_source_pdfs enable row level security;

-- RLS: lecture_resources 정책 미러 (authenticated read · staff write · no hard delete)
do $$ begin
  if not exists (select 1 from pg_policies where tablename='lecture_source_pdfs' and policyname='lecture_source_pdfs_authenticated_select') then
    create policy lecture_source_pdfs_authenticated_select on public.lecture_source_pdfs
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename='lecture_source_pdfs' and policyname='lecture_source_pdfs_staff_insert') then
    create policy lecture_source_pdfs_staff_insert on public.lecture_source_pdfs
      for insert with check (private.get_role() = any (array['instructor','manager','admin']));
  end if;
  if not exists (select 1 from pg_policies where tablename='lecture_source_pdfs' and policyname='lecture_source_pdfs_staff_update') then
    create policy lecture_source_pdfs_staff_update on public.lecture_source_pdfs
      for update using (private.get_role() = any (array['instructor','manager','admin']))
                with check (private.get_role() = any (array['instructor','manager','admin']));
  end if;
  if not exists (select 1 from pg_policies where tablename='lecture_source_pdfs' and policyname='lecture_source_pdfs_no_hard_delete') then
    create policy lecture_source_pdfs_no_hard_delete on public.lecture_source_pdfs
      for delete using (false);
  end if;
end $$;

drop trigger if exists lecture_source_pdfs_set_updated_at on public.lecture_source_pdfs;
create trigger lecture_source_pdfs_set_updated_at
  before update on public.lecture_source_pdfs
  for each row execute function set_updated_at();
