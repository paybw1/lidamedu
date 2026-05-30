# 합격자 데이터 Phase-1 활성화 런북

> **언제 실행하나**: 내년 합격자 발표 후 (2027 상반기 1차 / 2027 후반 2차).
> 실(비합성) 동의 합격자가 임계값 N에 도달하면 코드 배포 없이 자동 게이트 ON.
> **본 런북은 자동 전환 직후 운영자가 수행할 검증 + 후속 작업**을 정리.

---

## 0. 자동 활성화 메커니즘 (배경)

`app/features/exam-results/passer-benchmark-gate.server.ts` `isPasserBenchmarkEnabled()` 가 dashboard / goals / `/study/srs` / `/study/passer-trend` loader 마다 호출되어, **실(비합성) + 분석 동의 합격자 수**가 `PASSER_BENCHMARK_MIN_SAMPLE` (기본 **10명**, `pass-criteria.ts`) 이상이면 `gate.enabled = true` 로 자동 전환.

전환 시 학생 화면 변화:
- 대시보드 `PASS FORECAST` 섹션의 "합격자 비교는 준비 중" 안내 카드(`PassCriterionAnnouncementCard`) 가 사라지고 `PasserBenchmarkCard` + `PasserSummariesCard` 가 나타남.
- `/goals` 의 `PasserCalibrationCard` 가 채워짐.
- `/study/srs` 합격자 SRS 비교 섹션이 채워짐.
- `/study/passer-trend` 12주 곡선이 채워짐.
- `recommendations.ts` 가 합격 기준 메시지 대신 합격자 평균 비교 메시지를 사용.

---

## 1. 게이트 ON 직후 — 수동 검증 체크리스트

### 1.1 표본 sanity (반드시 첫번째)
- [ ] Supabase MCP `execute_sql`:
  ```sql
  select count(*) from exam_results er
    join profiles p on p.profile_id = er.user_id
   where er.status='passed'
     and p.analytics_consent_at is not null
     and coalesce(p.is_synthetic, false) = false;
  ```
  → 결과가 게이트 임계값 (`PASSER_BENCHMARK_MIN_SAMPLE`) 이상인지 확인.
- [ ] `is_synthetic=true` 합격자가 학생 화면 통계에 섞이지 않는지: `/admin/analytics/passers` 진입 → 시연 토글이 default OFF (시연 모드 ON 일 때만 합성 합격자가 표시) 인지 확인. **운영자 시연 화면도 default 를 OFF 로 변경 권장** (운영 모드).

### 1.2 PII 격리 재확인
- [ ] `npx vitest run app/features/exam-results/passer-pii-isolation.test.ts` — 7개 모두 PASS.
- [ ] dashboard 학생 계정으로 진입 → PasserBenchmarkCard 의 본문에 합격자 이름·이메일·연락처 노출 0건. 브라우저 devtools Network 탭에서 loader 응답 페이로드 직접 확인.
- [ ] `/study/passer-summaries` 후기 본문(`summaryMd`) 에 합격자가 자기 이름·연락처를 적었는지 모더레이션 — 자유 입력이라 PII 마스킹 없음. 운영자가 N건 수동 검토 권장.

### 1.3 비교 지표 sanity
- [ ] 표본 N 명의 평균 학습 시간 / 풀이 회수 / 정답률이 plausible 범위:
  - 학습 시간: 600~2500h
  - 풀이 회수: 1000~6000
  - 정답률: 60~85%
  - 활동 일수: 150~340일
- [ ] 비합격자(`status='failed'`) 표본도 ≥ 3명인지 — 없으면 `failerBaseline=null` 로 비합격자 패턴 경고 액션 비활성. 표본이 모이면 자동 활성.
- [ ] `/admin/analytics/failure-patterns` 가 두 그룹 평균 격차를 보여주는지 (격차가 너무 작거나 음수면 표본 편향 의심).

### 1.4 추천 액션 sanity
- [ ] `recommendations.ts` 가 게이트 OFF 때 생성하던 "합격 기준" 메시지 (`criterion-below-floor` / `criterion-below-average` / `criterion-safe`) 가 사라지고, "합격자 평균" 메시지 (`study-hours-gap-*` / `accuracy-gap-*` / `problem-attempts-gap`) 로 자동 전환되는지 학생 1명 계정에서 확인.

