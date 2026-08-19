-- feat-2-035 S1 — 판례 도식(사실관계→쟁점→법조문→법리→포섭→결론) 저장 테이블.
--
-- 판례 1건 = 도식 1개(case_id unique). 사실관계만 판례 전체에 하나이고,
-- 쟁점~결론은 쟁점마다 1세트라 blocks jsonb 배열로 반복한다.
-- 승인 전(draft)은 학생에게 보이지 않는다 — case_training_items 와 같은 RLS 형태.

create table if not exists public.case_diagrams (
  diagram_id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique
    references public.cases(case_id) on delete cascade,

  -- 사실관계 — 하급심 판결문에서 정리한다(상고심은 법률심이라 사실이 압축돼 있음).
  facts_md text not null default '',
  facts_source_kind text not null default 'none'
    check (facts_source_kind in
      ('lower_auto', 'lower_self', 'lower_manual', 'supreme_only', 'manual', 'none')),
  facts_source_ref text,                                  -- "특허법원 2022허4635" — 학생 화면 출처 캡션
  facts_source_meta jsonb not null default '{}'::jsonb,   -- {serial, files, fetchedAt} 재생성 추적

  -- 쟁점 단위 블록. 각 원소 = {issue, statutes[], doctrine{textual?,purpose?,objective?,balance?},
  -- application, conclusion}. 법리 4축은 각각 optional — 근거 없는 축은 비운다(창작 금지).
  -- 형태 검증은 action 경계의 Zod(app/features/cases/lib/case-diagram.ts)가 담당하고,
  -- DB 는 배열 여부만 보장한다.
  blocks jsonb not null default '[]'::jsonb
    check (jsonb_typeof(blocks) = 'array'),

  review_status public.problem_review_status not null default 'draft',
  generated_by text not null default 'ai' check (generated_by in ('ai', 'staff')),
  approved_at timestamptz,
  approved_by uuid references public.profiles(profile_id) on delete set null,
  rejected_reason text,

  created_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.case_diagrams is
  'feat-2-035 판례 도식 — 2차 답안 작성 순서(사실관계→쟁점→법조문→법리→포섭→결론) 레퍼런스. 판례당 1건, 승인 후 학생 공개.';
comment on column public.case_diagrams.facts_md is
  '사실관계. 출처는 하급심 판결문(대법원 판결문은 사실이 압축돼 있어 각색 출제의 원형이 안 됨).';
comment on column public.case_diagrams.facts_source_kind is
  'lower_auto=법령정보센터 자동수집 / lower_self=판례 자체가 하급심 / lower_manual=수기 투입 / supreme_only=대법원 원문 기재 범위 / manual=staff 직접 작성 / none=사실관계 없음';
comment on column public.case_diagrams.blocks is
  '쟁점 단위 블록 배열. 쟁점마다 법조문·법리(4축, 각 optional)·포섭·결론 1세트.';

-- 목록 필터(승인 대기 큐) — 살아있는 행만.
create index if not exists case_diagrams_review_status_idx
  on public.case_diagrams (review_status)
  where deleted_at is null;

create trigger case_diagrams_set_updated_at
  before update on public.case_diagrams
  for each row execute function public.set_updated_at();

alter table public.case_diagrams enable row level security;

-- 학생: 승인된 살아있는 도식만.
create policy case_diagrams_read_approved on public.case_diagrams
  for select
  using (review_status = 'approved' and deleted_at is null);

-- staff(강사·원장): 전건 R/W. draft 검수·승인 경로.
create policy case_diagrams_staff_all on public.case_diagrams
  for all
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));
