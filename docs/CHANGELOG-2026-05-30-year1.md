# 2026-05-30 — 1년차 운영 정비 (합격자 비교 게이팅 + 공식 합격선 SSoT)

> **추가 패치 (동일 날짜)**: 합격 기준 SSoT 를 **한국산업인력공단 공식 채점통계** 기반 2층 구조로 정밀화.
> 임의값 80/60/40 제거 → 차수별 실측 cut_line (1차 ~80, 2차 ~54) 사용. 단순 "평균 60 룰" 노출 차단.
> 데이터 파일: `app/features/exam-results/data/official-exam-stats.json` (공개·익명 집계).
> 갱신 동선: [`docs/runbooks/official-exam-stats-update.md`](runbooks/official-exam-stats-update.md).


> **배경**: 본 플랫폼은 첫 운영연도라 실제 합격자(인증된 실데이터)가 0명. 합격자 평균/패턴에 기대는 모든 비교·컨설팅은 합성 데이터이거나 비어 있어야 정상. 직전 감사 보고서 [`docs/audit/product-vision-audit-2026-05-30.md`](audit/product-vision-audit-2026-05-30.md) 의 핵심 갭 1·3 대응.
>
> **원칙**: 1년차 학생 화면에 합성 합격자 수치가 "합격자" 로 노출되지 않도록 차단막을 만든다. 그 자리에 합격 기준(평균 60·과락 40)을 비교 앵커로 사용한다. 내년 합격자 발표 후 자동으로 합격자 패턴 비교로 전환되도록 코드 배포 없이 게이트 ON.

---

## 변경 한 줄 요약

| 단계 | 결과 |
|---|---|
| A1 합격 기준 SSoT (★ **공식 통계 패치 후**) | `pass-criteria.ts` 를 **2층 구조** 로 재정의 — Layer 1 (statutory floor: 과락 40·평균 60) + Layer 2 (operative target: 공식 cut_line 평균). `pass-predict.ts` 임계값을 차수별로 분리 (1차 ~80 / 2차 ~54). 단순 60 룰 제거 |
| 공식 통계 적재 | `data/official-exam-stats.json` + 타입/헬퍼 `official-stats.ts`. 5개 헬퍼: `getOperativeTarget`/`getRecentCutLineAvg`/`getRecentPassRateAvg`/`getRound1SubjectStats`/`getRound2RequiredSubjectStats` |
| 합격선 벤치마크 카드 | `PassCriterionAnnouncementCard` 가 공식 합격선 + 6년 cut_line 미니 차트 + 법정 자격선 표시 |
| 약점 슬롯 컨텍스트 | `daily-menu.server.ts` `pickWeakProblem` body 에 공식 통계 과락률 라벨 보강 |
| 2차 선택과목 가이드 | `/study/electives-guide` 신설 — P/F 특성 반영 (평균/과락 50미만 중심, 합격률 미사용) |
| 데이터 갱신 동선 | `docs/runbooks/official-exam-stats-update.md` (연 1회 JSON 만 갱신) |
| A2 합성/실 분리 | 합격자 풀 읽는 9개 함수에 `excludeSynthetic` 옵션. 학생/비로그인 화면 7개 모두 default `true` |
| A3 게이팅 + 합격 기준 대체 | `passer-benchmark-gate.server.ts` 신설 (실+동의 합격자 ≥10 시 ON). 학생 화면 4곳 호출 skip + "합격 기준 안내 카드" 대체. `recommendations.ts` 메시지 합격 기준 기반으로 재구성. 14개 sanity 테스트 통과 |
| A4 PII 격리 | 학생 화면 합격자 풀 반환 타입 7종에 `userId/userName/userEmail` 금지 회귀 보호 테스트 (7개 통과). 학생 화면 PII 누수 경로 없음 확인 |
| A5 수집 파이프라인 | 자가 입력·동의·리마인더·연도 태깅·동의 철회 정상. 집계 윈도우 보정안 = 내년 활성화 시점에 적용 (B2 런북 명시) |
| B1 커리큘럼 보정 | `passer-calibration.server.ts` seam + `docs/roadmap/passer-calibration.md` 활성화 계획 (엔진 미구현) |
| B2 활성화 런북 | `docs/runbooks/passer-data-activation.md` |

---

## 올해 동작 (1년차, 게이트 OFF + 공식 통계 통합 후)

