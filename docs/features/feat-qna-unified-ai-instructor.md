# 통합 Q&A 설계 — 강사 + AI 답변 (학생 접근 최우선)

> 상태: **설계(제안)** — 착수 전 사용자 검토. 기존 두 시스템(학습지원 AI Q&A + 커뮤니티 Q&A)을 하나로 합쳐, **학생이 한 곳에서 질문하면 AI가 즉시 답하고 강사가 확인·보완**하는 구조.

## 1. 목표 / 원칙
- **단일 진입**: 학생은 "어디서 물어야 하지"를 고민하지 않는다. Q&A 한 곳에서 질문 → 끝.
- **즉답 + 권위**: AI가 즉시(스트리밍·출처인용) 답하고, 강사가 확인(✓)/보완/정정. 둘의 장점 결합.
- **공개 지식베이스**: 질문·답변 공개(이미 Q&A 공개화 완료). 남의 질문+AI답+강사확인이 모두에게 학습자산.
- **비용 안전**: AI를 전 학생에 개방하되 일일 쿼터 + 글로벌 비용 캡으로 보호(기존 인프라 재사용).

## 2. 현재 상태 (합치기 전)
| | 학습지원 AI Q&A (`/ai`) | 커뮤니티 Q&A (`/qna`) |
|---|---|---|
| 답변자 | AI(RAG, 스트리밍, 멀티턴) | 강사(비동기, 단일 답변) |
| 데이터 | `ai_conversations`/`ai_messages`(개인 비공개) | `qna_threads`(공개, 답변 1개 inline) |
| 접근 | **staff 전용**(AI_QNA_STAFF_ONLY=true)·일일쿼터·비용캡 | 전체 공개·대상(조문/판례/문제/공부방법)·과목분류 |
| 인용 | `[N]` 출처칩(조문/판례/문제/기본서) | 없음 |
| 연결 | 없음(한도 초과 시 "강사 Q&A" 링크 안내뿐) | 없음 |

→ 코드 결합 0. 합치려면 새 글루 필요.

## 3. 추천 학생 UX (가장 쉬운 접근)
1. nav **"Q&A" 한 개**(커뮤니티). 학습지원의 "AI Q&A"는 이 Q&A로 흡수.
2. **질문하기** 한 버튼: 과목(필수) + (선택) "무엇에 관한 질문?" 대상(조문/판례/문제 — 뷰어에서 진입 시 자동 anchor, 아니면 공부방법/일반).
3. 제출 즉시 **AI가 스트리밍으로 답**(출처 인용). 상태칩 = **AI 답변**.
4. 질문은 공개 → 다른 학생도 열람. 같은 의문 가진 학생은 검색으로 재사용.
5. **강사**가 스레드에 들어와 (a) AI 답변에 **✓ 강사 확인**, (b) **보완/정정 답변** 추가, (c) 필요 시 라벨링. 상태칩 = **강사 확인** / **강사 답변**.
6. 학생은 같은 스레드에서 **후속 질문**(멀티턴) → AI 재답변(스레드 맥락 반영). 강사 답변과 공존.

> 핵심: 학생은 "AI냐 강사냐"를 고르지 않는다. **한 번 물으면 즉답(AI) + 나중에 권위(강사)**가 같은 스레드에 쌓인다.

## 4. 데이터 모델 — 추천안 A: "스레드 + 메시지" 통합
두 모델(단일답변 `qna_threads` + 멀티턴 `ai_messages`)을 **스레드+메시지**로 일원화.

- **`qna_threads`(확장)** = 질문 스레드: `thread_id, target_type(article|case|problem|study_method|general), target_id(nullable), subject, asker_id, title, status, created_at/updated_at/deleted_at`. *기존 `question_md`는 첫 student 메시지로, `answer_md/answerer_id/quality_grade`는 강사 메시지로 이전(컬럼은 호환 위해 한동안 유지 가능).*
- **`qna_messages`(신규, ai_messages 일반화)** = 스레드 내 메시지:
  - `message_id, thread_id, role(student|ai|instructor), author_id(student/instructor; ai=null), body_md, created_at, deleted_at`
  - AI 전용: `citations(jsonb), retrieval_meta(jsonb), token_usage(jsonb), refusal_kind`
  - 강사 전용/공통: `verifies_message_id(nullable — 이 AI답을 ✓확인/정정함), feedback, review_status`
- 상태 머신: `open`(질문만) → `ai_answered`(AI 즉답) → `instructor_answered`/`verified`(강사 답/확인) → `closed`.

