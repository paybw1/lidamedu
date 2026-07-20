-- feat: 문제 실제 시험번호(exam_number). problem_number(노드 내 순번)와 별개 축.
-- 특허법 기출 색인(2010~2026)으로 백필. /qna 타겟팅이 (연도+시험번호)로 조회.
alter table public.problems add column if not exists exam_number int;
comment on column public.problems.exam_number is '실제 시험 문제번호(기출). problem_number=노드 내 순번과 별개. 색인 기반 백필(feat-11 QnA 타겟팅).';
-- (연도+출처+시험번호) 조회용 부분 인덱스.
create index if not exists problems_exam_number_idx
  on public.problems (law_id, origin, year, exam_number)
  where exam_number is not null and deleted_at is null;
