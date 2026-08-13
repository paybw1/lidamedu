# Phase 3 Stage 0 — 사전 재확인 결과

> 실측일: 2026-08-13 · **읽기 전용** (코드·DB 변경 0건 — 스크립트 `tmp/phase3/stage0-recheck.mjs`, 전부 SELECT)
> 근거: 운영 DB(mcgdoplo) 직조회 + 코드 정독(Phase 0-B·Phase 1에서 확인한 시그니처 재검)

## 판정 요약

| # | 확인 | 실측 | 판정 |
|---|---|---|---|
| 0-1 | 네임스페이스 충돌 | 신설 후보 6개 직접 충돌 **0건**. 단 `plan_*` 접두어는 LMS 커머스가 선점 | ⚠️ **`plan_checkpoints` 개명 권고** (아래) |
| 0-2 | assignments 스키마·기간 조회 | `due_at timestamptz NOT NULL`·`cohort_id`·`deleted_at`·`target_profile_id`·`deadline_policy` | ✅ F3 표시 통합 가능 |
| 0-3 | lesson_node_links·카탈로그 규모 | **links 4행** / lessons 17 / courses 6(published 4) | ⚠️ resolver 실효성 현재 낮음 — 설계 유지하되 초기엔 대부분 unresolved |
| 0-4 | getWeakNodes 시그니처 | `(client, userId, lawCodes: LawSubjectSlug[], limit=5) → WeakNodeItem[]` | ✅ 추천·회피 신호에 그대로 사용 가능 |
| 0-5 | 노드 수 | patent 109 / trademark 175 / design 150 / civil 141 (비 case_only) | ✅ Phase 0 실측(109~175)과 동일 — 변동 없음 |
| 0-6 | 자연과학 진단 테스트 조회 경로 | 살아있는 science 시험지 **0건**(전부 실험·삭제). 경로 자체는 확립됨 | ✅ 단, 파생 입력 축 결정 필요(아래) |
| 0-7 | profiles 코호트·회차 | 코호트 소속은 profiles 에 없음 — **`cohort_members`(cohort_id, profile_id, joined_at)** 경유. 회차 = `profiles.next_exam_year`/`next_exam_round` | ✅ FK 설계 확정 가능 |

## 0-1. 네임스페이스 상세

`study% / student% / plan%` 기존 테이블 전수: `plan_book_links`·`plan_books`·`plan_courses`·`plan_policies`(이상 **LMS 강의상품 도메인** — plan = subscription/강의 플랜), `student_notes`, `study_books`, `study_goals`, `study_sessions`.

- 신설 후보 6개(`student_diagnostics`·`student_subject_status`·`study_plans`·`study_plan_items`·`study_logs`·`plan_checkpoints`)와 **직접 충돌 없음**.
- ★단 **`plan_checkpoints`는 LMS `plan_*` 군(플랜=강의상품) 한복판에 앉게 되어 도메인 혼동**을 만든다(그쪽 plan_id = 상품, 이쪽 plan_id = 학습계획). **`study_plan_checkpoints`로 개명 권고** — 부모(`study_plans`)와 접두어도 일치. Stage 1 설계에 반영하되 지시서 자구와 다르므로 게이트에서 확인.
- `study_logs` vs `study_sessions`(방문 이벤트, duration 죽은 컬럼) — 의미 구분 명확(로그=시간 원장). 충돌 아님, 문서에 구분 명시 예정.

## 0-2. assignments — F3 표시 통합 경로

- 기간 조회 축: `due_at`(NOT NULL). 계획 기간 내 과제 = `cohort_id = ? AND deleted_at IS NULL AND (target_profile_id IS NULL OR = 학생) AND due_at BETWEEN period` — 학생 목록 쿼리(`listStudentAssignments`, assignments/queries.server.ts:821-842)와 동일 필터 조합 재사용 가능.
- 이행률은 `assignment_submissions`(recomputeSubmission 자동 재계산)에서 직접 읽음 — 복제 불필요 확인.

## 0-3. lesson resolver 실효성

`lesson_node_links` **4행**(특허 노드 2종에 시범 매핑), 강의 카탈로그 17차시·6강좌. → resolver는 설계대로 두되 **초기 운영에서는 강의 참조 항목 대부분이 "노드 미연결"로 표시**된다. 지시서의 "매핑해야 할 강의 목록이 쌓인다" 경로가 실제 초기 상태의 주 동선이 됨을 전제로 화면 문구를 준비한다.

## 0-6. G3 자동 파생 — 입력 축 결정 필요 사항

- 살아있는 science 시험지 0건(33건 전부 실험 후 삭제, Phase 1 B3) → **G3는 배포 후 새로 만드는 진단 테스트부터 작동**. 초기 학생은 수기(tier_source='manual') 경로가 주가 된다.
- 파생 입력 값: `offline_test_results.score`(배점 합)가 아니라 **`offline_test_answers`의 정답 수(count where is_correct)** 를 권고 — "10문 중 정답 수" 정의와 정확히 일치하고 배점 변경에 면역(Phase 1 T1 산출물을 그대로 활용). Stage 1 설계에 명시.
- 진단 테스트 식별: 전용 플래그 없이 "science_subject NOT NULL + 운영자가 진단으로 지정한 시험"을 어떻게 특정할지 — Stage 1에서 `student_subject_status.diagnostic_test_id`를 **운영자가 결과 반영 시 명시 선택**하는 흐름(자동 추측 없음)으로 설계 예정.

## 0-7. FK 확정

`student_diagnostics.cohort_id → cohorts` 유효(소속 검증은 `cohort_members` 조인, staff 게이트는 기존 반 소유권 패턴 재사용). 진단은 학생당 1행(PK user_id)이므로 반 이동 시 cohort_id 갱신 — 이력이 필요하면 후속(비범위).

## 게이트

Stage 1(스키마 설계·dry-run) 진행 가능. **사람 승인 대기.** 승인 시 Stage 1에서 확인받을 사항 미리보기: ① `plan_checkpoints` → `study_plan_checkpoints` 개명 ② G3 파생 입력 = answers 정답 수 ③ 진단 테스트 지정 = 운영자 명시 선택.
