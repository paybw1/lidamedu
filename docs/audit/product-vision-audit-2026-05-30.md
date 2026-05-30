# 제품 비전 부합도 감사 — 리담변리사학원 (2026-05-30)

> 본 보고서는 **감사(audit)** 결과물이다. 코드/스키마/마이그레이션 **변경 없음**. 모든 판정은 레포 read-only 조사에 근거하며, 근거가 부족한 항목은 "미확인"으로 표시했다.

---

## 핵심 요약 (가장 큰 갭 3가지)

1. **합격자 비교의 표본이 거의 전부 합성(seed) 데이터** — `app/features/exam-results/seed.server.ts` 의 `[SEED] 가상 합격자` 합성 흐름은 풀구현되었지만, 실제 합격자 수집은 `feat-8-001~005` 인프라(자가 입력 + 운영자 인증)만 깔려 있고 실데이터 누적 증거는 없다. `getPasserBenchmarks` · `at-risk.server.ts` · `recommendations.ts` 의 컨설팅은 모두 같은 합격자 풀에서 평균을 뽑으므로 **합성 데이터 의존**이다. (`profiles.is_synthetic` flag 가 분석 함수에서 옵션 필터로 사용되지 않는 코드도 다수 — `listPasserCases({onlyConsented:true})` 가 그대로 평균에 포함.)
2. **"실시간 최적화"는 동적 큐 + 일 1회 픽 고정 모델로, 진정한 실시간이 아님** — `daily-menu.server.ts` 의 `getOrComposeDailyMenu` 는 user × KST 자정 기준 1회 스냅샷을 `user_daily_recommendations` 에 박고 **그 날 다시 합성하지 않는다**. SRS 채점 결과는 다음 `next_due_at` 시점부터 큐에 들어오지만, **추천 카드 자체는 다음 KST 자정까지 변하지 않는다**. 풀이 직후 즉시 다음 카드가 갱신되지는 않는다.
3. **"종합반 = 합격 경로 가이드" 와 합격자 패턴 사이의 연결고리가 약함** — 커리큘럼(`curricula`) 은 "학원이 짠 N주 트랙"이 데이터 모델이고, 합격자 데이터에서 합격 경로를 **역산해서 만든 흔적은 없다**. `recommendations.ts` 가 합격자 평균과의 격차로 액션을 제시하긴 하지만, 커리큘럼 자체가 "합격자 학습 패턴" 으로부터 생성되거나 보정되지 않는다.

---

## 0. 사전 파악

### 0.1 레포 구조 한눈에

```
app/
├── core/                       공용 클라이언트·헬퍼·UI
├── features/
│   ├── auth/                   카카오 OAuth 단일 (메모리: auth-kakao-only.md)
│   ├── laws/ articles/ cases/ problems/ relations/
│   ├── subjects/               법 5과목 + 자연과학 hub
│   ├── study/                  ★ daily-menu · srs · weak-areas · today
│   ├── srs/                    ★ SRS v2 — 풀 SM-2 능동 플래시카드 (최신 커밋)
│   ├── blanks/ recitation/     암기 도구 (조문 빈칸 + 조문 암기)
│   ├── goals/                  학습 목표 (시험일·주간 시간·목표 점수)
│   ├── dashboard/              학생 진입 후 첫 화면
│   ├── exam-results/           ★ Phase A~D 합격자 데이터 + 분석 + 컨설팅
│   ├── curricula/ assignments/ cohorts/  종합반 트랙·과제·반 운영
│   ├── ai-qna/                 RAG 기반 AI Q&A (feat-9, 🟡)
│   ├── mcq-packs/ mcq-exams/   1차 모의고사 팩·시험 (feat-10)
│   ├── gs/                     2차 온라인 GS (강사·peer·AI 채점)
│   ├── papers/ book-updates/   논문 · 도서 추록·정오표
│   ├── community/              자유·스터디·합격후기 게시판
│   ├── notifications/ announcements/
│   └── admin/ subscriptions/   운영자 + 결제·구독 (feat-8-018)
├── routes.ts · root.tsx
```

### 0.2 주요 라우트 / API
- 학생 핵심: `/dashboard`, `/study/today`, `/study/srs`, `/study/stats`, `/goals`, `/subjects/:law/...`, `/assignments/:id`, `/ai`
- 운영자: `/admin`, `/admin/cohorts/...`, `/admin/curricula`, `/admin/students/:id`, `/admin/analytics/passers`, `/admin/analytics/failure-patterns`, `/admin/exam-results`
- API: `/api/study/...`, `/api/admin/...`, `/api/payments/...`, `/api/ai-qna/ask`, `/api/cron/*`
- Cron (외부 호출): `/api/cron/curriculum-weekly`, `/weekly-reports`, `/inactive-alert`, `/pass-predict-snapshot`, `/embed-chunks`, `/exam-result-reminder`, `/promote-law-revisions`

