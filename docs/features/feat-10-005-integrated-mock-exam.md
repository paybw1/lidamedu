# feat-10-005 — 다과목 통합 1차 모의고사

> 모의고사 체계 정비의 마지막 조각. feat-10-002·004 가 **팩 단위**(한 과목·한 세션)까지 완성했고,
> 이 문서는 그 위에 **3교시 통합 시험**(과목별 과락 + 전 과목 평균 합격)을 얹는다.
> 검토용 설계문서 — 승인 후 SPEC 갱신 → 마이그레이션 → 구현. DB 변경은 운영 Supabase 에 즉시 반영되므로 검토 전 적용하지 않는다.

## 1. 목표 / 배경

1차 모의고사는 현재 **팩 한 개 = 한 과목 = 한 세션**까지 동작한다(feat-10-002 출제·공개, feat-10-004 점수·합격선·등수). 그러나 실제 변리사 1차는 **3교시를 한 시험으로** 보고 **과목별 과락 + 전 과목 평균**으로 합격을 판정한다 — 팩 한 개로는 "산업재산권법은 잘 봤지만 자연과학 과락" 같은 판정을 표현할 수 없다(과목 경계가 한 팩 안에 없음).

feat-10-005 는 **여러 팩을 한 시험으로 묶는 `mcq_exams` 엔티티**와 **다중 세션을 한 응시로 묶는 모델**을 도입해, 실제 시험과 동일한 통합 응시·과락·합격 판정을 제공한다.

## 2. 도메인 — 변리사 1차 시험 구조

| 교시 | 과목 | `subject_scope` | 통상 문항 |
|:---:|------|------------------|:--------:|
| 1교시 | 산업재산권법 (특허·상표·디자인) | `industrial` | 40 |
| 2교시 | 민법개론 | `civil` | 40 |
| 3교시 | 자연과학개론 | `science` | 40 |

- 각 과목 100점 만점(= 정답률 %).
- **과락**: 한 과목이라도 **40점 미만** → 평균과 무관하게 불합격.
- **합격**: 전 과목 평균 **60점 이상** **그리고** 과락 없음.

> 교시 수·과목은 시험마다 운영자가 구성한다. 모델은 **N교시**로 일반화하되(아래 `mcq_exam_papers`), 변리사 1차의 표준값(과목 과락 40 / 평균 60)을 기본값으로 둔다.

## 3. 핵심 설계 결정 — 시험 = 팩 묶음, 교시 = 기존 팩

`mcq_exams` 는 **기존 `mcq_packs` 위의 얇은 묶음 레이어**다. 한 교시 = `mock_full`/`mock_progressive` 종류 팩 한 개. 이렇게 하면 다음을 **그대로 재사용**한다:

- 출제 — 팩 문제 picker(feat-10-002)
- 학습과목 공개 게이트 — 팩 단위 release(feat-10-002)
- 채점 공식 — 정답률 % = 정답 수 / 문항 수(feat-10-004)
- 응시 UI — `mcq-pack-sheet`(타이머·자동 제출)
- 교시별 통계 — `getPackResultStats`(유형·지문별 정답률)

신규 개념은 **시험(`mcq_exams`)**·**교시 매핑(`mcq_exam_papers`)**·**응시 묶음(`mcq_exam_attempts`)** 셋뿐. feat-10-002 가 "통합 시험은 GS 에 준하는 큰 작업"이라 미뤘던 부분을, **교시를 기존 팩으로 환원**해 최소 구조로 푼다.

## 4. 데이터 모델

신규 테이블 3개 + `quiz_sessions` 컬럼 1개 + 등수 RPC 1개.

```sql
-- 시험 (교시 묶음)
create table public.mcq_exams (
  exam_id       uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  year          int,
  exam_round_no int,
  pass_average  smallint not null default 60 check (pass_average between 0 and 100),
  is_published  boolean not null default false,   -- 교시 매핑 완료 후 운영자가 공개
  published_at  date,
  created_by    uuid references public.profiles(profile_id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz                       -- soft delete (콘텐츠)
);

-- 시험 ↔ 교시(팩) 매핑
create table public.mcq_exam_papers (
  exam_id    uuid not null references public.mcq_exams(exam_id) on delete cascade,
  pack_id    uuid not null references public.mcq_packs(pack_id),
  ord        smallint not null default 0,         -- 교시 순서 (0 = 1교시)
  fail_floor smallint not null default 40 check (fail_floor between 0 and 100),
  primary key (exam_id, pack_id)
);

-- 한 응시 = 전 교시 묶음
create table public.mcq_exam_attempts (
  attempt_id   uuid primary key default gen_random_uuid(),
  exam_id      uuid not null references public.mcq_exams(exam_id),
  user_id      uuid not null references public.profiles(profile_id),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,                       -- 전 교시 세션 완료 시각
  created_at   timestamptz not null default now()
);

-- 교시 세션 → 응시 묶음 역참조
alter table public.quiz_sessions
  add column exam_attempt_id uuid references public.mcq_exam_attempts(attempt_id);

create index idx_exam_attempts_exam_user on public.mcq_exam_attempts(exam_id, user_id);
create index idx_quiz_sessions_exam_attempt on public.quiz_sessions(exam_attempt_id)
  where exam_attempt_id is not null;
```

