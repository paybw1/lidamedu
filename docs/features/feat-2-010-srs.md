# feat-2-010 — 약점 자동 보충 (SRS, Spaced Repetition)

## 한 줄 요약
틀린/맞춘 문제를 SM-2 류 알고리즘으로 자동 큐잉 → 매일 "다시 봐야 할 문제"를 시스템이 가지고 옴.

## 동기

feat-2-009 (오늘의 학습 메뉴) 의 `weak_problem` 슬롯은 "최근 오답 중 정답률 최하" 1개 — 같은 문제를 *언제* 다시 봐야 하는지에 대한 학습 곡선 모델이 없음.

오답노트(`/study/wrong-note`)는 *수동 재시도*. 학생이 직접 들어가서 선택해야 함.

**SRS = 시스템이 망각 곡선을 따라 자동으로 적절한 시점에 끌어옴**. 한 번 틀리면 1일 뒤, 맞으면 3일 → 7일 → 14일 → 30일 → 60일로 간격 확장. 다시 틀리면 즉시 1일로 리셋.

## Layer 1. Judgment

| 체크 | 답변 |
|---|---|
| 시스템 동작에 필수? (YAGNI) | 학습 자체는 가능. SRS = 학습 효율 boost 가산 가치. |
| 더 단순한 대안? (KISS) | 단순 "오답 N일 뒤 재시도" 정책 — 가능하지만 정답/오답 모두 반영하는 SRS 가 망각 곡선 model 적합 |
| 같은 의미·소유자·축? (DRY) | 기존 `user_problem_attempts` 는 *이벤트 로그*. SRS state 는 *현재 상태* — 다른 축. 별도 테이블 |
| 클라이언트만 보장? | 서버 — `recordProblemAttempt` 훅. RLS = user_id 본인만 R/W |

→ **GO**

## Layer 2. Structure

### 데이터 모델

```sql
create table user_problem_srs (
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id uuid not null references problems(problem_id) on delete cascade,
  next_due_at timestamptz not null default now(),
  interval_days integer not null default 1,
  ease numeric(3,2) not null default 2.50,    -- SM-2 ease factor, 1.30 ~ 2.50+
  last_quality smallint,                      -- 0=fail, 1=pass
  last_reviewed_at timestamptz,
  lapses integer not null default 0,          -- 누적 실패
  reps integer not null default 0,            -- 누적 연속 성공 (실패 시 0 reset)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, problem_id)
);
```

인덱스: `(user_id, next_due_at)` — due 정렬 조회 최적화.

### 알고리즘 — Simplified SM-2

```
function next(prev, isCorrect):
  if isCorrect:
    if prev null OR prev.reps == 0:
      reps = 1, interval = 1
    else if prev.reps == 1:
      reps = 2, interval = 3
    else if prev.reps == 2:
      reps = 3, interval = 7
    else:
      reps = prev.reps + 1
      interval = round(prev.interval * prev.ease)
    interval = min(interval, 90)        # 90일 cap
    ease = prev?.ease ?? 2.5
    lapses = prev?.lapses ?? 0
  else:
    reps = 0, interval = 1
    ease = max(1.3, (prev?.ease ?? 2.5) - 0.2)
    lapses = (prev?.lapses ?? 0) + 1
  next_due_at = now + interval * 1day
```

### 시도 hook

기존 `recordProblemAttempt`(`app/features/study/queries.server.ts`) — `user_problem_attempts` insert 직후 `applyProblemSrsUpdate(client, userId, problemId, isCorrect)` 호출. 실패해도 attempt 흐름은 진행(best-effort, console.error).

### 화면

**`/study/srs`** — 학습관리 영역 게이트.
- 헤더: 오늘 due 카운트 / 지난 7일 학습 / 학습 시작 버튼
- 표: due 항목들 (problem snippet · 과목 · 마지막 시도일 · reps/lapses)
- 행 클릭 → 그 문제 viewer 로 진입

### 데일리 메뉴 통합 (feat-2-009)

`pickWeakProblem` 을 **`pickSrsDue` 우선 + fallback weak areas** 로 재구성:
- SRS due 항목이 있으면 → `srs_due` 슬롯 (high priority)
- 없으면 → 기존 `getWeakAreas` top1 (legacy weak_problem)

슬롯 kind 는 `weak_problem` 유지(소비자 호환), title 만 SRS 경우 "복습 due" 로.

## Layer 3. Code

- `app/features/study/lib/srs.ts` — 순수 알고리즘 `computeNextSrsState(prev, isCorrect)`. 클라/서버 공용.
- `app/features/study/srs.server.ts` — `applyProblemSrsUpdate` / `getDueProblems` / `getSrsCounts`.
- `app/features/study/queries.server.ts` `recordProblemAttempt` — insert 직후 SRS hook 호출.
- `app/features/study/daily-menu.server.ts` `pickWeakProblem` — SRS due 우선 + fallback.
- `app/features/study/screens/srs.tsx` — `/study/srs` 화면.
- `app/routes.ts` — `/study/srs` 등록.
- 네비 — 학습관리 dropdown "오늘의 학습 메뉴" 옆 또는 학습보조 dropdown 1번째.

## 후속

- v1.1: 빈칸 SRS — `user_blank_srs` 테이블 + blank_due 슬롯 SRS화.
- v1.2: 운영자 분석 — SRS 학습 효과 측정 (정답률 추이 vs SRS 미사용 cohort 비교).
- v1.3: 학생 SRS heat map (요일/시간대별 due 분포).
