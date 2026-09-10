-- 한 쪽에 덩이가 둘이면 **각각 한 화면**으로 나눈다(원장 지시 2026-09-10).
--   9p  = 정정청구 제도 / 재심 제도
--   11p = 국제출원절차 / 국내단계의 번역문 제출
--
-- ★`scope_key` 는 화면이 쓰는 CSS 클래스 꼬리표(`dp9-0`)다. 적재 때 만든 값을 그대로
--   저장한다 — 화면에서 다시 조립하면 규칙이 갈라져 언젠가 어긋난다.

alter table public.systematic_digests
  add column if not exists part integer not null default 0,
  add column if not exists scope_key text;

-- 같은 쪽이라도 덩이가 다르면 다른 자료다.
alter table public.systematic_digests
  drop constraint if exists systematic_digests_law_code_page_key;
create unique index if not exists systematic_digests_law_page_part_uidx
  on public.systematic_digests (law_code, page, part);

comment on column public.systematic_digests.part is
  '한 쪽 안의 덩이 번호(0부터). 나누지 않은 쪽은 0.';
comment on column public.systematic_digests.scope_key is
  '자료 전용 CSS 를 가르는 꼬리표 — 화면은 `dp{scope_key}` 클래스를 붙인다.';
