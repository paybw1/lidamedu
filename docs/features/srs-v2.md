# SRS v2 — 능동 카드 플래시카드 SRS

> 학생 효과 테스트(공식 오픈 전) 용 명시적 회상 SRS. 기존 자동 SRS
> (feat-2-010~016) 와 **병행**.

## TL;DR

- 풀 SM-2 (q 0~5 · EF 변동 · repetitions) — 단위 테스트 14건 모두 통과
- 4-grade 채점 UI (`Again=0` · `Hard=3` · `Good=4` · `Easy=5`) + 키보드 단축키
- 분석용 `review_logs` (prev/new interval·EF·state · elapsed_ms · source_type · cohort_id)
- `SRS_FAKE_TODAY` 환경변수 — 시간 흐름 시뮬레이션 (E2E 검증 완료)
- 학생 그룹 게이팅 미구현 — `cohort_id` 컬럼만 자리 확보 (오픈 후 활용)

## 추가/변경한 파일

| 경로 | 역할 |
|---|---|
| `app/features/srs/lib/scheduler.ts` | SM-2 순수함수 `scheduleNext(state, q, now?)` + `SrsScheduler` 인터페이스(FSRS 교체 대비) |
| `app/features/srs/lib/scheduler.test.ts` | Vitest 14 케이스 — 신규/실패/연속성공/EF clamp/relearning 복귀/순수성 |
| `app/features/srs/srs.server.ts` | `srsNow`·`srsToday`(FAKE_TODAY) · `getUserSettings` · `getReviewQueue` · `submitReview` · `getStats` · `exportLogsCsv` |
| `app/features/srs/api/queue.tsx` | GET `/api/srs/queue` |
| `app/features/srs/api/review.tsx` | POST `/api/srs/review` |
| `app/features/srs/api/stats.tsx` | GET `/api/srs/stats` |
| `app/features/srs/api/export.tsx` | GET `/api/srs/export?from=&to=` (CSV) |
| `app/features/srs/screens/srs-review.tsx` | `/srs` 카드 flip + 4 grade 버튼 + 키보드 단축키 |
| `app/features/srs/screens/srs-stats.tsx` | `/srs/stats` KPI + 30일 막대 + 7일 forecast + CSV 다운로드 |
| `scripts/srs/seed-items.ts` | 과목별 N개 `srs_items` 자동 생성 (articles → qa 카드) |
| `scripts/srs/demo-fake-today.ts` | SRS_FAKE_TODAY 시간 시뮬레이션 E2E |
| `vitest.config.ts` | unit test 설정 (~/* alias + Node 환경) |
| `app/routes.ts` · `app/core/components/navigation-bar.tsx` · `package.json` | 라우트·nav·script 등록 |

**마이그레이션 4건** (Supabase MCP `apply_migration` 적용):

| 이름 | 내용 |
|---|---|
| `srs_v2_items_states_logs` | 4 테이블(`srs_items`·`srs_review_states`·`srs_review_logs`·`srs_user_settings`) + 2 enum(`srs_item_type`·`srs_state`) + RLS |
| `srs_record_review_rpc` / `_fix_isstaff` / `_nullable_defaults` | state upsert + log insert 원자 실행 RPC (security definer + auth.uid 가드) |

Rollback SQL 은 각 마이그레이션 comment 에 명시.

## 새 API

### `GET /api/srs/queue`

오늘의 큐. 응답:
```json
{
  "today": "2026-06-01",
  "items": [{
    "itemId": "...", "kind": "due"|"new",
    "subject": "patent", "topic": "...", "type": "qa",
    "front": "...", "back": "...", "lawRef": "patent#29",
    "sourceType": "article",
    "state": "review"|null, "dueDate": "...", "intervalDays": 6, "repetitions": 2, "easeFactor": 2.5
  }],
  "dueCount": 3, "newCount": 20, "newIntroducedToday": 0,
  "settings": { "newPerDay": 20, "maxReviewsPerDay": 200 }
}
```

### `POST /api/srs/review`

body (JSON 또는 form):
```json
{ "itemId": "uuid", "grade": 4, "elapsedMs": 2500 }
```
응답:
```json
{ "ok": true, "result": { "itemId": "...", "newState": "review", "newInterval": 6, "newDueDate": "2026-06-08", "newEf": 2.5, "newReps": 2, "newLapses": 0 } }
```

### `GET /api/srs/stats`

```json
{
  "totalItems": 60, "totalReviewed": 120, "totalSuccess": 105, "retentionPct": 87.5,
  "byDay": [{ "date": "2026-05-01", "reviewed": 5, "success": 4 }],  // 30일
  "forecast7d": [{ "date": "2026-06-01", "dueCount": 8 }]
}
```

### `GET /api/srs/export?from=YYYY-MM-DD&to=YYYY-MM-DD`

CSV (UTF-8 + BOM), 14 컬럼:
`log_id, user_id, item_id, reviewed_at, grade, prev_interval, new_interval, prev_ef, new_ef, prev_state, new_state, elapsed_ms, source_type, cohort_id`

## 학생 테스트 시작 방법

### 1) 시드
```bash
npm run srs:seed             # 과목당 30개
npm run srs:seed -- --per-subject=50
```
- `articles.current_revision_id` 있는 조문에서 자동 변환
- 멱등 — 같은 `(source_type, source_id)` 는 skip

### 2) 학생 사용 흐름
- 상단 nav 학습관리 ▾ → **플래시카드 (SRS v2 베타)**
- `/srs` 카드 → "정답 보기" (Space) → 4 grade (1/2/3/4)
- `/srs/stats` 통계 + CSV 다운로드

### 3) `SRS_FAKE_TODAY` (QA 전용)
```bash
# 로컬 개발 서버
SRS_FAKE_TODAY=2026-06-15 npm run dev
# 또는 .env 에 SRS_FAKE_TODAY=2026-06-15 추가
```
- `srsNow()` / `srsToday()` 가 그 날짜의 KST 자정 반환
- **프로덕션에서는 반드시 비활성(env 미지정)**
- E2E 시뮬레이션: `npm run srs:demo` — 자동 사용자 생성 → 3개 day 시뮬레이션 → 통계·CSV 출력 → 사용자 cleanup

### 4) cohort 태깅 (오픈 후 활용)
- `srs_review_states.cohort_id` · `srs_review_logs.cohort_id` 컬럼 자리 확보
- 게이팅 로직은 미구현. 향후 effect 측정 시 admin 화면에서 그룹 배정 가능

## 로그 분석 방법

CSV 다운로드 → 분석 도구(Excel/Python/R)에서 통계.

**핵심 지표**:
- `retention_rate` = `count(grade>=3) / count(*)` per (user, day)
- `interval_growth` = 사용자별 평균 `new_interval / prev_interval` (q≥3 만)
- `lapse_rate` = `count(grade<3) / count(*)` — 망각 빈도
- `effort` = 평균 `elapsed_ms` — 회상 속도 추이
- `source_type` 별 retention — 어떤 콘텐츠 origin 이 가장 잘 외워지는지

**오픈 후 cohort 분석** (게이팅 추가 시):
```sql
SELECT cohort_id,
       COUNT(*) FILTER (WHERE grade >= 3)::float / COUNT(*) AS retention,
       AVG(elapsed_ms) AS avg_effort_ms
FROM srs_review_logs
WHERE reviewed_at >= '2026-07-01'
GROUP BY cohort_id;
```

## 알고리즘 (Simplified SM-2)

```
입력: state{ef, interval, reps, lapses, state}, grade q (0~5)

if q < 3:  // 실패
  reps = 0, interval = 1, lapses += 1, state = relearning
else:  // 성공
  if reps == 0:   interval = 1
  elif reps == 1: interval = 6
  else:           interval = round(prev_interval * ef)  // max 90 (안전 cap 없음 — 실험)
  reps += 1, state = review

ef = max(1.3, ef + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)))
due_date = today + interval
```

**EF 변화 표** (성공·실패 공통):
- q=0 → -0.8 · q=1 → -0.54 · q=2 → -0.32 · q=3 → -0.14 · q=4 → 0 · q=5 → +0.1

FSRS 등 다른 알고리즘으로 교체 시 `SrsScheduler` 인터페이스만 맞추면 됨.

## 실측 E2E 검증 (2026-05-30 실행)

```
Day 1 (2026-06-01): 3 카드 → [Good(4), Easy(5), Again(0)]
  → 모두 due 2026-06-02 (interval 1d)
  → states {review, review, relearning} / EF {2.5, 2.6, 1.7}

Day 2 (2026-06-02): 3 due 카드 + 20 new 큐 → 3 카드 [Good, Good, Good]
  → 1·2 (rep 1→2): interval 6 → due 2026-06-08
  → 3 (rep 0→1, relearning→review): interval 1 → due 2026-06-03

Day 8 (2026-06-08): 3 due → 2 카드 [Good, Good]
  → 1 (rep 1→2): interval 6 → due 2026-06-14
  → 2 (rep 2→3): interval round(6 * 2.5) = 15 → due 2026-06-23

최종 통계:
  보유 3 · 누적 8 복습 · 성공 7 · 유지율 87.5%
  Day 23 forecast: due 1 ✓ (Day 8 의 둘째 카드)

CSV: 8 행 + 헤더 = 9 행. 14 컬럼 모두 채워짐 (BOM + UTF-8).
```

## 향후

- `cohort_id` 게이팅 활성화 (오픈 후) — 학생 그룹별 학습 효과 측정
- FSRS-4.5 등 신규 알고리즘 swap (interface 만 유지)
- 다른 source_type (`'case'`, `'problem'`) 자동 시드
- 카드 manual 작성 UI (현재는 staff 가 SQL 또는 seed-items 만 가능)
