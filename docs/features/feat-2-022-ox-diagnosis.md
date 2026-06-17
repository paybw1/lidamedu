# feat-2-022 — OX 지문 기반 약점 진단 (단원 × 지식종류 교차)

> 상태: 🟡 ①~⑥ 구현·단위검산 완료, 라이브 확인 대기 (2026-06-14) · 클러스터: 5.2 학습(학습 통계 탭 + `/admin/students`)
> **갱신(2026-06-17)**: 학생 진입점을 독립 화면 → **`학습 통계`(`/study/stats`)의 "정오문제 약점" 탭**으로 흡수(통폐합). `/study/ox-diagnosis` 라우트는 보존하되 탭으로 리다이렉트. 집계·공용 뷰·게이트 로직은 무변경(진입점만 일원화). 자세히 §6·§8.
> 선행 조사: `docs/survey/수험생진단-데이터현황.md` · 본 문서가 설계 SSOT.

## 1. 목표
OX 지문(선지·박스 항목)의 **누적 정오**를 학생별로 집계해, **단원(systematic node) × 지식종류(choice_type: 조문/판례/이론)** 2축 교차로 약점을 진단한다. "판례 적용이 약한 편" 같은 **지식종류 진단**이 드러나게 하고, 표본이 충분한 셀만 약점·처방 대상으로 삼는다. 오픈 전(데이터 ≈ 0)이라 **빈 상태에서 안전**하게 동작하고 학생이 풀수록 채워진다.

## 2. 데이터 유입·기록 (§0 검증 결과 — 2026-06-14)
- OX 정오는 **`user_problem_attempts`** 1테이블로 수렴(`ox_answer IS NOT NULL` + `selected_choice_id`/`selected_box_item_id` + `is_correct` + `attempted_at`). ref 단위로 경로 무관 합산 가능.
- **기록 경로**: ①~④ `OxQuestionsPanel`(조문/단원/체계도노드/과목전체 OX) · ⑤ OX 시험 exam · ⑥ OX 오답노트 — 모두 기록됨.
- **닫은 구멍**: ⑤' OX 시험 **study 모드** — 답을 받고도 미기록이었음 → **본 작업에서 기록 추가**(`/api/problems/attempt`, `mode='study'`, `quiz_sessions` 미생성). `mcq-pack-ox-exam.tsx`.
- **분류 입력률(운영 실측)**: OX 지문 13,394개 중 `choice_type` **99.5%** 입력(미분류 66개=0.5%). 분포 조문 56%·판례 25%·이론 19%. → 품질 보강 거의 불필요.
- **노드 귀속**: 지문 `related_node_id`는 0% → **부모 문제** `primary_node_id` → `article_systematic_links`(article→node, 첫째) 순으로 도출(= `getSessionWeakNodes` 와 동일 체인). 단원 granularity = 문제 단위.
- **데이터 볼륨**: OX attempt 55건/4명(내부 테스트) → **오픈 전 사실상 0**. 마이그레이션 불필요(전부 JOIN 도출).

## 3. 집계 로직 (② — 기존 재사용 + 신규)
파일: `app/features/study/lib/ox-diagnosis.server.ts` (서버 전용, 순수 쿼리).

### 재사용
- 노드 귀속 체인 — `getSessionWeakNodes`(study/queries.server.ts) 패턴 미러(전역 OX용으로 scope만 다름).
- `weaknessScore = (100 - 정답률) × log10(시도+1)` — `getWeakNodes`(weak-nodes.server.ts) 와 동일 공식.
- choice_type enum `statute/precedent/theory` + 라벨 `CHOICE_TYPE_LABEL`(problems/labels.ts).
- 표본 임계 `OX_DIAGNOSIS_MIN_ATTEMPTS = 5` — 기존 `MIN_ATTEMPTS_FOR_RANKING`(=5) 과 일관.