### 0.3 DB 스키마 핵심 (`docs/db-schema.md` SSoT 기준)
- **콘텐츠**: `laws`, `law_revisions`, `articles`, `article_revisions`, `cases`, `problems` (+ choices/keywords/grading/model_answers), `papers`, `book_updates`, `science_sections`
- **과목 분류**: `problems.subject_type` enum (`law`/`science`) + `problems.law_id` + `problems.science_subject` + `science_section_id`
- **연관관계**: `article_article_links`, `article_case_links`, `case_case_links`, `problem_article_links`, `problem_case_links`
- **사용자 학습 데이터**: `user_problem_attempts`, `user_blank_attempts`, `user_recitation_attempts`, `study_sessions`, `daily_study_stats`, `user_bookmarks`, `user_memos`, `user_highlights`, `content_comments`
- **SRS**: `user_problem_srs`, `user_blank_srs`, `user_ox_ref_srs` (v1 — 객체별 simplified SM-2), `srs_items`, `srs_review_states`, `srs_review_logs`, `srs_user_settings` (**v2 — 풀 SM-2 능동 플래시카드, 신규 커밋**)
- **추천/예측**: `user_daily_recommendations`(스냅샷), `pass_prediction_snapshots`(일별)
- **합격자**: `exam_results`(자가 + 인증), `profiles.analytics_consent_at`, `profiles.next_exam_year`/`next_exam_round`, `profiles.is_synthetic`
- **종합반**: `cohorts`, `cohort_members`, `cohort_curricula`, `curricula`, `curriculum_weeks`, `curriculum_items` (`kind` ∈ article/case/problem/blank_set/recitation/lecture), `assignments`, `assignment_items`, `assignment_submissions`
- **운영 설정**: `app_settings` (key-value, `ai_qna_quotas` 등)
- **AI Q&A**: `content_chunks`(임베딩), `ai_conversations`, `ai_messages`

### 0.4 합격자 비교 관련 코드 — 한곳 정리
- 데이터 수집: `app/features/exam-results/queries.server.ts`, `screens/my-exam-results.tsx`, `screens/admin-exam-results.tsx`
- 합격자 집계: `analytics.server.ts` (`listPasserCases`, `computeAggregates`, `computePasserAggregateStats`, `getPasserBenchmarks`, `getPasserLawAverages`, `fetchPasserActivity`/trend, `getPublicPlatformStats`, `getFailerBaseline`)
- 위험군: `at-risk.server.ts`, `app/features/admin/queries/at-risk-cross-cohort.server.ts`
- 추천 액션 생성: `recommendations.ts`
- 합성 데이터: `seed.server.ts`
- SRS 합격자 비교: `app/features/study/passer-srs-benchmark.server.ts`

### 0.5 추천/큐잉/분석 — 한곳 정리
- 데일리 추천: `app/features/study/daily-menu.server.ts`(7 슬롯 합성), `lib/daily-menu.ts`(타입·정렬), `screens/today.tsx`, `api/recommendation-prefs.tsx`, `recommendation-analytics.server.ts`(실행률 분석)
- SRS v1 (객체별, simplified SM-2): `srs.server.ts`, `lib/srs.ts`, `ox-srs.server.ts`, `app/features/blanks/srs.server.ts`, `article-review.server.ts`(조문 정독 — passive SRS)
- SRS v2 (능동 플래시카드 SM-2): `app/features/srs/` (queue/review/stats/export)
- 약점 탐지: `study/queries.server.ts`의 `getWeakAreas`, `subjects/lib/weak-nodes.server.ts`의 `getWeakNodes`
- 합격 예측: `study/lib/pass-predict.ts` + `cron/api/pass-predict-snapshot.tsx`

---

## 1. 부합도 매트릭스 (핵심 산출물)

