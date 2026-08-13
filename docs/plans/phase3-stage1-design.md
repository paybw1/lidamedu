# Phase 3 Stage 1 — 스키마 설계 및 dry-run

> 작성일: 2026-08-13 · **본 단계 코드·스키마·데이터 변경 0건** (dry-run 문서)
> 선행: `phase3-stage0-recheck.md` + Stage 0 승인(확인 3건 승인·1-2 비율 확장·1-3 시험지 단위 지정)
> 신설 feature 모듈: `app/features/study-plans/` (labels.ts = 클라이언트 안전 상수·타입 SSOT / queries.server.ts / screens / api)

## 0. 승인 반영 요약

| 승인 | 반영 |
|---|---|
| 1-1 | `plan_checkpoints` → **`study_plan_checkpoints`**. 신설 6테이블 전부 `study_*`/`student_*` |
| 1-2 | tier 판정 = **비율**(정답 수/총 문항): ≥0.7 high / ≥0.4 mid / <0.4 low. `science_score`+**`science_total`** 저장. 경계값 상수 1곳(`study-plans/labels.ts`) |
| 1-3 | **`offline_tests.is_diagnostic boolean NOT NULL DEFAULT false`** — 시험지 편성 시 1회 지정, 성적 저장 시 응시 학생 전원 tier 자동 갱신. 무영향 재확인 완료(§8) |
| 2-1 | resolver는 매핑 유무 무관 동작(unresolved 정직 표시 + `study_logs.lesson_id` 원장으로 소급 재해석). 강의 매핑 채우기 = 운영 작업으로 병행 권고 유지 |
| 2-2 | 수기 입력 UI 1급 취급, `tier_source` 출처 화면 표시 |

## 1. 마이그레이션 SQL 전문 (실행하지 않음 — `scripts/sql/20260814_phase3_study_plans.sql` 예정)

