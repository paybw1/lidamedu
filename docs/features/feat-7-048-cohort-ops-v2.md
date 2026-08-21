# feat-7-048 — 오프라인 종합반 운영 v2 (진단·계획·공부통계·기록·타이머)

> 입력: `source/종합반운영/오프라인 데이터 수정&추가사항.pdf` (원장, 2026-08-21) + 원장 확인 회신 3건(2026-08-21, §7)
> 선행: feat-7-047 Phase 3 (`docs/plans/phase3-stage1-design.md` · `phase3-completion-report.md`)
> 상태: **Stage A 완료(2026-08-21) — Stage B 승인 대기**

## 0. 무엇을 하는 작업인가

Phase 3 로 종이 상담 루프를 플랫폼에 옮겨 4주 운영해 본 뒤 나온 **사용 피드백 반영**이다. 이미 있는 4개 화면(상담·계획·기록·지표)의 **입력 방식·표시 방식**을 고치고, **‘공부 통계’**와 **‘과목별 타이머’**를 신설한다.

관통하는 요구는 넷이다.

1. **수기 입력을 드롭다운으로** — 나중에 코호트 단위로 집계할 수 있는 데이터로 남기기 위해.
2. **상담자가 계획을 직접 쓸 수 있게** — 지금은 학생이 낸 것을 보고 승인만 가능하다.
3. **시간을 눈으로 보게** — 달력 히트맵 + 일/주/월 통계 + 하루 상세(과목 색 타일, 시각 축). 모바일 우선.
4. **기록 방식은 학생이 고른다** — 과목별 타이머 / 총량 입력 두 갈래(호불호가 갈리는 요소).

곁들여 진행 지표·격주 체크포인트 메뉴는 없애고 ‘공부 통계’ 안으로 접어 넣는다.

### Layer 1 판단

| 항목 | 판단 |
|---|---|
| 드롭다운 전환·시간 표기 통일 | 운영상 필수(데이터 수집 목적이 명시됨) — 진행 |
| staff 직접 계획 편집 | 운영상 필수(상담 1회 완주가 Phase 3 완료 기준인데 반쪽) — 진행 |
| 공부 통계 | 신규 기능. 학생 체류시간·기록률에 직접 작용 — 진행 |
| **과목별 타이머** | Phase 4 로 미뤄뒀던 항목. 원장 결정으로 **이번 범위에 포함**(§7-1) — 단, 총량 입력 방식과 병존하며 마지막 단계로 분리 출시 |
| 스터디 플래너 앱화(PDF 말미 ※) | YAGNI — 이번 범위 아님. 타이머 운영 결과를 보고 재검토 |

---

## 1. 지금 구조 (건드리는 것만)

- 테이블 6종 — `student_diagnostics` / `student_subject_status` / `study_plans` / `study_plan_items` / `study_logs` / `study_plan_checkpoints`.
- **`study_logs` 는 append-only 원장** — UPDATE/DELETE 정책 자체가 없다. 취소는 역방향 음수 레코드. staff 도 SELECT 만(대리 입력 금지 = 확정 정책).
- 승인은 `approve_study_plan` RPC 하나 — supersede→approve→항목 잠금을 원자로 수행. **`status='submitted'` 인 계획만 받는다.**
- 계획 유니크 = 파셜 2분할(in-flight 1개 + approved 1개).
- 상수 SSOT = `app/features/study-plans/labels.ts`, 기대 항목 파생 SSOT = `lib/expected-items.ts`.
- 시간은 **전 구간 ‘분’ 정수**로 저장·계산된다(가용시간 CHECK 0~1440, 과욕 지수 분모, 기대/실제 분).
- `study_logs.source` CHECK = `('plan_check','manual')` — `'timer'` 는 미포함(Stage E 에서 추가).
- `cohorts` 에는 **1차/2차 구분 컬럼이 없다**(Stage A 에서 추가). 개인 단위 차수는 `profiles.next_exam_round`(`first|second`).