### 신규
- `computeOxDiagnosis(client, userId, opts)` → `{ totals, byChoiceType, byNode, cross, minAttempts, dedup }`.
- **box-item 포함**: 기존 `getPackResultStats.byChoiceType` 는 `selected_choice_id`(선지)만 집계해 box 누락 → 신규 집계는 `selected_box_item_id → problem_box_items.choice_type` 까지 **union**.
- **노드 × choice_type 교차 매트릭스**: 각 attempt → (nodeId, choiceType) 동시 도출 → 셀별 `{attempts, correct, accuracyPct, belowThreshold}`.

### dedup 정책 (명시)
- **기본 `latest`** = ref별 최신 1회만 (현재 숙련도). 근거: ① 오답노트 `listMyOxWrongNoteItems` 가 이미 최신 dedup, ② "지금 무엇이 약한가"는 반복 드릴로 과대계상되면 안 됨, ③ SRS와 일관.
- `all` 옵션 = 전체 시도(빈도·궤적용). **`attempted_at` 은 절대 버리지 않음** — `totals.firstAt/lastAt` 보존 + `since/until` 윈도우 파라미터로 임의 구간 재집계 가능(아래 §5 토대).

### 0/빈 데이터 안전
- 시도 0 → 빈 배열·`accuracyPct=null`·totals 0. 모든 나눗셈 `attempts>0` 가드.

## 4. 표본 게이트 (③)
- 각 셀에 `attempts(N)` 보관. `N < minAttempts(=5)` → `belowThreshold=true` → "데이터 부족(N건)" 표기, **약점 강조·처방·순위에서 제외**. 임계는 상수(추후 `app_settings` 조정 여지).

## 5. 합격자 패턴 컨설팅 토대 (미래 — 그릇만, 화면 X)
**3축(시간·합격여부·시험시점)으로 미래에 쪼갤 수 있게** 집계를 설계. 기존 인프라 재사용:
- **시간**: `computeOxDiagnosis` 가 `attempted_at` 보존 + `since/until` 윈도우 수용 → 임의 기간 재집계.
- **합격여부**: `exam_results.status`('passed'/'failed') + `profiles.analytics_consent_at` + `is_synthetic` 게이트 = 기존 `listPasserCases`/`listFailerCases`(exam-results/analytics.server.ts) 와 동일. OX user_id ↔ exam_results.user_id 직접 조인.
- **시험시점(D-N)**: 기존 `approximateExamDateMs(year, round)`(1차 2/25·2차 7/20) + `getPasserTrendData` 의 주차 환산을 그대로 적용 가능.
- **게이트**: `isPasserBenchmarkEnabled`(실 동의 합격자 ≥ `PASSER_BENCHMARK_MIN_SAMPLE=10` 자동 ON). 현재 0명 → OFF, 합격자 패널은 **빈 채로** 둠.
- ⚠️ 지금은 비교 화면 **안 만든다**. `computeOxDiagnosis(userId, {since,until})` 시그니처가 코호트별·윈도우별 호출을 이미 허용 → 미래에 래퍼만 추가하면 됨.

## 6. 화면 (④ 학생 · ⑤ 강사)
- **④ 학생** — 홈: `학습 통계`(`/study/stats`)의 **"정오문제 약점" 탭**(2026-06-17 흡수; 종전 독립 화면 `/study/ox-diagnosis` 는 `?tab=ox_diagnosis` 로 리다이렉트). 표현은 공용 `<OxDiagnosisView audience="self">`: 단원×지식종류 매트릭스(약한 셀 강조·N 표기), choice_type별(조문/판례/이론) 정답률, 노드별 약점(기존 재사용). 처방은 **신중**("판례 지문 정답률이 낮은 편입니다(N건). 판례 학습을 점검해보세요" 톤, 미달 셀 처방 안 함). 빈 상태 안내("아직 진단할 데이터가 부족합니다 — OX 지문을 풀면 분석이 시작됩니다").
- **⑤ 강사**: `/admin/students/:id` 확장 — 학생별 단원×지식종류 약점. cohort 비교는 기존 분위(quartile) 재사용. 게이트 동일 적용.

