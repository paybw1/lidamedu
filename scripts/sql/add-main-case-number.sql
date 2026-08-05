-- 주관식 모범답안 관련판례 '메인 판례' 지정 (원장 요청 2026-08-05).
-- 관련판례 배지는 답안 인용 사건번호에서 파생(저장 없음)되므로, 메인 지정도 사건번호로 보관.
-- null = 미지정. 표시: 각 그룹에서 메인을 맨 앞 + ★ 강조.
ALTER TABLE public.problems ADD COLUMN IF NOT EXISTS main_case_number text;
COMMENT ON COLUMN public.problems.main_case_number IS '주관식 관련판례 메인 지정(사건번호 문자열) — null=미지정';
