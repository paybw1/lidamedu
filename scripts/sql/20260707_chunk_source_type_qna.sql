-- feat-9-010 ④ — RAG 코퍼스에 강사 Q&A 아카이브 소스 타입 추가
ALTER TYPE chunk_source_type ADD VALUE IF NOT EXISTS 'qna';