```sql
-- Phase 3 — 진단·월간 계획·승인·기록. 설계 SSOT: docs/plans/phase3-stage1-design.md
begin;

-- ── 1. 진단 — 학생당 1행 (현재 상태) ─────────────────────────────────────────
create table if not exists public.student_diagnostics (
  user_id uuid primary key references public.profiles(profile_id) on delete cascade,
  cohort_id uuid not null references public.cohorts(cohort_id) on delete cascade,
  attempt_type text not null check (attempt_type in ('first', 'repeat')),
  weekday_minutes integer not null check (weekday_minutes between 0 and 1440),
  weekend_minutes integer not null check (weekend_minutes between 0 and 1440),
  note text,
  updated_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.student_diagnostics is
  '오프라인 종합반 초기 진단 — 초시/재시·가용시간. 과욕 지수의 분모(선언 가용시간)';

-- ── 2. 과목별 수준 — (user, kind, code) 1행 ─────────────────────────────────
create table if not exists public.student_subject_status (
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  subject_kind text not null check (subject_kind in ('law', 'science')),
  subject_code text not null,
  lecture_stage text check (lecture_stage in ('none', 'basic', 'advanced', 'complete')),
  science_tier text check (science_tier in ('high', 'mid', 'low')),
  science_score integer check (science_score >= 0),
  science_total integer check (science_total > 0),
  tier_source text check (tier_source in ('manual', 'diagnostic_test')),
  diagnostic_test_id uuid references public.offline_tests(test_id) on delete set null,
  completed_lectures text,
  direction text,
  updated_by uuid references public.profiles(profile_id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, subject_kind, subject_code),
  -- subject_code = offline_tests 의 기존 CHECK 값과 동일 집합 (새 값 금지)
  constraint student_subject_status_code_check check (
    (subject_kind = 'law'
      and subject_code in ('patent', 'trademark', 'design', 'civil', 'civil-procedure'))
    or (subject_kind = 'science'
      and subject_code in ('physics', 'chemistry', 'biology', 'earth_science'))
  ),
  -- 점수는 총 문항과 쌍으로만 (비율 감사 가능성)
  constraint student_subject_status_score_pair check (
    science_score is null or (science_total is not null and science_score <= science_total)
  )
);

-- ── 3. 월간 계획 — 버전 체인 + baseline 동결 ────────────────────────────────
create table if not exists public.study_plans (
  plan_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  cohort_id uuid not null references public.cohorts(cohort_id) on delete cascade,
  period_start date not null,
  period_end date not null,
  version integer not null default 1 check (version >= 1),
  -- v1 = NULL(자기 자신이 루트). v2+ 는 최초 계획을 가리킴 — 준수율 baseline 추적.
  root_plan_id uuid references public.study_plans(plan_id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'revision_requested', 'superseded')),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(profile_id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  baseline_locked_at timestamptz,
  planned_weekday_minutes integer,   -- 승인 시점 진단 가용시간 동결 스냅샷
  planned_weekend_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_plans_period_check check (period_end >= period_start),
  unique (user_id, period_start, version)
);
comment on table public.study_plans is
  '월간 학습계획 — 승인 후 불변, 수정 = 새 version + 기존 superseded. 준수율은 항상 최초 승인(baseline) 기준';

-- ★유니크 2분할 — 단일 파셜 유니크로 묶으면 "v1 approved 유지 중 v2 draft 작성"이
--   insert 시점에 충돌한다(버전 워크플로우 §4 와 모순). in-flight 와 승인본을 분리:
-- in-flight(편집·심사 중)는 (user, period) 당 1개 — v1 이 submitted 인 동안 v2 draft 불가(의도)
create unique index if not exists study_plans_inflight_uniq
  on public.study_plans (user_id, period_start)
  where status in ('draft', 'submitted', 'revision_requested');
-- 승인본도 (user, period) 당 1개 — 새 버전 승인 직전에 기존 승인본 supersede 선행
create unique index if not exists study_plans_approved_uniq
  on public.study_plans (user_id, period_start)
  where status = 'approved';

create index if not exists study_plans_review_queue_idx
  on public.study_plans (cohort_id, status, submitted_at);  -- 승인 큐

create table if not exists public.study_plan_items (
  item_id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans(plan_id) on delete cascade,
  priority integer,                   -- 주말 항목 등 NULL 허용
  title text not null,
  node_id uuid references public.systematic_nodes(node_id) on delete set null,
  lesson_id uuid references public.course_lessons(lesson_id) on delete set null,
  activity_type text not null check (activity_type in
    ('lecture', 'review', 'problem', 'memorize', 'reading', 'essay', 'other')),
  daily_minutes integer not null check (daily_minutes between 1 and 1440),  -- F4 필수
  day_scope text not null check (day_scope in ('weekday', 'weekend', 'all')),
  start_date date not null,
  end_date date not null,
  is_locked boolean not null default false,   -- 승인 시 true (불변 동결)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_plan_items_period_check check (end_date >= start_date)
);
create index if not exists study_plan_items_plan_idx on public.study_plan_items (plan_id);

-- ── 4. 일일 기록 — APPEND ONLY 원장 ─────────────────────────────────────────
create table if not exists public.study_logs (
  log_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  log_date date not null,
  plan_item_id uuid references public.study_plan_items(item_id) on delete set null,
  node_id uuid references public.systematic_nodes(node_id) on delete set null,   -- E1 미분류 허용
  lesson_id uuid references public.course_lessons(lesson_id) on delete set null, -- 소급 재해석 원장
  activity_type text not null check (activity_type in
    ('lecture', 'review', 'problem', 'memorize', 'reading', 'essay', 'other')),
  minutes integer not null,
  source text not null check (source in ('plan_check', 'manual')),  -- 'timer' 는 Phase 4 에서 값 추가
  completion text not null default 'full' check (completion in ('full', 'partial', 'none')),
  node_resolved_from text check (node_resolved_from in ('direct', 'lesson')),
  self_difficulty integer check (self_difficulty between 1 and 5),
  reverses_log_id uuid references public.study_logs(log_id) on delete set null,
  created_at timestamptz not null default now(),
  -- 취소 = 역방향 레코드(음수 분) 한정. 일반 기록은 양수만.
  constraint study_logs_reversal_sign check (
    (reverses_log_id is null and minutes between 1 and 1440)
    or (reverses_log_id is not null and minutes between -1440 and -1)
  )
);
comment on table public.study_logs is
  '오프라인 학습시간 원장 — append only(UPDATE/DELETE 없음). 취소는 reverses_log_id + 음수 분';
create index if not exists study_logs_user_date_idx on public.study_logs (user_id, log_date);
create index if not exists study_logs_item_idx on public.study_logs (plan_item_id)
  where plan_item_id is not null;
create index if not exists study_logs_node_idx on public.study_logs (node_id)
  where node_id is not null;          -- E1 분석 격리 쿼리 전용
-- 이중 취소 방지 — 한 로그는 한 번만 뒤집힌다.
create unique index if not exists study_logs_reversal_uniq
  on public.study_logs (reverses_log_id) where reverses_log_id is not null;

-- ── 5. 격주 체크포인트 — 스냅샷 (superseded 후 재계산 불가 → 저장) ──────────
create table if not exists public.study_plan_checkpoints (
  checkpoint_id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans(plan_id) on delete cascade,
  checkpoint_date date not null,
  planned_minutes_to_date integer not null,
  actual_minutes_to_date integer not null,
  item_breakdown jsonb not null default '[]'::jsonb,  -- [{itemId,title,plannedMin,actualMin,fullDays,expectedDays}]
  note text,
  created_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (plan_id, checkpoint_date)   -- 지연 생성 멱등 키
);

-- ── 6. offline_tests — 진단 테스트 지정 (승인 1-3) ──────────────────────────
alter table public.offline_tests
  add column if not exists is_diagnostic boolean not null default false;
comment on column public.offline_tests.is_diagnostic is
  '자연과학 진단 테스트 — true 인 시험의 성적 저장 시 응시 학생 전원 science tier 자동 갱신';

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
alter table public.student_diagnostics enable row level security;
alter table public.student_subject_status enable row level security;
alter table public.study_plans enable row level security;
alter table public.study_plan_items enable row level security;
alter table public.study_logs enable row level security;
alter table public.study_plan_checkpoints enable row level security;

-- staff 전체 (반 소유권은 API 액션 게이트 — offline-tests 와 동일 패턴)
create policy student_diagnostics_staff_all on public.student_diagnostics for all
  to authenticated using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));
create policy student_subject_status_staff_all on public.student_subject_status for all
  to authenticated using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));
create policy study_plans_staff_all on public.study_plans for all
  to authenticated using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));
create policy study_plan_items_staff_all on public.study_plan_items for all
  to authenticated using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));
create policy study_logs_staff_select on public.study_logs for select
  to authenticated using (private.is_staff(auth.uid()));   -- staff 도 SELECT 만 (원장 불변)
create policy study_plan_checkpoints_staff_all on public.study_plan_checkpoints for all
  to authenticated using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));

-- 학생 — 진단·수준: 본인 read
create policy student_diagnostics_select_own on public.student_diagnostics for select
  to authenticated using (user_id = auth.uid());
create policy student_subject_status_select_own on public.student_subject_status for select
  to authenticated using (user_id = auth.uid());

-- 학생 — 계획: 본인 read 전체 + write 는 상태 화이트리스트
create policy study_plans_select_own on public.study_plans for select
  to authenticated using (user_id = auth.uid());
create policy study_plans_insert_own on public.study_plans for insert
  to authenticated with check (
    user_id = auth.uid() and status in ('draft')
    and exists (select 1 from public.cohort_members cm
                where cm.cohort_id = study_plans.cohort_id and cm.profile_id = auth.uid())
  );
create policy study_plans_update_own on public.study_plans for update
  to authenticated
  using (user_id = auth.uid() and status in ('draft', 'revision_requested'))
  with check (
    user_id = auth.uid()
    and status in ('draft', 'submitted', 'revision_requested')
    -- cohort_id 재지정으로 타 반 승인 큐 진입 차단 (insert 정책과 동형)
    and exists (select 1 from public.cohort_members cm
                where cm.cohort_id = study_plans.cohort_id and cm.profile_id = auth.uid())
  );
  -- draft/반려 상태에서만 편집. 전이 가능 목적지 = draft·submitted·revision_requested(반려
  -- 상태 유지 편집 허용). approved/superseded 로의 전이는 학생 불가(화이트리스트).

-- 학생 — 계획 항목: 부모 plan 경유, 잠금 전(is_locked=false)·편집 가능 상태에서만 쓰기
create policy study_plan_items_select_own on public.study_plan_items for select
  to authenticated using (
    exists (select 1 from public.study_plans p
            where p.plan_id = study_plan_items.plan_id and p.user_id = auth.uid())
  );
create policy study_plan_items_insert_own on public.study_plan_items for insert
  to authenticated with check (
    is_locked = false and exists (
      select 1 from public.study_plans p
      where p.plan_id = study_plan_items.plan_id and p.user_id = auth.uid()
        and p.status in ('draft', 'revision_requested'))
  );
create policy study_plan_items_update_own on public.study_plan_items for update
  to authenticated
  using (
    is_locked = false and exists (
      select 1 from public.study_plans p
      where p.plan_id = study_plan_items.plan_id and p.user_id = auth.uid()
        and p.status in ('draft', 'revision_requested'))
  )
  with check (
    is_locked = false and exists (
      select 1 from public.study_plans p
      where p.plan_id = study_plan_items.plan_id and p.user_id = auth.uid()
        and p.status in ('draft', 'revision_requested'))
  );
create policy study_plan_items_delete_own on public.study_plan_items for delete
  to authenticated using (
    is_locked = false and exists (
      select 1 from public.study_plans p
      where p.plan_id = study_plan_items.plan_id and p.user_id = auth.uid()
        and p.status in ('draft', 'revision_requested'))
  );

-- 학생 — 기록: SELECT + INSERT 만 (UPDATE/DELETE 정책 자체가 없음 = append only)
create policy study_logs_select_own on public.study_logs for select
  to authenticated using (user_id = auth.uid());
create policy study_logs_insert_own on public.study_logs for insert
  to authenticated with check (
    user_id = auth.uid()
    -- 역방향 레코드는 본인 로그만 뒤집을 수 있다 — 타인 로그의 1회 취소 슬롯
    --   (reversal_uniq) 선점 차단.
    and (reverses_log_id is null or exists (
      select 1 from public.study_logs l
      where l.log_id = study_logs.reverses_log_id and l.user_id = auth.uid()))
    -- 계획 항목 연결도 본인 계획만.
    and (plan_item_id is null or exists (
      select 1 from public.study_plan_items i
      join public.study_plans p on p.plan_id = i.plan_id
      where i.item_id = study_logs.plan_item_id and p.user_id = auth.uid()))
  );

-- 학생 — 체크포인트: 부모 plan 경유 read
create policy study_plan_checkpoints_select_own on public.study_plan_checkpoints for select
  to authenticated using (
    exists (select 1 from public.study_plans p
            where p.plan_id = study_plan_checkpoints.plan_id and p.user_id = auth.uid())
  );

commit;
```

