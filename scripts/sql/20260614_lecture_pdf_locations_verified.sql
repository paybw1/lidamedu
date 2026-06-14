-- PART2 — 강사 확인·교정 상태. 가산적·롤백 가능. RLS는 기존 staff-write(for all)로 충분.
--   verified_at / verified_by : 강사가 그 위치를 육안 확인한 시점/주체.
--   needs_recheck_at          : (구조 예약, 지금 미사용) 재추출 시 verified 행의 예상 위치가
--                               바뀐 것으로 보이면 표시 — "바뀐 것만 알림"용 여지.
alter table public.lecture_pdf_locations
  add column if not exists verified_at      timestamptz,
  add column if not exists verified_by      uuid,
  add column if not exists needs_recheck_at timestamptz;
-- 롤백: alter table public.lecture_pdf_locations
--         drop column verified_at, drop column verified_by, drop column needs_recheck_at;