**학생 첫 화면(`/dashboard`)** — PASS FORECAST 섹션:
- 합격 진단 점수 카드 — 차수별 임계값(`getRound1/2PredictionThresholds`) 적용. 1차 학생은 실측 합격선(~80) 기준, 2차 학생은 ~54 기준. hint 도 차수별 합격선 명시
- **`PassCriterionAnnouncementCard`** (공식 통계 통합):
  - 1차/2차 각각 실측 합격선 (예: "실측 합격선 ≈ 79.3점", 한국산업인력공단 2022~2026 평균)
  - 6년 cut_line 미니 SVG 차트
  - 법정 자격선 (과목 40·평균 60) 도 함께 — 자격선 vs 실측 합격선 구분
  - 합격자 학습 패턴 비교는 실 합격자 N/10명 누적 시 자동 활성화 안내

**추천 액션** (`recommendations.ts`):
- `passPrediction.thresholds` (차수별 분리) 를 사용
- 정답률이 법정 과락선(40) 미만 → high "정답률이 과락선 미달"
- 실측 합격선 미달 → medium "실측 합격선까지 X%p 부족" (1차 ~80 / 2차 ~54 차수별 다름)
- 안정권 도달 → celebrate "✨ 합격선 안정권"
- 합격자 평균 어휘 0건 (테스트로 잠금)

**`/goals`** — `PasserCalibrationCard` 호출 skip (null).
**`/study/srs`** — 합격자 SRS 비교 자리에 "준비 중" 안내 카드.
**`/study/passer-trend`** — 기존 "표본 부족" 카드 그대로 (호출 skip).
**`/study/passer-summaries`** — 합성 후기 제외 → 빈 결과.
**`/community/review`** — 합성 후기 제외.
**랜딩(`/`)** — `getPublicPlatformStats({excludeSynthetic:true})` — 마케팅 카운트가 합성을 세지 않음.

**운영자 시연 화면**:
- `/admin/analytics/passers`, `/admin/analytics/failure-patterns` — 시연 default 합성 포함 (변경 없음). 운영자가 토글로 실데이터/합성 전환할 수 있도록 후속 UI 가능.

---

## 내년 활성화 (자동 전환)

실(비합성) + 분석 동의 합격자 ≥ `PASSER_BENCHMARK_MIN_SAMPLE` (기본 10명, `pass-criteria.ts`) 도달 시:

- `isPasserBenchmarkEnabled()` 가 매 loader 호출마다 DB 카운트 → 임계값 초과 시 즉시 `enabled=true`
- 학생 화면에서 "합격 기준 안내 카드" 사라지고 `PasserBenchmarkCard` / `PasserSummariesCard` 등이 채워짐
- `recommendations.ts` 가 합격 기준 메시지 대신 합격자 평균 비교 메시지로 전환
- **코드 배포 불필요** — DB 카운트만 충족하면 자동

활성화 직후 검증·후속 작업은 [`docs/runbooks/passer-data-activation.md`](runbooks/passer-data-activation.md) 참조.

---

## 변경 파일 전수

### 신규
- `app/features/exam-results/pass-criteria.ts` (2층 SSoT — statutory floor + operative target)
- `app/features/exam-results/passer-benchmark-gate.server.ts` (게이트)
- `app/features/exam-results/data/official-exam-stats.json` (공식 채점통계, 루트에서 이동)
- `app/features/exam-results/official-stats.ts` (타입 + 5개 헬퍼)
- `app/features/exam-results/screens/electives-guide.tsx` (`/study/electives-guide`)
- `app/features/exam-results/passer-benchmark-gate.test.ts` (23 tests — 2층 구조 + recommendations + 차수별 임계값)
- `app/features/exam-results/passer-pii-isolation.test.ts` (7 tests)
- `app/features/curricula/passer-calibration.server.ts` (B1 seam)
- `docs/roadmap/passer-calibration.md`
- `docs/runbooks/passer-data-activation.md`
- `docs/runbooks/official-exam-stats-update.md` (연 1회 갱신)
- `docs/CHANGELOG-2026-05-30-year1.md` (본 파일)

