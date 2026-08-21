-- 판례 목록 노출 플래그 (원장 지시 2026-08-21).
--
-- 민법 판례가 1,341건까지 늘어 학습과목 목록이 길고 무거워졌다(특허 383·상표 356·디자인 63).
-- "무엇을 목록에 싣는가" 는 중요도(importance)와 다른 축이라 별도 컬럼으로 둔다.
--   · false = 목록/트리 카운트에서 제외. 상세 화면과 해설 팝업은 그대로 열린다(접근 차단 아님).
--   · 판정 규칙과 백필은 scripts/precedents/apply-case-list-visibility.mjs 소유.
--   · 기본 true — 다른 과목은 손대지 않는다.
alter table public.cases
  add column if not exists list_visible boolean not null default true;

comment on column public.cases.list_visible is
  '학습과목 판례 목록·트리 카운트 노출 여부. false 여도 상세·팝업은 열린다. 백필=scripts/precedents/apply-case-list-visibility.mjs';

-- 목록 쿼리는 subject_laws + deleted_at + list_visible 을 함께 건다.
create index if not exists cases_list_visible_idx
  on public.cases (list_visible)
  where deleted_at is null;