| 비전 요소 | 상태 | 근거 | 갭/메모 |
|---|---|---|---|
| **[프로그램 1] 자기주도 학습** | | | |
| 학습 대상 분류(법령 5과목 + 자연과학 4과목) 데이터 모델 | 구현됨 | `app/features/subjects/lib/subjects.ts:37` `LAW_SUBJECTS` · `science.ts:25` `SCIENCE_SUBJECTS` · `problems.subject_type`/`science_subject` enum (`docs/db-schema.md:340–375`) | 콘텐츠 양은 SPEC.md M3 "특허법 풀빌드, 나머지 4법 콘텐츠 양 부족" 로 명시 — 데이터 모델 ✅, 실제 시드량 미확인 |
| 실시간 최적화 엔진 (다음 학습 결정) | 부분구현 | `study/daily-menu.server.ts:69` `composeDailyMenu` 7 슬롯 + `getOrComposeDailyMenu:28` 스냅샷 캐시 + `study/srs.server.ts` due 큐 + `srs/srs.server.ts` v2 풀 SM-2 큐 | "실시간" 갱신은 아님 — KST 자정 기준 1회 픽 고정(`user_daily_recommendations`). 풀이 직후 큐는 갱신되지만 추천 카드 자체는 다음 날까지 그대로 |
| 개인화 (학생별 콘텐츠/순서 다름) | 구현됨 | `getWeakAreas`(study/queries.server.ts:1451) · `pickWeakProblem/Article/UnreadCase/BlankDue/GapProblems/CohortTrack/ArticleReview` 7 슬롯 모두 user_id 종속 + `recommendation_prefs` 슬롯 ON/OFF | 약점 정렬은 "최근 오답 × 글로벌 정답률 낮음 우선" 단순 정책. 난이도 동적 계산은 `feat-4-A-312`만 존재(전체 정답률 RPC) |
| 실시간 피드백 루프 (풀이 → 다음 추천) | 부분구현 | `study/queries.server.ts:121` `recordProblemAttempt` → 즉시 `applyProblemSrsUpdate`/`applyOxRefSrsUpdate` hook (line 153–169, best-effort) | SRS state 는 즉시 반영 ✅. **데일리 메뉴 추천 자체는 다음 자정에만 갱신** — `getOrComposeDailyMenu` 가 cached 있으면 그대로 반환(line 40). 즉, 풀이 직후 "오늘의 학습" 카드가 다른 카드로 바뀌지 않음 |
| 자기주도 affordance (목표/과목/진도 선택·확인·자기점검) | 구현됨 | `goals/screens/goals.tsx` (시험일·주간 시간·목표 점수·메모 upsert) · `onboarding/screens/welcome.tsx` 3-step wizard · `subjects/` 과목 자유 진입 · `study/screens/today.tsx` 추천 슬롯 ON/OFF · `feat-4-A-303` 퀴즈 설정 폼 · `feat-4-A-305` 주관식 자기채점 | 자기 평가(self-grade)는 주관식만. 객관식·OX·빈칸은 자동채점. |
| 진도·성취 가시화 | 구현됨 | `dashboard/screens/dashboard.tsx` (DashKpiStrip · 5법/자연과학 카드 · weak/forecast/streak) · `study/screens/stats.tsx`(통계 4탭) · `goals` 권장진도 · `feat-2-013` 활동 히트맵 · `feat-7-027` 합격 진단 점수 시계열 | 풍부함 — 비전 충족 |
| **[프로그램 2] 종합반 — 합격 기반 가이드** | | | |
| 합격자 데이터 수집 (학습 패턴 캡처) | 부분구현 | 인프라: `exam_results`(feat-8-001) + `profiles.analytics_consent_at` + 인증 워크플로우(`screens/admin-exam-results.tsx`) + 합격증 Storage + cron 리마인더(`/api/cron/exam-result-reminder`) | **합성 시드로 풀구동 가능, 실데이터 자체 수집 흔적 없음**(`seed.server.ts`). `is_synthetic` flag 는 있지만 `listPasserCases` 가 실/합성을 구분하지 않음 — 분석 함수가 합성 데이터를 그대로 평균에 사용 |
| 합격 기준 정의 (점수·커버리지·정답률) | 부분구현 | `mcq_packs.pass_score`(팩 단위) · `mcq_exams.pass_average`(전과목 평균) · `mcq_exam_papers.fail_floor`(과락) — 모의고사 합격선만 존재. `pass-predict.ts:30` `RATING_THRESHOLDS` 4단계(80/60/40) | **실시험 합격선이 코드에 정의된 곳 없음**(예: 1차 평균 60+, 과락 40 미만 같은 룰). pass_predict 의 80/60/40 도 임의 임계값(주석 "v1: 단순 가중평균 모델. 실제 데이터 누적되면 후속 정밀화") |
| 현재 학생 ↔ 합격 기준/합격자 비교 | 구현됨 (단, 데이터 한계) | `getPasserBenchmarks`(analytics.server.ts:650) 5종 지표 비교 + `metricFromValues` 분위 산출 + `PasserBenchmarkCard`(dashboard) · `passer-srs-benchmark.server.ts` SRS due 비교 | 합격자 표본이 **합성 시드** 일 때 비교 자체는 동작 — 하지만 의미는 "합성 분포" 와의 비교. 표본 <3 fallback 분기는 안전장치로 존재 |
| 갭 가이드 (행동 유도) | 구현됨 | `recommendations.ts:71` `generateRecommendedActions` 7종 룰(과제 마감/시간격차/정답률격차/풀이량격차/약점단원/슬럼프/취약 진단) — priority + CTA URL + metric chip | 액션 카드 자체는 풍부 — 비전 부합. 단, 비교 baseline 이 합성이라 행동 유도의 신빙성은 데이터에 종속 |
| 커리큘럼·페이싱 (합격자 패턴 기반) | 부분구현 | `curricula`/`curriculum_weeks`/`curriculum_items` (`docs/features/feat-7-020-curriculum-assignments.md`) — 학원이 짠 N주 트랙. cohort 적용 후 `getCurrentWeekTrack`(curricula/queries.server.ts:493) 으로 주차별 항목 + 자동 assignment 변환 + cron(`/api/cron/curriculum-weekly`) | **합격자 학습 패턴으로부터 자동 생성/보정되지 않음**. "학원 강사가 입력" 한 정적 트랙. `feat-8-019` 권장진도 합격자 실측 보정만 `/goals` 화면에 chip 으로 노출 |
| 모드 관계 (자기주도 ↔ 종합반) | 부분구현 | cohort 가입 여부로 `cohort_track` daily-menu 슬롯(`daily-menu.server.ts:402` `pickCohortTrack`) 자동 추가 + 대시보드 `WeekTrackCard` 카드 | "모드 토글" 같은 명시적 분기 없음. 종합반 가입 = 자동으로 cohort_track 슬롯이 일과 합성. 비종합반 = 약점/SRS 만으로 합성. **두 모드 사이의 사용자 인지 가시화는 없음** |

---

## 2. 프로그램 1 점검 체크리스트

### 2.1 과목 커버리지
- **상태**: 구현됨 (데이터 모델), 콘텐츠 양은 미확인
- **근거**:
  - `app/features/subjects/lib/subjects.ts:3` `LAW_SUBJECT_SLUGS = ["patent","trademark","design","civil","civil-procedure"]`
  - `app/features/subjects/lib/science.ts:3` 4과목 `physics/chemistry/biology/earth_science`
  - `problems.subject_type` enum(`law`/`science`), `problems.law_id`, `problems.science_subject`, `science_section_id`(`docs/db-schema.md:340–375`)
  - SPEC.md M3 "5.4.A 전체 5과목 시드 데이터 🟡 — **다음 작업 포커스**. 특허법은 풀빌드, 상표/디자인/민법/민사소송법 콘텐츠 양 부족" (line 612)
- **갭**: 자연과학 시드는 "샘플 문제 8개(과목별 2)" 수준(`feat-4-B-007`, SPEC.md line 370). 운영 임계량까지 콘텐츠 시드가 부족 — 비전상 "변리사 시험 전 영역 커버" 는 모델만 준비됨.

### 2.2 실시간 최적화 엔진
- **상태**: 부분구현
- **근거**:
  - `app/features/study/daily-menu.server.ts:69` `composeDailyMenu` 7 슬롯 병렬 평가(weak_problem/weak_article/unread_case/blank_due/gap_problems/cohort_track/article_review). 각 슬롯 priority(high/medium/low) + 정렬
  - SRS due 큐: `study/srs.server.ts` `getDueProblems`(line 80) · `blanks/srs.server.ts` · `study/ox-srs.server.ts` · `study/article-review.server.ts`(passive 조문 정독 SRS)
  - SRS v2 (능동 플래시카드): `app/features/srs/srs.server.ts:110` `getReviewQueue` — newPerDay/maxReviewsPerDay 상한, due 오래된 순 + new 끝에. `lib/scheduler.ts` 풀 SM-2
