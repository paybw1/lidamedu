-- feat-9-010 ③ — 강사 Q&A 아카이브 소급 적재용 컬럼
--   archive_source: 아카이브 출처 표기('cafe-archive' 등, NULL=일반 스레드)
--   archive_key   : 멱등 키(과목|질문|답변 해시) — 재실행 중복 방지
ALTER TABLE qna_threads
  ADD COLUMN IF NOT EXISTS archive_source text,
  ADD COLUMN IF NOT EXISTS archive_key text;

CREATE UNIQUE INDEX IF NOT EXISTS qna_threads_archive_key_unique
  ON qna_threads (archive_key)
  WHERE archive_key IS NOT NULL;