## 7. 검증 (⑥) — 완료
- **합성표본 단위검산** `app/features/study/lib/ox-diagnosis.test.ts`(vitest, 순수 `buildOxDiagnosis`). 검증: 누적 정답률·node×choice_type 교차 셀(시도/정답/정답률)·표본 게이트 경계(N=4 미달 / N=5 충족)·box+choice union·dedup(latest 최신1회·입력순서 무관 / all 전체)·미분류/기타 버킷·**빈 입력 0/빈배열 비크래시**.
- **비회귀**: `npm run typecheck` 통과, 전체 단위 테스트 63개 통과. 재사용 함수(`getSessionWeakNodes`·`getWeakNodes`·`getPackResultStats`)는 **미변경**(호출만) → 기존 통계 화면 무영향.
- 라이브(데이터 유입 후) 매트릭스·게이트 표시는 사용자 확인 대기.

## 8. 보류 / 숙제
- ✅ **단원 deep-link (완료, 2026-06-14)** — `computeOxDiagnosis` 노드 해석에 `systematic_nodes.law_code`(=과목 slug) 추가 → `OxNodeRow.lawCode` → 매트릭스 단원명이 `/subjects/:lawCode/systematic/:nodeId`(체계도 단원 학습) 링크. lawCode 없거나 기타(노드 null)면 **라벨만**(안전 폴백). 단위검산 포함. "약점→학습 잇기" 완성.
- ✅ **⑨ SRS OX 재복습 단절 해결 (완료, 2026-06-14)** — 신규 러너 `/study/srs/ox`(`srs-ox-review.tsx`)에서 due ref 를 실제 O/X 로 재채점. `/study/srs` OX 섹션 "OX 복습 시작"·"풀기" 가 (이전: OX UI 없는 MCQ 뷰어) 이 러너로 연결. 기록 `/api/problems/attempt`(mode='study') → `applyOxRefSrsUpdate` 로 `user_ox_ref_srs.next_due_at` 갱신 → 복습 후 due 에서 빠짐. ref→OxQuestionItem 투영 `getOxQuestionsForRefs`(problems/queries.server.ts). 다과목 혼재라 subject 비의존 카드. (부가: 이 기록이 OX 진단 데이터에도 반영.)
- ✅ **학습 통계 탭으로 흡수 (완료, 2026-06-17)** — 독립 화면이던 학생 진단을 `학습 통계`(`/study/stats`)의 5번째 탭 "정오문제 약점"으로 통합. stats loader 에 `computeOxDiagnosis`+`isPasserBenchmarkEnabled` 추가(A동의 게이트는 stats 와 동일), 공용 `OxDiagnosisView` 그대로 렌더. `/study/ox-diagnosis` 라우트 보존→`?tab=ox_diagnosis` 리다이렉트(링크·북마크 무효화 방지). nav SSOT(`nav-groups.ts`)에서 학습관리의 "정오문제 약점 진단" 항목 제거(진입점 통계로 일원화). 판단 근거: 진단은 본질이 *분석* → 같은 분석 화면(통계, 같은 feature·게이트·축)에 속함(DRY 게이트 3요건 충족). 강사 드릴다운(`/admin/students/:id`)은 같은 공용 뷰를 별도 경로로 써 무관. 커밋 `05cfd5c`.
- (참고, 같은 통폐합 커밋) `정오문제 응시 이력`(`/me/ox-sessions`)은 진단이 아닌 *응시 기록* → "응시 결과"(`/me/exam-results`)의 형제로 보고 nav 를 **학습관리 → 모의고사** 그룹으로 이동(co-locate). 화면·라우트 무변경.
- (향후) `getSessionWeakNodes` 의 노드귀속을 공용 헬퍼로 추출해 본 모듈과 공유(현재는 비회귀 위해 미러).
