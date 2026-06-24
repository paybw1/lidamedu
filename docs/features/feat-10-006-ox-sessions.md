# feat-10-006 — 정오문제(OX) 시험 · 응시 이력 · 회차 리뷰

> 1차 객관식 팩(보기·박스의 OX 지문)을 O/X 시험 모드로 풀고, 회차를 저장·조회·리뷰.
> 관련 화면: `latest/screens/mcq-pack-ox-exam.tsx`(러너+저장), `latest/screens/my-ox-sessions.tsx`(이력),
> `mcq-packs/queries.server.ts`(`listMyOxSessions`). 점검: `docs/survey`(OX 리뷰 분석, 2026-06-23).

## 동작 흐름
1. **진입** — 1차 객관식 팩 상세(`mcq-pack-detail`) → "정오문제 시험"(exam) / "정오문제 학습"(study) → `/latest/mcq/:packId/ox-exam`.
2. **풀이** — exam: 지문별 O/X(즉시 피드백 없음)·타이머·셔플 → "제출+채점"(0초 자동제출). study: 카드별 즉시 정답 + 지문별 best-effort 기록(회차 미생성).
3. **저장** — `quiz_sessions`(`mode='exam'`, `scope_type='pack'`, `scope_payload={pack_id, ref_count, exam_kind:'ox'}`) + `user_problem_attempts`(응답한 지문, session_id 연결).
4. **이력** — `/me/ox-sessions`: `listMyOxSessions`(exam_kind='ox' 세션 + attempts 집계). 점수 미저장·파생.

## 데이터 모델
- 회차 = `quiz_sessions`(`scope_payload->>exam_kind='ox'`). 지문 정오 = `user_problem_attempts`(`selected_choice_id`/`selected_box_item_id` = OX `refId`). 점수는 attempts에서 매번 파생(모의 채점과 동일).
- **OX 정답 단일 소스 = `getOxQuestionsForPack`**(`problems/queries.server.ts`) — 팩 문제의 `problem_choices`/`problem_box_items` 중 `ox_ineligible=false ∧ ox_truth NOT NULL`. `refId`(choice_id/box_item_id)로 attempts와 매칭.

## 리뷰 개선 (1+2+3 — 2026-06-23 착수)
제3자 점검에서 식별한 핵심 3건. 단일 정답 소스(`getOxQuestionsForPack`)를 채점·뷰·정답률이 공유해 정합.

### ✅ 단계 1 — 서버 권위 채점 (+ 과목 식별 픽스)
- **서버 재채점**: 액션이 `getOxQuestionsForPack`로 `truthMap`(`refType:refId → ox_truth`) 구성 → `is_correct`를 **서버가 재계산**. 클라가 보낸 `isCorrect`/`oxTruth`는 폐기(스키마·payload에서 제거). truthMap에 없는 ref(팩 편집 등)는 채점 불가 → 미저장·미집계(미응답 흡수). → 약점진단·SRS·이력 데이터 무결성.
- **과목 식별 픽스(블로커)**: 기존 OX 액션은 `subject_scope→law_code` 불완전 맵(`industrial/civil/civil_procedure/science`만)을 써서 **`patent`·`design`·`trademark` 누락 → "과목 식별 실패"로 특허/디자인/상표 기출 90팩 OX 저장 실패**였음. → 일반 객관식 응시(`mcq-packs/api/start`)와 동일하게 **첫 문제의 실제 `laws(law_code)`로 결정**(SSOT). 맵 삭제.

### ✅ 단계 2 — 회차 결과 뷰 + 이력 relink + 정답률 통일
- `QuestionCard`+`OxButton` → `problems/components/ox-question-card.tsx` 추출(러너·결과 뷰 공용, 드리프트 0).
- 새 라우트 `/me/ox-sessions/:sessionId` + `my-ox-session-result.tsx`: `getOxSessionResult`(세션·attempts·`getOxQuestionsForPack` refId 매칭) → 지문별 정답/오답/미응답 + 사용자 답 + 정답 + 해설(읽기 전용 `QuestionCard`). 본인 세션만(RLS+user_id), 아니면 404.
- 이력 행 클릭 = **결과 보기**(재시작은 우측 "다시 풀기" 별도). 러너 "이력 저장됨" → "결과 보기" 링크.
- **정답률 `correct/total`로 통일**(러너·이력·결과 뷰 동일 — 미응답 분모 포함).

## 백로그 4~7 (2026-06-24 처리)
- ✅ **삭제 팩**: 회차 클릭은 결과 뷰로(정상 처리). "다시 풀기"는 packTitle 존재 시만 노출(삭제 팩 404 가드) — 이력 행·결과 뷰 양쪽.
- ✅ **duration 클램프**: 클라 역산 startedAt 폭주 방지(상한 6시간 `MAX_OX_DURATION_MS`). started_at/durationSec은 표시용·비권위 유지.
- ✅ **과목 필터**: 이력에 등장한 subject_scope 칩 필터(전체+과목) — RangeSelection과 AND.
- ✅ **진입 동선**: 이력 헤더 "정오문제 풀러 가기" CTA(→ `/latest/mcq?kind=past_exam`, OX 지문 풍부한 기출).
- ⏸ **의도(미변경)**: per-item `time_spent_ms` 균등분배 — OX는 지문별 시간 미노출 + **합계는 정확**(KPI 총학습시간) → 실측 미구축(YAGNI). **미응답 무기록** — 무응답=데이터 아님(약점진단·SRS 오염 방지), 미응답은 회차 결과 뷰에 표시됨.
- 🔲 **팩별 그룹/추이(trend)**: 같은 팩 반복 응시 향상 시각화 — 별도 설계(데이터 누적 후). 현재는 결과 뷰로 회차별 리뷰 가능.
