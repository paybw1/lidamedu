-- feat-3-214 A단계 — 판례 다중 배치.
--
-- 왜: 리담 판례집은 같은 판결을 두 주제에서 **다른 각도로** 다루는데(상표 5건),
--     판례 1건 = 배치 1곳이라 뒤 주제의 서술이 통째로 안 보인다.
-- ★배치만 늘리면 문제가 안 풀린다 — 본문이 하나면 주제19 에서 눌러도 주제9 내용이
--   나온다. 그래서 주제별 서술(book_sections)을 링크에 담는다.
--
-- cases.primary_node_id 는 남긴다(27개 파일이 읽는다). 그 열이 계속 권위이고,
-- 링크는 그것을 따라간다 — 최신판례 트리거·승인 플로우가 그대로 동작하게.

create table if not exists public.case_systematic_links (
  link_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(case_id) on delete cascade,
  node_id uuid not null references public.systematic_nodes(node_id) on delete cascade,
  seq smallint not null default 1,
  is_primary boolean not null default false,
  -- 그 주제에서의 교재 서술. null 이면 cases.book_sections 로 폴백.
  book_sections jsonb,
  -- 그 주제 안에서의 교재 순번(목록 정렬용). null 이면 cases.source_seq.
  source_seq integer,
  note text,
  created_by uuid references public.profiles(profile_id),
  created_at timestamptz not null default now(),
  unique (case_id, node_id)
);

create index if not exists csl_case on public.case_systematic_links (case_id);
create index if not exists csl_node on public.case_systematic_links (node_id);
-- 대표 배치는 판례당 하나뿐.
create unique index if not exists csl_one_primary
  on public.case_systematic_links (case_id) where is_primary;

comment on table public.case_systematic_links is
  'feat-3-214 판례 ↔ 체계도 노드 다중 배치. book_sections 는 그 주제에서의 교재 서술(null 이면 cases.book_sections).';

alter table public.case_systematic_links enable row level security;

drop policy if exists csl_select on public.case_systematic_links;
create policy csl_select on public.case_systematic_links for select using (true);

drop policy if exists csl_write on public.case_systematic_links;
create policy csl_write on public.case_systematic_links for all
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

-- ── 정합 트리거 ──────────────────────────────────────────────────────────
-- cases.primary_node_id ↔ 대표 링크(is_primary)를 양방향으로 맞춘다.
-- ★pg_trigger_depth 가드가 없으면 두 트리거가 서로를 불러 무한 재귀한다.

create or replace function public.sync_case_primary_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  -- 기존 대표 배치 해제(새 노드가 아닌 것들)
  update public.case_systematic_links
     set is_primary = false
   where case_id = new.case_id
     and is_primary
     and (new.primary_node_id is null or node_id is distinct from new.primary_node_id);

  if new.primary_node_id is not null then
    insert into public.case_systematic_links (case_id, node_id, is_primary, source_seq)
    values (new.case_id, new.primary_node_id, true, new.source_seq)
    on conflict (case_id, node_id)
      do update set is_primary = true;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_case_primary_link on public.cases;
create trigger trg_sync_case_primary_link
  after insert or update of primary_node_id on public.cases
  for each row execute function public.sync_case_primary_link();

create or replace function public.sync_link_to_case_primary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if new.is_primary then
    update public.cases
       set primary_node_id = new.node_id
     where case_id = new.case_id
       and primary_node_id is distinct from new.node_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_link_to_case_primary on public.case_systematic_links;
create trigger trg_sync_link_to_case_primary
  after insert or update of is_primary, node_id on public.case_systematic_links
  for each row execute function public.sync_link_to_case_primary();
