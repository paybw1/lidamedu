-- 롤백 — feat-11-013 P9.
-- ★되돌리면 그 사이의 자료 이용이력이 사라지고 **소급이 불가능하다**(환불 계산 근거).
drop table if exists public.material_access_logs;
