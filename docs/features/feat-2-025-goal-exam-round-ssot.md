# feat-2-025 — 시험 차수 SSOT 일원화(profiles) + 목표→추천 연결 + D-day 폴백 제거

> 상태: ✅ Phase 1 + ① + Phase 2(DROP) + Phase 3(D-day 폴백) 완료·운영 반영(2026-06-18)
> 결정(사용자): 1.(b) profiles로 차수 SSOT·`study_goals.exam_type` 제거 / 2. 차수 필터부터 / 3. D-day 폴백 제거 / 4. 진도 정의 현행 유지.
> 추가 지시(2026-06-18): Phase 1 에 **① 신규 유저 next_exam_round 보장** 동봉 / Phase 2 dry-run 은 **② 발산 행** 기준 보고.
> 핵심: 차수가 `study_goals.exam_type`(write-only)·`profiles.next_exam_round`(파이프라인) 이중 저장·미동기화 → **profiles 단일화**.

---

## 1. exam_type 사용처 감사 (★신중 확인 — write-only 맞음)
| 위치 | 동작 |
|---|---|
| `goals/queries.server.ts:31,40,62` | getStudyGoals select·매핑 / upsertStudyGoals 저장 |
| `goals.tsx:97,118,130,467-468` | zod·action 파싱·폼 select `defaultValue={goals.examType}` |
| `onboarding/welcome.tsx:156` | step3 `upsertStudyGoals({examType:"first"})` — **하드코딩** |
| 그 외 | **없음** (추천·예측·cron·대시보드 전부 `exam_type` 미참조 — grep 0) |

→ `exam_type` 은 **/goals 폼에 되비추는 것 외 아무 동작도 안 한다**. 제거해도 동작 변화 없음(안전). 차수의 실제 권위는 `profiles.next_exam_round`(`exam_round` enum first/second).
- 쓰는 헬퍼 = `setNextExamPlan(client,userId,{nextExamYear,nextExamRound})`(`exam-results/queries.server.ts:267`, profiles update). 온보딩 step1·`/me/exam-results`가 사용.
- 읽는 곳 = `daily-menu.pickGapProblems`(`:372` 차수→과목), pass-predict(`dashboard:147`).

## 2. 설계 — 단계별

### Phase 1 — 차수 SSOT 배선 (코드만, 컬럼 유지) ★먼저
**목표**: /goals 가 차수를 `profiles.next_exam_round`에 읽고/쓰게 → 차수 필터(gap_problems) 자동 작동. 컬럼은 아직 안 지움(안전).
- `goals.tsx` loader: `getStudyGoals` + **profiles `next_exam_round`·`next_exam_year` 조회** 추가.
- `goals.tsx` 폼 select `defaultValue` = `profiles.next_exam_round`(← study_goals.examType 대신).
- `goals.tsx` action: `upsertStudyGoals(...)`(examType 인자 제거) + **`setNextExamPlan(client,userId,{ nextExamYear: <기존 값 유지>, nextExamRound: 선택값 })`**.
  - year = 이번 범위(차수)에선 **기존 next_exam_year 유지**(loader에서 읽어 그대로 전달). 시점(year) 중복은 별도(§4 결정 2).
- `goals/queries.server.ts`: `StudyGoals`·`getStudyGoals` select·`upsertStudyGoals` 입력·`DEFAULT_STUDY_GOALS` 에서 **examType 제거**(컬럼은 아직 select 안 하면 됨 — DROP 전이라도 select 목록에서 빼면 안전).
- `welcome.tsx:153` step3: `upsertStudyGoals` 호출에서 `examType` 제거(온보딩 차수는 step1 `setNextExamPlan`이 이미 설정).
- **효과**: /goals 에서 1·2차 바꾸면 즉시 `profiles.next_exam_round` 갱신 → **gap_problems 추천 과목이 바로 반영**(차수 필터 = 추가 코드 없이 작동). typecheck.

