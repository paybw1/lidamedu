# 2차 답안 작성·채점 — 현재 구현 상태 보고서

> **작성일**: 2026-06-01 · **범위**: 변리사 2차(주관식·논술) 답안 작성과 채점에 관여하는 모든 학생/강사 흐름. SPEC.md 의 5.3.4 · 5.4.A.3 (주관식 항목) · 5.5 (온라인 GS) 통합.

---

## 0. 한눈에 요약

| 항목 | 상태 |
|---|---|
| **2차 답안 작성·채점 — 전체 흐름** | ✅ P0/P1/P2 전 항목 완료 |
| **학습용 디지털 답안 + 자기채점 + 강사 첨삭 요청** | ✅ |
| **온라인 GS 회차 (종이→사진 업로드 + 다중 채점)** | ✅ |
| **AI 채점 초안** (Claude API) | ✅ 강사 초안 모드 (자동 반영 X) |
| **동료 채점 (peer review)** | ✅ 분쟁 큐 + 자동 배정 cron |
| **우수답안·포인트** | ✅ ledger 모델 |
| **GS 문항 → 학습과목 주관식 문제은행 승격** | ✅ (feat-10-001) |

핵심 메시지: **현재 단계에서 2차 답안 작성·채점은 완성형(P2 포함)**. 두 개의 독립된 흐름(일상 학습용 디지털 답안 + 회차 실전용 종이→사진)이 평행 운영되며, 회차 종료 시 GS 문항이 학습과목 문제은행으로 자동 흘러드는 닫힌 루프 가지고 있음. 알려진 차기 보강 후보는 AI 채점 자동반영(검수 모드), 우수답안 cross-회차 검색, 디지털 에디터 등 — 모두 운영 피드백 기반의 점진 개선 영역.

---

## 1. 두 가지 답안 작성 흐름 (의도된 분리)

같은 도메인이지만 사용 맥락이 다르므로 두 모델이 평행 운영됩니다.

| 차원 | 학습용 (학습과목·`/latest/essay`) | 실전용 (온라인 GS) |
|---|---|---|
| **용도** | 단원/판례 학습 중 한 문제씩 풀이 | 회차/시리즈로 실전 모의 응시 |
| **답안 입력** | 디지털 textarea (`answer_md`) | 종이 손글씨 → 페이지별 사진/PDF 업로드 |
| **자동 저장** | ✅ (`/api/study/subjective-attempt` autosave) | N/A (페이지 업로드는 즉시 저장) |
| **타이머** | 문제별 선택 시간제한 (`time_limit_sec`) | 회차 시작·종료 + 본인 시작 후 N분 |
| **응시 단위** | 개별 problem | submission (round 단위, N페이지) |
| **채점자** | 강사 (`/admin/subjective-reviews` 큐) | 강사 + AI 초안 + 동료 (3중 + 분쟁 큐) |
| **점수 영향** | 학습 점검용 (개인 진척에만) | 시리즈 통계·우수답안·포인트 |
| **결과 공개** | 첨삭 완료 즉시 | `finalizeGrading` 후 일괄 공개 |
| **테이블** | `user_subjective_attempts` | `gs_submissions` + `gs_submission_pages` + `gs_answers` 등 |
| **모범답안 / 채점기준** | problem-viewer 에서 reveal | `gs_questions.model_answer_md` + `rubric` + 모범답안 PDF |

이 분리는 의도된 설계입니다. 일상 학습은 즉시성·반복 가능성을 우선, 회차 응시는 실전(종이 답안지) 환경을 보존.

---

## 2. Surface 1 — 학습용 디지털 주관식 (학습과목 + 최신정보)

### 2-1. 학생 흐름

| 단계 | 화면 / API | 상태 |
|---|---|---|
| 주관식 문제 검색·진입 | `/subjects/:law/problems/:id` (subjective 분기) · `/latest/essay` 색인 → `/latest/essay/:id` | ✅ |
| 답안 작성 (textarea, 자동저장) | `/api/study/subjective-attempt` intent=autosave (debounce) | ✅ |
| 타이머 응시 (선택) | problem-viewer 타이머 + 자동 제출 | ✅ |
| 모범답안 / 채점기준 reveal | problem-viewer 우측 패널 fold | ✅ |
| 자기채점 점수 입력 | intent=submit (self_score, rubric_self_check) | ✅ |
| 첨삭 요청 액션 | `/api/study/subjective-review` request | ✅ |
| 강사 응답 알림 수신 | Resend 이메일 + 인앱 알림 + 학생 인박스 | ✅ |
| 첨삭 결과 보기 | problem-viewer 결과 패널 | ✅ |