- **갭**:
  - `getOrComposeDailyMenu:28` 가 1일 1회 스냅샷 모델. 풀이 후 카드 즉시 갱신 ❌
  - 난이도 동적 조정은 글로벌 정답률 기반 5단계 버킷(`feat-4-A-312`) 만 — 학생별 ability/IRT 모델 없음
  - 추천 정렬은 단순 priority 분류 + 글로벌 정답률 ASC. 협업필터링·임베딩 기반 유사 추천 등 없음
  - `gap_problems` 슬롯은 candidates 셔플 + slice(daily-menu.server.ts:377) — 완전 랜덤. 학생 약점·취향 반영 없음

### 2.3 개인화
- **상태**: 구현됨
- **근거**:
  - 모든 슬롯이 `userId` 종속(`pickWeakProblem` 등). 추천 결과 = user × KST date 별 1행 (`user_daily_recommendations` PK)
  - 추천 슬롯 ON/OFF 사용자 설정(`profiles.recommendation_prefs jsonb` + `study/api/recommendation-prefs.tsx`)
  - 학생별 SRS 상태(`user_problem_srs` PK `(user_id, problem_id)`)
  - 합격 진단(`predictPassScore`) 도 5요소 모두 본인 데이터
- **갭**: "콘텐츠 자체" 가 학생별로 다른 게 아니라, "어떤 콘텐츠를 다음에 보여줄지" 만 학생별. v1 비전 충족 — 의미상 부합.

### 2.4 실시간 피드백 루프
- **상태**: 부분구현
- **근거 (반영 경로 추적)**:
  1. 문제 풀이: `app/features/problems/api/attempt.tsx` → `recordProblemAttempt`(`study/queries.server.ts:121`)
  2. `recordProblemAttempt` 내부에서 즉시 `applyProblemSrsUpdate`(line 153) 또는 `applyOxRefSrsUpdate`(line 169) hook
  3. SRS state upsert → `user_problem_srs.next_due_at` 갱신
  4. 다음 SRS 큐 조회 시 (`getDueProblems`) `next_due_at <= now` 필터에 즉시 반영 ✅
- **runAfterResponse 사용**: `study/screens/today.tsx:60` `markDailyMenuViewed` 같은 analytics 마킹은 `runAfterResponse` 사용. 학습 큐 갱신은 동기(await).
- **갭**: 데일리 메뉴 카드 자체는 풀이 후 즉시 변경되지 않음(2.2 와 동일 — `getOrComposeDailyMenu` cached 반환). 학생이 한 슬롯 완수해도 새 카드가 즉시 합성되지 않음. "오늘 카드" UX 의도일 수도 있으나, "실시간" 라벨과는 거리가 있음.

### 2.5 자기주도 affordance
- **상태**: 구현됨
- **근거**:
  - **목표 설정**: `goals/screens/goals.tsx:78` Zod 스키마 — examDate, weeklyGoalHours, examType, targetScore, notes
  - **온보딩 3-step**: `onboarding/screens/welcome.tsx` (next_exam 계획 → 분석 동의 → 학습 목표)
  - **과목 자유 진입**: `routes.ts` 의 `/subjects/:law/{articles,cases,problems}` + 자연과학 4과목 hub
  - **자기점검**: `feat-4-A-305` 주관식 자기채점 + `feat-4-A-322` 모범답안 reveal + `/study/wrong-note` 오답노트
  - **퀴즈 설정 폼**: `feat-4-A-303` (유형/연도/극성/문항수/모드)
  - **추천 슬롯 ON/OFF**: `feat-2-021` (`profiles.recommendation_prefs`)
- **갭**: 자기 평가(self-grade) 는 주관식만. 1차 객관식·OX·빈칸은 자동채점이라 학생이 채점 기준을 의식하지 않음 — "내가 왜 틀렸나" 메타인지 도구는 강사 해설/Q&A 의존.

### 2.6 진도·성취 가시화
- **상태**: 구현됨 (풍부)
- **근거**:
  - `dashboard/screens/dashboard.tsx` — KPI 스트립 + 진도카드 + 합격진단점수 + 합격자 비교 카드 + 추천 액션 + 약점 단원 + GS 추이
  - `study/screens/stats.tsx` — 4탭(한눈에/1차/2차/빈칸·암기) + 활동 히트맵(`feat-2-013`)
  - 합격 진단 점수 시계열(`feat-7-027`), 12주 추이 미니 차트(`feat-7-024`)
  - `goals` 권장 진도 vs 현재 (D-day 일평균)
- **갭**: 없음 — 오히려 정보 과잉 가능성. UX 검증 권장.

---

## 3. 프로그램 2 점검 체크리스트

### 3.1 합격자 데이터 수집
- **상태**: 부분구현 (인프라 ✅ · 실데이터 ❌)
- **근거 (출처 끝까지 추적)**:
  - 자가 입력 화면: `app/features/exam-results/screens/my-exam-results.tsx`(연도×차수 카드 + 합격증 업로드)
  - 운영자 인증: `screens/admin-exam-results.tsx` (`verified/rejected` 처리)
  - 합격증 Storage: `exam-certificates` private 버킷 (PDF/PNG/JPEG/WebP, 10MB)
  - 알림 cron: `/api/cron/exam-result-reminder` (14일 throttle)
  - 분석 활용 동의: `profiles.analytics_consent_at` (PIPA §22 별도 동의, `/legal/analytics-consent`)
  - 합격자 학습 로그 집계: `analytics.server.ts:163` `computeAggregates` — 시험 전년도~시험 연도 (`examStartOfPriorYearIso:59`/`examEndOfYearIso:56`) user_problem_attempts/study_sessions/user_blank_attempts/user_recitation_attempts 집계
  - **합성 데이터 도구**: `seed.server.ts:54` `generateProfileSpec` — `[SEED] 가상 합격자` 1~20명 일괄 생성. SPEC.md 본인이 명시 "시연·QA 시드 데이터 도구"(line 531, feat-8-009)
