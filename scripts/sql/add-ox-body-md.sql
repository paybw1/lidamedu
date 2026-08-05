-- OX(정오문제) 표시 전용 지문 오버라이드 (feat 신고 b09650c4, 원장 승인 2026-08-05).
-- 사례형 선지가 OX 패널에 단독 노출될 때 판단 술어가 없는 문제 해결 —
-- 원문제 선지(body_md)는 불변, OX 노출 시에만 coalesce(ox_body_md, body_md).
ALTER TABLE public.problem_choices ADD COLUMN IF NOT EXISTS ox_body_md text;
COMMENT ON COLUMN public.problem_choices.ox_body_md IS 'OX 패널 표시 전용 지문 오버라이드 — null 이면 body_md 사용';