#### ① 신규 유저 차수 보장 (Phase 1 동봉 — 완료)
- 라이브 트리거 `handle_new_user` 는 profiles INSERT 시 `next_exam_round` 를 **생략** → 신규 프로필이 NULL 차수로 생성(SSOT 빈 칸). null 이면 `pickGapProblems` 가 암묵적으로 1차로 폴백(깨지진 않으나 불명시적).
- **조치**: `profiles.next_exam_round` 컬럼 **DEFAULT `'first'`** 추가(`scripts/sql/20260618_profiles_next_exam_round_default.sql`). 트리거가 컬럼을 생략하므로 모든 생성 경로가 비-NULL 차수를 갖는다. 기존 행 무변경(추가·비파괴), 롤백 파일 동봉.
- 적용·검증(2026-06-18, 운영 mcgdoplo): `column_default = 'first'::exam_round`, `is_nullable=YES`(기존 null 행 허용 유지). db:typegen 무변경(DEFAULT 는 생성 타입에 미반영 — Insert 는 이미 optional).

**Phase 1 완료 — 변경 파일**: `goals/queries.server.ts`(examType 전부 제거), `goals/screens/goals.tsx`(loader profiles 차수 조회·폼 `examRound`·action `setNextExamPlan`+year 보존), `onboarding/screens/welcome.tsx`(step3 examType 인자 제거), 마이그레이션 1건(① DEFAULT). typecheck 통과.

### Phase 2 — 마이그레이션 (exam_type 컬럼 제거) ✅ 완료(2026-06-18)
- 적용: `scripts/sql/20260618_drop_study_goals_exam_type.sql`(+ rollback) → 운영 mcgdoplo `DROP COLUMN`. 검증: study_goals 컬럼 = user_id·exam_date·weekly_goal_hours·target_score·notes·updated_at(exam_type 제거). `npm run db:typegen` → database.types.ts 3줄 삭제(study_goals Row/Insert/Update)·드리프트 0. typecheck 통과.
- 백필 UPDATE = **미실행**(dry-run 0행, no-op). 선행 조건 충족: Phase 1(465dbf7) 운영 배포로 서빙 코드가 exam_type 미참조(전수 grep 확인 — 잔여는 생성 타입·시드 스크립트뿐, 시드도 정정).

> **dry-run 결과(2026-06-18, 운영 mcgdoplo · ② 발산 행 기준)** — study_goals 8행(orphan 0):
> | exam_type | next_exam_round | 행 |
> |---|---|---|
> | first | (null) | 2 |
> | first | first | 5 |
> | first | second | 1 |
>
> - `exam_type='second'` = **0행** → **백필 대상 0(no-op)**. 아무도 /goals 에서 2차를 고른 적 없음(예상대로 write-only).
> - 발산 행 = **3** (null 2 + second 1). 셋 다 백필 불필요·무해:
>   - null 2행: profiles 미설정(=1차 폴백)·exam_type 'first' → 의도 일치(1차). ①으로 신규는 'first' 보장, 기존 null 은 그대로 1차 동작.
>   - second 1행: 온보딩 step1 에서 **명시적으로 2차 선택**(profiles='second')했으나 step3 가 exam_type='first' 하드코딩 → **구 /goals 가 이 유저를 '1차'로 오표시**하던 버그. Phase 1 으로 /goals 가 profiles 를 읽으면서 **자동 교정(2차로 정상 표시)**. DROP 으로 잃는 것 없음.
> - **결론**: 백필 UPDATE 불필요(0행). Phase 2 = 사실상 `DROP COLUMN` 단독 + typegen. 2차 데이터 소실 위험 0.

Phase 1 배포로 코드가 exam_type 을 더는 읽지/쓰지 않게 된 뒤:
- **데이터 이전(신중)**: 온보딩이 `exam_type='first'` 하드코딩이라 `'first'`는 "기본값/의도" 구분 불가 → **`'second'`만 의도된 선택**(/goals 에서만 가능). 권고:
  `UPDATE profiles p SET next_exam_round='second' FROM study_goals g WHERE g.user_id=p.profile_id AND g.exam_type='second' AND p.next_exam_round IS DISTINCT FROM 'second';`
  (deliberate 2차만 반영. `'first'` 일괄 backfill은 온보딩 'second'를 덮을 위험 → **금지**.)
- **dry-run**: 위 UPDATE 대상 수 + 영향 사용자 먼저 카운트·보고 → 승인 후 적용.
- **스키마**: `ALTER TABLE study_goals DROP COLUMN exam_type;` (마이그레이션) → `npm run db:typegen`.
- ★ 엣지: 온보딩 'first' + /goals 'second' 였던 사용자는 backfill로 second 반영. 온보딩 'second' 인데 /goals 미변경(=exam_type 'first' 하드코딩)인 사용자는 **그대로 second 유지**(backfill 조건이 건드리지 않음).