**마이그레이션(소급)**: 기존 `qna_threads.answer_md` → instructor `qna_messages` 1건. 기존 `ai_conversations/ai_messages` → `qna_threads`(anchor→target, user→asker, private→**비공개 유지 플래그**) + `qna_messages`. *AI 대화는 사적이었으니 소급 공개 금지 — `visibility(private|public)` 컬럼 두고 기존 AI대화=private, 신규 Q&A=public 기본.*

### 데이터 모델 — 대안 B: 가벼운 증분(마이그 최소)
`qna_threads` 유지 + AI 답변을 **생성 시 1회** 만들어 별도 필드/메시지로 저장, 강사 답변은 기존 `answer_md` 사용. **멀티턴 없음**(단일 Q→AI답→강사답). 작업량↓·통합도↓. /ai 챗은 당분간 병존 또는 폐지.

→ **추천 = A**(진짜 통합 + 멀티턴 + 최고 UX). 단 마이그·작업량 큼. 빠른 1차 출시가 우선이면 B로 시작해 A로 진화 가능.

## 5. 답변 생성 (AI) — 기존 인프라 재사용
- 질문 생성 액션이 **즉시 RAG 스트리밍**(기존 `hybridSearch`+`answerQuestion`+`buildSystemPrompt`+`extractCitations`)으로 AI 메시지 작성. (현 `/api/ai-qna/ask` SSE 로직을 Q&A 스레드에 쓰도록 일반화.)
- 멀티턴: 스레드의 직전 메시지들(student/ai)을 `buildMultiturnMessages`로 재생(강사 메시지는 컨텍스트에 포함하되 별도 표기).
- 자연과학·근거부족은 기존 거절 가드 → "강사 답변 대기"로 전환(강사 큐에 노출).

## 6. 접근 · 권한 · 게이팅
- **AI 학생 개방**: `AI_QNA_STAFF_ONLY` 해제(통합 Q&A는 학생용). 일일 쿼터(free 5 / tier1 50, `app_settings.ai_qna_quotas`) + 글로벌 비용캡(`checkGlobalCap`) 그대로 적용 → 비용 안전.
  - 쿼터 초과 시: AI 답변만 막히고 **질문은 그대로 등록 → 강사 답변 대기**(현재의 "강사 Q&A로 가세요"보다 매�끄러움).
- **강사 권한**: 답변/확인/정정 = staff. (학생끼리 답변은 범위 밖 — 사용자가 강사 답변 모델 확정.)
- **공개/비공개**: 공개 기본. (소급 노출 우려분 = §4 visibility 플래그로 보호.)
- RLS: 스레드 SELECT 공개(완료), `qna_messages` SELECT 공개(visibility=public)·INSERT(student=본인 thread, ai=service, instructor=staff)·강사 verify=staff.

## 7. 내비게이션 / 진입점
- nav "Q&A"(커뮤니티) 단일. 학습지원의 "AI Q&A" 항목 제거(또는 Q&A로 redirect).
- 콘텐츠 뷰어의 `AskAiButton`("이 조문 질문") → 통합 Q&A 작성(anchor=대상)으로 연결. 뷰어 우측 Q&A 패널과 일원화.
- `/ai`·`/api/ai-qna/ask`는 통합 백엔드로 redirect 또는 폐지.

## 8. 단계 (제안)
1. **모델 확정 + 마이그**: `qna_messages` 신설 + `qna_threads` 확장(+ visibility, general 대상). 기존 answer_md·ai_* 이관.
2. **AI 즉답 배선**: 질문 생성 → RAG 스트리밍 AI 메시지(기존 ask 로직 일반화) + 쿼터/캡.
3. **스레드 UI**: 메시지 타임라인(질문/AI/강사) + 출처칩 + 후속질문 작성 + 👍/👎.
4. **강사 도구**: ✓확인/보완답변/큐(미답·근거부족 우선).
5. **진입 통합**: nav 단일화·AskAiButton·/ai redirect.
6. **정리**: 학습지원 AI Q&A·admin 화면 재배치, 문서/ SPEC.

## 9. 확정 필요한 결정
- (A vs B) 멀티턴 통합(A) vs 가벼운 증분(B)?
- AI를 **모든 질문에 자동 즉답**(가장 쉬움) vs **요청 시에만**?
- 기존 `/ai` 사적 AI 대화의 처리(비공개 보존 = 권장) 및 학습지원 메뉴 제거 범위.
- 학생 일일 AI 쿼터 수치(현 free 5 유지?).
