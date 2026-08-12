-- 주관식 문제 ↔ 체계도 노드 복수 배치 (feat: 주관식 노드 매핑 고도화)
-- 기존 problems.primary_node_id/primary_article_id 는 단일 배치라 주관식(설문별 복수 논점)에 부적합.
-- 조문 파생이 아닌 주제 노드(권리범위확인심판·침해에 대한 조치 등) 배치이므로 별도 링크 테이블.

create table if not exists public.problem_systematic_links (
  link_id     uuid primary key default gen_random_uuid(),
  problem_id  uuid not null references public.problems(problem_id) on delete cascade,
  node_id     uuid not null references public.systematic_nodes(node_id) on delete cascade,
  note        text,          -- 설문 라벨·논점 메모 (예: "설문(2) — §128 손해배상")
  seq         smallint,      -- 문항 내 노출 순서 (1부터)
  created_by  uuid references public.profiles(profile_id),
  created_at  timestamptz not null default now(),
  unique (problem_id, node_id)
);

create index if not exists psl_problem on public.problem_systematic_links(problem_id);
create index if not exists psl_node on public.problem_systematic_links(node_id);

alter table public.problem_systematic_links enable row level security;

-- 읽기: 콘텐츠 링크 — 전체 공개 (문제·체계도와 동일 정책 기조)
drop policy if exists psl_select on public.problem_systematic_links;
create policy psl_select on public.problem_systematic_links
  for select using (true);

-- 쓰기: staff (instructor/admin)
drop policy if exists psl_write on public.problem_systematic_links;
create policy psl_write on public.problem_systematic_links
  for all using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));