## 2. 롤백 SQL 전문

```sql
begin;
drop table if exists public.study_plan_checkpoints;
drop table if exists public.study_logs;
drop table if exists public.study_plan_items;
drop table if exists public.study_plans;
drop table if exists public.student_subject_status;
drop table if exists public.student_diagnostics;
alter table public.offline_tests drop column if exists is_diagnostic;
commit;
-- 신설 6테이블은 실데이터 0에서 시작하므로 롤백 무손실.
-- is_diagnostic 은 명시 select 12지점 무참조라 drop 도 무영향(§8).
```

## 3. 인덱스 설계 근거 (주 쿼리 = 일일 기록 조회·기간별 집계)

| 인덱스 | 주 쿼리 |
|---|---|
| `study_logs (user_id, log_date)` | 일일 기록 화면(오늘 로그)·기간 집계(달성률: user+date range 스캔) — 두 축을 한 인덱스로 |
| `study_logs (plan_item_id) where not null` | 항목별 달성률·체크포인트 item_breakdown |
| `study_logs (node_id) where not null` | E1 분석 격리(`node_id IS NOT NULL` 전용 쿼리가 파셜 인덱스와 정확히 일치) |
| `study_logs (reverses_log_id) unique where not null` | 이중 취소 방지(제약 겸용) |
| `study_plans_inflight_uniq` + `study_plans_approved_uniq` (파셜 유니크 2분할) | "이번 달 내 계획" 단건 조회 + 유일성 제약 겸용 — 단일 파셜로 묶으면 v1 approved 중 v2 draft 작성이 충돌하므로 분리. **화이트리스트 파셜**(Phase 1 교훈) |
| `study_plans (cohort_id, status, submitted_at)` | 승인 큐(반별 submitted 목록, 제출순) |
| `study_plan_items (plan_id)` | 계획 화면·기대 항목 파생(전 조회가 plan 단위) |
| `study_plan_checkpoints unique(plan_id, checkpoint_date)` | 지연 생성 멱등 upsert 키 |

