-- feat-2-038 정리비교표 학생 공개(원장 결정 2026-09-11) — 도해(dohae_units_read)와 같은 등급: 로그인 사용자 읽기.
-- ★유출방지 코드(워터마크·복사차단·인쇄숨김·고지·열람 로그)가 운영에 배포된 뒤에 적용한다.
-- 쓰기는 기존 systematic_digests_staff_all(staff 전용) 그대로.
drop policy if exists systematic_digests_read on public.systematic_digests;
create policy systematic_digests_read
  on public.systematic_digests
  for select
  using (auth.uid() is not null);
