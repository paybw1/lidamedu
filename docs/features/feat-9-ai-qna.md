# feat-9 — AI 학습 Q&A (RAG 기반 수험생 질의응답)

> **계획 문서.** 사용자 검토 → 결정사항(§14) 확정 → 코드 착수. SPEC.md `5.9 / feat-9-*` 매핑.
> **기존 사람-간 Q&A([[feat-qna]])와 다르다** — feat-qna 는 학생 질문 → 강사 답변(스레드). 이 문서(feat-9)는 **생성형 AI 가 조문·판례·문제를 근거로 즉답**한다. 두 기능은 공존하며, AI 가 답 못 하는 질문을 강사 Q&A 로 넘기는 연계는 §16.

---

## 0. 한 줄

조문·판례·문제를 색인한 AI 가 수험생 질문에 **출처를 인용해** 즉시 답한다. 환각이 곧 법률 오답이므로, "검색된 근거 안에서만 답하고 모르면 모른다고 한다"가 설계의 1원칙.

---

## 1. 배경과 판단 (3계층 Layer 1)

- **왜 만드는가**: (a) 24시간 즉답 — 강사 Q&A 는 답변까지 시간차가 있다. (b) 강사 부하 분산 — 반복 질문을 AI 가 흡수. (c) 플랫폼의 콘텐츠 자산(조문·판례·문제 + 연관관계 그래프)을 학습 인터페이스로 직접 활용. (d) 합격자 데이터 컨설팅([[feat-8]])과 함께 "AI 학습 동반자"라는 제품 차별점.
- **SPEC YAGNI 와의 관계**: SPEC §"범위 외"의 *"AI 자동 해설 생성"* 은 콘텐츠를 AI 가 **생산**하는 것 — 여전히 범위 밖. feat-9 는 **기존 콘텐츠 검색 기반 질의응답(RAG)** 으로 성격이 다르다. v1 출시 이후의 전략적 추가 기능.
- **판단**: 만든다. 단 법률 정확성 리스크가 크므로 — 순수 LLM 생성이 아니라 **RAG(검색 근거 결합) + 출처 인용 필수 + 근거 부족 시 "모름"** 을 비협상 설계 제약으로 둔다 (CLAUDE.md Non-negotiable #8 "법령 원문 무결성"의 정신).
- **더 단순한 대안 검토(KISS)**: pgvector 없이 기존 `pg_trgm` 키워드 검색만으로 컨텍스트를 모을 수도 있다. 그러나 "진보성 판단 기준" 같은 개념·의역 질문을 키워드만으로는 못 잡는다 → 벡터 검색이 필요. 단 별도 벡터 DB 는 도입하지 않는다(§4).

---

## 2. 범위

**v1 IN**
- 텍스트 질문 → RAG 답변 + 출처 카드. 멀티턴 대화(직전 맥락 유지).
- 대상 코퍼스 = **법률 5과목**의 조문(현행 시행본) · 판례(요지/이유/평석) · 객관식/주관식 문제(문제+해설).
- 사용자별 대화 이력 저장 · 재열람.

**v1 OUT (YAGNI)**
- 음성·이미지 질문, 자동 문제 출제, 주관식 답안 첨삭(별도 기능 [[feat-4-A-305]]).
- 자연과학 4과목 — 조문·판례 개념이 없고 문제 풀이 위주라 RAG 적합도가 낮음. v2 검토.
- AI 가 콘텐츠를 DB 에 쓰는 행위 일체 (해설 자동 생성 등).
- 사람-간 Q&A 스레드를 코퍼스에 포함 — 비공개 데이터(feat-qna §10.3)라 제외.

**의존성**
- 답변 품질 = 콘텐츠 품질·완전성. 현재 콘텐츠는 특허법만 풀빌드, 상표·디자인·민법·민사소송법은 비어 있음 → **feat-9 인프라(feat-9-001)는 지금 착수 가능하나, 5과목 출시 품질은 콘텐츠 확보가 선행**. 특허법으로 먼저 베타.

---

## 3. 사용자 경험

### 3.1 진입점
- **전용 화면 `/ai`** — 채팅 인터페이스. 메인 진입점.
- **조문/판례/문제 뷰어 우측 패널 "AI 에게 묻기"** — 현재 보고 있는 엔티티가 대화의 기본 컨텍스트로 앵커됨(예: 특허법 제29조 뷰어에서 열면 그 조문이 컨텍스트).
- **대시보드 카드** — 최근 대화 이어가기 + 추천 질문.

### 3.2 화면 동작
- 질문 입력 → 답변 **스트리밍** 표시.
- 답변 하단 **출처 카드** — 사용한 조문/판례/문제를 칩으로, 클릭 시 해당 뷰어로 이동(`/subjects/:subject/articles/:no` 등).
- 답변별 **피드백(👍/👎)** — eval 데이터로 수집(§12).
- 대화 이력 좌측 목록 — 사용자별, soft delete.
- 상태 렌더 순서(CLAUDE.md): error → loading(스트리밍 전) → empty(첫 진입 추천질문) → content.

---

## 4. 아키텍처 — RAG 파이프라인

```
[색인 파이프라인 — 비동기]
 콘텐츠(조문/판례/문제)
   → 청킹(chunk)            §6
   → 임베딩(embed)          §7   ── 외부 임베딩 API
   → 저장 content_chunks    §5        (pgvector)

[질의 파이프라인 — 요청 시]
 질문
   → 전처리(과목·조문번호·사건번호 추출)
   → 하이브리드 검색         §8
       ├ pgvector 의미 검색
       ├ pg_trgm 키워드 검색
       ├ 구조화 필터(law_code 등)
       └ 연관관계 그래프 확장
   → 컨텍스트 top-K 조립
   → 생성(Claude API, 스트리밍)  §9  ── 시스템 프롬프트 가드레일
   → 출처 인용 + 응답
```

**핵심 결정**
- **벡터 DB 별도 도입 안 함** — Supabase Postgres 의 `pgvector` 익스텐션 사용. 현재 미설치(`ltree`·`pg_trgm`만 설치됨)이나 `vector` 0.8.0 이 Supabase 에 available — `create extension vector` 한 줄로 활성화, `hnsw` 인덱스 지원. db-schema.md 도 이미 "pgvector 는 P2" 로 예고함. → 신규 인프라·신규 RLS 체계 0.
- **LLM = Claude API** — 프로젝트 스택 일치. 기본 `claude-sonnet`(비용/속도), 필요 시 복잡 질의 `claude-opus` 분기. 외부 호출은 서버 action/loader 에서만, 키는 서버 전용(CLAUDE.md).
- **순수 벡터가 아니라 하이브리드** — 법률 질문은 "특허법 제29조"·사건번호 등 정확 참조가 많아 키워드·구조 검색이 필수. 벡터는 개념·의역 질문 담당.

---

## 5. 데이터 모델 (제안)

> 명명·공통컬럼·RLS 는 db-schema.md §1 컨벤션 준수. 확정 시 db-schema.md 에 정식 등재.

### 5.1 `content_chunks` — 색인 단위 + 임베딩

```sql
create extension if not exists vector;

create type public.chunk_source_type as enum ('article','case','problem');

create table public.content_chunks (
  chunk_id       uuid primary key default gen_random_uuid(),
  source_type    chunk_source_type not null,
  source_id      uuid not null,              -- polymorphic, FK 없음 (관례: relations 와 동일)
  chunk_index    int not null,               -- 한 소스가 여러 청크일 때 순서
  law_code       text,                       -- 구조화 필터용 (problem 은 subject)
  heading_path   text,                       -- '특허법 > 제2장 > 제29조' 식 표시·재랭킹용
  body_text      text not null,              -- 임베딩·키워드 검색 대상 평문
  token_count    int not null,
  embedding      vector(1024),               -- ❓ 차원은 임베딩 모델에 종속 (§14)
  content_hash   text not null,              -- body_text 해시 — 재임베딩 skip 판정
  embedded_at    timestamptz,                -- null = 임베딩 대기(dirty)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
```

- `deleted_at` 없음 — 청크는 콘텐츠에서 **파생**되는 재생성 가능 데이터(사용자 학습 데이터 아님). 소스 삭제·개정 시 청크는 삭제/재생성.
- 인덱스: `content_chunks_embedding_hnsw` (`using hnsw (embedding vector_cosine_ops)`), `content_chunks_body_trgm` (`using gin (body_text gin_trgm_ops)`), `(source_type, source_id)`, `(law_code)`, `(embedded_at)` partial — `where embedded_at is null`(dirty 큐 스캔).
- **RLS**: 인증 사용자 read(콘텐츠 평문은 이미 공개 콘텐츠에서 파생 — 콘텐츠 RLS 와 동일). write 는 임베딩 파이프라인(admin client)만.

### 5.2 `ai_conversations` — 대화 (사용자 학습 데이터)

```sql
create table public.ai_conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(profile_id),
  title           text,                      -- 첫 질문에서 자동 생성
  anchor          jsonb,                     -- 앵커 컨텍스트 {source_type, source_id} (뷰어 진입 시)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                -- soft delete (Non-negotiable #9)
);
```

### 5.3 `ai_messages` — 대화 메시지

```sql
create type public.ai_message_role as enum ('user','assistant');

create table public.ai_messages (
  message_id      uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(conversation_id),
  role            ai_message_role not null,
  body_md         text not null,
  citations       jsonb not null default '[]', -- [{source_type, source_id, chunk_id, label}]
  retrieval_meta  jsonb,                       -- 디버그·eval: 검색된 청크 id·점수
  token_usage     jsonb,                       -- 비용 추적 {input, output, model}
  feedback        smallint,                    -- null=무 / 1=👍 / -1=👎
  created_at      timestamptz not null default now()
);
```

- **RLS** (`ai_conversations`·`ai_messages` 둘 다): `user_id = auth.uid()` 본인만 R/W. 강사·운영자 접근 없음 — 비공개(db-schema.md §1.3 사용자 학습 데이터 원칙). `ai_messages` 는 `conversation_id` 의 소유자로 판정.
- 인덱스: `ai_conversations (user_id, updated_at desc) where deleted_at is null`, `ai_messages (conversation_id, created_at)`.

---

## 6. 청킹 전략

콘텐츠가 이미 구조화돼 있어 자연 경계가 명확하다 — 청킹이 단순하다.

| 소스 | 청크 단위 | 비고 |
|---|---|---|
| 조문 | **조 1개 = 청크 1개**. 본문이 길면(>~800토큰) 항 단위 분할 | `article-body.ts` 구조화 JSON → 평문 직렬화. 현행 시행 revision(`articles.current_revision_id`)만 색인 — 과거 개정본 제외 |
| 판례 | **요지 / 이유 / 평석 섹션별** 청크 | `heading_path` 에 사건번호·법원 포함 |
| 객관식 문제 | **문제 발문 + 선지 + 해설 = 청크 1개** | 해설(`explanation_md`)이 학습 가치의 핵심 |
| 주관식 문제 | **문제 + 모범답안 + 채점기준** | |

- 각 청크는 안정적 `(source_type, source_id, chunk_index)` 식별자 유지 — 소스 재색인 시 동일 키로 upsert.
- `content_hash` = `body_text` 해시. 소스가 바뀌어도 해당 청크 텍스트가 동일하면 재임베딩 skip.

---

## 7. 임베딩 파이프라인

### 7.1 최초 백필
- 전 콘텐츠를 1회 배치 색인. 운영자 트리거 RPC 또는 스크립트. 과목·소스타입별로 끊어 실행(타임아웃 회피).

### 7.2 증분 — 콘텐츠 변경 시 재색인
콘텐츠 변경 경로에서 영향받은 소스의 청크를 **dirty 마킹**(`embedded_at = null`) → 워커가 임베딩.
- **개정 발행** — `article_revisions` publish 트랜잭션 후 해당 조문 청크 dirty.
- **판례 수정** — `admin-case-edit` 저장 후 해당 판례 청크 dirty.
- **문제 출제/수정** — 문제 저장 후 해당 문제 청크 dirty.

워커 = **외부 cron** (`/api/cron/embed-chunks`, `CRON_SECRET` 보호) — 기존 `/api/cron/*` 패턴과 일관. `embedded_at is null` 청크를 배치로 임베딩. (Postgres `pg_cron`·`pgmq` 도 가용하나, 외부 cron 이 기존 관례라 채택.)
- 즉시성이 필요하면 변경 action 에서 `runAfterResponse()`(CLAUDE.md §서버리스)로 best-effort 선임베딩, 누락은 cron 이 보강.

---

## 8. 검색 (Retrieval) — 하이브리드

질문 1건에 대해 4경로를 병합한다.

1. **의미 검색** — 질문 임베딩 ↔ `content_chunks.embedding` 코사인 유사도 top-N. Postgres 함수 `match_content_chunks(query_embedding, law_filter, k)`.
2. **키워드 검색** — `pg_trgm` / `ILIKE` 로 `body_text` 매칭. 고유명사·정확 표현 담당.
3. **구조화 필터** — 질문 전처리로 과목·`제N조`·사건번호 토큰 추출(기존 `extract.ts` `extractCaseNumber` 재사용 가능) → `law_code`·소스 직접 조회. "특허법 제29조 알려줘"는 검색 없이 직격.
4. **연관관계 그래프 확장** — 위에서 찾은 조문의 관련 판례·문제를 5종 link 테이블([[relations]])로 끌어와 컨텍스트 보강.

- **융합**: Reciprocal Rank Fusion(RRF) 또는 가중합으로 단일 순위 → top-K(약 8~12 청크)를 컨텍스트로.
- 모두 Postgres 내 — 외부 검색 인프라 불필요.

---

## 9. 답변 생성 + 출처 인용 + 가드레일

- **시스템 프롬프트 제약**: ① 제공된 검색 컨텍스트 안에서만 답한다 ② 답변에 사용한 조문/판례/문제를 반드시 인용 ③ 근거가 부족하면 추측하지 말고 "이 부분은 확실하지 않습니다 — 강사 Q&A 를 이용하세요"로 응답 ④ 변리사 수험 톤, 한국어 ⑤ 법조문·판례는 컨텍스트의 원문을 왜곡하지 않는다.
- **출처(citations)**: 모델이 답변에 사용한 청크 → `ai_messages.citations` 에 `{source_type, source_id, chunk_id, label}` 저장 → UI 출처 카드. 인용 0건이면 "근거 불충분" 경로로 처리.
- **스트리밍**: SSE 로 토큰 스트림. Vercel Node SSR 에서 스트리밍 응답 가능.
- **prompt caching**: 시스템 프롬프트 + (가능 시) 컨텍스트 캐싱으로 비용·지연 절감.
- 환각 = 법률 오답 = 사용자 피해. 출처 인용과 "모름"은 **기능이 아니라 안전장치**다.

---

## 10. 권한 · RLS · 구독 게이팅

- `ai_conversations`·`ai_messages` — 본인만 R/W(RLS), soft delete(#9). 강사·운영자도 못 봄.
- `service_role` 미사용 — 질의 파이프라인은 사용자 클라이언트 + RLS. 임베딩 백필 cron 만 admin client.
- **구독 게이팅** — AI 질의는 LLM 비용이 든다. `feat-8-018` 결제 인프라(`hasFeature` 헬퍼) 연계: 무료 = 일 N회 한도 / 유료 = 확대. 한도 정책은 ❓(§14).

---

## 11. 비용 · 성능 · 서버리스 제약

- **임베딩 비용** — 백필 1회성 + 증분(콘텐츠 변경분만). 콘텐츠 규모상 작음.
- **LLM 비용** — 질의당 발생. 레이트 리밋(사용자별 일 한도) + 구독 게이팅으로 방어. `token_usage` 로 추적.
- **Vercel 서버리스** — 스트리밍 응답 OK. 임베딩 백필은 함수 타임아웃(서울 `icn1`) 안에서 배치 분할. 응답 후 로깅은 `runAfterResponse()`.
- **지연** — 검색(수십 ms) + LLM(수 초, 스트리밍으로 체감 완화).

---

## 12. 평가 (Eval)

- **eval셋** — 실제 수험생 질문 + 강사 검증 답변 쌍. **지금부터 수집** 시작(베타 로그 + 강사 라벨링).
- **지표** — 검색 recall(정답 청크 포함률), 출처 정확도, 답변 품질(강사 채점), 환각율(컨텍스트 밖 주장 비율).
- **피드백 루프** — `ai_messages.feedback`(👍/👎) → 👎 케이스를 eval 셋·프롬프트 개선에 환류.

---

## 13. 단계적 구현 — feat-9-001 ~ 006

| ID | 범위 | 우선순위 |
|---|---|---|
| feat-9-001 | **RAG 인프라** — `vector` 확장, `content_chunks` + RLS·인덱스, 청킹 로직, 임베딩 파이프라인(`/api/cron/embed-chunks`), 전체 백필 | P2 |
| feat-9-002 | **하이브리드 검색** — `match_content_chunks` RPC + 키워드 + 구조화 필터 + 그래프 확장 + RRF 융합 | P2 |
| feat-9-003 | **답변 생성** — Claude API 연동, 시스템 프롬프트·가드레일, 출처 인용, 스트리밍 | P2 |
| feat-9-004 | **AI Q&A 화면** — `/ai` 채팅 UI, `ai_conversations`/`ai_messages`, 대화 이력, 뷰어 패널·대시보드 진입점 | P2 |
| feat-9-005 | **피드백 · eval · 품질 튜닝** — 👍/👎, eval셋, 지표 측정 | P2 |
| feat-9-006 | **구독 게이팅 · 레이트 리밋** — feat-8-018 결제 연계, 일 한도 | P2 |

001→002→003→004 는 순차. 001 은 콘텐츠 확보와 무관하게 착수 가능(특허법으로 베타). 005·006 은 004 이후.

---

## 14. 미해결 질문 — 결정 필요 ❓

> **착수 전 사용자 확인 필요.** 각 항목에 **권장안**을 1개씩 제시한다. 사용자가 다른 안을 원하면 그 자리에서 교체, 권장안 채택 시 §13 feat-9-001 부터 착수.

### 14.1 임베딩 모델 → **권장: Voyage AI `voyage-3-large` (다국어, 1024 차원)** ⚠️ 차원 결정 필요

- 후보 비교
  - **Voyage `voyage-3-large`** — 다국어 SOTA 급, Anthropic 생태계 공식 권장. 차원 1024(또는 256/512/2048 선택 가능, 1024 default). 한국어 법률 텍스트에서 가장 안정적 기대치.
  - Voyage `voyage-law-2` — 영문 법률 특화, 한국어 미보장 → 후순위.
  - OpenAI `text-embedding-3-large` — 3072 차원(고차원 → 인덱스 비용↑). 다국어 강하지만 한국 법률 도메인 eval 안 됨.
  - 자체호스팅 `bge-m3` — 인프라 부담 → 비채택.
- **결정 영향**: `content_chunks.embedding vector(N)` 의 N 이 모델에 따라 고정. 한 번 만들면 차원 변경 = 전체 재임베딩. 따라서 v1 default 로 **1024** 확정 후 후속 eval 에서 모델만 교체 여지(차원 동일하면 가능).
- 환경변수: `VOYAGE_API_KEY` (server-only).

### 14.2 LLM 모델 → **권장: 단일 모델 `claude-sonnet-4-6` 고정**

- 권장 이유: v1 의 질의는 대부분 정의·요건·판례 인용 — sonnet 으로 충분. opus 분기는 (a) 비용·지연 동시 상승 (b) 분기 기준 결정 어려움 (c) 시스템 프롬프트 캐싱(§9) 단일 모델일 때 효과 최대. 복잡 질의 분기는 v2 에서 eval 데이터 보고 재결정.
- 환경변수: `ANTHROPIC_API_KEY` (server-only). 모델 ID 는 `app/core/lib/constants.ts` 에 `AI_QNA_MODEL` 로 둔다.

### 14.3 구독 게이팅 → **권장: 무료 일 5회 / 회원3(area_study_mgmt) 일 50회**

- 무료 사용자 = 일 **5회** AI 응답. 한도 초과 시 모달 → "강사 Q&A 또는 유료 업그레이드" 안내.
- 회원3(`area_study_mgmt` 보유) = 일 **50회**. 일반 학습자의 평균 사용량을 충분히 커버하며 비용도 제어 가능.
- 측정 단위: 사용자당 KST 자정 ~ 다음 자정 사이 `ai_messages.role='assistant'` row 수. RPC `ai_qna_today_count(user_id)` 로 단일 query.
- 한도 정책은 `app/features/ai-qna/lib/rate-limit.ts` 의 상수로 단일 소유. feat-8-018 결제 tier 변경 시 같이 갱신.

### 14.4 진입점 우선순위 → **권장: 뷰어 패널 먼저 (조문·판례·문제)**

- 권장 이유: (a) 학습 흐름 안에서 가장 자연 — 학생이 보고 있는 조문이 곧 컨텍스트 앵커. (b) 전용 `/ai` 화면은 "무엇을 물어야 하나" 의 cold start 가 있음. (c) 뷰어 패널이 베타 단계의 사용자 신호 수집에 효율적(어느 조문에서 질문이 많은가).
- 구현 순서: feat-9-004 안에서 뷰어 패널 → 대화 이력 누적 → `/ai` 전용 화면(이력 색인) 순.

### 14.5 멀티턴 범위 → **권장: 직전 4턴 (앵커 + user 2 + assistant 2)**

- 권장 이유: 1턴(직전 user 질문만) 은 follow-up 질문(“그럼 진보성은요?”) 처리 불가. 전체 대화는 토큰 비용·지연 누적. **마지막 4턴(2 라운드)** 이 follow-up 두 단계까지 안전하게 잡으면서 비용은 통제됨. 5턴 이상은 v2 에서 사용자 데이터 보고 확장.
- 컨텍스트 우선순위: ① 앵커(현재 뷰어 엔티티) > ② 직전 2 라운드 > ③ 검색 결과 top-K.

### 14.6 자연과학 포함 → **권장: v1 제외 (동의)**

- 자연과학(물리·화학·생물·지구과학) 4과목은 조문·판례가 없는 문제 풀이 기반 — RAG 적합도 낮음. v1 코퍼스에서 제외하고 시스템 프롬프트에서 "자연과학 질문은 답변하지 않습니다" 명시.
- v2 에서 자연과학 문제+해설을 별도 코퍼스로 추가 검토.

---

### 14.7 권장안 채택 시 다음 단계

위 6건 권장안을 그대로 채택하면 feat-9-001 착수 가능. 우선 작업:
1. Supabase MCP `apply_migration` — `create extension vector` + `content_chunks` 테이블(`embedding vector(1024)`) + RLS + 인덱스(`hnsw vector_cosine_ops`, `gin gin_trgm_ops`, partial `embedded_at is null`)
2. `npm run db:typegen` — `database.types.ts` 재생성
3. `app/core/lib/constants.ts` 에 `AI_QNA_MODEL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMS=1024`, `AI_QNA_FREE_DAILY=5`, `AI_QNA_TIER1_DAILY=50` 추가
4. 청킹 로직 + dirty-mark 훅 (조문/판례/문제 변경 시) + `/api/cron/embed-chunks` cron handler 골격
5. `docs/db-schema.md` 갱신 (테이블 등재)

---

## 15. 위반 가드 (CLAUDE.md Non-negotiable 체크)

- #1/#2: `service_role` 키 클라이언트 노출 금지 — 임베딩 cron 만 admin client, 질의는 사용자 클라이언트.
- #3: `any`/`@ts-ignore` 금지 — 검색 결과·citations 타입 명시.
- #8 정신: 법령 무결성 — AI 는 콘텐츠를 **읽기만**, DB 에 쓰지 않음. 출처 인용·"모름"으로 원문 왜곡 방지.
- #9: 대화 이력 soft delete(`deleted_at`).
- #10: 외부 API(임베딩·Claude) 호출은 서버 action/loader 에서만, 키 서버 전용. 응답 후 로깅은 `runAfterResponse()`.
- DB 변경은 Supabase MCP `apply_migration` + `npm run db:typegen`, db-schema.md 동시 갱신.

---

## 16. 기존 자산과의 관계

- **사람-간 Q&A([[feat-qna]])** — AI 가 "근거 불충분"으로 답하면 그 질문을 강사 Q&A 스레드 생성으로 연결(에스컬레이션). v1 이후 연계, v1 에서도 그 흐름을 막지 않도록 설계.
- **연관관계 그래프([[relations]])** — §8.4 검색 확장의 핵심 자산. 새로 만들 것 없음.
- **`pg_trgm` 검색** — feat-4-A-208 에서 이미 도입·운영 중. 하이브리드의 키워드 경로로 재사용.
- **결제([[feat-8]] feat-8-018)** — `hasFeature` 헬퍼로 게이팅.
- **콘텐츠 5과목** — 상표·디자인·민법·민사소송법 색인 품질은 콘텐츠 확보에 종속(§2 의존성).

— 끝. 검토 후 §14 결정 → feat-9-001 착수.