- **갭**:
  - **실 합격자 데이터가 누적된 흔적이 코드/시드/문서에 없음**. 인프라만 깔린 상태
  - 합성/실 데이터 구분: `profiles.is_synthetic` flag 가 있지만 `listPasserCases({onlyConsented:true})`(`analytics.server.ts:151`)는 is_synthetic 을 필터하지 않음 — **분석 함수가 합성 데이터를 그대로 평균에 포함**
  - `computeAggregates` 의 학습 활동 기간이 "시험 전년도 1월 1일 ~ 시험 연도 12월 31일" 로 광범위(line 169) — 합격자 응시 직전 3개월 / 직전 6개월 분리 등 시점 가중치 없음

### 3.2 합격 기준 정의
- **상태**: 부분구현
- **근거**:
  - 모의고사 합격선: `mcq_packs.pass_score` (`feat-10-004`, `app/features/mcq-packs/queries.server.ts:28`)
  - 다과목 통합: `mcq_exams.pass_average` (전과목 평균 합격선 %) + `mcq_exam_papers.fail_floor` (과락선 %) (`app/features/mcq-exams/queries.server.ts:37`, `feat-10-005`)
  - 진단 점수 임계값: `app/features/study/lib/pass-predict.ts:30` `RATING_THRESHOLDS = { safe: 80, ok: 60, caution: 40 }` (가중평균 5요소)
- **갭**:
  - **실제 변리사 시험 합격선**(예: "1차 전과목 평균 60+ AND 과락 40 미만" 같은 시험제도 룰)이 코드/DB에 정의된 곳 **없음**. 운영자가 mcq_exam 만들 때 수동 입력.
  - `pass-predict` 의 80/60/40 도 코드 주석 본인이 "임의 가중평균 모델" 명시(line 1: "v1: 단순 가중평균 모델. 실제 데이터 누적되면 후속 정밀화(회귀/시험 점수 보정)")
  - "과목별 합격 기준 커버리지" (예: 특허법 조문 N% 이상) 같은 합격선은 없음

### 3.3 현재 학생 ↔ 합격 기준/합격자 비교
- **상태**: 구현됨 (코드 ✅) / 실데이터 기반 ❌
- **근거**:
  - 5종 지표: `analytics.server.ts:650` `getPasserBenchmarks` — studyHours/problemAttempts/accuracyPct/activeDays/longestStreak. `metricFromValues:563` 평균·중간·분위 계산. 표본 매칭 = `next_exam_year/round` 우선, 부족 시 (year-1, same round) → 전체 동의 합격자 fallback
  - SRS 비교: `study/passer-srs-benchmark.server.ts:38` `getPasserSrsBenchmark` — 4종 SRS due 평균(problem/blank/ox/article). 표본 ≥3 게이트
  - 비교 UI: 대시보드 `PasserBenchmarkCard`, `/study/passer-trend`(`feat-8-012`), `/admin/analytics/passers`, `/admin/analytics/failure-patterns`(`feat-8-015`)
- **갭**:
  - **표본이 합성 데이터일 때 의미는 "운영자가 만든 시연용 분포" 와의 비교** — 실 합격자 수집 전엔 데모용
  - 비교 지표가 **양적**(시간·풀이수·정답률·streak) 일변. "어떤 단원을 N회 풀었나" "조문/판례/문제 비율" 같은 패턴 비교는 제한적 (`getPasserLawAverages` 가 과목별 평균 풀이/정답률만)

### 3.4 갭 가이드 (행동 유도)
- **상태**: 구현됨
- **근거**:
  - `app/features/exam-results/recommendations.ts:71` `generateRecommendedActions` — 7종 룰:
    1. 마감 임박 과제 (high, daysLeft ≤3 & pct <70)
    2. 학습 시간 격차 (high if ratio<0.5 & deltaH>50; medium if <0.8 & >30)
    3. 정답률 격차 (high if delta≥10; medium if ≥5) — fallback weak node URL
    4. 풀이 회수 격차 (medium)
    5. 약점 단원 chip(`PasserLawHint`)
    6. 슬럼프(streak 끊김), 활동 격차
    7. 진단 '취약'/'주의' 시 학습 습관 회복
  - `weakNodes` 기반 deep link 자동: `subjects/lib/weak-nodes.server.ts`
  - `failerBaseline` 추가 입력으로 "비합격자 패턴 위험 신호" high/medium 액션 (`feat-8-015`)
- **갭**: 비교 baseline 이 합성이라 "행동 유도" 의 권위는 데이터에 종속. 코드 자체는 비전 부합.

### 3.5 커리큘럼/페이싱
- **상태**: 부분구현 (학원 입력 모델)
- **근거**:
  - 모델: `curricula`(이름·기간·소유자·is_published) + `curriculum_weeks`(주차·제목·목표) + `curriculum_items`(`kind` ∈ article/case/problem/blank_set/recitation/lecture) + `cohort_curricula`(cohort 적용·시작일·is_active) (`docs/features/feat-7-020-...`)
  - 운영자 편집: `/admin/curricula`, `ContentPicker` UI 로 ref 선택
  - 학생 진입: `getCurrentWeekTrack`(curricula/queries.server.ts:493) — cohort 멤버십 → 활성 cohort_curricula → KST start_date 기반 weekNumber 계산
  - 자동 과제 변환: `assignments`/`assignment_items`/`assignment_submissions` + cron `/api/cron/curriculum-weekly` (활성 cohort 별 현재 주차 미발송 분 자동 변환)
  - 자동 완수 판정: `recomputeSubmission` — 문제 정답 1번 이상, 빈칸 전 idx 정답, 조문/판례 session 1회, 암기 is_complete=true