student_diagnostics/​student_subject_status 는 PK 접근만(추가 인덱스 불요).

## 4. 상태 머신·baseline 동결·버전 규칙

```
draft ──제출──▶ submitted ──승인──▶ approved ──(새 버전 승인)──▶ superseded
  ▲                │
  └──반려(코멘트)──┘ (revision_requested → 학생 편집 → 재제출)
```

- **승인 액션(staff)**: status='approved' + `baseline_locked_at=now()` + `planned_weekday/weekend_minutes` ← 승인 시점 `student_diagnostics` 스냅샷 + 항목 전체 `is_locked=true`. adminClient 불필요 — staff RLS 로 요청 클라이언트 수행, 반 소유권은 액션 게이트.
- **승인 후 수정** = 새 plan 생성(version+1, `root_plan_id`=v1의 plan_id, 항목 복사, status draft) — v1 은 approved 로 유지된 채 v2 draft 가 공존한다(in-flight/approved 유니크 2분할이 이를 허용). v2 승인 순간 **기존 approved 를 superseded 로 먼저 전이한 뒤 v2 를 approved 로** 전이(approved 파셜 유니크가 동시 승인본을 차단). v1 이 아직 submitted(심사 중)면 in-flight 유니크가 v2 draft 생성을 자연 차단(의도된 부수 효과).
- **준수율 baseline**: 지표 계산은 `(user, period)` 의 **최초 승인 버전(root)** 항목을 기준으로 한다 — v2 로 축소해도 분모가 줄지 않는다. root 식별 = `root_plan_id`(NULL 이면 자기 자신).
- **미제출 월**: `(user, period)` 에 approved/submitted 가 없으면 준수율 `null` + `no_plan` 플래그(파생 — 저장 안 함). 자동 승인 없음.
- **체크포인트 생성**: 승인 시점에 격주 지정일 파생(period_start+13일, +27일 — KST date). 저장은 **상담자 화면 로드 시 도래분 지연 생성**(unique 키 upsert-ignore 로 멱등, created_by=해당 staff). 학생 화면은 조회 전용(존재 전이면 실시간 파생 지표만 표시) — 학생 뷰에 쓰기 부작용을 만들지 않는다.