### 2-2. 강사 흐름

| 단계 | 화면 / API | 상태 |
|---|---|---|
| 첨삭 요청 도착 알림 | 운영관리 허브 워크큐 "주관식 첨삭 대기" 타일 | ✅ |
| 첨삭 큐 진입 | `/admin/subjective-reviews` | ✅ |
| 한 행 펼침 → 점수·코멘트 작성 | 인라인 펼침 폼 | ✅ |
| 첨삭 완료 → 학생 알림 | Resend 이메일 + 인앱 + 카카오 알림톡(Solapi) | ✅ |
| 첨삭 이력 (완료 30건) | 큐 화면 하단 | ✅ |

### 2-3. 관련 SPEC

- `feat-3-401` — 신규 주관식 문제 피드 (`/latest/essay`)
- `feat-3-402` — 모범답안 reveal + 첨삭 요청 워크플로우 (강사 알림 포함)
- `feat-4-A-305` — 학습과목 주관식 Runner (자기채점 + 첨삭 요청)
- `feat-4-A-321` — 주관식 분류 라벨 (subjective_kind / subjective_keyword)

### 2-4. 데이터 모델 (핵심)

`user_subjective_attempts`
- (user_id, problem_id) 1:1 — 최신 시도
- `answer_md`, `self_score`, `self_score_note`, `rubric_self_check jsonb`
- `submitted_at`, `review_requested_at`, `review_completed_at`
- `instructor_score`, `instructor_feedback_md`, `instructor_id`

운영관리 RPC `admin_work_queue_counts.subjective_pending` → `review_requested_at IS NOT NULL AND review_completed_at IS NULL AND deleted_at IS NULL`.

---

## 3. Surface 2 — 온라인 GS (회차 실전 모의)

### 3-1. 학생 흐름

| 단계 | 화면 / API | 상태 |
|---|---|---|
| 대시보드 — 회차 카드 + 내 동료 채점 배정 | `/gs` | ✅ |
| 응시 가드 (시작/종료/제한시간/1회 제한) | `/gs/:id/take` loader | ✅ |
| 답안지 PDF 다운로드 (시험지) | Storage signed URL | ✅ |
| 페이지별 사진/PDF 업로드 | `/api/gs/take` intent=upload-page | ✅ |
| 페이지 swap/끼워넣기/삭제 | `gs_swap_pages` / `gs_shift_pages_down` RPC | ✅ |
| 페이지 ↔ 문항 M:N 매핑 | `gs_submission_pages.question_ids` text[] | ✅ |
| 페이지별 판독 가능 자가확인 | intent=confirm-legibility | ✅ |
| 다페이지 PDF 자동 분할 (클라이언트) | `lib/pdf-split.client.ts` (PDF.js) | ✅ |
| 제출 가드 (모든 문항 매핑 + 모든 페이지 확인) | intent=submit | ✅ |
| 결과 페이지 (state 3종) | `/gs/:id/result` | ✅ |

### 3-2. 채점 흐름 (3중)

| 채점 종류 | 화면 / 동작 | 영향 |
|---|---|---|
| **강사 직접** | `/admin/gs/:id/grade/:submissionId` — 답안지 갤러리 + 문항별 카드 + 동료 점수 참고 | 학생 **최종 점수** |
| **AI 초안 (Claude)** | `lib/ai-grader.server.ts` (`claude-sonnet-4-6`) | 강사 채점 화면에서 초안 미리보기 — 자동 반영 X |
| **동료 peer (자동 배정)** | `/api/cron/gs-auto-assign` (회차 종료 후) — round-robin, 자기 답안 제외, default 3 reviewer | 학습용 + 분쟁 큐 input |

### 3-3. 분쟁 검토

`/admin/gs/:id/disputes` — 동료 점수 표준편차 ≥ maxScore × 0.15 인 (제출, 문항) 쌍 노출. threshold·최소 채점자 수 URL 파라미터로 조정.