### Phase 3 — D-day 폴백 제거 ✅ 완료(2026-06-18)
- `dashboard.tsx`: `EXAM_DATE_FALLBACK_ISO="2026-07-23"` 상수 제거, `examDateIso = goals.examDate`(이제 `string | null`).
- `dash-header.tsx`: `DashHeaderData.examDateIso: string | null`, dDay 계산은 examDateIso 있을 때만(없으면 0). 배지 렌더 분기 — `goalsConfigured && examDateIso` 면 D-day+시험일(기존), 아니면 **가짜 D-day 숨기고 "시험 D-day / 시험일 설정하기 →"(/goals 링크)**. 틀린 D-day보다 정직.
- `/goals` KPI는 이미 examDate null 시 D-day 숨기고 안내(`goals.tsx`) — 변경 불필요. typecheck 통과.
- ★ **남은 하드코딩(이번 범위 밖, 플래그)**: 배지 eyebrow `"변리사 1차"`(dash-header.tsx)·`user.cohort:"27기 · 1차 준비"`(dashboard.tsx) 는 여전히 "1차" 고정 → 2차 수험생에 오표시. 차수(`next_exam_round`)·cohort 실데이터로 치환은 별도 소과제(round 를 loader return·DashHeader prop 까지 배선 필요).

### 범위 밖(이번)
- #4 진도 정의(방문·시도 비율) 현행 유지.
- 차수 필터를 discovery 슬롯(unread_case·weak_article)까지 확장 = 차수 작동 확인 후 단계적(§4 결정 3).
- 시점(year) 중복(`study_goals.exam_date` vs `profiles.next_exam_year`) = 차수 범위 밖, 별도 논의(§4 결정 2).

### 후속 발견 — 2차 객관식 추천 차단 ✅ (별도 커밋 c6f3fbd)
차수→추천 연결을 검증하다 데이터로 확인: **운영 problems 전 2,893문항이 1차 객관식**(2차·주관식 0). 변리사 2차는 주관식/논술이라 2차 수험생에게 `gap_problems`(객관식)는 차수상으로도, 콘텐츠상으로도 이중 무의미. → `pickGapProblems`가 `next_exam_round='second'`면 **null 반환**(1차 동작 무변경, 2차도 조문·판례·암기 SRS 추천은 타 슬롯 유지). 차수→추천의 올바른 동작 = "2차는 객관식 슬롯 제거"(과목 필터가 아님).
- **큰 별도 과제**: 2차(주관식) 연습 콘텐츠 부재 + 민소법 조문·문제 미적재 → 2차 수험생 학습/추천 경험 빈약. 2차 콘텐츠 구축은 독립 로드맵.

## 3. 영향 파일
- `app/features/goals/screens/goals.tsx`(loader profiles 조회·select default·action setNextExamPlan), `goals/queries.server.ts`(examType 제거).
- `app/features/onboarding/screens/welcome.tsx`(step3 examType 인자 제거).
- `app/features/dashboard/screens/dashboard.tsx`(폴백 제거·D-day null 처리).
- 마이그레이션 1건(backfill + DROP COLUMN) + `db:typegen`.
- 추천(daily-menu)·예측·cron = **무변경**(이미 next_exam_round 사용 — SSOT 배선의 수혜자).

## 4. 결정 질문
1. **마이그레이션 backfill** — (a) `'second'`만 반영(deliberate 2차 보존, 안전)〔권고〕 / (b) backfill 없이 DROP만(profiles 온보딩값 유지, /goals 2차 선택 1회 재설정 필요) / (c) 전체 backfill〔위험·비권고〕.
2. **next_exam_year** — (a) 이번엔 손대지 않음(차수만)〔권고〕 / (b) /goals 의 exam_date 연도로 next_exam_year 도 동기화(시점까지 일원화).
3. **차수 필터 범위** — (a) gap_problems만(SSOT 배선으로 자동)〔권고: 최소·즉효〕 / (b) discovery 슬롯까지 확장.
4. **단계 순서 확인** — Phase 1(배선) → 라이브 차수 작동 확인 → Phase 2(마이그·dry-run) → Phase 3(폴백). 이대로 OK?

> 권고: 1-(a)·2-(a)·3-(a)·4 그대로. Phase 1부터 착수하면 차수가 즉시 작동하고, 컬럼 제거(Phase 2)는 dry-run 보고 후 안전하게.
