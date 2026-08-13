# Phase 3 완료 보고 — 진단 · 월간 계획 · 승인 · 기록 (feat-7-047)

> 완료일: 2026-08-13 · Stage 2 커밋 `fd8ad507` · Stage 3 커밋(본 보고서와 동일 푸시)
> 선행: `phase3-stage0-recheck.md` → `phase3-stage1-design.md`(승인+반영 4건) → `phase3-stage2-report.md`(승인+추가 2건)

## 1. 검증 결과 — 통합 21/21 통과 (Stage 2: 12 · Stage 3: 9)

실행: vitest 통합(운영 DB), 강사 경로는 실제 로그인한 instructor RLS 클라이언트. 테스트 데이터(학생·강사·반·과제·진단시험) 전량 삭제 실측(잔여 0). 하네스 `tmp/phase3-verify/`.

### 지시서 §6 전체 매트릭스

| # | 검증 | 결과 | 방법·비고 |
|---|---|---|---|
| P1 | 진단→계획→제출→승인→일일 기록→체크포인트 E2E | ✅ | 테스트 학생 1명 전 경로 + **회수→재제출** 포함(Stage 3 추가 §2). 기록은 RLS 수준(화면과 동일 문장) |
| P2 | 승인 후 항목 불변 | ✅ | 항목 UPDATE/DELETE·상태 되돌리기 전부 0행 |
| P3 | (재정의) 버전 체인 | ✅ | 원문 "준수율 v1 기준"은 승인 2.2 로 철회 — 대신 v1 approved+v2 draft 공존·원자 supersede·root 체인·항목 복사 검증 |
| P4 | 미제출 월 준수율 null | ✅ | `noPlan=true`·metrics null·자동 생성 0건 |
| P5 | 과욕 지수 | ✅ | 350/300 → warn(작성 화면 실시간 + 승인 화면 서버 동일 함수) |
| P6 | 약점 회피 신호 | ✅ | 오답 5건 노드 감지 → 계획 미포함 → avoided ≥1 |
| P7 | node NULL 분석 격리 | ✅ | 미분류 로그가 총 시간엔 포함(120 중 30)·미분류 비율 산출·노드 축과 분리(파셜 인덱스 `where node_id is not null`) |
| P8 | lesson resolver | ✅ | 매핑 강의→node_id 해석 / 미매핑→null(화면 "노드 미연결") |
| P9 | 과제 미복제 | ✅ | 표시되되 study_plan_items 행 불변 |
| P10 | 과학 tier 파생 | ✅ | 순수(7/10·5/10·2/10·0·14/20) + E2E(저장→high, 재저장→mid, 철회→값 유지+retracted) |
| P11 | append-only | ✅ | 학생·staff UPDATE/DELETE 0행, 타인 로그 취소 차단, 이중 취소 23505, 취소 후 부호 상쇄 지표 확인 |
| P12 | 요일범위 파생 | ✅ | weekend 항목이 평일 목록에 안 뜸(+기간 밖 0건) |
| P13 | RLS 교차 차단 | ✅ | 타 학생 계획·진단·항목·남 명의 insert 전부 차단 |

### Stage 3 추가 검증

- **제출 회수(§2)**: submitted+reviewed_at NULL → draft 성공·회수 후 편집 가능 / 승인 뒤 조건부 UPDATE 0행("이미 검토됨" 경로). RLS는 화이트리스트 유지(`scripts/sql/20260814_phase3_stage3_withdraw.sql`).
- **체크포인트 소급(승인 2.1)**: 4주차 시점("오늘"=기간 말 시뮬레이션)에 처음 생성해도 2주차 스냅샷이 그 날짜까지의 로그만 집계(이후 500분 미포함) + 기존 행 불변(ignoreDuplicates — 재실행·추가 로그에도 값 고정).
- **빈 상태 폴백(승인 §1-1 권장안 — 조건 성립 확인 후 구현)**: 이력 0 학생은 제안 0 → 상담에서 lecture_stage 입력 즉시 수준 기반 상위 노드 제안. 검수 항목 1-2(진단 미입력)는 조용히 사라지지 않음 — 학생·상담 화면 모두 안내 배너.