### 3-4. 통계

| 단위 | RPC / 화면 |
|---|---|
| 회차별 학생 통계 (점수·z·rank·percentile) | `gs_round_student_stats` → `admin-gs-round-stats` |
| 회차별 문항 통계 (avg·median·stdev·quartile) | `gs_round_question_stats` |
| 시리즈 학생/회차 매트릭스 + 본인 추이 | `gs_series_*` → `admin-gs-series-stats` / `gs-my-series` |

### 3-5. 우수답안 + 포인트

| 단계 | 위치 |
|---|---|
| 우수답안 마킹 (회차/문항 단위) | `/admin/gs/:id/distinctions` (자동 추천 + 수동) |
| 공개 옵션 (익명 / 실명 / 비공개) | distinction row 컬럼 |
| 학생 열람 | `/gs/:id/distinguished` |
| 포인트 자동 지급 | `gs_points_ledger` 자동 insert |
| 학생 포인트 화면 | `/gs/points` |
| 운영자 수동 ±조정 | `/admin/gs/points` |

### 3-6. 관련 SPEC

- `feat-5-001` ~ `feat-5-004` — 회차/시리즈 인프라
- `feat-5-101` ~ `feat-5-110` — 학생 응시
- `feat-5-201` ~ `feat-5-207` — 채점 (강사·AI·peer 트리오 + 분쟁 + cron)
- `feat-5-301` ~ `feat-5-305` — 통계·우수답안·포인트
- `feat-5-401` ~ `feat-5-408` — 운영자 화면
- `feat-4-A-330` ~ `feat-4-A-339` — 학습과목에서 동일 모델 재사용 (답안 업로드/N분할/AI 채점/통계/우수답안 등)

전체 ✅ 완료 — SPEC.md 5.5 섹션 P0/P1 항목 일체 + P2 (`feat-5-305`, `feat-4-A-336`, `feat-4-A-339`) 도 완료.

---

## 4. 두 흐름의 연결 (feat-10-001)

GS 회차에서 출제된 좋은 문항이 학습과목의 **주관식 문제은행으로 자동 승격**되는 닫힌 루프:

```
운영자가 GS 회차 마감 → /admin/gs/:id/edit 의 "주관식 문제은행 등록" 패널
  → gs_questions → problems(format=subjective, origin=mock)
  → problems.source_gs_question_id 역참조(멱등 키)
       ↓
  학습과목 /subjects/:law/problems 색인에 자동 등장
  학생이 단원별 학습 중 만나는 풀에 합류
```

효과:
- 빈 주관식 문제은행을 GS 회차로 충전
- 회차 응시 후 같은 문제로 단원별 학습 가능 (반복 학습)
- 운영 부담 감소 (한 번 만들면 두 곳에서 활용)

---

## 5. 운영 화면 정리 (사이드바 기준)

운영관리 사이드바 **주관식 문제** 클러스터 + **공지·알림·감사** 클러스터:

```
운영관리 → 주관식 문제
  ├─ 주관식 회차      (/admin/gs)
  ├─ 주관식 시리즈    (/admin/gs/series)
  └─ 포인트 관리      (/admin/gs/points)

운영관리 → 공지·알림·감사
  └─ 주관식 첨삭 대기  (/admin/subjective-reviews)  ← 학습용 첨삭 큐

운영관리 → (허브 워크큐)
  ├─ 첨삭 대기         (count)
  └─ (회차 종료 후) 우수답안 마킹·분쟁 큐 — 회차 진입으로 처리
```

회차별 5개 운영 화면(메타 편집 · 채점 · 동료 채점 · 분쟁 · 우수답안)은 사이드바가 아닌 **회차 상세 진입 후 액션** 으로 접근.

---

## 6. 외부 통합 현황