---

## 2. 요구서 ↔ 설계 대응표

| PDF 항목 | 설계 | 단계 |
|---|---|---|
| Ⅰ-1 진입 시기(년/월) 추가 | `student_diagnostics.entry_year/entry_month` + 드롭다운 | A |
| Ⅰ-1 가용시간 시/분 입력 | **저장은 분 유지**, 입력만 [시간][분] 2칸 | A |
| Ⅰ-1 시간 표시 전체 통일 | `formatMinutes()` SSOT + 기존 "N분" 문자열 일괄 교체 | A |
| Ⅰ-2 법/과학 분리·드롭다운화 | `basic_course_status` + `study_direction` 신설, 수기 2칸 폐지 | A |
| Ⅰ-2 민사소송법 삭제 | `cohorts.exam_round` 기준 — 1차 반에서만 숨김, 2차 반은 노출 | A |
| Ⅰ-3 상담자 계획 직접 입력·수정 | in-flight 계획 직접 편집 + 대신 제출 → 기존 승인 RPC | B |
| Ⅰ-3 공부 통계(그림1) | 월 히트맵 + 일/주/월 탭 + 날짜 클릭 상세 | C |
| Ⅰ-4·5 진행지표·체크포인트 메뉴 삭제 | **렌더만** 공부 통계 안으로 이동 | C |
| Ⅱ 과목별 색상 지정 | 팔레트 키 + 학생별 오버라이드 테이블 | C |
| Ⅱ 메인 달력 → 공부통계 | `/study/plan` 달력을 히트맵으로 교체 | C |
| Ⅱ 계획 삭제 시 기록 잔존 | §7-2 ① 확정 — 상담자 편집·승인 즉시 반영으로 해소 | B·D |
| Ⅲ 미래 날짜 완료 처리 차단 | 서버 거부 + UI 비활성(열람은 허용) | D |
| Ⅲ 그림2 레이아웃·타일·총합 | **시각 축 + 10분 타일**로 기록 화면 재구성 | D |
| Ⅲ 계획 외 학습 과목 선택 | `subject_kind/subject_code` 축 신설 | C(스키마)·D(UI) |
| §7-1 과목별 타이머 | `study_timer_sessions` + 기록 방식 선택 | E |
| Ⅱ 강의 연결·단원 선택 고도화 | 강의 수강 연동 이후 — 이번 범위 아님 | — |

---

## 3. 설계 결정

### D1. 시간은 분으로 저장하고, 시/분은 입력·표시에서만

`daily_minutes`·`weekday_minutes`·`study_logs.minutes`·기대 항목 계산이 모두 분 정수를 쓴다. 단위를 바꾸면 과욕 지수 분모와 CHECK 제약까지 연쇄로 흔들린다. **DB 는 그대로 두고 경계에서만 변환**한다.

- 입력: `[시간][분]` 2칸 → `h*60+m` 로 합산해 제출(숨김 필드 1개).
- 표시: `formatMinutes(340)` → `"5시간 40분"`, `formatMinutesCompact(340)` → `"5:40"`(달력 셀처럼 좁은 곳).
- 위치: `study-plans/labels.ts` (클라·서버 공용). 하드코딩 `${m}분` 은 전부 교체.

### D2. 진입 시기

`entry_year smallint` + `entry_month smallint check between 1 and 12`, 둘 다 nullable. 날짜 하나로 두지 않는 이유는 ‘일’에 의미가 없어 가짜 정밀도가 생기기 때문이다. 표시는 `2025년 3월 진입 · 재시`, 파생 지표 `수험 개월수 = (현재 연월 − 진입 연월)` 는 저장하지 않고 계산한다.

### D3. 과목별 수준 — 드롭다운 2개로 교체

