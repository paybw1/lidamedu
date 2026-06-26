-- 통합 Q&A Phase 3 — 강사의 AI 답변 정오 평가(정확/부정확).
-- 시험 대비 답변이라 부분정확은 두지 않고 binary(correct/incorrect)로만 평가.
-- AI 메시지(role='ai')에 직접 부착 — 학생은 신뢰도 배지로 보고, 운영자는 정확률 집계 가능.
-- RLS 추가 불요: qna_messages UPDATE 정책이 이미 staff(private.is_staff) 를 허용.

ALTER TABLE qna_messages
  ADD COLUMN IF NOT EXISTS verdict text CHECK (verdict IN ('correct', 'incorrect')),
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES profiles(profile_id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;
