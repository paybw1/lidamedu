-- 사건번호 유일성 규칙 변경: 전역 → 법률(과목) 단위
--   도메인 규칙(2026-07-07 원장 확정): 같은 판례가 다른 법률의 판례집에 각자 수록될 수 있다
--   (예: 2018다221676 이 특허·상표 판례집 양쪽에 등장 — 콘텐츠·배치가 법률별로 다름).
--   동일 법률 안에서만 중복 금지. subject_laws 는 법률별 행 분리 원칙(단일 원소)으로 운영.
DROP INDEX IF EXISTS cases_case_number_unique_active;
CREATE UNIQUE INDEX cases_case_number_unique_active
  ON public.cases USING btree (case_number, subject_laws)
  WHERE (deleted_at IS NULL);