| 통합 | 용도 | 환경변수 | 상태 |
|---|---|---|---|
| Anthropic Claude API | AI 채점 초안 (`ai-grader.server.ts`) | `ANTHROPIC_API_KEY` | ✅ Sonnet 4.6 |
| Google Cloud Vision | 답안 페이지 한국어 손글씨 OCR | `GOOGLE_CLOUD_VISION_API_KEY` | ✅ DOCUMENT_TEXT_DETECTION |
| Supabase Storage | 답안지 PDF·페이지 사진 (signed URL) | (Supabase keys) | ✅ 버킷 2종 (gs-papers/gs-submissions) |
| Vercel Cron | 동료 채점 자동 배정 | `CRON_SECRET` | ✅ 운영 (자동) |
| Resend | 학생/강사 이메일 알림 (응시 시작, 채점 완료, 첨삭 응답 등) | `RESEND_API_KEY` | ✅ |
| Solapi (카카오 알림톡) | 첨삭 응답 등 카톡 발송 | (Solapi keys) | ✅ 테스트키 검증, 라이브키·WL버튼 재심사 대기 |

---

## 7. 데이터 모델 요약

```
[학습용]                                  [GS 실전용]

user_subjective_attempts                  gs_series ──< gs_rounds ──< gs_questions
  (user_id, problem_id)                                    │
  ├─ answer_md (textarea)                                  ├──< gs_submissions ──< gs_submission_pages
  ├─ self_score / note                                     │       │                (attachment jsonb, question_ids[])
  ├─ rubric_self_check jsonb                               │       ├──< gs_answers (강사 최종)
  ├─ submitted_at                                          │       └──< gs_distinguished_answers
  ├─ review_requested_at                                   │
  ├─ review_completed_at                                   └──< gs_peer_assignments ──< gs_peer_review_answers
  └─ instructor_score / feedback_md
                                          gs_points_ledger (user_id, amount, source, ref)

──── 두 모델의 다리 ────
problems.source_gs_question_id  (feat-10-001 부분 유니크)
  GS 문항을 학습과목 주관식 문제은행으로 승격
```

---

## 8. 코드/모듈 책임 정리

### 학습용 (디지털)
- `app/features/study/api/subjective-attempt.tsx` — autosave/submit
- `app/features/study/api/subjective-review.tsx` — 강사 첨삭 응답
- `app/features/subjects/screens/problem-viewer.tsx` — Runner (subjective 분기)
- `app/features/latest/screens/essay.tsx` · `latest-essay-viewer.tsx` — /latest/essay 색인·뷰어
- `app/features/admin/screens/admin-subjective-reviews.tsx` — 첨삭 큐

### GS
- `app/features/gs/queries.server.ts` — 회차·문항·제출·페이지·채점 코어
- `app/features/gs/queries-peer.server.ts` — 동료 채점
- `app/features/gs/queries-distinctions.server.ts` — 우수답안 + 포인트
- `app/features/gs/queries-promotion.server.ts` — GS→문제은행 승격
- `app/features/gs/lib/ai-grader.server.ts` — Claude
- `app/features/gs/lib/ocr.server.ts` — Vision OCR
- `app/features/gs/lib/pdf-split.client.ts` — 다페이지 PDF 분할
- `app/features/gs/api/*.tsx` — take, peer, ai-draft, cron-auto-assign
- 학생 화면 9개 · 운영자 화면 13개 (manual 참조)

### 사용설명서·리포트
- `docs/manual/온라인GS-출제자-사용설명서.md` — 강사·운영자
- `docs/manual/온라인GS-응시자-사용설명서.md` — 수험생
- `docs/manual/온라인GS-개발자-리포트.md` — 인계용 기술 리포트
- `docs/features/feat-10-001-gs-question-promotion.md` — 승격 흐름 상세
- 본 문서 (`docs/audit/subjective-grading-status-2026-06-01.md`)

---

## 9. 알려진 한계 / 차기 보강 후보

### 의도된 한계 (현재 유지가 정답)
| 항목 | 설명 |
|---|---|
| 종이→사진 모델 | 변리사 2차 실전 환경 보존 — 디지털 에디터 도입은 실전 감각 훼손 우려로 보류 |
| 동료 점수 미반영 | 학생 점수 책임 분리 (다른 학생이 영향 X) — 의도된 정책 |
| 채점 후 잠금 | `finalizeGrading` 후 학생 결과 공개 일괄 — 부분 공개 (먼저 끝난 문항만)는 채점자 노출 불공정 가능 |

