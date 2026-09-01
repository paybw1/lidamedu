-- feat-14-N1-c — 감사 스크립트 결과 적재소.
--
-- 감사 스크립트가 19개나 있는데 전부 터미널 전용이라, 예컨대 도식 감사가 잡아낸
-- "법리 축 0개" WARN 59건이 검수 화면 어디에도 안 뜬다. 사람이 볼 것을 사람이 보게 하려면
-- 결과가 화면까지 와야 한다.
--
-- ★콘텐츠 원본은 건드리지 않는다 — 이 테이블은 **판정 결과만** 담는 부착물이다.
-- ★source 단위로 통째 교체(replace)한다 — 감사를 다시 돌리면 그 스크립트가 낸 결과가
--   전량 갱신되고, 이번에 안 나온 항목은 사라진다(고쳐진 것이 남아 있으면 안 된다).

create table if not exists public.content_audit_findings (
  finding_id   uuid primary key default gen_random_uuid(),
  -- 어떤 콘텐츠에 붙는가. 검수 큐의 탭 키와 같은 값을 쓴다.
  entity_type  text not null check (entity_type in (
    'case_diagram', 'problem', 'case_training_item', 'case_training_issue'
  )),
  entity_id    uuid not null,
  -- 어떤 감사가 냈는가(스크립트 파일명 기준). replace 단위.
  source       text not null,
  -- 감사 안에서의 규칙 키 — 같은 대상에 규칙이 여럿일 수 있다.
  rule_key     text not null,
  severity     text not null check (severity in ('fail', 'warn', 'info')),
  message      text not null,
  detected_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (source, entity_type, entity_id, rule_key)
);

create index if not exists content_audit_findings_entity_idx
  on public.content_audit_findings (entity_type, entity_id);
create index if not exists content_audit_findings_source_idx
  on public.content_audit_findings (source);
-- 큐 정렬 — 심각한 것부터.
create index if not exists content_audit_findings_severity_idx
  on public.content_audit_findings (entity_type, severity);

alter table public.content_audit_findings enable row level security;

-- 읽기 = staff 전원(검수는 강사도 한다). 쓰기 = 서버(service_role)만 — 감사 스크립트가 넣는다.
drop policy if exists content_audit_findings_staff_read on public.content_audit_findings;
create policy content_audit_findings_staff_read
  on public.content_audit_findings
  for select
  using (private.is_staff(auth.uid()));

comment on table public.content_audit_findings is
  '감사 스크립트 결과 적재소(feat-14-N1-c). source 단위 replace. 원본 콘텐츠 무변경.';
