# feat-qna — Q&A 통합 (조문 / 판례 / 문제)

> SPEC.md 매핑: feat-4-A-116 (조문), feat-4-A-215 (판례), feat-4-A-316 (문제) — 공통 컴포넌트로 묶어 한 번에 구현.

## 1. 목표

수험생(student)이 특정 **조문 / 판례 / 문제** 단위로 질문을 작성하면 강사(instructor / admin)가 답변하고, 답변자는 질문의 수준을 평가한다. 외부 알림(이메일·카톡)으로 양방향 전달한다. 통합 화면에서 검색·열람 가능.

## 2. 사용자 흐름

### 2.1 학생 — 새 질문
1. 조문/판례/문제 우측 패널의 "Q&A" 탭에서 **새 질문** 클릭
2. 제목 + 본문(markdown) 입력 → 등록
3. 시스템이 답변자에게 이메일(+카톡) 발송
4. 학생 본인의 Q&A 목록에서 상태 추적

### 2.2 강사 — 답변
1. 알림 메일 링크 클릭 → `/qna/:threadId` (로그인 필요)
2. 답변(markdown) 입력 + **질문 수준 평가**(상/중/하) 선택
3. 등록 → 학생에게 이메일(+카톡) 발송, 상태 = answered

### 2.3 통합 열람·검색
- 상단 네비게이션 "운영자" 옆 **Q&A** 메뉴
- `/qna` — 검색 + 필터(전체/내 질문/내 답변/대기/답변완료) + 대상 필터(조문/판례/문제)
- `/qna/:threadId` — 스레드 상세

## 3. 데이터 모델 (제안)

### 3.1 `qna_threads`
```
thread_id        uuid PK
target_type      enum('article','case','problem')
target_id        uuid                    -- polymorphic, FK 없음
asker_id         uuid FK profiles
answerer_id      uuid FK profiles NULL   -- 답변 등록 시 채워짐
title            text NOT NULL
question_md      text NOT NULL
answer_md        text NULL
status           enum('open','answered','closed') DEFAULT 'open'
quality_grade    enum('high','mid','low') NULL  -- 답변 시 입력
created_at       timestamptz NOT NULL
answered_at      timestamptz NULL
updated_at       timestamptz NOT NULL
deleted_at       timestamptz NULL        -- soft delete
```

> v1 은 한 스레드 = 한 질문 + 한 답변. 추가 답변/스레드 댓글이 필요하면 `qna_messages` 별도 테이블로 확장.

### 3.2 RLS
- `asker_id = auth.uid()`: 본인 질문 R/W
- `answerer_id = auth.uid()`: 답변 시 W
- role = `instructor` 또는 `admin`: 모든 open 스레드 R, 답변 시 W
- 그 외 사용자: 비공개 (v1). 향후 공개 옵션은 별도 컬럼 `is_public` 으로.

### 3.3 인덱스
- `(target_type, target_id)` — 엔티티별 패널 조회
- `(asker_id, status)`, `(answerer_id, status)` — 내 질문/답변 목록
- `created_at desc` — 정렬

## 4. 라우트

| 경로 | 역할 |
|------|------|
| `/qna` | 검색 + 목록 (탭: 전체/내 질문/내 답변/대기) |
| `/qna/:threadId` | 스레드 상세 + 답변 폼 |
| `/qna/new?targetType=...&targetId=...` | 새 질문 작성 (entity 패널에서 진입) |
| `/api/qna/thread` | POST(create), PATCH(answer/close), DELETE(soft) |

엔티티 우측 패널의 Q&A 탭은 `qna_threads.target_type=X AND target_id=Y` 로 필터링한 임베디드 리스트 + "새 질문" 버튼.

## 5. 알림

### 5.1 이메일 (v1, Resend)
새 React Email 템플릿 2종:
- `qna-new-question.tsx` — 답변자에게: 질문 제목 + 본문 발췌 + 답변 링크 `/qna/:threadId`
- `qna-new-answer.tsx` — 질문자에게: 답변 발췌 + 평가 + 링크

발송 위치: action 함수 내부 (서버), Resend 호출 실패 시 `console.error` + 사용자에게는 등록 성공 응답 (알림은 부가 기능).

### 5.2 카카오 알림톡 — 스캐폴딩 완료, provider 활성화 대기
ALIM_TALK 은 비즈니스 채널 + 템플릿 사전 승인이 필요해서 코드만으로는 발송이 불가능합니다. 현재 상태:

