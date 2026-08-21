-- 종합 표시(cross_unit)는 개정 원장 대상이 아니다.
--
-- cross_unit 은 "이 지문이 다른 단원 내용을 담고 있다"는 분류 표시일 뿐,
-- 교재 문구가 바뀐 게 아니다. 원장에 쌓이면 발행 대기 목록에 정오 아닌 항목이
-- 섞이고, 운영자가 수정 화면에서 배지를 켤 때마다 pending revision 이 생긴다.
-- (추록은 책이 바뀔 때만 — errata Phase 3 원칙)
--
-- 트리거의 무시 필드 목록(tg_argv[1])에 cross_unit 을 추가한다.

begin;

drop trigger if exists log_revision_problem_choices on public.problem_choices;
create trigger log_revision_problem_choices
  after insert or update or delete on public.problem_choices
  for each row execute function public.fn_log_revision_problem('problem_choices', 'cross_unit');

drop trigger if exists log_revision_problem_box_items on public.problem_box_items;
create trigger log_revision_problem_box_items
  after insert or update or delete on public.problem_box_items
  for each row execute function public.fn_log_revision_problem(
    'problem_box_items', 'updated_at,cross_unit');

commit;