`student_subject_status` 에 컬럼 2개를 새로 만든다. 기존 수기 텍스트(`completed_lectures`·`direction`)는 **지우지 않고** 폼에서만 내린다(값이 있으면 행 아래 회색 한 줄로 읽기 전용 표시).

```
basic_course_status  ∈ before | done | retake | not_needed
   법과목   : 수강 전 / 수강 완료 / 재수강 필요               (not_needed 미사용)
   자연과학 : 수강 전 / 수강 완료 / 재수강 필요 / 강의 필요 없음
study_direction      ∈ advanced | objective | reading_problem | problem
   법과목   : 심화강의 / 객관식 강의 / 회독+문제풀이
   자연과학 : 심화강의 / 객관식 강의 / 문제풀이
```

CHECK 는 4값·4값 합집합으로 두고, **과목 종류별 허용 집합은 `labels.ts` + zod 에서 강제**한다(DB CHECK 를 kind 조건부로 쓰면 나중에 값 추가가 마이그레이션 지옥이 된다).

- 자연과학 상/중/하(`science_tier`)와 진단 테스트 자동 파생은 **그대로**.
- 법과목의 기존 `lecture_stage`(수강 전/기본강의/심화강의/수강 완료) 셀렉트는 **폼에서 제거** — `basic_course_status` 가 같은 축을 더 정확히 표현한다. 컬럼은 이력으로 남긴다.
- ★유일한 소비처인 `listLevelBasedNodeSuggestions`(계획 빈 상태 폴백)를 `basic_course_status in ('before','retake')` 로 이관한다. 안 옮기면 진단만 입력한 신규 학생의 노드 제안이 조용히 사라진다.
- 백필: `none|basic→before`, `advanced|complete→done`(대상 9명, 다음 상담 1회로 확정). ★`basic`(기본강의 수강 중)을 `done` 으로 넘기면 위 폴백 대상에서 빠진다 — 옛 트리거(`none|basic`)와 새 트리거(`before|retake`)의 대상 집합이 같아야 한다.

### D4. 민사소송법 — 반의 차수로 가른다

과목 목록을 화면에 하드코딩하지 않고 **반 속성으로 파생**한다. `cohorts.exam_round`(`first|second`, 기본 `first`)를 새로 두고, 계획·상담 화면의 법과목 목록을 그 값으로 정한다.

```
first  → 특허 · 상표 · 디자인 · 민법            (민사소송법 숨김)
second → 특허 · 상표 · 디자인 · 민사소송법      (2차 과목 구성)
```

`PLAN_LAW_CODES` 는 `offline_tests` CHECK 값 집합의 미러라 줄이지 않는다. 화면용 파생 함수 `planLawCodesFor(examRound)` 를 `labels.ts` 에 둔다. 값 이름은 개인 단위 차수(`profiles.next_exam_round`)와 맞춘다.

### D5. 과목 축 신설 — 색상·타이머·‘계획 외 학습 과목 선택’의 공통 전제

지금 계획 항목에도 로그에도 **과목 컬럼이 없다**. 법과목은 `node_id → systematic_nodes.law_code` 로 파생되지만, 자연과학과 미분류는 파생할 근거가 아예 없다. 색을 칠하려면, 과목별로 타이머를 재려면 축이 먼저 필요하다.

- `study_plan_items` + `subject_kind`·`subject_code` (nullable — 센티넬 금지, 미분류는 NULL). 저장 시 노드가 있으면 자동 파생, 없으면 사용자가 선택.
- `study_logs` + 같은 두 컬럼 (nullable). **INSERT 시점에만 채운다** — append-only 원장이므로 나중에 UPDATE 로 메우지 않는다. 채우는 순서: 계획 항목 상속 → 노드 파생 → 사용자 선택 → NULL.
- 과거 로그(컬럼 NULL)는 조회 시 `plan_item → node → law_code` 로 파생해 보여준다. 통계는 항상 `저장값 ?? 파생값`.

### D6. 색상 — 팔레트 키만 저장

