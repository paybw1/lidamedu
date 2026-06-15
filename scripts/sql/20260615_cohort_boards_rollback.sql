-- rollback: 20260615_cohort_boards.sql (반별 게시판 전체 제거)
drop function if exists public.soft_delete_cohort_board(uuid);
drop function if exists public.soft_delete_cohort_board_comment(uuid);
drop function if exists public.soft_delete_cohort_board_post(uuid);
drop function if exists public.user_manages_cohort_post(uuid, uuid);
drop function if exists public.user_can_write_cohort_post(uuid, uuid);
drop function if exists public.user_can_read_cohort_post(uuid, uuid);
drop function if exists public.user_can_write_cohort_board(uuid, uuid);
drop function if exists public.user_manages_cohort_board(uuid, uuid);
drop function if exists public.user_can_read_cohort_board(uuid, uuid);
drop table if exists cohort_board_comments cascade;
drop table if exists cohort_board_posts cascade;
drop table if exists cohort_board_cohorts cascade;
drop table if exists cohort_boards cascade;
drop type if exists cohort_board_write_scope;
