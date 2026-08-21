-- 참조 법령 — 판례 도식의 법조문 인용 중 5과목(특허·상표·디자인·민법·민사소송법)이
-- 아닌 법령의 조문 (원장 지시 2026-08-21).
--
-- ★articles 테이블에 넣지 않는다. articles 는 과목 조문 트리·체계도·빈칸·진도 분모·
--   AI 색인이 전제하는 테이블이라, 실용신안법 65조·형사소송법 610조 같은 참조 조문이
--   섞이면 "조문 진도"의 분모가 부풀고 학습 화면 곳곳에 새어 나온다.
--   여기 조문은 **읽기 전용 참조**다 — 학습화면·즐겨찾기·메모 대상이 아니고, 도식의
--   법조문 칩을 눌렀을 때 본문을 보여주는 용도로만 쓴다.
create table if not exists public.reference_laws (
  ref_law_id     uuid primary key default gen_random_uuid(),
  law_name       text not null unique,          -- 법령명 한글 정식 명칭
  -- 판결문이 쓰는 약칭들("공정거래법"). 도식 표기를 이 목록으로도 맞춘다.
  aliases        text[] not null default '{}',
  law_mst        text,                          -- 법령일련번호(재적재용)
  enforced_at    date,                          -- 시행일자
  source_fetched_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.reference_articles (
  ref_article_id uuid primary key default gen_random_uuid(),
  ref_law_id     uuid not null references public.reference_laws(ref_law_id) on delete cascade,
  -- "33", "126의2" — articles.article_number 와 같은 표기 규칙.
  article_number text not null,
  title          text,
  content_md     text not null,
  ord            integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (ref_law_id, article_number)
);

create index if not exists reference_articles_law_idx
  on public.reference_articles (ref_law_id, ord);

alter table public.reference_laws enable row level security;
alter table public.reference_articles enable row level security;

-- 콘텐츠 규칙 그대로 — 읽기는 전체 공개, 쓰기는 staff.
drop policy if exists "read-reference-laws" on public.reference_laws;
create policy "read-reference-laws" on public.reference_laws for select using (true);
drop policy if exists "staff-write-reference-laws" on public.reference_laws
  ;
create policy "staff-write-reference-laws" on public.reference_laws for all
  using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));

drop policy if exists "read-reference-articles" on public.reference_articles;
create policy "read-reference-articles" on public.reference_articles for select using (true);
drop policy if exists "staff-write-reference-articles" on public.reference_articles;
create policy "staff-write-reference-articles" on public.reference_articles for all
  using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));

comment on table public.reference_laws is
  '판례 도식이 인용하는 5과목 외 법령. 읽기 전용 참조 — 학습 대상 아님. 적재=scripts/laws/import-reference-laws.mjs';
comment on table public.reference_articles is
  '참조 법령의 조문 본문. 도식 법조문 칩 팝업 전용(학습화면 없음).';