## 2. 실제 변경 파일 (Stage 3 분)

- `scripts/sql/20260814_phase3_stage3_withdraw.sql` — 회수 전이 RLS(적용 완료)
- `app/features/study-plans/lib/expected-items.ts` — 기대 항목·달성률·미분류 순수 계산(서버·클라 공용)
- `app/features/study-plans/queries.server.ts` — 로그 조회·`ensureCheckpoints`(소급·멱등)·`getPeriodCompliance`(현재 승인본·no_plan)·`listLevelBasedNodeSuggestions`
- `app/features/study-plans/api/study-plan.tsx` — `withdraw_plan`·`add_log`(계획 항목 노드 상속/resolver/미분류)·`reverse_log`(역방향)
- `app/features/study-plans/screens/study-plan-log.tsx` — **일일 기록 화면 신규**(/study/plan/log): 기대 항목 카드([완료 N분] 1탭 / 부분 = 프리셋+저장 2탭), 노드 선택기 없음, 계획 외 추가에서만 선택기(미분류 허용), 날짜 이동, 취소
- `app/features/study-plans/screens/study-plan.tsx` — 회수 버튼·달성 현황 섹션(항목별 바+미분류)·오늘 기록 링크·수준 기반 폴백 배선
- `app/features/admin/screens/admin-student-plan-review.tsx` — 진행 지표(+**과제 이행률 병기** — 합산 금지)·격주 체크포인트 패널(지연 생성)
- `app/routes.ts`·`app/core/lib/nav-groups.ts` — /study/plan/log 라우트·"오늘 기록" nav
- `SPEC.md`(feat-7-047 등록)·`docs/db-schema.md`(6테이블+is_diagnostic 절 신설)

품질 게이트: typecheck ✅ · react-router build ✅.

## 3. 설계 대비 이탈 사항

1. **P3 재정의** — 승인 2.2(준수율=현재 승인본)의 귀결. 위 표 참조.
2. **P1 기록 단계의 검증 레벨** — 화면 액션 API 를 HTTP 로 구동하지 않고 동일 SQL 문장을 학생 RLS 클라이언트로 실행(append-only·소유권 검증의 권위가 RLS 이므로 실질 동일). API 분기(zod·노드 상속·역방향 복사)는 typecheck+코드 검토, 브라우저 완주는 사람 검수 대기.
3. 하네스의 체크포인트 검증은 `ensureCheckpoints`의 `todayISO` 파라미터로 "미래의 오늘"을 시뮬레이션 — 소급 계산 검증에는 이것이 정확히 필요한 방식(현재 시점 계산이었다면 이 테스트가 실패한다).
4. 그 외 승인 설계 이탈 없음. 비범위(타이머·게임화·합산 총시간·4분면·슬롯 테이블·센티넬) 미접촉.

## 4. 운영 게이트(§7) 준비 상태

4주 운영 측정 대상 지표의 데이터 원천이 모두 준비됨 — 제출률(study_plans.status)·기록률(study_logs 일자별 존재)·미분류 비율(getPeriodCompliance)·승인 처리 시간(submitted_at→reviewed_at). 측정 스크립트는 게이트 시점에 SELECT 로 뽑을 수 있다(저장 지표 아님).

운영 참고: ① 새 진단 테스트를 만들 때 빌더의 "진단 테스트" 체크를 켜야 tier 가 자동 반영된다 ② 강의↔노드 매핑(현재 4행) 채우기는 운영 작업으로 병행 권고 유지 ③ 학생 nav 에 "월간 계획"·"오늘 기록"이 종합반(cohort_curriculum)에만 노출된다.

*Phase 3 종료. 4주 운영 게이트(§7)로 넘어가며, Phase 4(타이머)로 자동 진행하지 않는다.*