### 수정
- `app/features/study/lib/pass-predict.ts` — 차수별 임계값 분리. `predictPassScore({examRound})` 추가. hint/basisLabel 차수별 동적 생성. `PassPrediction.thresholds`/`basisLabel` 노출
- `app/features/exam-results/recommendations.ts` — `passPrediction.thresholds` 사용. 합격선 기반 액션 (criterion-below-floor/below-average/safe). no-benchmark 안내에 공식 합격선 출처 명시
- `app/features/dashboard/screens/dashboard.tsx` — `next_exam_round` 조회 + `predictPassScore` 에 examRound 전달. 게이트 + bundle
- `app/features/dashboard/components/dash-forecast.tsx` — `PassCriterionAnnouncementCard` 가 `RoundBlock` × 2 + `CutLineSparkline` (SVG-free 막대 차트)
- `app/features/study/daily-menu.server.ts` — `pickWeakProblem` body 에 공식 통계 과락률 라벨 보강
- `app/features/exam-results/analytics.server.ts` — 9개 함수에 `excludeSynthetic` 옵션 + `is_synthetic` join
- `app/features/study/passer-srs-benchmark.server.ts` — `excludeSynthetic` 옵션
- `app/features/exam-results/at-risk.server.ts` — `computePasserBaseline(opts)`
- `app/features/goals/screens/goals.tsx` — 게이트 + 호출 skip
- `app/features/study/screens/srs.tsx` — 게이트 + 호출 skip + 안내 카드
- `app/features/exam-results/screens/passer-trend.tsx` — 게이트 + 호출 skip
- `app/features/exam-results/screens/passer-summaries.tsx` — `excludeSynthetic:true` 명시
- `app/features/community/screens/community-board.tsx` — `excludeSynthetic:true` 명시
- `app/features/home/screens/home.tsx` — `excludeSynthetic:true` 명시
- `app/routes.ts` — `/study/electives-guide` 라우트 추가

### 이동
- `official_exam_stats.json` (루트) → `app/features/exam-results/data/official-exam-stats.json`

### 미변경 (의도)
- `app/features/exam-results/screens/admin-passer-cases.tsx` — 운영자 시연 화면. default 합성 포함 유지.
- `app/features/exam-results/screens/admin-failure-patterns.tsx` — 동일.
- DB 스키마 (마이그레이션 0건)

---

## 검증

- `npm run typecheck` ✅
- `npx vitest run app/features/exam-results/` ✅ 30 passed (23 SSoT/recommendations + 7 PII)
- 엔드투엔드 (단위 테스트):
  - 1차 cut_line 평균이 60 보다 훨씬 큼(70~90) 검증 — 단순 60 룰 노출 차단
  - 2차 cut_line 평균이 60 보다 작음(45~60) 검증 — 단순 60 룰 노출 차단
  - 두 차수 임계값이 서로 다름 검증
  - cut_line null 연도(1차 2021·2023) 자동 제외 검증
  - 게이트 OFF 추천 액션 본문에 "합격자 평균 " 어휘 없음 회귀 잠금

---

## 위험 작업 / 데이터 변경

- DB 스키마 변경 **없음**
- 데이터 삭제 **없음**
- `seed.server.ts` 합성 합격자 행 **유지** (운영자 시연 목적)

---

## 다음 단계 (요약)

| 시점 | 작업 |
|---|---|
| 이번 분기 | 운영자 시연 화면(`admin-passer-cases`/`admin-failure-patterns`)에 "시연 모드/운영 모드" 토글 추가 권장 — default 운영 모드(=합성 제외) |
| 매년 5월 / 11월 | 큐넷 합격자 공고 직후 `data/official-exam-stats.json` 갱신 — [공식 통계 갱신 런북](runbooks/official-exam-stats-update.md) |
| 시험 응시 직전 | 학생들이 `/me/exam-results` 의 `next_exam_year/round` + `analytics_consent_at` 설정하도록 안내 (학습 로그 → 내년 합격자 데이터로 연결) |
| 내년 합격자 발표 후 | [활성화 런북](runbooks/passer-data-activation.md) 절차 — 게이트 자동 ON 직후 검증 + A5 집계 윈도우 보정 + B1 커리큘럼 보정 엔진 착수 |

---

## 보충 — "법정 기준 vs 실측 합격선" 의미 차이 (README 정리)

| 구분 | 1차 | 2차 | 출처 | 코드 |
|---|---|---|---|---|
| **법정 자격선 (statutory floor)** | 평균 60·과락 40 | 평균 60·과락 40 | 시험제도 규칙 | `getStatutoryFloor(round)` |
| **실측 합격선 (operative target)** | ~80 (최근 평균) | ~54 (최근 평균) | 한국산업인력공단 공식 통계 | `getOperativeTarget(round)` |

- 학생에게 노출하는 **현실 목표**는 항상 **실측 합격선**. 단순 "평균 60 룰" 은 1차 과소목표·2차 과대목표 → 학생 메시지/UI 절대 금지.
- 법정 자격선은 **과락 진단** 에만 사용 (40 미만 = 과락).
- 실 합격자 학습 패턴 비교(프로그램 2 핵심)는 **별도 게이트** — 본 공식 통계와 무관. 실 합격자 학습 로그 누적 후 자동 활성화.
