-- feat-2-035 — 판례 도식에 "출원·심판 경과 타임라인" 추가.
--
-- 사실관계는 산문(facts_md)이라 시간 흐름이 한눈에 안 들어온다. 2차는 출원일·공지일·
-- 심판청구일의 선후가 결론을 가르는 문항이 많아, 같은 사실을 시간축으로도 준다.
-- 사실관계와 같은 층위(판례당 1개)라 blocks 가 아니라 도식 루트에 둔다.
--
-- 형태: [{ "when": "2018. 7. 5.", "what": "이 사건 출원", "kind": "filing" }, …]
--   when 은 문자열 — 판결문이 "2018. 7.경" 처럼 불완전한 날짜를 쓰는 경우가 있어
--   date 로 강제하면 그런 사실을 버리게 된다. 정렬은 생성 시점 순서를 그대로 따른다.

alter table public.case_diagrams
  add column if not exists timeline jsonb not null default '[]'::jsonb;

alter table public.case_diagrams
  drop constraint if exists case_diagrams_timeline_check;
alter table public.case_diagrams
  add constraint case_diagrams_timeline_check
  check (jsonb_typeof(timeline) = 'array');

comment on column public.case_diagrams.timeline is
  '출원·심판·소송 경과 타임라인 [{when,what,kind}]. 사실관계(facts_md)와 같은 소스(하급심)에서 뽑는다.';
