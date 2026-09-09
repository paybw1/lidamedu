-- 정리비교표(교재 부록) 적재용 테이블.
--
-- 교재 뒤쪽 정리비교표를 **텍스트 HTML** 로 재작화해 체계도 대분류마다 붙인다.
-- 이미지로 넣으면 나중에 빈칸 학습을 걸 수 없어(원장 지시) 전부 선택 가능한 글자다.
--
-- ★노출: 우선 staff 전용(검수). 학생 공개는 read 정책 한 줄을 더하는 것으로 전환한다.
-- ★(law_code, page) 가 재적재 키다 — 같은 쪽을 다시 올리면 덮어쓴다.

create table if not exists public.systematic_digests (
  digest_id uuid primary key default gen_random_uuid(),
  law_code text not null,
  node_id uuid references public.systematic_nodes (node_id) on delete set null,
  page integer not null,
  title text not null,
  body_html text not null,
  css text not null default '',
  ord integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (law_code, page)
);

create index if not exists systematic_digests_node_ord_idx
  on public.systematic_digests (node_id, ord);

drop trigger if exists systematic_digests_set_updated_at on public.systematic_digests;
create trigger systematic_digests_set_updated_at
  before update on public.systematic_digests
  for each row execute function public.set_updated_at();

alter table public.systematic_digests enable row level security;

-- staff 만 읽고 쓴다. 학생에게는 0건이 내려가 화면이 "아직 등록되지 않았습니다" 를 유지한다.
drop policy if exists systematic_digests_staff_all on public.systematic_digests;
create policy systematic_digests_staff_all
  on public.systematic_digests
  for all
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));
