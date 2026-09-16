-- 상표 선지 해설 끝에 붙은 HWPX 표 변환 찌꺼기(" |" + "| --- | --- |" + "정답 ○" 행) 제거.
-- 대상: 마지막 해설 줄이 " |" 로 끝나고(표 헤더 줄이 아님) 바로 뒤에 구분선·정답 행이 오는 선지만.
-- 비교표가 뭉개진 10건(마지막 줄이 "|" 로 시작)은 제외 — 원본 재추출 대상.
-- 롤백: problem_choices_expl_backup_20260916 에서 explanation_md 복원.
begin;
create table if not exists problem_choices_expl_backup_20260916 as
  select c.choice_id, c.problem_id, c.choice_index, c.explanation_md, now() as backed_up_at
  from problem_choices c join problems p on p.problem_id = c.problem_id
  where p.deleted_at is null
    and c.explanation_md ~ ' \|\s*\n\| --- \| --- \|\n\|  \|  \|\n\|  \| 정답 '
    and left(c.explanation_md, position(E'\n| --- |' in c.explanation_md) - 1) !~ '(^|\n)\|[^\n]*$';
-- 백업 테이블은 public 에 놓이므로 PostgREST 노출 차단 (정책 없음 = anon/authenticated 거부, service_role 만 읽음)
alter table problem_choices_expl_backup_20260916 enable row level security;
update problem_choices c
set explanation_md = regexp_replace(c.explanation_md, ' \|\s*\n\| --- \|.*$', '')
from problems p
where p.problem_id = c.problem_id and p.deleted_at is null
  and c.explanation_md ~ ' \|\s*\n\| --- \| --- \|\n\|  \|  \|\n\|  \| 정답 '
  and left(c.explanation_md, position(E'\n| --- |' in c.explanation_md) - 1) !~ '(^|\n)\|[^\n]*$';
select json_build_object(
  'backed_up', (select count(*) from problem_choices_expl_backup_20260916),
  'remaining_garbage', (select count(*) from problem_choices c join problems p on p.problem_id=c.problem_id where p.deleted_at is null and c.explanation_md ~ '\n\| --- \|'),
  'still_ending_pipe', (select count(*) from problem_choices c where c.explanation_md ~ ' \|\s*$')
) as r;
commit;
