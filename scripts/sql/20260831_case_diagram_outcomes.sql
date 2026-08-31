-- feat-2-035 — 판례 도식 '심급별 결과' (경과 배지).
--
-- timeline 은 무슨 일이 언제 있었는지만 담고 결과(인용/기각/각하·파기환송…)는
-- 문장 속에만 있었다. 심급별 결론은 2차에서 사실관계만큼 자주 묻는 정보라
-- 따로 뽑아 배지로 보여 준다.
--
-- 심급을 3칸 고정이 아니라 **목록**으로 둔다 — 심결취소계열(심판원→특허법원→대법원)과
-- 민사계열(지방법원→항소심→대법원)이 섞여 있어 고정 칸은 민사 사건에 안 맞는다.
--
-- 요소: { level, court, result, caseNo?, when?, note? }
--   level  : trial_board | first | appeal | supreme   (정렬·색 구분용)
--   result : 인용 | 일부인용 | 기각 | 각하 | 취소 | 파기환송 | 파기자판 | 상고기각 | 심리불속행 | 기타
-- 값 검증은 앱(zod, case-diagram.ts)이 한다 — 열거값이 늘 때 마이그레이션이 따라붙지 않게.

alter table public.case_diagrams
  add column if not exists outcomes jsonb not null default '[]'::jsonb;

comment on column public.case_diagrams.outcomes is
  '심급별 결과 배지 — [{level,court,result,caseNo,when,note}]. 스키마 SSOT = app/features/cases/lib/case-diagram.ts';
