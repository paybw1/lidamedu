-- 도해특허법 제20판 — 조문 팝업 자료 (feat: dohae)
-- ★staff 전용(수험생 비노출 — 사용자 지시 2026-08-14): SELECT=is_staff, 쓰기 정책 없음(시드=service_role).
-- 콘텐츠 정정은 시드 재실행(판례 book_sections 와 동일 정책 — 편집 UI 없음, 요구 "편집 불가").

begin;

create table public.dohae_units (
  unit_id       uuid primary key default gen_random_uuid(),
  book_code     text not null default 'dohae_patent_20',   -- 추후 도해상표법 등 확장 대비
  unit_key      text not null,                             -- 't01'(주제) / 'r2-1'(참고자료 2.1)
  kind          text not null check (kind in ('topic', 'reference')),
  chapter_no    int  not null,
  chapter_title text not null default '',
  unit_no       int,                                       -- 주제 전역 연번(1~81), 참고자료는 null
  ref_no        text,                                      -- 참고자료 'N.M', 주제는 null
  title         text not null,
  law_refs      jsonb not null default '[]'::jsonb,        -- 원문 표기 보존 [{law, articles, raw}]
  pdf_page      int,                                       -- 원본 PDF 페이지(검수 대조용)
  blocks        jsonb not null,                            -- [{type:h|p|table|diagram|image, …}] 렌더 SSOT
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (book_code, unit_key)
);

comment on table public.dohae_units is
  '도해특허법 주제/참고자료 단위 콘텐츠. staff 전용 — 학생 공개는 별도 결정 전 금지.';

-- 조문 ↔ 유닛 (조문 뷰어에서 해당 조문의 도해 존재 판정·팝업 목록)
create table public.dohae_unit_articles (
  unit_id    uuid not null references public.dohae_units (unit_id) on delete cascade,
  article_id uuid not null references public.articles (article_id) on delete cascade,
  primary key (unit_id, article_id)
);
create index dohae_unit_articles_article_idx on public.dohae_unit_articles (article_id);

alter table public.dohae_units enable row level security;
alter table public.dohae_unit_articles enable row level security;

-- 읽기 = staff 만. 학생 정책 없음. 쓰기 정책 없음(service_role 시드 전용).
create policy dohae_units_staff_select on public.dohae_units
  for select using (private.is_staff(auth.uid()));
create policy dohae_unit_articles_staff_select on public.dohae_unit_articles
  for select using (private.is_staff(auth.uid()));

-- Storage: 비공개 버킷(공개 URL 금지 — 다이어그램 크롭도 staff 게이트 loader 의 서명 URL 로만)
insert into storage.buckets (id, name, public)
values ('dohae', 'dohae', false)
on conflict (id) do nothing;

commit;
