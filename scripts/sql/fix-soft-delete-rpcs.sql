-- soft-delete RLS 차단 일괄 수정 (lecture_resources 와 동일 패턴).
-- 각 테이블 SELECT 정책이 deleted_at IS NULL 을 요구해, deleted_at 을 세팅하는
-- UPDATE 의 새 행이 RLS 에 막혀(42501) soft-delete 가 실패한다.
-- → SECURITY DEFINER RPC 로 기존 UPDATE 정책과 동일한 권한을 검사한 뒤
--    definer 권한으로 UPDATE(RLS 우회). 가시성 동작은 그대로(삭제=모두에게 사라짐).

-- 1) book_updates (staff)
create or replace function public.soft_delete_book_update(p_id uuid)
returns void language plpgsql security definer set search_path to 'public','private','pg_temp'
as $function$
begin
  if not private.is_staff(auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
  update public.book_updates set deleted_at=now() where update_id=p_id and deleted_at is null;
end;
$function$;

-- 2) papers (staff)
create or replace function public.soft_delete_paper(p_id uuid)
returns void language plpgsql security definer set search_path to 'public','private','pg_temp'
as $function$
begin
  if not private.is_staff(auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
  update public.papers set deleted_at=now() where paper_id=p_id and deleted_at is null;
end;
$function$;

-- 3) mcq_packs (staff)
create or replace function public.soft_delete_mcq_pack(p_id uuid)
returns void language plpgsql security definer set search_path to 'public','private','pg_temp'
as $function$
begin
  if not private.is_staff(auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
  update public.mcq_packs set deleted_at=now() where pack_id=p_id and deleted_at is null;
end;
$function$;

-- 4) mcq_exams (staff)
create or replace function public.soft_delete_mcq_exam(p_id uuid)
returns void language plpgsql security definer set search_path to 'public','private','pg_temp'
as $function$
begin
  if not private.is_staff(auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
  update public.mcq_exams set deleted_at=now() where exam_id=p_id and deleted_at is null;
end;
$function$;

-- 5) community_posts (작성자 OR manager)
create or replace function public.soft_delete_community_post(p_id uuid)
returns void language plpgsql security definer set search_path to 'public','private','pg_temp'
as $function$
begin
  if not (private.is_manager(auth.uid())
          or exists (select 1 from public.community_posts where post_id=p_id and author_id=auth.uid()))
  then raise exception 'forbidden' using errcode='42501'; end if;
  update public.community_posts set deleted_at=now() where post_id=p_id and deleted_at is null;
end;
$function$;

-- 6) community_post_comments (작성자 OR manager)
create or replace function public.soft_delete_community_comment(p_id uuid)
returns void language plpgsql security definer set search_path to 'public','private','pg_temp'
as $function$
begin
  if not (private.is_manager(auth.uid())
          or exists (select 1 from public.community_post_comments where comment_id=p_id and author_id=auth.uid()))
  then raise exception 'forbidden' using errcode='42501'; end if;
  update public.community_post_comments set deleted_at=now() where comment_id=p_id and deleted_at is null;
end;
$function$;

-- 7) qna_threads (asker OR answerer OR staff)
create or replace function public.soft_delete_qna_thread(p_id uuid)
returns void language plpgsql security definer set search_path to 'public','private','pg_temp'
as $function$
begin
  if not (private.is_staff(auth.uid())
          or exists (select 1 from public.qna_threads where thread_id=p_id and (asker_id=auth.uid() or answerer_id=auth.uid())))
  then raise exception 'forbidden' using errcode='42501'; end if;
  update public.qna_threads set deleted_at=now() where thread_id=p_id and deleted_at is null;
end;
$function$;

revoke all on function public.soft_delete_book_update(uuid) from public;
revoke all on function public.soft_delete_paper(uuid) from public;
revoke all on function public.soft_delete_mcq_pack(uuid) from public;
revoke all on function public.soft_delete_mcq_exam(uuid) from public;
revoke all on function public.soft_delete_community_post(uuid) from public;
revoke all on function public.soft_delete_community_comment(uuid) from public;
revoke all on function public.soft_delete_qna_thread(uuid) from public;
grant execute on function public.soft_delete_book_update(uuid) to authenticated, service_role;
grant execute on function public.soft_delete_paper(uuid) to authenticated, service_role;
grant execute on function public.soft_delete_mcq_pack(uuid) to authenticated, service_role;
grant execute on function public.soft_delete_mcq_exam(uuid) to authenticated, service_role;
grant execute on function public.soft_delete_community_post(uuid) to authenticated, service_role;
grant execute on function public.soft_delete_community_comment(uuid) to authenticated, service_role;
grant execute on function public.soft_delete_qna_thread(uuid) to authenticated, service_role;