다크 모드 정합 때문에 hex 를 저장하지 않는다. 팔레트 키 8종(`sky·emerald·violet·amber·rose·teal·orange·slate`)만 저장하고, 렌더는 Tailwind 클래스 맵으로 한다.

- **기본값 고정 매핑** — 아무 설정도 안 한 학생도 색이 나온다(특허 sky / 상표 emerald / 디자인 violet / 민법·민소 amber / 물리 rose / 화학 teal / 생물 orange / 지구과학 slate).
- 오버라이드: `student_subject_colors(user_id, subject_kind, subject_code, color_key)` PK 3열. 계획 버전과 무관하게 유지돼야 하므로 별도 테이블(profiles JSONB 는 검증이 없다).
- 편집 위치: `/study/plan` ‘계획 항목’ 탭 헤더의 색 점 클릭 → 팔레트 팝오버.

### D7. 공부 통계 — 화면 구조

공용 모듈 `app/features/study-plans/components/study-stats/` 하나를 만들어 **학생 화면과 상담 화면이 같은 컴포넌트를 쓴다**(지표가 두 곳에서 갈라지지 않게).

```
lib/study-stats.ts     순수 집계 — 로그[] → { byDate, byWeek, byMonth, bySubject, byHour }
month-heatmap.tsx      월 캘린더. 셀 = 그날 총 시간, 채도 5단계
period-tabs.tsx        일간 / 주간 / 월간 — 총 시간 + 과목별 스택 바 + 직전 기간 대비
day-detail.tsx         그림2 — 좌: 과목별 시간·달성 체크 / 우: 시각 축 타일 그리드
```

- 채도 구간 경계는 상수 SSOT `STUDY_HEATMAP_STEPS = [60, 180, 300, 480]`(분) — 매직 넘버 금지.
- **모바일 우선**: 히트맵은 7열 `aspect-square` 그리드, 기간 탭은 세그먼트 컨트롤, 타일 그리드는 가로 스크롤 없이 축소. PDF 가 명시한 요구.
- 배치
  - 학생 `/study/plan` — 메인 달력을 히트맵으로 교체, 날짜 클릭 → `/study/plan/log?date=…`
  - staff 상담 화면 — ‘이번 달 계획’ 아래 `공부 통계` 섹션 신설. **진행 지표 표와 격주 체크포인트를 이 안으로 옮긴다**(렌더 이동만).
- ★`ensureCheckpoints` 지연 생성은 상담 화면 로더에서 그대로 호출하고, `checkpoint_date` **소급 계산은 손대지 않는다**. 현재 시점 계산으로 바꾸면 스냅샷이 무력화된다.

### D8. 하루 상세 — 시각 축 · 타일 1개 = 10분 (원장 확정)

그림2 그대로 간다. 세로 눈금은 **시각**, 타일 1개는 **10분**, 색은 과목 색.

- 그리드 = 1시간 1행 × 6칸(10분). 표시 범위는 기본적으로 **기록이 있는 최소~최대 시각 ±1시간**, ‘하루 전체 보기’ 토글로 0~24시.
- 시각을 알 수 있는 기록은 타이머(Stage E)와, 총량 입력 중 **시작 시각을 함께 넣은 기록**이다.
- **시각을 모르는 기록**(시작 시각 미입력, 그리고 Stage E 이전의 기존 기록 전부)은 숨기지 않고 그리드 아래 **‘시각 미지정’ 띠**에 같은 색으로 쌓는다. 하루 총합·과목별 시간에는 당연히 포함된다.
- 그래서 총량 입력 폼에는 시작 시각 칸을 하나 둔다 — 기본값 `지금 − 입력한 분`, 비워도 저장된다(§7-1 후속).

### D9. staff 직접 계획 편집

새 승인 경로를 만들지 않는다(뮤테이션 경로 동결). 상담자는 **계획을 편집한 뒤 기존 `approve_study_plan` RPC 로 승인**한다.

