-- feat-2-035 — 하급심 판결문 적재.
--
-- 도식의 사실관계 근거가 하급심 판결문인데, 그동안 전문은 로컬 캐시에만 있어
-- 운영자가 앱에서 원문을 확인할 수 없었다(원장 요청 2026-08-20).
--
-- ★대상 판례마다 한 행. 확보 못 한 건도 행을 남긴다 — "무엇을 아직 못 구했는지"와
--   "그때 필요한 원심 사건번호가 무엇인지"가 목록의 핵심 정보이기 때문이다.
--   확보분만 넣으면 미확보 목록을 매번 스크립트로 다시 만들어야 한다.
--
-- ★학생 비노출: 저작물 전문이고 학습 콘텐츠가 아니다. RLS 는 staff 전용 한 줄.

create table if not exists public.case_lower_courts (
  lower_id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique
    references public.cases(case_id) on delete cascade,

  -- loaded=전문 확보 / not_in_api=원심 사건번호는 알지만 법령정보센터 미수록 /
  -- summary_only=수록됐으나 판시사항·요지뿐 / no_ref=대법원 원문에 원심 표기 없음
  status text not null default 'no_ref'
    check (status in ('loaded', 'not_in_api', 'summary_only', 'no_ref')),
  -- lower_auto=API 자동 / lower_self=판례 자체가 하급심 / lower_manual=수기 투입
  source_kind text
    check (source_kind in ('lower_auto', 'lower_self', 'lower_manual')),

  source_ref text,           -- '특허법원 2022허4635' — 화면 표기·출처 캡션
  lower_case_number text,    -- 원심 사건번호(미확보 건도 채운다 — 이게 있어야 구해 온다)
  lower_court text,
  lower_decided_at text,     -- 판결문 표기 그대로(불완전 날짜 존재)
  law_serial_id text,        -- 국가법령정보센터 판례일련번호

  body_text text not null default '',
  char_count integer not null default 0,
  fetched_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.case_lower_courts is
  'feat-2-035 하급심 판결문 — 판례 도식 사실관계의 근거. staff 전용(저작물 전문). 미확보 건도 행을 남겨 수기 확보 대상 목록으로 쓴다.';
comment on column public.case_lower_courts.status is
  'loaded=전문 확보 / not_in_api=원심번호는 알지만 API 미수록 / summary_only=요지만 / no_ref=원심 표기 없음';

create index if not exists case_lower_courts_status_idx
  on public.case_lower_courts (status)
  where deleted_at is null;

create trigger case_lower_courts_set_updated_at
  before update on public.case_lower_courts
  for each row execute function public.set_updated_at();

alter table public.case_lower_courts enable row level security;

-- staff 전용 — 학생에게는 어떤 경로로도 보이지 않는다.
create policy case_lower_courts_staff_all on public.case_lower_courts
  for all
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));
