-- 가이드 대상(audience) — student(기본)=전체 학생 노출 / staff=운영자·강사 전용.
-- 종합반 운영 가이드처럼 학생에게 보일 필요 없는 운영 문서를 허브에 함께 담기 위함.

alter table public.guide_articles
  add column if not exists audience text not null default 'student'
  check (audience in ('student', 'staff'));

-- 발행본 select 정책 교체 — staff 대상 글은 staff 에게만.
drop policy if exists guide_articles_select_published on public.guide_articles;
create policy guide_articles_select_published on public.guide_articles
  for select using (
    is_published = true
    and (audience = 'student' or private.is_staff(auth.uid()))
  );