**컬럼 소유 결정**

- `fail_floor`(과락선)는 `mcq_exam_papers` 에 둔다 — `mcq_packs.pass_score`(feat-10-004)는 팩 **단독** 응시의 합격선이고, 과락선은 **시험 맥락**의 값이다. 같은 팩이 두 시험에서 다른 과락선을 가질 수 있으므로 매핑 행에 소유.
- `pass_average`(평균 합격선)는 시험 단위 → `mcq_exams`.
- 점수는 **저장하지 않는다** — `user_problem_attempts` 에서 파생(feat-10-004 와 동일 철학). `mcq_exam_attempts`·`quiz_sessions` 에 점수 컬럼 없음.

**RLS** (mcq_packs 패턴 그대로)

- `mcq_exams`·`mcq_exam_papers` — 콘텐츠: `is_published` 인 행은 전체 읽기 + staff 는 전체 읽기, 쓰기는 staff.
- `mcq_exam_attempts` — 학습 데이터: 본인(`user_id = auth.uid()`)만 R/W. staff 자기반 열람은 범위 밖(§11).
- `quiz_sessions.exam_attempt_id` — 기존 RLS(본인 세션) 그대로.

## 5. 응시 흐름 — 교시별 순차

실제 시험이 교시를 **나눠** 보므로(교시 사이 휴식), 교시별로 **독립 세션·독립 타이머**로 응시한다. 단일 연속 세션이 아니다 — 이렇게 하면 `mcq-pack-sheet`(팩 단위 시트·타이머)를 **수정 없이** 교시마다 재사용한다.

```
시험 러너(/latest/mcq/exam/:examId)
  │  응시 시작 → POST /api/mcq-exam/start → mcq_exam_attempts insert → 러너로 복귀
  │
  ├─ 1교시 응시 → POST /api/mcq-pack/start (packId, mode=exam, examAttemptId)
  │      → quiz_session(pack_id, exam_attempt_id) → 시트 → 제출 → 러너 복귀
  ├─ 2교시 …  (1교시 완료 세션이 있어야 열림)
  ├─ 3교시 …
  │
  └─ 전 교시 완료 → mcq_exam_attempts.completed_at 설정 → "결과 보기"
         → /latest/mcq/exam/:examId/result/:attemptId
```

- **러너**는 진입점이자 허브 — 진행 중 응시의 교시별 상태(미시작 / 진행 중(이어서) / 완료)와 다음 교시 버튼을 보여준다.
- **교시 게이트**(서버): ord N 교시는 ord < N 교시가 모두 완료 세션을 가질 때만 시작 가능. UI 잠금 + `/api/mcq-pack/start` 에서 재검증.
- **재진입**: 교시 도중 이탈 후 복귀 시 진행 중 세션이 있으면 새로 만들지 않고 그 시트로 이동.
- **`/api/mcq-pack/start` 확장**: `examAttemptId` optional 파라미터 추가. 있으면 ① 응시가 본인 소유 + 진행 중인지, ② 팩이 그 시험의 교시인지, ③ 교시 게이트, ④ 중복 응시 여부 검증 후 `createQuizSession` 에 `examAttemptId` 전달. exam-attempt 교시는 mode 를 `exam` 으로 강제.
- **시트 제출 경로 확장**: 세션에 `exam_attempt_id` 가 있으면 — 제출 후 ① 그 응시의 전 교시 세션 완료 여부 확인 → 마지막이면 `mcq_exam_attempts.completed_at` 설정(`finalizeExamAttemptIfComplete`), ② 팩 결과 화면 대신 **시험 러너로 redirect**.

