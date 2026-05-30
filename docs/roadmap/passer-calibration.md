# 합격자 학습 시퀀스 → 권장 커리큘럼 보정 (Phase-1 활성화)

> **상태**: 🔲 미착수 (1년차 = 실 합격자 0명). 내년 합격자 발표 후 [B2 런북](../runbooks/passer-data-activation.md) 절차로 활성화.
> **seam**: `app/features/curricula/passer-calibration.server.ts` `suggestCurriculumCalibration()` — 현재는 빈 보고 반환.

---

## 1. 목적

학원 강사가 수동 입력하는 커리큘럼(주차별 항목 트리)을 **실 합격자 학습 시퀀스 분포**로 보정한다. 합격자의 90% 가 학습한 항목이 커리큘럼에서 빠져 있으면 추가 권장, 합격자 20% 미만이 학습한 항목은 제거 권장.

직전 감사 보고서 §5.1 갭 B (★★★) 의 구현 진입점.

---

## 2. 활성화 전제 (입력 데이터 요건)

| 요건 | 임계값 | 이유 |
|---|---|---|
| 실(비합성) 동의 합격자 표본 | ≥ 30명 (차수별) | 통계적 안정성 — 20명 미만은 한두 명 학습 패턴이 분포 왜곡 |
| 합격자별 학습 활동일 수 | ≥ 60일 | 단기 벼락치기만 한 합격자는 시퀀스 신호가 적음 |
| 합격자별 응시 직전 12개월 study_sessions 보유 | ≥ 50건 | sequence 분석에 timestamp 가 충분히 깔려야 함 |
| 커리큘럼 주차 수 | ≥ 4주 | 단주차 트랙은 보정 의미 없음 |

위 4 항목이 모두 충족돼야 `suggestCurriculumCalibration()` 이 빈 보고가 아닌 실 권장안을 반환한다. 그 전까지는 `insufficientReason` 으로 사유 반환.

표본 임계값은 `app/features/exam-results/pass-criteria.ts` `PASSER_BENCHMARK_MIN_SAMPLE` (기본 10) 과 **별도** — 커리큘럼 보정은 분포 분석이라 더 큰 표본 필요.

---

## 3. 알고리즘 (착수 시 채울 내용)

### 3.1 합격자 학습 시퀀스 → 주차별 분포
1. 합격자 표본의 응시일(`exam_results.exam_year/round` + `pass-criteria.ts` 의 시험일 근사) 기준 D-12주~D-0주를 12 bucket 으로 분할.
2. 각 합격자의 `study_sessions.scope` (article_id/case_id) + `user_problem_attempts.problem_id` + `user_blank_attempts.set_id` + `user_recitation_attempts.article_id` 를 timestamp 별로 bucket 매핑.
3. 항목별로 "합격자 중 N% 가 W주차에 학습" 산출 (heatmap).

### 3.2 권장안 산출
- **추가 권장**: 합격자 ≥ 70% 가 학습한 항목 중 커리큘럼에 없는 것. 가장 분포가 집중된 주차로 배정.
- **제거 권장**: 커리큘럼에 있지만 합격자 < 20% 만 학습한 항목. 우선순위 낮음 / 선택 항목으로 강등 제안.

### 3.3 표시
- `/admin/curricula/:id/calibration` (신규 화면) — 주차별 추가/제거 권장 테이블 + "권장안 적용" 버튼 (curriculum_items insert/delete 트랜잭션)
- 권장 적용 후 변경 사항은 `audit_logs` 기록. 적용 전 dry-run 미리보기.

---

## 4. 미구현 이유 (1년차)
- 실 합격자 0명. `seed.server.ts` 의 합성 데이터는 학습 시퀀스가 무작위 분포라 보정 의미 없음 (오히려 강사가 잘못 짠 커리큘럼처럼 보일 위험).
- 알고리즘 자체보다 **데이터 품질**이 출시 가치를 결정 — 표본이 충분하기 전엔 미구현이 정답.

---

## 5. seam 인터페이스

```ts
// app/features/curricula/passer-calibration.server.ts
suggestCurriculumCalibration(input: PasserCalibrationInput): Promise<CalibrationReport>

interface PasserCalibrationInput {
  curriculumId: string;
  examRound: "first" | "second";
  subjectScope?: LawSubjectSlug[];
}

interface CalibrationReport {
  sampleSize: number;
  insufficientReason: string | null;
  suggestedAdditions: CalibrationSuggestion[];
  suggestedRemovals: CalibrationSuggestion[];
}
```

내년 구현 시 인터페이스는 깨지 않는다 — 호출처(없음 → 신설 화면) 한 번에 작업.

---

## 6. 연관 작업
- B2 런북 — 내년 합격자 데이터 활성화 절차
- A1 SSoT — `pass-criteria.ts` 의 시험일 근사값 (응시일 bucket 산출에 사용)
- 직전 감사 §5.1 갭 B (★★★) 우선순위