- 대상 결정
  1. in-flight(draft/submitted/revision_requested) 가 있으면 **그 행을 그대로 편집** — 파셜 유니크가 in-flight 1개만 허용하므로 새로 만들면 충돌한다.
  2. 승인본만 있으면 `create_revision` 과 동일하게 v+1 draft 를 만들고 편집.
  3. 아무것도 없으면 새 draft 생성.
- ★승인 절차: `approve_study_plan` 은 **`status='submitted'` 인 계획만** 받는다(RPC 본문 `if v_plan.status <> 'submitted' then raise`). 따라서 "저장하고 승인" 은 한 액션 안에서 ① `draft → submitted`(상담자 대신 제출 — `submitted_at`·`authored_by` 기록) → ② 기존 RPC 호출, **두 문장**으로 수행한다. RPC 는 손대지 않는다(승인 경로는 여전히 하나). ①만 성공하고 ②가 실패해도 계획은 `submitted` 라는 정상 상태에 머물러 재시도하면 된다.
- 권한: **adminClient 금지**. 요청 클라이언트 + RLS 정책 신설(반 소유자 또는 manager 이상, `status='approved'` 행은 제외 — 승인본 잠금 유지) + action 게이트.
- 귀속: `study_plans.authored_by`(staff 작성 시 staff id) + `study_plan_items.updated_by`. 학생 화면에 "상담자가 수정함" 표시.
- 학생 통지: 알림 kind `study_plan_updated_by_staff` — ★`kinds.ts` 등록 필수(미등록 시 조용히 누락된다).
- ★**운영 게이트 오염 주의**: `scripts/ops/phase3-gate-metrics.mjs` 의 제출률은 `study_plans.status` 로 센다. staff 가 쓴 승인 계획은 학생 제출이 아니다 — `authored_by IS NOT NULL` 을 분리 집계하지 않으면 4주 게이트 수치의 의미가 측정 중에 조용히 바뀐다.

### D10. 계획을 바꿨을 때 기록 화면 (원장 확정 = §7-2 ①)

기록 화면의 계획 항목은 **승인본 기준**을 유지한다. 즉시 반영은 **상담자 편집·승인 경로(Stage B)로 달성**한다 — 상담 중에 고치면 그 순간부터 학생 화면이 바뀐다.

- 학생이 혼자 v2 를 짜는 동안에는 승인 전까지 v1 항목이 보인다. 이때 기록 화면 상단에 **"새 계획 검토 중 — 승인 전까지 현재 계획으로 기록합니다"** 배너를 띄워, 왜 안 바뀌는지 화면에서 설명한다.
- 이미 **기록된 학습**은 계획 항목을 지워도 남는다(원장이 append-only). 지우는 대신 목록에서 **‘지난 계획’으로 흐리게** 구분한다.

### D11. 기록 방식 — 과목별 타이머 / 총량 입력 (원장 확정 = §7-1)

학생마다 호불호가 갈리므로 **둘 다 만들고 학생이 고른다.**