`/api/mcq-exam/start` 는 `mcq_exam_attempts` 한 행 insert 만 한다 — 교시 세션 생성은 전부 `/api/mcq-pack/start` 단일 경로(뮤테이션 경로 동결, Layer 2-8).

## 6. 채점 · 합격 판정

### 6.1 점수

- **교시 점수** = 정답 수 / 문항 수 × 100 (정답률 %). feat-10-004 와 동일 — 문항 균등 배점, 미응답도 분모 포함.
- **평균** = 전 교시 점수의 단순 평균. 각 교시가 0–100 정답률이므로 교시 문항 수가 달라도 환산 불필요.
- **합격** = `평균 ≥ pass_average` **그리고** 모든 교시 `점수 ≥ fail_floor`. 한 교시라도 과락이면 평균과 무관하게 불합격.

### 6.2 응시 상세 — `getExamAttemptBreakdown` (본인 데이터)

특정 `attempt_id` 의 교시별 점수·과락·합격 판정을 본인 세션(`exam_attempt_id` 로 묶인 `quiz_sessions` + `user_problem_attempts`)에서 계산한다. 본인 데이터라 RLS 통과 — **모든 응시(최신 아니어도)**에 대해 정확. **합격 판정 로직은 여기 한 곳에만** 둔다(Layer 2-5 단일 진입점).

### 6.3 등수 — `mcq_exam_attempt_stats` RPC

다른 응시자 대비 등수는 전체 응시자 가시성이 필요 → feat-10-004 의 `mcq_pack_attempt_stats` 를 본뜬 `SECURITY DEFINER` + `search_path` 고정 RPC.

```
mcq_exam_attempt_stats(p_exam_id uuid)
returns table(
  attempt_id   uuid,        -- 호출자의 최신 완료 응시 (결과 화면이 :attemptId 와 대조)
  average      numeric,
  rank         int,
  total_takers int,
  percentile   numeric,
  z_score      numeric
)
```

- 각 사용자의 그 시험 **최신 완료 응시 1건**(`completed_at` not null, `distinct on (user_id) order by completed_at desc`)을 모집단으로.
- 응시별 평균 = 교시 세션 점수의 평균(교시 점수는 `mcq_pack_attempt_stats` 와 동일하게 문제별 최신 시도 정답 수 / `problem_ids` 길이).
- 윈도우 함수로 `rank`/`percentile`/`z_score` 산출, `where user_id = auth.uid()` 한 행 반환.
- RPC 는 **등수만** — 과락·합격 판정(§6.2)은 RPC 밖. 평균 산술만 RPC 와 helper 양쪽에 있고(랭킹에 불가피), 판정 로직은 중복하지 않는다.

> 결과 화면은 §6.2 breakdown 으로 교시별 점수·합격을 그리고, RPC 로 등수를 얹는다. 단 RPC 등수는 **최신 응시 기준** — 보고 있는 `:attemptId` 가 RPC 의 `attempt_id` 와 같을 때만 등수 표시(과거 응시는 점수·판정만). feat-10-004 결과 화면과 동일한 처리.

## 7. 화면 / 라우트

```
/latest/mcq/exams                            통합 모의고사 색인        mcq-exam-index.tsx
/latest/mcq/exam/:examId                     시험 러너 / 허브          mcq-exam-runner.tsx
/latest/mcq/exam/:examId/result/:attemptId   시험 결과                 mcq-exam-result.tsx
/api/mcq-exam/start                          응시 시작 (attempt insert) mcq-exams/api/start.tsx
/api/admin/mcq-exam                          시험 CRUD + 교시 매핑      admin/api/mcq-exam.tsx
```

- **색인** `mcq-exam-index.tsx` — 통합 모의고사 목록(관보식 표, `/latest/mcq` 와 동일 톤). staff 는 시험 추가/수정 + 교시(팩) picker.
- **러너** `mcq-exam-runner.tsx` — 시험 소개(교시 목록·합격 규칙·총 문항) + 진행 중 응시의 교시별 상태·다음 교시 버튼.
- **결과** `mcq-exam-result.tsx` — 평균 점수 · 합격/불합격 badge(과락 시 사유 명시) · 등수/백분위/z · 교시별 점수 표. 각 교시 행에서 기존 팩 결과(`/latest/mcq/:packId/result/:sessionId`)로 drill-in — 유형·지문별 분석 재사용.
- **운영자 폼** — 시험 CRUD(제목·연도·회차·`pass_average`·공개) + 교시 매핑: mock 종류 팩을 골라 ord·`fail_floor` 지정. 교시 팩은 exam 모드 응시가 가능해야 하므로 `isMockKind` 만 허용.
- **라우트 순서**: `/latest/mcq/exams`(1세그먼트 "exams")가 `/latest/mcq/:packId` 와 충돌 → exam 라우트 블록을 `:packId` 라우트보다 **먼저** 선언.

