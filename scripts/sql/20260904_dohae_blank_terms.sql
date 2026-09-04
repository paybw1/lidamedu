-- feat-2-037 S2 — 도해 빈칸 학습 모드의 낱말 저장소.
--
-- ★좌표(어느 블록 몇 번째 글자)는 저장하지 않는다. 말만 저장하고 위치는 렌더 때
--   본문에서 다시 찾는다 — 도해 본문은 운영자 편집(dohae-unit-editing)으로도
--   재파싱으로도 바뀌므로, 좌표를 들고 있으면 조문 빈칸이 겪은 좌표 유실
--   (재직렬화 한 번에 96세트)이 그대로 재현된다. 못 찾는 말은 조용히 빠질 뿐이다.
--
-- ★행은 사람이 쓴 것이 아니라 추출 스크립트(gen-blank-terms)가 만든 것이다.
--   유닛 재시드로 cascade 삭제되어도 되만들 수 있다 — 유닛 편집분과 다르다.
--   단 `excluded_at`(운영자가 뺀 말)은 사람의 판단이므로 재생성 시 보존해야 한다.

create table if not exists public.dohae_blank_terms (
  term_id      uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.dohae_units(unit_id) on delete cascade,
  term         text not null,
  -- 유형 1(기출 유래) / 유형 2(정오 유래) 소속. 유형 3 은 둘의 합집합이라 컬럼이 없다.
  from_exam    boolean not null default false,
  from_ox      boolean not null default false,
  -- 근거 건수 — 화면에 "기출 5 · 정오 23" 으로 보여 주고, 유형별 순위의 기준이다.
  exam_count   integer not null default 0,
  ox_count     integer not null default 0,
  score        numeric not null default 0,
  -- 운영자가 뺀 말. 지우지 않고 표시만 한다(왜 뺐는지 다시 보게 된다).
  excluded_at  timestamptz,
  excluded_by  uuid references public.profiles(profile_id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint dohae_blank_terms_unit_term_uniq unique (unit_id, term),
  -- 어느 유형에도 안 속한 말은 어느 화면에도 안 나온다 — 들어올 이유가 없다.
  constraint dohae_blank_terms_has_source check (from_exam or from_ox),
  constraint dohae_blank_terms_term_len check (char_length(term) between 2 and 12)
);

-- 화면은 언제나 "이 유닛의 살아 있는 말 전부"를 읽는다.
create index if not exists dohae_blank_terms_unit_idx
  on public.dohae_blank_terms (unit_id)
  where excluded_at is null;

alter table public.dohae_blank_terms enable row level security;

-- ★처음에는 읽기까지 staff 전용이다. 화면만 staff 로 막고 테이블을 전원에게 열면
--   검수 전 낱말이 PostgREST 로 그대로 나간다(problems 가 RLS 로 draft 를 안 가려
--   같은 일을 겪었다). 학생 공개(S5)를 결정할 때 이 정책을 넓힌다.
drop policy if exists dohae_blank_terms_staff_select on public.dohae_blank_terms;
create policy dohae_blank_terms_staff_select
  on public.dohae_blank_terms for select
  using (private.is_staff(auth.uid()));

drop policy if exists dohae_blank_terms_staff_write on public.dohae_blank_terms;
create policy dohae_blank_terms_staff_write
  on public.dohae_blank_terms for update
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

-- INSERT/DELETE 는 열지 않는다 — 말을 만드는 것은 추출 스크립트(service_role)의 몫이고,
-- 운영자가 화면에서 하는 일은 `excluded_at` 을 켜고 끄는 UPDATE 뿐이다.

comment on table public.dohae_blank_terms is
  'feat-2-037 도해 빈칸이 될 낱말. 좌표 없음 — 위치는 렌더 때 본문에서 찾는다.';