---

## 2. 후속 — A5 권고 보정안 적용 (집계 윈도우)

**문제**: `computeAggregates(admin, userId, examYear)` 의 종료일이 `${year}-12-31` 로 고정 → 1차 합격자(2월 응시) 도 시험 *이후* 8개월 학습이 평균에 잡혀 왜곡.

**조치**:
1. `pass-criteria.ts` 에 시험일 근사값 export:
   ```ts
   export const EXAM_DATE_APPROX = {
     first: { month: 1, day: 25 },   // 0-indexed (=2/25)
     second: { month: 6, day: 20 },  // 0-indexed (=7/20)
   } as const;
   ```
   (참고: `analytics.server.ts:805` `approximateExamDateMs` 이 이미 같은 값을 가진다 — 그 함수를 SSoT 로 이동.)
2. `computeAggregates` 시그니처에 `examRound: ExamRound` 추가, 종료일을 차수별 응시일까지로 좁힘.
3. `listExamCasesByStatus:131` 의 `computeAggregates(admin, r.userId, r.examYear)` → `r.examRound` 도 전달.
4. 회귀 테스트 — 시험 응시 이후 학습 로그가 평균에 잡히지 않는지 확인.

**왜 1년차에 안 했나**: 합성 데이터엔 의미 없음. 실데이터 누적 시 즉시 필요.

---

## 3. 후속 — B1 (커리큘럼 보정 엔진) 착수

게이트 ON + 실 합격자 ≥ 30명 (차수별, 보정 임계값) 도달 시 `docs/roadmap/passer-calibration.md` 절차로 `suggestCurriculumCalibration()` 구현 착수.

### 3.1 순서
1. `pass-criteria.ts` `EXAM_DATE_APPROX` SSoT 정리 (위 2번과 함께).
2. 합격자 학습 시퀀스 bucket 산출 — `app/features/curricula/passer-calibration.server.ts` 의 `suggestCurriculumCalibration` 본문 채우기. study_sessions / user_problem_attempts / user_blank_attempts / user_recitation_attempts 4종 timestamp → 12 bucket.
3. 권장안 산출 — 추가 (≥70%) / 제거 (<20%).
4. UI — `/admin/curricula/:id/calibration` 신설. dry-run preview + "권장안 적용" 트랜잭션.
5. audit_logs 기록.
6. E2E — `e2e/admin/curriculum-calibration.spec.ts` 신설.

### 3.2 표본 임계값
- `pass-criteria.ts` `PASSER_BENCHMARK_MIN_SAMPLE` 와 별도. 보정 임계값은 30명 / 차수.
- `app_settings` 키 `curriculum_calibration_min_sample` 신설 권장 — 운영자가 표본 확보 속도에 따라 조정.

---

## 4. 후속 — UX / 마케팅
- [ ] 게이트 ON 시점에 학생 in-app 알림 fanout — `staff_notification_kind` 확장 또는 `announcement` 발행: "합격자 학습 패턴 비교가 활성화되었습니다".
- [ ] 비로그인 랜딩(`/`) `getPublicPlatformStats` 가 실 합격자 카운트로 자동 갱신됨 → 마케팅 카피 업데이트 점검.
- [ ] `is_synthetic=true` 합성 합격자는 게이트 ON 후에도 학생 화면에 노출되지 않음 (A2 보호). 운영자 시연 화면(`admin-passer-cases`/`admin-failure-patterns`) 에서만 보임.

---

## 5. 롤백 — 표본 오류 발견 시

게이트가 잘못 ON 된 경우 (예: 합성 합격자가 실수로 `is_synthetic=false` 로 들어감):

1. 즉시 합성 데이터 정정:
   ```sql
   update profiles set is_synthetic = true
    where profile_id in ('<uuid1>', '<uuid2>', ...);
   ```
2. 실 합격자 카운트 다시 임계값 미만으로 떨어지면 다음 loader 호출부터 자동 OFF.
3. **데이터 변경 전 반드시 백업** — `pg_dump` 또는 Supabase 스냅샷.

게이트 임계값을 일시적으로 올려야 한다면 (코드 변경 회피) `pass-criteria.ts` `PASSER_BENCHMARK_MIN_SAMPLE` 상수 수정 + 재배포. 향후 `app_settings` 키로 옮기면 무배포 조정 가능.