## 8. 결정 필요 사항 (검토 시 확인)

1. **합격 기준 수치** — `pass_average` 기본 60, 교시별 `fail_floor` 기본 40 (변리사 1차 실제 기준). 운영자가 시험·교시별 조정. 이 기본값으로 확정?
2. **교시별 순차 응시** — 각 교시 = 독립 세션·독립 타이머(§5). 단일 연속 타이머 아님 — 실제 교시 구조와 일치 + 기존 시트 무수정 재사용. 동의?
3. **네비 메뉴** — 현재 모의고사 ▾ "1차 종합 모의고사" → `/latest/mcq?kind=mock_full`. 통합 시험이 정식 "종합"이므로 이 링크를 `/latest/mcq/exams` 로 **repoint** 제안. 단일 `mock_full` 팩은 `/latest/mcq` 색인 필터로 잔존. (대안: 메뉴에 "1차 통합 모의고사" 한 줄 추가, 4줄.) 어느 쪽?
4. **점수 = 정답률 % 평균** — 교시별 100점 환산 후 단순 평균. 교시 문항 수가 달라도 균등(§6.1). 동의?

## 9. 구현 단계

1. **마이그레이션** — `mcq_exams`·`mcq_exam_papers`·`mcq_exam_attempts` + `quiz_sessions.exam_attempt_id` + 인덱스 + RLS + `mcq_exam_attempt_stats` RPC → `npm run db:typegen`
2. **쿼리** — `mcq-exams/queries.server.ts`: 시험 CRUD, 교시 매핑, `createExamAttempt`, `getExamAttemptBreakdown`(§6.2), RPC 래퍼, `finalizeExamAttemptIfComplete`
3. **세션 묶기** — `createQuizSession` 에 `examAttemptId` opt, `/api/mcq-pack/start` 에 `examAttemptId` 검증·게이트(§5)
4. **시트 복귀** — `mcq-pack-sheet` 제출 경로: exam-attempt 세션이면 attempt finalize + 러너 redirect
5. **운영자** — `/api/admin/mcq-exam` 액션 + 색인 화면의 시험 CRUD·교시 picker
6. **학생 화면** — `mcq-exam-index` · `mcq-exam-runner` · `mcq-exam-result`
7. **라우트·네비** — `routes.ts`(순서 주의) + `navigation-bar.tsx` `mockExamItems`
8. **typecheck + 문서** — `SPEC.md` feat-10-005 ✅, `docs/db-schema.md`

## 10. 위반 가드 / 결정사항

- 점수·합격은 **파생** — `mcq_exam_attempts`·`quiz_sessions` 에 점수 컬럼 없음, RPC/helper 가 매번 집계.
- 합격 판정 로직은 `getExamAttemptBreakdown` **한 곳**(서버) — 화면은 표시만.
- 교시 세션 생성은 `/api/mcq-pack/start` **단일 경로** — `mcq-exam/start` 는 attempt insert 만(뮤테이션 경로 동결).
- 교시 게이트·중복 응시 차단은 **서버에서 재검증** — UI 잠금은 보조.
- 등수 RPC 는 `SECURITY DEFINER` + `search_path` 고정(feat-10-004 RPC 와 동일 패턴).
- `mcq_exams.is_published` 기본 `false` — 교시 매핑 미완 시험이 학생에게 "반쪽 열림" 되지 않도록.
- `service_role` 미사용. attempt finalize·세션 시작은 멱등(중복 호출 무해).

## 11. 범위 밖 (YAGNI)

- staff 자기반 학생 통합시험 성적 열람 — 별도 태스크
- 코호트 한정·기간 한정 랭킹 — feat-10-004 와 동일하게 전체 응시자 모집단
- 교시 단일 연속 타이머 / 교시 간 강제 휴식시간
- 재응시 이력 비교 그래프 (등수 RPC 는 최신 응시만 사용)
- 2차(주관식) 통합 시험 — 온라인 GS 가 이미 그 역할
- 교시 문제 순서 드래그 재정렬 (feat-10-002 와 동일하게 범위 밖)
