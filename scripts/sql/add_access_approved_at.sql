-- 서비스 접근 승인 게이트 — profiles.access_approved_at
-- NULL = 승인 대기(신규 가입 기본), NOT NULL = 승인됨.
-- 기존 사용자는 전원 승인 backfill 로 무중단 도입.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_approved_at timestamptz;

UPDATE public.profiles SET access_approved_at = now() WHERE access_approved_at IS NULL;

-- 자기 승인 방지: profiles 에 self-UPDATE RLS 정책이 있으므로, authenticated/anon
-- 요청이 access_approved_at 을 변경하는 것을 트리거로 거부한다.
-- service_role(운영자 승인 API)·직접 DB 연결만 변경 가능.
CREATE OR REPLACE FUNCTION public.prevent_access_approval_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.access_approved_at IS DISTINCT FROM OLD.access_approved_at
     AND COALESCE(auth.role(), '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'access_approved_at can only be changed by service role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_access_approval_self_change ON public.profiles;
CREATE TRIGGER trg_prevent_access_approval_self_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_access_approval_self_change();
