-- feat-11-xxx — 회차별 재생 횟수 제한(시간/배수 제한 대체).
-- 각 회차를 정해진 횟수만큼만 재생(기본 2회), 운영자가 회차별로 조정. "재생 1회" = 새 재생 세션
-- (같은 회차의 직전 재생과 6시간 이상 간격) 시작 시 1회 차감. 세션 내 재개·새로고침은 무차감.

-- 회차별 최대 재생 횟수(운영자 조정, 기본 2).
ALTER TABLE public.course_lessons
  ADD COLUMN IF NOT EXISTS max_plays integer NOT NULL DEFAULT 2;

-- 이 grant 가 새 재생 세션(=1회 차감)인지. 기존 grant 는 false 로 두어 소급 차감 없음.
ALTER TABLE public.playback_grants
  ADD COLUMN IF NOT EXISTS counts_as_play boolean NOT NULL DEFAULT false;

-- 재생 횟수 집계용 인덱스(user+lesson).
CREATE INDEX IF NOT EXISTS playback_grants_user_lesson_idx
  ON public.playback_grants (user_id, lesson_id, granted_at DESC);