- **갭**:
  - **합격자 패턴에서 커리큘럼이 자동 생성되거나 보정되는 흐름 없음**. "이번 주에 합격자는 N시간 학습했다" 는 `feat-8-019` `PasserCalibrationCard` 가 `/goals` 화면에 chip 으로 노출만. 커리큘럼 item 권장 추가/순서 재정렬 같은 보정은 없음
  - "페이싱" 은 학원이 수동 입력한 일정에 의존. cohort 가 늦은 학생을 위한 catch-up 큐도 없음 (단, daily-menu 의 weak_problem/weak_article 슬롯이 보조)

### 3.6 모드 관계 (자기주도 ↔ 종합반)
- **상태**: 부분구현
- **근거**:
  - cohort 가입 여부로 자동 분기. 가입 = `cohort_members` 행 존재 → `getCurrentWeekTrack` 이 트랙 반환 → `daily-menu.server.ts:402` `pickCohortTrack` 슬롯 활성 → "이번 주 트랙 — XX" 카드 추가
  - 대시보드 `WeekTrackCard`(`feat-7-030`) 가 종합반 학생에게만 상단 카드로 노출
  - `feat-8-008` 3-tier 가격: 회원3 = 활성 cohort 멤버. `subscription_plans.features.area_*` 영역 게이팅
- **갭**:
  - **사용자에게 "지금 자기주도 모드입니다 / 종합반 모드입니다" 같은 모드 인지 가시화 없음**. 단순히 카드 한두 개 추가/제거됨
  - 종합반 가입 직후 "지금 X주차이고 이번 주는 OOO 학습 입니다" 같은 온보딩 없음 (확인은 못 했지만 cohort 가입 동선 UX 미확인)
  - 모드 사이 토글(예: "오늘은 자기주도 모드로만 보여줘") 없음

---

## 4. 공통·횡단 점검

### 4.1 데이터 모델 정합성
- **두 프로그램 모두 지원**: 학생 학습 로그(`user_problem_attempts`, `study_sessions`, `user_blank_attempts`, `user_recitation_attempts`, SRS state, `daily_study_stats`) 가 두 프로그램의 공통 입력으로 사용됨
- **한쪽만 지원**:
  - 합격자 비교(P2): `exam_results`, `analytics_consent_at`, `is_synthetic`, `pass_prediction_snapshots` — 모두 P2 전용
  - 자기주도(P1): `user_daily_recommendations`, `recommendation_prefs`, `srs_*` — 두 프로그램이 공유하긴 하나 본질은 P1 도구
- **갭**: 데이터 모델은 양쪽 지원에 충분. 단 `is_synthetic` 분기 처리가 분석 함수에 없음 — 합성/실 데이터 섞여서 평균 산출됨 (실 데이터가 들어오기 시작하면 정합성 이슈)

### 4.2 측정 가능성
- **풀구현**:
  - 모든 풀이/세션에 `attempted_at`/`started_at`/`time_spent_ms`/`elapsed_ms` 기록
  - SRS v1/v2 모두 `interval_days`/`ease`/`reps`/`lapses` 저장. v2 는 `srs_review_logs` 에 prev/new 모두 로깅 + CSV export(`srs/api/export.tsx`)
  - cohort 단위 통계(`getCohortAggregateStats`, `getCohortAccuracyTrend`)
  - 합격자 비교 표본 size · fallback 사유 기록(`PasserBenchmark.fallbackReason`)
  - 추천 실행률 분석(`recommendation-analytics.server.ts`) — slot별 / day별
  - source_type 추적: SRS v2 의 `srs_items.source_type` + `review_logs.source_type` (mcq_exam_attempt_stats RPC 등)
- **갭**:
  - "왜 추천했는가" 의 explainability 메타데이터는 슬롯별 metadata jsonb 에 일부(`metadata.problemId`, `srsDueCount` 등) — 추천 알고리즘 변경 시 ablation 분석 가능
  - `recommendation-analytics.server.ts` 완수 룰이 단순(예: weak_problem = attempt 1+ 면 완수) — "완수했지만 정답 못 맞춤" 같은 세분화 없음

### 4.3 권한·보안 (RLS)
- **본인 데이터 격리**: `docs/db-schema.md:79–83` 패턴 명시. 본인만 R/W RLS 가 user_problem_attempts/memos/highlights/srs 등 전반 적용. CLAUDE.md Non-negotiable §1 (service_role 클라이언트 번들 금지)
- **합격자 데이터 접근**:
  - `analytics.server.ts` 의 합격자 집계 함수 전부 `adminClient as SupabaseClient<Database>` 우회 사용 (RLS 우회 = service_role)
  - caller 가 staff 권한 검사 선행해야 함 (라우트 loader 책임)
  - `getPasserSrsBenchmark`, `at-risk.server.ts` 도 동일 패턴
- **운영자 기능 권한**: `private.is_staff` / `private.is_manager` RLS 함수 + `requireMinRole` 가드(`feat-7-031`)
- **갭**:
  - 학생용 `getPasserBenchmarks`/`getPasserLawAverages`/`getPasserTrendData` 가 admin client 사용 — 본인 비교를 위해 합격자 풀에 RLS 우회 접근. **익명화 보장이 코드 레벨에 명시되지 않음** (`PasserCase.userName` 노출 — admin 화면 전용이라고 가정, 학생 화면 호출은 anonymized 집계만 반환되도록 분리 미확인)
  - `study/passer-summaries` 학생 화면은 익명화 코멘트 있음 (line 530 SPEC) — ✅
  - `is_synthetic` 합성 데이터가 학생 비교에 섞여 노출되는 가능성 (3.1 갭과 동일)

