-- 관련 판례 입력란 — 판례에 딸린 관련 판례 인용 목록(구조화).
--   각 항목: { citation(전체 인용), caseTitle(사건명, 선택), note(비고, 선택) }
--   예: "의정부지방법원 2011. 9. 8. 선고 2009가합7325"
-- 자유 인용 텍스트라 DB 판례와 링크는 하지 않는다(하급심 등 미적재 판례 포함).
alter table public.cases
  add column if not exists related_cases jsonb not null default '[]'::jsonb;
