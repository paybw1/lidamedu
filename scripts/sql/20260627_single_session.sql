-- feat-000-016 단일 세션 강제(중복 로그인 차단) — 1단계 스키마.
-- 한 계정당 "현재 유효 세션 ID" 1개만 두고, 새 로그인이 이를 갈아치워(last-login-wins)
-- 이전 기기를 다음 요청에서 무효화한다. 컬럼은 전부 nullable → 기존 사용자(=NULL)는
-- 강제 대상 아님(추방 없음), 각자 다음 로그인부터 자연 적용(무중단 롤아웃).
--
-- 쓰기는 SECURITY DEFINER RPC 로만(자기 행 auth.uid() 스코프). active_session_id 는
-- 서버 생성 UUID(추측 불가) — 클라이언트로 내려보내지 않고 서버에서만 비교.

alter table public.profiles
  add column if not exists active_session_id uuid,
  add column if not exists active_session_at timestamptz,
  add column if not exists active_session_device text;

comment on column public.profiles.active_session_id is
  '단일 세션 강제: 현재 유효한 세션 토큰(서버 생성 UUID). 새 로그인이 갈아치움. 클라이언트 미노출.';
comment on column public.profiles.active_session_at is '단일 세션: 현재 세션 등록 시각.';
comment on column public.profiles.active_session_device is '단일 세션: 현재 세션 기기 라벨(예 "Chrome · Windows"). 감사/표시용.';

-- 로그인 시 이 세션을 현재 유효 세션으로 등록(이전 기기 자동 무효화).
create or replace function public.claim_session(p_sid uuid, p_device text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
begin
  update public.profiles
     set active_session_id = p_sid,
         active_session_at = now(),
         active_session_device = p_device,
         updated_at = now()
   where profile_id = auth.uid();
end;
$function$;

-- 로그아웃 시 현재 세션 해제(잠금 release).
create or replace function public.release_session()
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
begin
  update public.profiles
     set active_session_id = null,
         active_session_at = null,
         active_session_device = null,
         updated_at = now()
   where profile_id = auth.uid();
end;
$function$;

revoke all on function public.claim_session(uuid, text) from public;
revoke all on function public.release_session() from public;
grant execute on function public.claim_session(uuid, text) to authenticated, service_role;
grant execute on function public.release_session() to authenticated, service_role;
