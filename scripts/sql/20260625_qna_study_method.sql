-- feat: 커뮤니티 Q&A '공부방법' 대상 + 과목 분류.
-- 운영(mcgdoplo)에 scripts/jagwa/mgmt-sql.mjs 로 적용.
--
-- (1) qna_target_type += 'study_method' — ALTER TYPE ADD VALUE 는 트랜잭션/사용 제약이 있어
--     별도 단일 쿼리로 선적용함:  ALTER TYPE qna_target_type ADD VALUE IF NOT EXISTS 'study_method';
-- (2) target_id nullable — study_method 질문은 콘텐츠 앵커(조문/판례/문제)가 없다.
-- (3) subject 컬럼 — 과목 분류(law_code 류). study_method 는 필수,
--     콘텐츠 Q&A 는 대상에서 도출(생성 시 set). 검증은 앱 Zod.
ALTER TABLE qna_threads ALTER COLUMN target_id DROP NOT NULL;
ALTER TABLE qna_threads ADD COLUMN IF NOT EXISTS subject text;
COMMENT ON COLUMN qna_threads.subject IS '과목 분류(patent/trademark/design/civil/civil-procedure/science/general). study_method 필수, 콘텐츠 Q&A 는 대상에서 도출.';
