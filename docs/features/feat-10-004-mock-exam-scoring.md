# feat-10-004 — 1차 모의고사 채점·합격선·등수 (Phase B2)

> 모의고사 체계 정비 **Phase B2**. B1(feat-10-002, 출제·공개) 위에 점수·합격선·등수를 얹는다.
> 검토용 설계문서 — 승인 후 SPEC 갱신 → 마이그레이션 → 구현. DB 변경은 운영 Supabase 에 즉시 반영되므로 검토 전 적용하지 않는다.

## 1. 목표 / 배경

1차 모의고사(`mcq_packs` exam 모드)는 응시·자동채점·유형별 정답률까지 동작한다(B1·기존). 그러나 응시자가 **"내 수준이 어느 정도인가"** 를 알 길이 없다 — 점수 총점, 합격선 통과 여부, 다른 응시자 대비 등수가 없다. 1차 모의고사 흐름 ⑤("통계분석으로 수준 진단·분석")의 핵심 미충족분이다.

Phase B2 는 mock 팩 응시에 **점수 · 합격선(pass/fail) · 등수(percentile·z-score)** 를 제공한다.

## 2. 범위 결정 — 팩 단위 채점 (다과목 통합 시험은 분리)

실제 변리사 1차는 3교시(산업재산권법 · 민법 · 자연과학)를 한 시험으로 보고 **과목별 과락 + 평균 합격**으로 판정한다. 이를 그대로 구현하려면 "시험 = 팩(교시) 묶음"인 `mcq_exams` 신규 엔티티 + 다중 세션을 한 응시로 묶는 세션 모델 변경이 필요 — GS 시스템에 준하는 큰 작업이다.

**B2 는 팩 단위 채점으로 한정한다.** 두 모의고사 종류 모두 `mcq_packs` 한 행이다:
- **종합 모의고사**(`mock_full`) — 넓은 scope 팩(예: `industrial` 산업재산권법 합본).
- **진도별 모의고사**(`mock_progressive`) — 세부 과목 단위 팩(예: `patent` 특허법, `trademark` 상표법). `subject_scope` enum 이 이미 세부 과목을 구분하므로, 진도 범위 문제만 골라 담은 세부 과목 팩이 그대로 만들어진다.

둘 다 팩이므로 점수·합격선·등수가 동일하게 적용된다. 3교시 통합 1차 모의고사(산업재산권법+민법+자연과학 한 시험, 과목별 과락)는 **feat-10-005 로 분리**(§10).

## 3. 데이터 모델

신규 테이블 없음. `mcq_packs` 에 합격선 컬럼 1개 + 등수 집계 RPC 1개.

```sql
alter table public.mcq_packs add column pass_score smallint
  check (pass_score is null or pass_score between 0 and 100);

comment on column public.mcq_packs.pass_score is
  'feat-10-004 — 모의고사 합격선(정답률 %). null = 합격선 없음(점수·등수만 표시).';
```

**등수 집계 RPC** `mcq_pack_attempt_stats(p_pack_id uuid)` — GS 의 `gs_round_student_stats` 를 본뜸. 그 팩의 `mode='exam'` + 완료(`completed_at` not null) `quiz_sessions` 중 **사용자별 최신 1건**을 대상으로:

```
returns table(
  user_id uuid, session_id uuid,
  correct int, total int, score numeric,   -- score = 정답률 %
  rank int, percentile numeric, z_score numeric
)
```

`user_problem_attempts`(session_id 별 `is_correct`)를 집계해 점수 산출, 윈도우 함수로 rank/percentile/z. `quiz_sessions.problem_ids` 배열 길이를 total 로 쓴다(미응답도 분모 포함 — 실제 시험과 동일).

> 점수를 `quiz_sessions` 에 저장하지 않고 RPC 가 매번 집계 — 세션 모델 변경 회피. 점수는 `user_problem_attempts` 에서 파생(`docs/architecture.md` derived 원칙).

## 4. 채점·합격 판정

- **점수** = 정답 수 / 문항 수 × 100 (정답률 %). 문항별 균등 배점 — `mcq_pack_problems` 에 배점 컬럼 없음, 1차 객관식은 균등 배점이 표준.
- **합격 판정** = `pass_score` 가 설정돼 있으면 `점수 ≥ pass_score` → 합격 / 미만 → 불합격. `pass_score` 가 null 이면 점수·등수만 표시(판정 없음).
- 단일 팩이므로 "과목별 과락" 은 적용 안 함 — 그건 다과목 통합 시험(feat-10-005)의 개념.

## 5. 등수·통계

- `mcq_pack_attempt_stats` RPC 결과로 응시자의 **등수 / 백분위 / z-score** 산출. 모집단 = 그 팩 exam 모드 완료 응시자 전체(사용자별 최신 1건).
- 기존 `getPackResultStats`(유형별·지문별 정답률)는 그대로 — B2 는 그 위에 총점·합격·등수를 더한다.

## 6. 화면

- **학생 — 팩 응시 결과** `/latest/mcq/:packId/result/:sessionId` (`mcq-pack-result.tsx`): 상단에 **점수 / 합격·불합격 badge(합격선 대비) / 등수·백분위** 추가. 기존 유형별·지문별 표 위에.
- **운영자 — 팩 편집 폼** (`/latest/mcq` 의 인라인 pack CRUD): mock 종류 팩에 **합격선(`pass_score`) 입력** 추가. `mcq-pack.tsx` 의 `upsertSchema` 에 `passScore` 추가.

## 7. 결정 필요 사항 (검토 시 확인)

1. **합격선 기본/표기** — `pass_score` 는 정답률 %(0–100), 운영자가 팩별 입력. 기본값은 비움(null) 제안 — 운영자가 명시 입력. (변리사 1차 통상 과목 60점선 참고.)
2. **등수 모집단** — 그 팩 exam 응시자 전체(사용자별 최신 응시). 코호트 한정·기간 한정은 범위 밖.
3. **다과목 통합 1차 모의고사** (산업재산권법+민법+자연과학 한 시험, 과목별 과락) 를 원하시면 — feat-10-005 로 별도 진행. B2 는 팩 단위까지만.

## 8. 구현 단계

1. **마이그레이션** — `mcq_packs.pass_score` + `mcq_pack_attempt_stats` RPC → `db:typegen`
2. **쿼리** — `mcq-packs/queries.server.ts` 에 RPC 래퍼 `getPackAttemptRanking` (+ 점수 산출)
3. **운영자 폼** — pack upsert 에 `passScore`
4. **결과 화면** — `mcq-pack-result.tsx` 점수·합격·등수 섹션
5. **typecheck + 문서**

## 9. 위반 가드 / 결정사항

- 점수는 파생(RPC 집계) — `quiz_sessions` 점수 컬럼·세션 모델 변경 없음.
- 등수 RPC 는 `SECURITY DEFINER` + `search_path` 고정(GS RPC 와 동일 패턴).
- 합격선 미설정(null) 시 판정 없이 점수·등수만 — "반쪽 열림" 회피.

## 10. 범위 밖 (feat-10-005 — 다과목 통합 1차 모의고사)

- `mcq_exams` + `mcq_exam_papers`(시험 = 팩 묶음) + `mcq_exam_attempts`(다중 세션 묶음)
- 과목별 과락 + 전 과목 평균 합격 판정
- 코호트 한정 랭킹·기간 한정, 재응시 이력 비교
