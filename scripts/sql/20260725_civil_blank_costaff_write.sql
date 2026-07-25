-- feat-2-029/민법 협업 — 민법(civil) 빈칸 세트는 원장·스태프가 동일 권한으로 co-edit.
-- 기존 owner-write-blank-sets(소유자만 쓰기)는 유지하고, civil 한정 permissive 정책을 추가한다.
-- permissive 정책은 OR 결합 → civil 세트는 (owner 이거나) staff 이면 쓰기 허용, 그 외 과목은 소유자만.
-- read-blank-sets(SELECT true)는 이미 전원 열람 → '서로 볼 수 있게'는 충족.

drop policy if exists "civil-staff-write-blank-sets" on public.article_blank_sets;

create policy "civil-staff-write-blank-sets"
on public.article_blank_sets
as permissive
for all
to authenticated
using (
  private.is_staff(auth.uid())
  and exists (
    select 1
    from public.articles a
    join public.laws l on l.law_id = a.law_id
    where a.article_id = article_blank_sets.article_id
      and l.law_code = 'civil'
  )
)
with check (
  private.is_staff(auth.uid())
  and exists (
    select 1
    from public.articles a
    join public.laws l on l.law_id = a.law_id
    where a.article_id = article_blank_sets.article_id
      and l.law_code = 'civil'
  )
);