## 5. 파생 계산·훅 설계

- **기대 항목**(일일 기록 선택지): 지시서 §3.2 그대로 — `start_date<=D<=end_date AND day_scope 매칭`(평일/주말 = KST `getUTCDay` 보정). 구현 위치 `study-plans/lib/expected-items.ts`(순수 함수 — 서버·클라 공용).
- **과욕 지수**: `Σ daily_minutes(weekday|all)/weekday_minutes`, 주말 동형. 분모 0 이면 신호 표시 안 함(진단 미입력 안내). 1.0↑ 경고 / 0.9~1.0 주의. 작성 화면은 클라이언트 실시간(로더가 진단 내려줌), 승인 화면은 서버 계산.
- **약점 회피**: `getWeakNodes(client, userId, 계획에 등장한 law 과목들, N=5)` 상위 N 중 계획 node_id 집합에 없는 비율. 계획에 법 과목 항목이 없으면 신호 생략.
- **준수율·달성률·미분류**: 지시서 표 그대로. 시간 합산은 로그 `minutes` 부호 합(역방향 레코드가 자연 상쇄). 분석 격리 = `node_id IS NOT NULL`(약점·마스터리 기여 — Phase 5 에서 실제 합류, 이번엔 지표만). 총 시간엔 무필터.
- **lesson resolver**: `resolvePlanItemNode(lessonId)` — `lesson_node_links` 1쿼리. 있으면 `node_id` 채움 + `node_resolved_from='lesson'`(로그) / 없으면 node NULL + UI "노드 미연결". 계획 저장 시 1회 해석하되 `lesson_id` 원장 보존(로그에도) — 매핑이 나중에 채워지면 소급 재해석 가능.
- **G3 tier 자동 파생 (훅 지점)**: `saveOfflineTestResults` 말미(SRS 적용 뒤) — `test.isDiagnostic && test.scienceSubject` 이면 taken 엔트리별로 `offline_test_answers` 기반 정답 수(`answerRows.filter(is_correct)`, 메모리 재사용 — 추가 쿼리 0)·총 문항으로 tier 산출 → `student_subject_status` upsert(`tier_source='diagnostic_test'`, `diagnostic_test_id`, science_score/total, updated_by=enteredBy). **manual 이었어도 진단이 우선 갱신**(승인 1-3) — 직전 값과 달라지면 반환 요약에 갱신 목록을 실어 화면에 표시(갱신 사실 가시화). absent·온라인 프리필 행도 응시(taken)면 갱신 대상, absent 는 제외.
  - 경계 상수: `SCIENCE_TIER_HIGH_RATIO = 0.7`, `SCIENCE_TIER_MID_RATIO = 0.4` — `app/features/study-plans/labels.ts` 단일 정의(서버·화면 공용).
  - 수기 수정 정책: 수기 저장 시 `tier_source='manual'` 전환, `diagnostic_test_id` 는 참조로 유지.

