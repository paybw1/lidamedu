# feat-9-010 — 강사 Q&A 아카이브 ETL (고도화 → 적재 → AI 학습)

> 상태: 🔲 설계 검토 대기 (2026-07-07 작성)
> 소스: `source/Q&A/` — 임병웅 변리사 질의응답 아카이브 (2005~2026, 약 7,400건)

## 1. 소스 데이터 현황

| 과목 | 파일 | 추정 건수 | 비고 |
|------|------|-----------|------|
| 특허법(+실용신안) | CSV 13개 (장별: 1장~12장) | 4,834 | 일부 파일 CP949 인코딩(분류 컬럼 깨짐 1,333건) |
| 특허법 5장 | xlsx 1개 | ~463 | 87조~125조의2 |
| 상표법 | xlsx 1개 | ~1,365 | |
| 디자인보호법 | xlsx 1개 | ~787 | |

공통 스키마: `과목, 분류(조문/문제/판례), 대상_식별자(대부분 빈값), 질문_제목, 질문_내용, 답변, 추가질문, 재답변, 날짜`

- 장별 파일명 자체가 조문 범위 힌트(예: "2장(29조~56조)").
- `추가질문/재답변` = 멀티턴 후속 문답.
- 날짜 분포: 2005~2026 (본진은 2017 이후). **구법 기준 답변 리스크** 존재.
- 질문자 개인정보: 별도 이름 컬럼 없음(본문 내 호칭 정도).

## 2. 현행 체계 (적재 목적지)

- **질의응답**: `qna_threads`(target_type: article/case/problem/node/study_method…, subject, status, quality_grade) + `qna_messages`. 공개 열람 RLS 적용됨. 현재 운영 데이터 3건뿐 — 오염 우려 낮음.
- **AI RAG**: `content_chunks`(source_type: article/case/problem/textbook/practice, embedding, authority_tier 1/2) 6,979청크 + hybrid-search + AI 즉답(`ai_conversations`). 임베딩은 스크립트로 수행(cron 정지 상태).

## 3. 파이프라인 설계 (5단계, 단계별 하드스톱)

### ① 파싱·정규화 → 통합 JSON
`scripts/qna-archive/parse-qna-archive.mjs`
- CSV: 인코딩 자동 판별(UTF-8 BOM/CP949, iconv-lite) 후 파싱. xlsx: unzip+fast-xml-parser(기존 hwpx 방식 재사용).
- 산출: `source/_converted/qna-archive.json` — `{subject, category, title, question, answer, followups:[{q,a}], askedAt(YYYY-MM-DD 정규화), sourceFile, articleRangeHint}`
- 리포트: 건수/결측(답변 없음·날짜 없음)/중복(제목+질문 해시) 통계.

### ② 고도화(정제·타깃 매핑) — dry-run 리포트 → 사용자 검수
`scripts/qna-archive/enrich-qna-archive.mjs`
- **정제**: 완전 중복 제거, 답변 없는 행 제외, 인사말 꼬리("열공하세요~" 유지 — 강사 시그니처이므로 보존), 개행 정규화.
- **타깃 자동 매핑**(규칙 우선, AI 보조):
  - 조문: 질문/제목의 "제N조(의M)" + 파일 장 범위 → `articles` 매핑 → target_type=article
  - 문제: "20XX년 기출 N번" 패턴 → `problems` 매핑 → target_type=problem
  - 판례: 사건번호 패턴 → `cases` 매핑 → target_type=case
  - 실패 시: subject만 지정, target_type=study_method(과목 일반)로 폴백
- **개정 리스크 플래그**: askedAt 기준 주요 개정 전 답변에 `pre_revision` 표시(뷰어·AI 프롬프트에서 "답변 당시 법령 기준" 고지).
- AI 보조(선택): 제목 없는 행 제목 생성, 분류 결측 보정 — Anthropic 배치, 비용 소액.

### ③ qna_threads 소급 적재
`scripts/qna-archive/seed-qna-threads.mjs` (dry-run 기본, --apply)
- 스키마 소폭 확장(마이그레이션 1건): `qna_threads.archive_source text NULL` (예: 'cafe-2019') — 아카이브 구분·재실행 멱등 키(archive_source+content_hash).
- 매핑: asker_id=NULL(익명 아카이브), answerer_id=임병웅 강사 계정, status='answered', quality_grade='high'(강사 공인), created_at/answered_at=원 날짜, 멀티턴은 qna_messages 로.
- 목록 노출: 기존 /qna 목록·검색에 자연 합류(문제번호 검색·타깃 패널 연동 포함). 필요 시 "아카이브" 배지 1개만 추가.

### ④ AI 학습 = RAG 적재 (fine-tuning 아님 — 현 체계와 동일한 RAG 방식)
- `chunker.ts`에 `chunkQnaThread` 추가 → `content_chunks(source_type='qna', authority_tier=1)` — Q+A 쌍 단위 1청크(길면 분할), heading_path=`과목>분류>askedAt`.
- 임베딩 백필: 기존 `scripts/backfill-content-chunks.mjs` 확장 실행.
- hybrid-search 소스에 'qna' 포함 + AI 답변 프롬프트에 "강사 기존 답변" 인용 규칙(출처링크=해당 qna_thread) 추가 → **AI가 강사의 과거 답변 스타일·결론을 근거로 답변**.
- 개정 리스크: pre_revision 청크는 프롬프트에 시점 명시, 현행 조문 청크와 함께 인용하도록 유도.

### ⑤ 검증·공개
- 표본 검수: 과목별 30건 무작위 — 타깃 매핑 정확도·답변 절단 여부.
- E2E: /qna 목록·상세·검색, AI 질문 3건(아카이브 인용 확인).
- 공개 범위: qna RLS는 이미 공개 — 적재 즉시 학생 열람 가능. 원하면 staff 검수 기간 동안 archive_source 필터로 숨김 가능.

## 4. 결정 필요 사항 (③ 착수 전)

1. **강사 계정**: answerer_id를 임병웅 계정(e20ac99a)으로 통일? (제안: 예)
2. **학생 즉시 공개** vs staff 검수 후 공개? (제안: 적재 후 표본 검수 통과 시 즉시 공개)
3. AI 보조 고도화(제목 생성 등) 사용 여부? (제안: 1차는 규칙 기반만, 부족하면 2차에 AI 보조)

## 5. 규모·리스크

- 총 ~7,400건 → 정제 후 예상 6,500±. RAG 청크 +7천(현 코퍼스 2배) — 검색 성능 영향 낮음(pgvector).
- 임베딩 비용: 7천 청크 × 평균 500토큰 — 소액.
- 가장 큰 품질 리스크 = 구법 답변(2005~2016 약 100건 + 2017~2019 개정 전후) → pre_revision 플래그 + 시점 고지로 대응, 삭제하지 않음(원문 보존 원칙).
