-- 롤백: 20260615_cohort_board_attachments_pin.sql
-- 주의: 버킷 삭제는 객체가 비어 있어야 함(객체 있으면 먼저 storage.objects 제거).
drop trigger if exists guard_pin on cohort_board_posts;
drop function if exists public.guard_cohort_board_post_pin();
drop function if exists public.set_cohort_board_post_pinned(uuid, boolean);
drop table if exists cohort_board_post_attachments;
drop function if exists public.user_can_attach_cohort_post(uuid, uuid);
drop type if exists cohort_board_attachment_kind;
delete from storage.buckets where id = 'cohort-board-attachments';
