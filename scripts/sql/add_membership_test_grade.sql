-- 회원 등급 체험 테스트(운영자 전용) — staff 가 학생 등급 화면을 그대로 보기 위한 오버라이드.
-- 값: 'trial' | 'free_member' | 'cohort' | 'plan:<plan_code>' | NULL(해제).
-- getMembershipAccess 가 staff 역할일 때만 이 값을 반영하므로, 학생이 자기 행에
-- 값을 넣어도 효과 없음(가드 불필요).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS membership_test_grade text;
