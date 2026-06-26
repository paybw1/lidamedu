-- feat: Q&A 공개화 (비공개 → 공개).
-- 운영(mcgdoplo)에 scripts/jagwa/mgmt-sql.mjs 로 적용.
--
-- Q&A SELECT 공개화 — 기존 비공개(질문자/답변자/staff만) → 인증 사용자 전체 공개.
-- Q&A 기본 모델 = 강사 답변(단일). 질문 주제는 학습과목 내용(조문/판례/문제) 또는 공부방법.
-- 모두가 질문·강사답변을 열람 가능한 공개 지식베이스.
DROP POLICY IF EXISTS qna_threads_select_visible ON qna_threads;
CREATE POLICY qna_threads_select_visible ON qna_threads
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- NB: 초기엔 공부방법 peer 다중답변(qna_replies)도 만들었으나, Q&A 는 강사 단일답변 모델로
--     확정되어 제거함(DROP TABLE qna_replies / DROP FUNCTION soft_delete_qna_reply). 공부방법도
--     강사가 답변하며, 기존 단일 answer 흐름을 그대로 재사용한다.