### 점진 보강 후보 (운영 피드백 기반)
| 영역 | 현재 | 보강 후보 |
|---|---|---|
| **AI 채점 자동 반영** | 강사 초안 모드 | "초안 자동 채택 + 강사 sample 검수" 모드 (검증 후 단계 도입) |
| **OCR 합본** | 페이지별 개별 OCR | 답안지 합본 OCR (문맥 보존 → AI 채점 품질 ↑) |
| **분쟁 큐 시각화** | URL 파라미터 (t=0.15) | UI 슬라이더 + 점수 분포 시각화 |
| **포인트 사용처** | 명예 점수 | 콘텐츠 잠금해제·할인쿠폰 등 — 학원 정책 결정 후 |
| **우수답안 검색** | 회차별 | 단원/주제별 cross-회차 검색 |
| **재응시 정책** | 회차 1회 제한 (unique) | 시리즈 누적 best score 등 정책 옵션 |
| **시리즈 leaderboard** | 회차 추이 표 | 명예의 전당 + 공개 순위 (옵트인) |
| **첨삭 큐 분배** | 단일 큐 (FIFO) | 강사별 분배 + 만료 알림 |
| **자기채점 루브릭** | rubric_self_check 항목별 체크 | 항목별 셀프 점수 + AI 분석 |

### 의존 환경 / 잔여 운영
- 카카오 알림톡 **라이브키 + Vercel env + WL버튼 재심사**
- AI/OCR 비용 모니터링 — 현재 회차당 추산치는 명세 없음. 일일 cap 도입 검토
- Cron 등록 — Vercel Cron 또는 외부 cron 으로 `/api/cron/gs-auto-assign` daily

---

## 10. 결론 및 권고

### 현 시점 결론
**2차 답안 작성·채점은 기능적으로 P2 까지 완료된 상태.** 실전 응시·학습 학습·강사 첨삭·동료 채점·AI 보조·우수답안·포인트의 전 영역이 작동하며, 학습용·실전용 두 모델이 의도적으로 분리·연결되어 있음.

### 운영 가능 여부
**즉시 운영 가능.** 시뮬레이션 + 회차 1~2회 운영을 통해 다음을 확인 후 본격 운영 권장:
1. 강사 채점 시간 (한 학생 채점에 얼마나 걸리는지)
2. AI 초안 신뢰도 (실제 강사 점수와의 차이)
3. 동료 채점 참여율 (배정받고 실제 채점하는 비율)
4. 분쟁 큐 발생률 (threshold 0.15 가 적정한지)
5. OCR 정확도 (변리사 손글씨 한자 혼용 대응)

### 차기 우선순위 권고
1. **회차 1~2회 운영 데이터** 확보 후 분석
2. **AI 채점 자동 반영 모드** 검토 (강사 부담 ↓)
3. **포인트 사용처** 학원 정책 결정 (콘텐츠 잠금해제 / 할인 등)
4. **카카오 알림톡 라이브** 완료 (잔여 외부 의존)
5. **OCR 합본·문맥 보존** 으로 AI 채점 품질 ↑

운영 피드백 없이 추가 기능 개발은 비효율 — 일단 회차를 돌려보는 게 다음 의사결정의 가장 좋은 input.

---

## 11. 부록 — SPEC.md 참조 매트릭스

전체 ✅ — 누락 항목 없음.

| 영역 | feat ID | 상태 |
|---|---|---|
| 신규 주관식 피드 | feat-3-401, feat-3-402 | ✅ |
| 학습과목 주관식 Runner | feat-4-A-305, feat-4-A-321 | ✅ |
| 학습과목 답안 업로드 인프라 (GS 모델 재사용) | feat-4-A-330 ~ 339 | ✅ |
| GS 회차·시리즈 인프라 | feat-5-001 ~ 004 | ✅ |
| GS 학생 응시 | feat-5-101 ~ 110 | ✅ |
| GS 채점 트리오 + 분쟁 | feat-5-201 ~ 207 | ✅ |
| GS 통계·우수답안·포인트 | feat-5-301 ~ 305 | ✅ |
| GS 운영자 화면 | feat-5-401 ~ 408 | ✅ |
| GS → 문제은행 승격 | feat-10-001 | ✅ |

---

*문서 작성: Claude. 마지막 점검: 2026-06-01.*