## 6. 과제 표시 통합 (F3)

계획 화면·일일 기록 화면 로더가 기간 겹침 과제를 조회해 **읽기 전용 카드**(자물쇠)로 병기: `assignments WHERE cohort_id=? AND deleted_at IS NULL AND (target_profile_id IS NULL OR = 학생) AND due_at BETWEEN period` (기존 `listStudentAssignments` 필터 재사용). `study_plan_items` 에 행을 만들지 않으며(P9), 이행률은 `assignment_submissions` 를 그대로 읽어 **별도 지표로 병기**(합산 금지).

## 7. 예상 쿼리 수

| 화면 | 쿼리 | 계 |
|---|---|---|
| 일일 기록 로드 | 활성 plan 1(파셜 인덱스 단건) + items 1 + 당일 logs 1 + 기간 과제 1 | **4** (+auth) |
| 계획 승인 화면 로드 | plan 1 + items 1 + diagnostics 1 + subject_status 1 + 기간 과제 1 + 약점 신호 `getWeakNodes` ≈3~5(skeleton+attempts 페이징+problems 청크, 계획 등장 과목 한정) | **8~10** |
| 성적 저장 tier 훅 | 추가 0(answers 메모리 재사용) + status upsert 1/학생 → 배치 upsert 1 | +1 |

## 8. `offline_tests.is_diagnostic` 무영향 재확인 (승인 조건)

`from("offline_tests")` 읽기 전수 re-grep(2026-08-13): **12지점 전부 명시 컬럼 select, `select('*')` 0건** — series.server(:35·:82·:149), results.server(:92·:171), queries.server(:53·:173·:314), monthly-report(:148), admin/api/offline-test(:71·:198·:302). DEFAULT false 라 기존 행·insert 경로도 무영향. 학생 RLS 는 status 화이트리스트 그대로(신규 컬럼은 노출 조건과 무관).

## 9. 비범위 확인

일간 슬롯 테이블 없음(파생 계산) · 센티넬 노드 없음(E1 nullable) · 타이머/게임화/합산 총시간/4분면 없음 · `source` CHECK 에 'timer' 미포함(Phase 4 에서 CHECK 확장 한 줄).

---

## 승인 요청 (게이트)

1. 마이그레이션·RLS 전문(§1) — 특히 학생 계획 UPDATE 화이트리스트(편집=draft·반려에서만, 전이 목적지=draft·submitted·revision_requested + cohort 멤버십 재검증)와 study_logs 의 UPDATE/DELETE 정책 부재(=append only 강제) + insert 시 역방향·plan_item 소유권 검증
2. **파셜 유니크 2분할**(in-flight / approved) — 초안 단계 자체 검토에서 단일 유니크가 "v1 approved 중 v2 draft 작성"과 충돌함을 발견해 분할했다(§1·§4). v1 심사(submitted) 중 v2 draft 차단은 의도된 부수 효과
3. 버전·baseline 규칙(§4) — root_plan_id 체인, supersede 선행 후 신규 승인
4. 체크포인트 지연 생성 주체 = 상담자 화면 로드(§4) — 학생 뷰 쓰기 부작용 없음
5. G3 훅 = saveOfflineTestResults 말미, absent 제외·taken 전원 갱신·manual 덮어쓰기+가시화(§5)
