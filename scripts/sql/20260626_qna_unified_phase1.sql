-- 통합 Q&A Phase 1 — 모델(additive schema only, 데이터 이관 없음).
-- enum 확장은 별도 선적용: qna_status += ai_answered,verified · qna_target_type += general.
-- 운영(mcgdoplo)에 scripts/jagwa/mgmt-sql.mjs 로 적용.

-- 메시지 역할 — 질문(학생) / AI(즉답) / 강사.
DO $$ BEGIN
  CREATE TYPE qna_message_role AS ENUM ('student', 'ai', 'instructor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 스레드 내 메시지(타임라인). AI 메시지엔 출처/검색메타/토큰. 강사 메시지는 author=강사.
CREATE TABLE IF NOT EXISTS qna_messages (
  message_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES qna_threads(thread_id) ON DELETE CASCADE,
  role        qna_message_role NOT NULL,
  author_id   uuid REFERENCES profiles(profile_id),  -- ai = null
  body_md     text NOT NULL,
  citations   jsonb,        -- ai 출처칩
  retrieval_meta jsonb,     -- ai RAG 메타(파싱쿼리/경로/청크ID)
  token_usage jsonb,        -- ai 토큰/모델/상태
  refusal_kind text,        -- ai 거절 사유(자연과학/근거부족)
  verifies_message_id uuid REFERENCES qna_messages(message_id) ON DELETE SET NULL, -- 강사가 이 AI답을 ✓확인/정정
  feedback    smallint,     -- 👍 1 / 👎 -1 (질문자)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS qna_messages_thread_idx
  ON qna_messages (thread_id, created_at) WHERE deleted_at IS NULL;

ALTER TABLE qna_messages ENABLE ROW LEVEL SECURITY;
-- 공개 읽기(인증). 작성=본인(학생 후속질문) 또는 staff(강사답/AI는 service-role 로 삽입).
DROP POLICY IF EXISTS qna_messages_select ON qna_messages;
CREATE POLICY qna_messages_select ON qna_messages
  FOR SELECT TO authenticated USING (deleted_at IS NULL);
DROP POLICY IF EXISTS qna_messages_insert ON qna_messages;
CREATE POLICY qna_messages_insert ON qna_messages
  FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) OR private.is_staff((SELECT auth.uid())));
DROP POLICY IF EXISTS qna_messages_update ON qna_messages;
CREATE POLICY qna_messages_update ON qna_messages
  FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid()) OR private.is_staff((SELECT auth.uid())))
  WITH CHECK (author_id = (SELECT auth.uid()) OR private.is_staff((SELECT auth.uid())));

-- soft-delete RPC (SELECT deleted_at IS NULL 가 직접 UPDATE 를 막으므로).
CREATE OR REPLACE FUNCTION soft_delete_qna_message(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE qna_messages SET deleted_at = now()
   WHERE message_id = p_id AND deleted_at IS NULL
     AND (author_id = auth.uid() OR private.is_staff(auth.uid()));
END; $$;
REVOKE ALL ON FUNCTION soft_delete_qna_message(uuid) FROM public;
GRANT EXECUTE ON FUNCTION soft_delete_qna_message(uuid) TO authenticated;

-- 등급별 'AI 즉답' 토글(운영자 조정). 초기 = tier1 ON · free OFF(품질확인 후 free 개방).
INSERT INTO app_settings (key, value)
VALUES ('qna_ai_instant', '{"free": false, "tier1": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