### 4.4 개인정보
- **민감 정보**: `exam_results.self_reported_total_score`, `self_reported_subject_scores jsonb`, `study_summary_md`(자유 입력), 합격증 PDF/JPG(개인 식별 가능 문서 — 이름·수험번호 포함 가능)
- **동의/약관**: `feat-8-004` `/legal/analytics-consent` PIPA §22, §15 1.1 별도 동의. `profiles.analytics_consent_at` 시점 기록 + 철회(`/me/exam-results` 토글)
- **미성년 처리**: 변리사 시험 응시 자격(19세 이상) 고려 시 미성년 위험 낮으나, 가입 단계에서 생년 수집 여부 미확인 (회원가입 화면 미조사)
- **갭**:
  - 합격증 자체는 Storage private 버킷에 보관 — RLS 적용 가정. signed URL TTL 5분 (`feat-8-003`) ✅
  - 분석 활용 동의 철회 시 기존 학습 로그 집계는 제외하는지 미확인 (`listPasserCases({onlyConsented:true})` 는 시점 필터만)
  - "분석 동의 철회" 시 과거 합격자 비교에 본인 데이터 노출 차단 로직 미확인

### 4.5 확장성 리스크
- **현재 위험 지점**:
  - `pickWeakArticle`(`daily-menu.server.ts:162`) 의 `.limit(5000)` study_sessions 풀 fetch — 활성 학생 누적 시 N²
  - `pickUnreadCase` 도 동일 `.limit(5000)` fetch + 클라 측 Set 필터
  - `recommendation-analytics.server.ts` 의 14일 분석에서 `.limit(5000)` 3종 fetch — 활성도 높은 학생 잘림 가능
  - `getPasserBenchmarks` — `listPasserCases({onlyConsented:true})` 가 합격자 전체 fetch + 각각 `computeAggregates`(4 query 병렬) — **합격자 수 × 4 query 가 매 학생 dashboard load 마다 발생** (학생 캐시 없음). 합격자 200명 = 학생 1명 load 당 800 query. **심각**
  - `getPasserLawAverages` 동일 — 학생 dashboard 가 cached 없이 매번 합격자 집계
  - `at-risk.server.ts` `computePasserBaseline` — cohort detail 진입 마다 합격자 풀 재계산
- **권고**: 합격자 baseline/aggregates 는 `pass_prediction_snapshots` 같은 일별 materialized 테이블 신설 권장. `feat-7-027` 의 본인 snapshot 패턴을 합격자 baseline 에도 적용.

---

## 5. 빠진 것 · 리스크 · 우선순위

### 5.1 비전 대비 완전히 빠진(미구현) 핵심 기능

| # | 기능 | 비전 핵심도 |
|---|---|---|
| A | **실 합격자 데이터 수집 운영** — 인프라(feat-8-001~005)는 있지만 실데이터 누적이 시작되지 않음. 합격생 영업 / 졸업생 인증 캠페인 / 자가 입력 친화 UX 검증 필요 | ★★★ (Program 2 전제 — 없으면 컨설팅이 합성 시연) |
| B | **합격자 패턴 기반 커리큘럼 자동 생성·보정** — 현재 커리큘럼은 학원 강사 수동 입력. 합격자가 어떤 순서·비율로 학습했는지 역산해 권장 트랙을 만들거나, 기존 트랙을 합격자 데이터로 보정 | ★★★ (Program 2 — "합격 기반 가이드" 의 핵심) |
| C | **실시험 합격 기준 룰 SSoT** — 1차 평균 60+/과락 40, 2차 절대 점수 등 시험제도 룰이 코드/DB에 정의된 곳 없음. `pass-predict` 의 80/60/40 은 임의값 | ★★★ (Program 2 — "합격 기준 대비 어디" 의 권위) |
| D | **데일리 메뉴 갭 단위 재합성** — 현재 KST 자정 기준 1회 고정. 학생이 슬롯 완수 시 즉시 다음 카드를 합성해 보여주는 옵션 (현행 + reroll 토글) | ★★ (Program 1 — "실시간 최적화" 의 어감과 일치) |
| E | **합격자 합성/실 데이터 분리 처리** — `listPasserCases({onlyConsented:true})` 가 `is_synthetic` 을 필터하지 않음. 실데이터 누적 시점에 합성 평균이 분포를 오염 | ★★★ (E 가 안 되면 A 의 가치 0) |
| F | **학생 자기주도 ↔ 종합반 모드 명시화** — 사용자에게 모드 가시화 + 모드 토글 + 종합반 가입 직후 온보딩 (이번 주차 안내) | ★★ (Program 1·2 경계 UX) |
| G | **합격자 비교 baseline 캐시화** — 매 dashboard load 마다 합격자 풀 재집계 (성능 리스크). 일별 materialized snapshot 권장 | ★★ (운영 리스크) |
| H | **자기 평가(self-grade) 도구 확장** — 현재 주관식만. 객관식·OX·빈칸도 "왜 틀렸나" 메타인지 도구 (오답 사유 태깅 등) | ★ (P1 만점 위한 보강) |
| I | **explainability — 왜 이 카드가 추천됐는가** — 슬롯 metadata 일부만 노출. "약점이 X 단원에 집중되어 있어서" 같은 설명 chip | ★ (학생 신뢰도) |

### 5.2 구현됐지만 비전과 어긋난 부분

