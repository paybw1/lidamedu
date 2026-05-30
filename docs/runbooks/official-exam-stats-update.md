# 공식 시험통계 데이터 갱신 동선 (연 1회)

> **데이터 파일**: `app/features/exam-results/data/official-exam-stats.json`
> **출처**: 한국산업인력공단(큐넷) 변리사 국가자격시험 합격자 공고 채점통계 (공개·익명)
> **갱신 주기**: 매 시험 합격자 발표 후 (1차 ≈ 5월 / 2차 ≈ 11월)

---

## 1. 무엇을 갱신하나

`official-exam-stats.json` **만** 갱신한다. 본 파일이 변경되면:

- `app/features/exam-results/pass-criteria.ts` 의 `getOperativeTarget()` 이 자동 갱신
- `app/features/study/lib/pass-predict.ts` 의 1차/2차 임계값(`getRound1PredictionThresholds`/`getRound2PredictionThresholds`) 이 자동 갱신
- `app/features/dashboard/components/dash-forecast.tsx` 의 `PassCriterionAnnouncementCard` (cut_line 미니 차트 포함) 가 자동 갱신
- `app/features/study/daily-menu.server.ts` 의 약점 슬롯 body 컨텍스트(과락률 라벨) 가 자동 갱신
- `app/features/exam-results/screens/electives-guide.tsx` (2차 선택과목 가이드) 가 자동 갱신

코드 변경 0 — JSON 만 PR.

---

## 2. 갱신 절차

1. 큐넷 합격자 공고에서 최신 연도 채점통계 다운로드. 추출 대상:
   - **1차**: `applicants / sat / passers / pass_rate / cut_line / top_score / subjects.{산업재산권법/민법개론/자연과학개론}.avg / .fail_rate`
   - **2차**: 위 + `required_subjects.{특허법/상표법/민사소송법}.avg / .fail_rate / elective_fail_rate`
   - **선택과목**: `electives_overview.by_subject.{과목}.{year, sat, passers, avg}`
2. `app/features/exam-results/data/official-exam-stats.json` 의 해당 차수 `by_year` 배열 **앞에** 신규 연도 row 추가.
3. **cut_line 미공개**: `cut_line: null`, `top_score: null` 그대로 두기. **추정/보간 금지** (코드 자동으로 가용 연도만 평균 산출).
4. `important_notes` 가 변경되지 않았다면 그대로 유지.

---

## 3. 검증

```bash
npm run typecheck
npx vitest run app/features/exam-results/
```

테스트가 PASS 인지 + 다음 4개를 수동 확인:

- [ ] `getRound1PredictionThresholds().ok` 가 새 cut_line 평균과 일치
- [ ] `getRound2PredictionThresholds().ok` 가 새 cut_line 평균과 일치
- [ ] dashboard 학생 계정에서 `PassCriterionAnnouncementCard` 미니 차트가 신규 연도 막대를 표시
- [ ] `/study/electives-guide` 신규 연도 평균이 반영

---

## 4. 가드레일 — 갱신 시 절대 위반 금지

1. **집계 통계 ≠ 개별 학습 로그**. 합격자 "학습 패턴" 비교(프로그램2)에 사용 금지. 합격 기준/벤치마크 전용.
2. **법정 기준(floor: 과락 40·평균 60) ≠ 실측 합격선(target: cut_line)** 절대 분리. 신규 row 의 `cut_line` 을 그대로 `floor` 로 옮기지 말 것.
3. **단순 60 룰 학생 노출 금지**. 1차 cut_line 은 평균 60 보다 훨씬 높음(~80), 2차는 60 보다 낮음(~54). UI 라벨/메시지에 차수별 실측값 명시.
4. **`demographics_optional`** 은 마케팅 / 동기부여 콘텐츠 전용. 학습 엔진 로직(추천/SRS/약점 정렬)에 입력 금지.
5. **합격자-패턴 게이트**(A3 `passer-benchmark-gate.server.ts`) 는 본 데이터와 **무관**. 게이트는 실 합격자 학습 로그(`exam_results` + `analytics_consent_at` + non-synthetic) 카운트로만 결정. 본 JSON 갱신만으로 게이트가 ON 되지 않음.

---

## 5. 데이터 형상 (JSON schema 요약)

```jsonc
{
  "source": "...",
  "important_notes": ["..."],
  "round1": {
    "statutory_criteria": {
      "subject_floor": 40, "average": 60,
      "english": "...", "subjects": ["..."],
      "selection": "...", "operative_target_note": "..."
    },
    "by_year": [
      {
        "year": 2026, "round": 63,
        "applicants": 4236, "sat": 3697, "passers": 632,
        "pass_rate": 17.09,
        "cut_line": 80.00 /* or null */,
        "top_score": 95.00 /* or null */,
        "subjects": {
          "산업재산권법": { "avg": 52.87, "fail_rate": 35.78 },
          "민법개론":     { "avg": 59.67, "fail_rate": 31.02 },
          "자연과학개론": { "avg": 50.26, "fail_rate": 26.52 }
        }
      }
    ]
  },
  "round2": {
    "statutory_criteria": {
      "required_subject_floor": 40, "required_average": 60,
      "elective": { "pass_fail": true, "pass_floor": 50, "counts_toward_total": false },
      ...
    },
    "by_year": [
      {
        "year": 2023, ..., "cut_line": 54.33,
        "required_subjects": {
          "특허법":    { "avg": 44.39, "fail_rate": 23.74 },
          "상표법":    { "avg": 45.15, "fail_rate": 20.95 },
          "민사소송법": { "avg": 45.36, "fail_rate": 27.17 }
        },
        "elective_fail_rate": 22.79
      }
    ],
    "electives_overview": {
      "note": "...",
      "by_subject": {
        "디자인보호법": [
          { "year": 2023, "sat": 542, "passers": 115, "avg": 51.93 }
        ]
      }
    }
  },
  "demographics_optional": { "round1_passer_age": {...} }
}
```