- 선택값: `student_study_prefs(user_id pk, record_mode ∈ 'timer'|'total')`. 기본 `total`. 화면은 고른 쪽을 크게 보여주고, 반대 방식은 "다른 방식으로 기록" 링크로 항상 열어 둔다(모드가 기능을 잠그지는 않는다).
- **타이머 세션 테이블** `study_timer_sessions` — 진행 중 상태가 필요하므로 원장(`study_logs`)과 분리한다. 세션 행은 UPDATE 가능하고, **종료 시점에 `study_logs` 로 1건 INSERT** 된다. append-only 정책은 그대로 지켜진다.
- 사용자당 **진행 중 세션 1개**(파셜 유니크 `where ended_at is null`). 과목별 타이머란 동시 다중이 아니라 과목을 골라 재는 것이다.
- 시작 지점: 계획 항목 카드에서 시작(항목·과목·노드 상속) 또는 과목 칩에서 시작(과목만).
- 종료 시 `minutes = round((ended_at − started_at − paused_ms)/60000)`, `source='timer'`, `started_at`/`ended_at` 을 로그에 함께 적는다.
- **자정 넘김**: KST 자정을 넘긴 세션은 로그를 **2건으로 쪼개** 각 날짜에 귀속한다(시각 축이 0~24시이므로 쪼개는 것이 맞다).
- **미종료 세션 복구**: 서버리스라 서버가 타이머를 감시하지 않는다. 다음 접속 시 "OO시부터 진행 중인 기록이 있습니다" 배너로 종료 시각을 확인받는다. 단일 세션 강제(학생 last-login-wins)로 다른 기기에서 추방돼 끊긴 경우도 이 배너가 안전망이다.
- **상한**: 단일 세션 12시간. 초과분은 자동 확정하지 않고 사람이 확인한다(과대 기록이 준수율·공부 통계를 왜곡한다).

### D12. 미래 날짜

`add_log` 에서 `logDate > todayKST()` 를 **서버가 거부**하고(400), 카드도 비활성 + 안내 문구. 날짜 **열람**은 과거·미래 모두 유지(PDF 가 날짜 이동은 가능하게 하라고 명시). `reverse_log`(취소)는 제한하지 않는다. 타이머도 같은 규칙 — 시작 시각이 미래인 세션은 만들 수 없다.

---

## 4. DB 변경 (마이그레이션 4개)

**M1 — 진단 · 과목 수준 · 반 차수** (Stage A)

```sql
alter table public.student_diagnostics
  add column if not exists entry_year  smallint check (entry_year between 2000 and 2100),
  add column if not exists entry_month smallint check (entry_month between 1 and 12);

alter table public.student_subject_status
  add column if not exists basic_course_status text
    check (basic_course_status in ('before','done','retake','not_needed')),
  add column if not exists study_direction text
    check (study_direction in ('advanced','objective','reading_problem','problem'));

update public.student_subject_status
   set basic_course_status = case when lecture_stage in ('none','basic') then 'before' else 'done' end
 where basic_course_status is null and lecture_stage is not null;

alter table public.cohorts
  add column if not exists exam_round text not null default 'first'
    check (exam_round in ('first','second'));
```

**M2 — staff 편집 권한·귀속** (Stage B)

```sql
alter table public.study_plans      add column if not exists authored_by uuid references public.profiles(profile_id);
alter table public.study_plan_items add column if not exists updated_by  uuid references public.profiles(profile_id);
-- staff(반 소유자 or manager+) 가 in-flight 계획·항목을 쓰기. approved 행은 제외.
-- 정책 본문은 20260814_phase3_study_plans.sql 의 학생 정책과 같은 형태로 작성.
```

**M3 — 과목 축 · 색상 · 시각** (Stage C)

```sql
alter table public.study_plan_items
  add column if not exists subject_kind text check (subject_kind in ('law','science','other')),
  add column if not exists subject_code text;
alter table public.study_logs
  add column if not exists subject_kind text check (subject_kind in ('law','science','other')),
  add column if not exists subject_code text,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at   timestamptz;
create index if not exists study_logs_subject_idx
  on public.study_logs (user_id, log_date) where subject_code is not null;

create table if not exists public.student_subject_colors (
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  subject_kind text not null check (subject_kind in ('law','science','other')),
  subject_code text not null,
  color_key    text not null check (color_key in
    ('sky','emerald','violet','amber','rose','teal','orange','slate')),
  updated_at timestamptz not null default now(),
  primary key (user_id, subject_kind, subject_code)
);
-- RLS: 본인 R/W + staff SELECT(반 멤버십 스코프)
```

**M4 — 타이머** (Stage E)