| # | 어긋남 | 근거 |
|---|---|---|
| α | **"합격자 비교 컨설팅" 이 합성 데이터로 운영 가능 상태** — 시연·영업에는 좋지만, 운영 시 학생이 "합성 분포와 비교" 받는 상황 | `seed.server.ts` `[SEED] 가상 합격자` + `is_synthetic` 미필터 분석 함수들 |
| β | **"실시간 최적화" 라벨 vs 일 1회 픽 고정 모델** — 추천 카드가 풀이 직후 갱신되지 않음. 비전 어감에 미달 | `daily-menu.server.ts:28` `getOrComposeDailyMenu` cached 분기 |
| γ | **합격자 SRS 비교가 "due 개수" 만 비교** — "합격자는 SRS due 가 평균 N개" 라는 비교는 학습 행위가 아니라 **학습 부채**의 비교. 본인이 due 많으면 빨간 표시 = 동기부여 역방향 가능성 | `passer-srs-benchmark.server.ts:200–225` — delta>0 = "본인이 더 많이 보유(rose)" |
| δ | **커리큘럼 item 의 lecture 가 외부 URL embed 만** — "학원이 짠 트랙" 인데 강의 콘텐츠는 외부 위임 (YouTube/Vimeo). v1 범위 외(SPEC line 29 — 라이브 강의 위임) — 명시적 결정이라 어긋남은 아니나, 종합반 가이드의 "콘텐츠 일관성" 측면 보강 필요 가능 | `curricula/labels.ts:58` `lectureUrl` · `feat-7-029` `TrackedLectureFrame` postMessage 진행률 |

### 5.3 우선순위 (임팩트 × 노력)

| 갭 | 임팩트 | 노력 | 우선순위 | 권고 다음 단계 (구현 금지 — 권고만) |
|---|:---:|:---:|:---:|---|
| **E** 합성/실 데이터 분리 | 매우 높음 | 낮음 | **P0** | `listPasserCases`/`listFailerCases`/`getPasserBenchmarks`/`getPasserSrsBenchmark` 등에 `excludeSynthetic` 옵션 추가 + 학생 화면 호출 시 default `true`. 운영자 시연 화면만 `false`. |
| **A** 실 합격자 수집 시작 | 매우 높음 | 매우 높음 | **P0** | 영업·커뮤니티 캠페인. 합격증 자가 인증 UX 한번 더 점검. `/me/exam-results` 진입 동선 강화. (코드 작업보단 운영) |
| **C** 합격 기준 룰 SSoT | 높음 | 낮음 | **P0** | `app/core/lib/constants.ts` 또는 신설 `app/features/exam-results/pass-criteria.ts` 에 시험제도 임계값 단일 소유. `pass-predict.ts` 도 이쪽 참조. mcq_exams 운영자 폼 default value 도 여기에서 |
| **G** baseline 캐시화 | 높음 | 중간 | **P1** | `passer_baseline_snapshots` 신설(연도×차수 PK, 일별 cron 갱신). 합격자 풀이 누적되어도 학생 dashboard load 마다 N² 가 안 나도록 |
| **B** 합격자 패턴 → 커리큘럼 보정 | 매우 높음 | 매우 높음 | **P1** | 합격자 학습 시퀀스 분석(주차별 학습 항목 분포) → 권장 커리큘럼 템플릿 생성기. 학원 강사가 임의 트랙 + 합격자 기반 추천 트랙 둘 다 선택. (대형 작업) |
| **D** 데일리 메뉴 재합성 | 중간 | 낮음 | **P2** | `getOrComposeDailyMenu` 에 `force=true` 분기 추가 + UI "추천 새로고침" 버튼 (rate-limit 권장). 또는 슬롯 완수 시 그 슬롯만 즉시 재합성 |
| **F** 모드 명시화 | 중간 | 낮음 | **P2** | 대시보드 헤더에 "자기주도 / 종합반(O기수)" 모드 chip + 종합반 가입 후 환영 토스트 |
| **H** 자기 평가 도구 확장 | 중간 | 중간 | **P2** | 오답 사유 enum(개념 미숙/실수/시간 부족/조문 모름) + 풀이 직후 1-tap 태깅 |
| **I** explainability | 낮음 | 낮음 | **P2** | 카드 body 에 "왜 추천?" chip ("최근 오답 5건 모두 특허법 29조에 집중") |
| **α/β/γ/δ** 어긋남들 | 가변 | 가변 | E/A/C/D 와 결합 처리 권장 — 별도 항목 아님 |

---

## 보고서 끝의 미확인·문의 사항

1. **콘텐츠 시드량**: 5개 법 과목 + 자연과학 4과목의 현재 시드된 조문/판례/문제 수치를 확인하지 못함. SPEC.md line 612 "특허법 풀빌드, 나머지 부족" 외 정량 미확인. (필요 시 `select count(*) from problems group by law_id` 같은 점검 권장)
2. **합성 vs 실 합격자 비율**: `profiles.is_synthetic=true` 행 수와 `exam_results` 실 인증 합격자 수 비교 점검 권장.
3. **회원가입 단계 정보**: 생년월일·연락처 등 개인정보 수집 항목 미조사 — 회원가입 화면(카카오 OAuth)을 직접 확인하지 못함.
4. **종합반 가입 동선**: cohort 가입(=구독 결제) 후 학생이 "이번 주차 + 트랙" 을 알게 되는 첫 화면이 어디인지 UX 흐름 미확인.
5. **합격자 비교의 학생 호출 vs 운영자 호출 격리**: `getPasserBenchmarks` 가 dashboard.tsx loader 에서 호출됨 — 학생 본인이 합격자 풀의 row level 데이터(이름·이메일)에 접근 가능한지 화면 출력 단에서 격리되는지 코드 한 줄씩 추적 못 함. **빠른 보안 점검 권장**.
6. **추천 알고리즘 "실시간" 의 정의**: 의도가 "학습 행위 즉시" 인지 "오늘 안에" 인지에 따라 D 항목 처리 방향이 다름. 비전 작성 시 의도 명확화 필요.
