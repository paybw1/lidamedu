-- 학생(질문자) AI 답변 도움됐어요 피드백 — qna_messages.feedback(+1/-1/0).
-- AI 메시지는 author_id 가 null 이라 기존 UPDATE 정책(author 본인)으로는 질문자가
-- 쓸 수 없음 → 스레드 asker 검증 후 feedback 컬럼만 갱신하는 SECURITY DEFINER RPC.
create or replace function public.set_qna_ai_feedback(
  p_message_id uuid,
  p_feedback smallint
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_thread uuid;
  v_role text;
begin
  if p_feedback is null or p_feedback not in (-1, 0, 1) then
    raise exception 'invalid feedback';
  end if;
  select m.thread_id, m.role::text into v_thread, v_role
    from public.qna_messages m
    where m.message_id = p_message_id and m.deleted_at is null;
  if v_thread is null or v_role <> 'ai' then
    raise exception 'not an ai message';
  end if;
  if not exists (
    select 1 from public.qna_threads t
    where t.thread_id = v_thread
      and t.asker_id = auth.uid()
      and t.deleted_at is null
  ) then
    raise exception 'not the asker';
  end if;
  update public.qna_messages
    set feedback = p_feedback
    where message_id = p_message_id;
end;
$$;