```sql
alter table public.study_logs drop constraint if exists study_logs_source_check;
alter table public.study_logs add constraint study_logs_source_check
  check (source in ('plan_check','manual','timer'));

create table if not exists public.study_timer_sessions (
  session_id   uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(profile_id) on delete cascade,
  plan_item_id uuid references public.study_plan_items(item_id) on delete set null,
  node_id      uuid references public.systematic_nodes(node_id) on delete set null,
  subject_kind text check (subject_kind in ('law','science','other')),
  subject_code text,
  activity_type text not null,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  paused_ms    integer not null default 0 check (paused_ms >= 0),
  log_id       uuid references public.study_logs(log_id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists study_timer_sessions_active_uniq
  on public.study_timer_sessions (user_id) where ended_at is null;
-- RLS: 본인 R/W(진행 중 세션 UPDATE 허용) + staff SELECT(반 멤버십 스코프)

create table if not exists public.student_study_prefs (
  user_id     uuid primary key references public.profiles(profile_id) on delete cascade,
  record_mode text not null default 'total' check (record_mode in ('timer','total')),
  updated_at  timestamptz not null default now()
);
```

적용은 `node scripts/run-prod-sql.mjs <file.sql>` → `npm run db:typegen` → `docs/db-schema.md` 갱신.

---

## 5. 단계 — 각 단계 끝에 하드 스톱

### Stage A · 진단 · 과목별 수준 · 반 차수 · 시간 표기 — ✅ 완료 (2026-08-21)

적용: `scripts/sql/20260821_feat7048_stage_a.sql`(운영 반영·typegen 완료) · 검증 `tmp/feat7048-verify/`(3/3 통과, 읽기 전용) · typecheck ✅ · build ✅.
백필 실측: 법과목 2행(`basic→before` 1 · `advanced→done` 1) — 폴백 대상 학생이 이관 후에도 그대로 제안을 받는다.
시간 표기는 `MinutesField`(입력) + `formatMinutes`/`formatMinutesCompact`(표시)로 상담·계획·기록·캘린더 4화면 통일.


- M1 적용
- `labels.ts` — `formatMinutes`/`formatMinutesCompact`, `BASIC_COURSE_STATUS_LABEL`, `STUDY_DIRECTION_LABEL`(kind별 허용 집합), `planLawCodesFor(examRound)`
- `admin/api/study-plan.tsx` — zod 확장(진입 연월, 새 enum 2종, kind별 허용값 검증)
- `admin/screens/admin-student-plan-review.tsx` — 진단 폼(진입 연월 셀렉트·시/분 2칸), 과목 행(드롭다운 2개·수기 2칸 → 읽기 전용 이력), 반 차수에 따른 과목 목록
- 반 편집 화면 — `exam_round` 셀렉트(1차 종합반 / 2차 종합반)
- `study-plans/queries.server.ts` — 새 컬럼 read/write, `listLevelBasedNodeSuggestions` 를 `basic_course_status` 로 이관
- "N분" 하드코딩 스윕 4파일(상담 화면·계획 화면·기록 화면·캘린더)
- 검증: typecheck · build · 폴백 제안이 신규 학생에게 여전히 뜨는지 실측 1건 · 2차 반으로 바꿨을 때 민사소송법이 나타나는지

### Stage B · staff 직접 계획 편집

- M2 적용
- `admin/api/study-plan.tsx` — `ensure_editable_plan`·`upsert_plan_item`·`delete_plan_item`·`save_and_approve`(draft→submitted 후 기존 RPC) intent(RLS 클라이언트 사용, adminClient 금지)
- 상담 화면 — 계획 패널을 읽기 전용 → 편집 가능으로
- 학생 기록 화면 — "새 계획 검토 중" 배너(D10)
- 알림 kind 등록 + 학생 화면 "상담자가 수정함" 표시
- `scripts/ops/phase3-gate-metrics.mjs` — `authored_by` 분리 집계
- 검증: 파셜 유니크 충돌 3케이스(in-flight 있음/승인본만/없음) · 승인본 잠금 유지 · 학생 RLS 로 남의 계획 편집 차단