**구현된 부분**:
- `profiles.phone_e164` (E.164, nullable) + `profiles.notify_channels` (text[], 기본 `{email}`) 컬럼 — 마이그레이션 적용됨
- `/account/edit` 폼에서 휴대폰 번호 입력 + 알림 채널 선택 (이메일 / 카카오)
- `app/features/qna/notify.server.ts` — 수신자별 `notify_channels` 에 따라 이메일·카카오로 fanout
- `app/features/qna/notify-kakao.server.ts` — Solapi 형태의 sender 시그니처 (`sendKakaoAlimtalk`). 환경변수 누락 시 `KakaoNotConfigured` throw, 디스패처가 silent catch.

**활성화 절차** (운영자가 직접 진행):
1. provider 결정 — Solapi(추천) / Aligo / Bizppurio / NHN Toast / Naver Cloud SENS 중 택1.
2. 카카오 비즈니스 채널 등록 — 사업자등록증 제출, 채널 승인.
3. 알림톡 템플릿 2종 사전 승인 — `new-question`, `new-answer` 용. 본문은 `notify.server.ts` 의 `kakaoPayload.variables` 키를 `#{변수명}` 형태로 사용.
4. Cloudflare Workers Secrets 에 환경변수 등록:
   - `KAKAO_PROVIDER` (기본 `solapi`)
   - `KAKAO_API_KEY`, `KAKAO_API_SECRET`
   - `KAKAO_PFID` — 발신 프로필 ID
   - `KAKAO_TEMPLATE_NEW_QUESTION`, `KAKAO_TEMPLATE_NEW_ANSWER` — 승인된 템플릿 ID
5. `notify-kakao.server.ts` 의 `TODO(provider-impl)` 블록에 실제 provider API 호출 코드 작성.
6. 사용자 측에서는 `/account/edit` 에서 휴대폰 번호 등록 → 카카오 채널 활성화.

## 6. 답변자 결정 — **결정 필요 ❓**

세 가지 모델 후보:

| 모델 | 설명 | 장점 | 단점 |
|------|------|------|------|
| A. 풀(Pool) 방식 | 모든 instructor + admin 에게 동시 알림. 먼저 답변하는 사람이 답변자. | 구현 간단, 학생 대기 짧음 | 누락 가능성 + 중복 답변 경합 |
| B. 학생 지정 | 학생이 새 질문 작성 시 강사 선택 (드롭다운) | 명확한 책임 | 학생이 강사 식별 부담 |
| C. 라운드로빈 | 시스템이 자동 분배 | 부하 분산 | 부재중 강사로 갈 위험 |

**기본 추천: A (풀)** — 시작이 가장 가볍고, instructor 수가 적은 초기 단계에 적합. 답변자가 등록되는 순간 `answerer_id` 가 채워지고, 이후 동일 스레드에 대한 알림은 보내지 않음.

## 7. 검색

- `qna_threads.title` + `question_md` + `answer_md` 에 대해 PostgreSQL `ILIKE %q%` (v1).
- 필요 시 `tsvector` 컬럼 + GIN 인덱스로 업그레이드 (v2).
- 권한 필터(RLS) 적용 후 결과 페이징.

## 8. 점진 구현 단계

1. **DB 스키마** — `qna_threads` + RLS + 인덱스. 마이그레이션.
2. **API** — POST 생성, PATCH 답변, DELETE soft.
3. **목록/상세 페이지** — `/qna`, `/qna/:threadId`, `/qna/new`.
4. **엔티티 패널 통합** — article/case/problem 의 Q&A 탭 → 실제 임베디드 리스트.
5. **상단 네비게이션** — `운영자` 옆 `Q&A` 링크.
6. **이메일 템플릿 2종** — Resend 발송.
7. **품질 평가 UI** — 답변 폼에 상/중/하 라디오.
8. (v2) 카톡 채널, tsvector 검색, 다중 답변 스레드.

## 9. 위반 가드

- `service_role` 사용 안 함 — 사용자 클라이언트 + RLS 만으로 동작.
- soft delete (`deleted_at`) — 학습 데이터 손실 방지 정책 따름.
- 이메일 발송 실패가 등록 트랜잭션을 막지 않음 — 알림은 best-effort.
- markdown 본문은 클라이언트 렌더 시 sanitize (XSS 방지). v1 은 `whitespace-pre-line` 평문 표시로 시작 → 추후 `react-markdown` 도입.

## 10. 결정 사항 (확정)

1. 답변자 모델 — **A. 풀** (모든 instructor + admin 알림, 먼저 답변하는 사람이 답변자).
2. 카카오 — v1 스캐폴딩만 완료, provider 활성화는 운영자 작업 (§5.2).
3. Q&A 공개 범위 — **비공개** (asker + answerer + instructor/admin staff 만 열람).
4. instructor 부재 시 — admin(운영자)도 staff 로 동시 알림 수신.

## 11. 카카오 활성화 체크리스트

§5.2 절차 참고. 활성화 완료 시 SPEC.md 의 feat-4-A-116/215/316 상태를 ✅ 로 변경.
