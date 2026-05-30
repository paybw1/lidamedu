# feat-2-009 — 오늘의 학습 메뉴 (`/study/today`)

## 한 줄 요약
학생이 로그인하자마자 "오늘 뭐 할까" 없이 곧장 학습 시작할 수 있도록, 본인의 약점·미열람·진도 격차·과제를 매일 자동으로 5~7 항목의 **구체적인 학습 큐**로 합성해 단일 화면에 노출.

## 동기

학습관리 영역에는 이미 풍부한 도구가 있지만(`/goals`, `/study/stats`, `/assignments`, 학습보조 5개, 합격자 비교), **하루치 액션으로 합성되지 않는다**.

- 약점 데이터(`getWeakAreas`), 합격자 평균(`getPasserBenchmarks`), D-day 권장(`getRecommendedDailyProgress`), 미완 과제(`assignment_submissions`) 가 분산.
- cohort curriculum (feat-7-020~021) 은 운영자가 짠 트랙 — cohort 미가입 학생에겐 적용 안 됨.
- 기존 `RecommendedAction` (feat-8-013) 은 *카테고리 단위*("약점 학습 시작"). 학생은 어느 조문/문제로 들어가야 할지 또 결정해야 함.

**feat-2-009 = "구체적인 N개의 학습 단위" 자동 추천**. RecommendedAction 위 layer 가 아니라 보완(콘크리트 학습 단위 picker).

## Layer 1. Judgment

| 체크 | 답변 |
|---|---|
| 시스템이 동작하려면 필요한가? (YAGNI) | 학습관리 메뉴 자체는 동작함. 본 기능은 **학생 시작 마찰 제거** 목적의 가산 가치 |
| 더 단순한 대안? (KISS) | RecommendedAction 확장 — 그러나 카테고리 vs 콘크리트 학습 단위는 본질적으로 다른 stream |
| 같은 의미·소유자·축? (DRY) | 일부 데이터(WeakAreaItem) 재사용. 합성 로직은 신규 — 픽 단위가 조문/문제/판례라 별도 |
| 클라이언트만 보장? | 서버 합성 — `composeDailyMenu` server fn |

→ **GO**

## Layer 2. Structure

### 데이터 흐름
```
[기존 데이터 소스]
  getWeakAreas        — 본인 약점 문제 5개
  listWrongAttempts   — 최근 오답
  getRecommendedDailyProgress — D-day 기반 권장
  cases (importance≥3, no study_session) — 미열람 중요 판례
  articles (importance≥3, no study_session) — 미열람 중요 조문
  article_blank_sets — 본인 미시도 빈칸
        ↓
  composeDailyMenu(userId, kstDate)
        ↓ (5~7 슬롯 선정 + 우선순위)
  DailyMenuItem[]
        ↓ (snapshot 1일 1회 upsert)
  user_daily_recommendations  (jsonb items)
        ↓
  /study/today 화면 — 카드 리스트
        ↓
  각 카드 "시작" → 기존 학습 화면(조문/문제/빈칸 등)
        ↓
  학습 결과는 기존 user_problem_attempts / study_sessions 에 기록
        (별도 완수 추적 테이블 없음 — 기존 진도 데이터로 충분)
```

### 슬롯 (v1 5종)

| Slot | 데이터 source | 추천 항목 | 예상 분 |
|---|---|---|---|
| `weak_problem` | `getWeakAreas` top 1 (최근 오답 중 글로벌 정답률 최하) | 1 문제 재시도 | 3분 |
| `weak_article` | 약점 문제의 `primary_article_id` 중 미열람 (study_sessions 없음) | 1 조문 학습 | 7분 |
| `unread_case` | 본인 next_exam_year/round 매칭 과목 + `importance ≥ 3` + study_session 없음 + 최근 선고일 | 1 판례 정독 | 5분 |
| `blank_due` | 본인이 시도 안 한 `article_blank_sets` 중 importance 높은 1개 | 1 빈칸 세트 | 5분 |
| `gap_problems` | D-day 권장 일평균 대비 부족 시 — 미풀이 객관식 5문항 (랜덤) | 5 문제 풀이 | 15분 |

총 합 ~ 35분. 슬롯은 데이터 부족 시 비어 있을 수 있음(예: 약점 없으면 weak_problem 생략).

### DB

```sql
create table public.user_daily_recommendations (
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_date date not null,        -- KST 자정 기준
  items jsonb not null default '[]'::jsonb, -- DailyMenuItem[]
  generated_at timestamptz not null default now(),
  viewed_at timestamptz,
  primary key (user_id, recommendation_date)
);
-- RLS 본인 R/W.
```

### TypeScript

```ts
export type DailyMenuKind =
  | "weak_problem"
  | "weak_article"
  | "unread_case"
  | "blank_due"
  | "gap_problems";

export interface DailyMenuItem {
  kind: DailyMenuKind;
  title: string;        // 카드 제목
  body: string;         // 한 줄 이유
  ctaLabel: string;     // "이 문제 풀기" / "조문 읽기"
  ctaUrl: string;       // 학습 화면 deep link
  estimatedMinutes: number;
  priority: "high" | "medium" | "low";
  metadata: Record<string, unknown>; // kind-specific (problem_id 등)
}
```

### 캐싱

- `/study/today` loader 가 `composeDailyMenu(userId, KST_today)` 호출.
- 같은 user + date snapshot 이 있으면 그대로 반환 — 하루 한 번 픽 고정 (학습 중간에 추천이 사라지는 것 방지).
- 사용자 새로고침 시 같은 카드. 다음 KST 자정 후 재진입 시 신규 픽.

## Layer 3. Code

- `app/features/study/lib/daily-menu.ts` — `DailyMenuItem` 타입, kind enum (클라이언트 공용).
- `app/features/study/queries.server.ts` — `composeDailyMenu` 추가 (또는 별도 `daily-menu.server.ts`).
- `app/features/study/screens/today.tsx` — `/study/today` 화면.
- `app/routes.ts` — `/study/today` 등록.
- 네비/대시보드 진입점 — 대시보드 `RecommendedActionsCard` 옆 or 상단 nav 학습관리 dropdown 에 "오늘 메뉴" 추가.

## 후속 (v1 이후)

- v1.1: 추천 항목 실행률 분석 — `viewed_at` + 다음 날 시점에서 `study_sessions` 매칭 → "어제 추천 5개 중 N개 완수" 통계.
- v1.2: SRS 슬롯 추가 (`feat-2-010` B 트랙). 빈칸/문제 spaced repetition 큐 통합.
- v1.3: cohort 멤버라면 `getCurrentWeekTrack` 항목을 슬롯 1개로 자동 흡수.