### Stage C · 과목 축 · 색상 · 공부 통계 ★분량 최대

- M3 적용
- `lib/study-stats.ts`(순수) + `components/study-stats/*` 3종
- `/study/plan` 달력 → 히트맵 교체, 색 팔레트 팝오버
- 상담 화면 — ‘공부 통계’ 섹션 신설, 진행 지표·체크포인트 흡수(렌더 이동만, `ensureCheckpoints` 로직 불변)
- 검증: 집계 순수 함수 단위 테스트(취소 로그 상쇄·미분류 포함) · 모바일 375px 실측 · 체크포인트 소급 값이 이동 전후 동일한지

### Stage D · 오늘 학습 기록 개편 (총량 입력 방식 기준)

- 그림2 레이아웃 — 좌 과목별 시간·달성 체크 / 우 **시각 축 10분 타일** / 하루 총합
- 총량 입력에 시작 시각 칸 추가(비워도 저장 → ‘시각 미지정’ 띠)
- 미래 날짜 서버 거부 + UI 비활성
- 계획 외 학습에 과목 선택 추가
- ‘지난 계획’ 기록 흐리게 구분(D10)
- 검증: 기존 하네스 `tmp/phase3-verify/` 전량 재실행(append-only·RLS 회귀) + 미래 날짜 거부 1케이스 + 시각 미지정 기록이 총합에 포함되는지

### Stage E · 과목별 타이머

- M4 적용
- 세션 시작·일시정지·종료 API(진행 중 1개 제약, 미래 시작 금지, 12시간 상한)
- 계획 항목 카드/과목 칩에서 시작, 진행 중 표시(경과 시간·과목 색)
- 종료 → `study_logs` INSERT(자정 넘김 2건 분할) → 타일 그리드에 시각대로 배치
- 미종료 세션 복구 배너
- 기록 방식 선택 UI(`record_mode`) + 반대 방식 링크
- 검증: 자정 분할 · 미종료 복구 · 추방(단일 세션 강제) 후 복구 · 12시간 상한 · 타이머 기록이 준수율·체크포인트에 정상 반영되는지

---

## 6. 건드리지 않는 것

게임화 · 총 시간 합산 지표 신설 · 일간 슬롯 테이블 · `study_logs` 의 append-only 정책 · 체크포인트 소급 계산 · 준수율 정의(현재 승인본 기준) · 강의↔단원 연결 고도화 · `offline_tests` CHECK 값 집합 · `profiles.next_exam_round`(개인 차수) 의미.

---

## 7. 원장 확인 결과 (2026-08-21)

| # | 질문 | 회신 | 반영 |
|---|---|---|---|
| 7-1 | 타일을 분량으로 그릴지 | **타이머 + 총량 입력 두 방식 모두 구현, 학생이 선택. 타일 1개 = 10분. 세로 눈금은 시각** | D8·D11 / Stage D·E |
| 7-2 | 계획 변경 시 기록 화면 | **① 선택** — 상담자 편집·승인으로 즉시 반영 | D10 / Stage B |
| 7-3 | 민사소송법 | **1차 종합반에서만 숨기고 2차 종합반은 활성화** | D4 / Stage A |

### 7-1 후속 — 총량 입력의 시각

세로축이 시각이므로 총량만 입력한 기록은 놓을 자리가 없다. 총량 입력 폼에 **시작 시각 칸**을 하나 두고(기본값 `지금 − 입력한 분`), 비워두면 그리드 아래 **‘시각 미지정’ 띠**에 쌓는다. 기존 기록도 전부 이 띠로 들어간다(총합에는 포함).

---

## 8. 진행 순서

Stage A → **하드 스톱(보고·승인)** → Stage B → 하드 스톱 → Stage C → 하드 스톱 → Stage D → 하드 스톱 → Stage E → 완료 보고.
