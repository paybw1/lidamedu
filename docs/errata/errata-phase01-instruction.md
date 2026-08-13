# 지시서 — 추록/정오표 시스템 Phase 0(감사) + Phase 1(원장)

> 실행: Claude Code (`C:\project\lidamedu`)
> 대상 DB: Supabase `mcgdoplo` (Seoul)
> **범위: 개정 원장 인프라만. UI·발행·발송·수험생 노출 전부 제외.**

---

## 0. 설계 확정 사항 (v1.1 — 이전 설계서 대비 변경)

임별님 결정 반영 결과입니다. 이전 설계서 §0.2 / §3.2 / §5.2를 아래로 대체합니다.

| # | 결정 | 설계 반영 |
|---|---|---|
| 1 | "원본 반영"은 **책 원고 + 플랫폼 DB 둘 다** | 단일 status 폐기 → **3축 독립 상태 모델** (§0.1) |
| 2 | 검수 **필수 아님** | `notice_status`에서 `pending` 은 선택적 경유. 기본은 `published` 직행 |
| 3 | **최신판만 지원** | 구판 병행 고지 로직 제거. `publication_content_map`은 최신 frozen edition만 유지 |
| 4 | 재채점 **건별 판단** | 자동 재채점 없음. `requires_regrade` 플래그 + dry-run 수동 실행만 |
| 5 | 추록호 **월 1회 원칙 + 운영자 선택** | pg_cron이 매월 1일 **draft 초안만 자동 생성**, 발행은 수동. 수시 발행도 허용 |
| 6 | **원장만 먼저** | 본 지시서 = Phase 1 단독. Phase 2~7 착수하지 않음 |

### 0.1 3축 독립 상태 모델 ★ 핵심 변경

하나의 개정이 세 가지 목적지를 갖고, 각각 시점이 다릅니다.

```
                      ┌─ 축A. 고지 ────→ 수험생 (추록/정오표)
개정 1건 (revision) ──┼─ 축B. 콘텐츠 ──→ 플랫폼 DB 정식 레코드
                      └─ 축C. 판본 ────→ 차기 판 인쇄 원고
```

실제 조합 예시:

| 사례 | 축A 고지 | 축B 콘텐츠 | 축C 판본 |
|---|---|---|---|
| 단순 오탈자 | 발행 | 즉시 반영 | 병합 |
| 법령개정(미래 시행) | **지금 발행** | **시행일에 예약 반영** | 병합 |
| 내부 표현 다듬기 | 고지 안 함 | 즉시 반영 | 병합 |
| 판례 보충 설명 | 발행 | 즉시 반영 | 병합 |
| 오발행 철회 | 철회 고지 | 원복 | 제외 |

따라서 `content_revisions`는 status 컬럼 하나가 아니라 **3쌍의 (status, timestamp)** 를 갖습니다. Phase 1에서 컬럼을 전부 만들어두되, 실제로 동작하는 것은 **축B의 자동 기록뿐**입니다. 나머지는 기본값으로 대기합니다.

---

## 1. Phase 0 — 읽기 전용 감사

> **어떤 DDL도 실행하지 말 것.** SELECT 및 카탈로그 조회만 수행하고 보고서를 출력합니다.

### 1.1 수행 항목

**A1. 대상 테이블 식별**
조문 / 판례 / 객관식 / 주관식 / 이론 콘텐츠를 담는 실제 테이블명, PK 컬럼명, PK 타입을 확정합니다.

```sql
select table_name,
       (select string_agg(c.column_name, ', ' order by c.ordinal_position)
          from information_schema.key_column_usage c
          join information_schema.table_constraints tc
            on tc.constraint_name = c.constraint_name
         where tc.table_name = t.table_name
           and tc.constraint_type = 'PRIMARY KEY') as pk_cols
  from information_schema.tables t
 where table_schema = 'public'
 order by table_name;
```

**A2. 각 대상 테이블의 컬럼 구조**
`updated_at`, `deleted_at`, `node_id`(또는 `primary_node_id`), 정답 필드, 본문 필드의 존재 여부와 정확한 이름.

**A3. 기존 이력 테이블 존재 여부**
이미 변경 이력을 남기는 테이블/트리거가 있는지 확인. 있으면 신규 원장과 중복되므로 통합 여부를 판단해야 합니다.

```sql
select event_object_table, trigger_name, action_timing, event_manipulation
  from information_schema.triggers
 where trigger_schema = 'public'
 order by event_object_table;
```

**A4. `node_id` 태깅 커버리지**
content_type별 `node_id` non-null 비율. 상표/디자인 0% 이슈가 여전한지 재확인.

**A5. 콘텐츠 볼륨 및 변경 빈도**
각 테이블 행 수, 최근 6개월 `updated_at` 변경 건수. 원장 볼륨 추정용.

**A6. 노이즈 컬럼 식별**
매 요청마다 갱신되는 컬럼(조회수, 검색벡터, 캐시 필드 등). 이걸 못 걸러내면 원장이 쓰레기로 가득 찹니다.

**A7. 확장 기능 활성 여부**
`pg_cron`, `pgcrypto`(`gen_random_uuid`) 활성 상태.

```sql
select extname, extversion from pg_extension order by extname;
```

**A8. RLS 정책 현황**
대상 테이블의 RLS 활성 여부 및 관리자 판별 방식(`auth.jwt() ->> 'role'`, 별도 `profiles.role` 등). 원장 테이블 정책 작성에 필요합니다.

**A9. 교재 판본 현황 (문서 확인)**
현재 유통 중인 교재 목록, 판/쇄, 인쇄일. DB에 없으면 임별님께 질의 목록으로 남길 것.

### 1.2 산출물

`docs/errata/phase0-audit-report.md` 로 저장합니다.

```markdown
## A1. 대상 테이블
| 논리명 | 실제 테이블 | PK 컬럼 | PK 타입 | 행 수 |
|---|---|---|---|---|
| 조문 | ? | ? | ? | ? |
...

## A4. node_id 커버리지
| content_type | 전체 | 태깅됨 | 비율 |
...

## 판단 필요 사항
- (Claude Code가 발견한 이슈 나열)

## 권고 트리거 대상 (content_type 매핑안)
| content_type 값 | 테이블 | PK 컬럼 | node 컬럼 | 제외 컬럼 |
...
```

### 1.3 ⛔ 게이트

**Phase 0 보고서를 출력하고 반드시 멈춥니다.** 임별님이 보고서를 확인하고 §2의 테이블 매핑을 확정한 뒤에만 Phase 1로 진행합니다.

---

## 2. Phase 1 — 원장 구축

> Phase 0 승인 후에만 실행. 모든 DDL은 단일 마이그레이션 파일로 작성합니다.
> 파일: `supabase/migrations/<timestamp>_errata_revision_ledger.sql`

### 2.1 원장 테이블

```sql
-- ============================================================
-- 추록/정오표 개정 원장 (append-only)
-- Phase 1: 자동 기록만. 고지/발행/발송 없음.
-- ============================================================

create table if not exists content_revisions (
  revision_id      uuid primary key default gen_random_uuid(),

  -- ── 대상 식별 ──────────────────────────────────
  content_type     text not null
    check (content_type in ('statute','precedent','mcq','essay','theory')),
  content_id       text not null,          -- PK 타입 혼재 대비 text 저장
  node_id          text,                   -- FK는 Phase 6에서 연결 (태깅 공백 대응)
  subject_code     text,                   -- 'patent'|'trademark'|'design'|...

  -- ── 변경 실체 (불변) ───────────────────────────
  op               text not null check (op in ('INSERT','UPDATE','DELETE')),
  before_snapshot  jsonb,
  after_snapshot   jsonb,
  changed_fields   text[] not null default '{}',

  -- ── 축A: 고지 (Phase 3~4에서 사용) ─────────────
  notice_status    text not null default 'none'
    check (notice_status in ('none','pending','published','withdrawn')),
  errata_kind      text
    check (errata_kind is null or errata_kind in
      ('typo','law_amend','precedent_change','addendum','answer_change','deletion')),
  errata_severity  text
    check (errata_severity is null or errata_severity in ('critical','normal','minor')),
  errata_title     text,
  errata_payload   jsonb,
  errata_reason    text,
  legal_basis      jsonb,
  published_at     timestamptz,

  -- ── 축B: 콘텐츠 반영 ───────────────────────────
  apply_status     text not null default 'applied'
    check (apply_status in ('applied','scheduled','pending','skipped','reverted')),
  applied_at       timestamptz default now(),
  scheduled_for    date,                   -- 법령 시행일 예약 반영
  pending_payload  jsonb,                  -- scheduled일 때 적용할 내용

  -- ── 축C: 판본 병합 ─────────────────────────────
  merge_status     text not null default 'pending'
    check (merge_status in ('pending','merged','excluded')),
  source_edition_id      uuid,
  merged_into_edition_id uuid,
  merged_at        timestamptz,

  -- ── 수험 도메인 ────────────────────────────────
  effective_date         date,
  applies_from_exam_round int,
  requires_regrade       boolean not null default false,

  -- ── 감사 ───────────────────────────────────────
  created_by       uuid,                   -- auth.uid(), 시스템 변경 시 null
  created_by_label text,                   -- 'system:migration' 등
  created_at       timestamptz not null default now()
);

comment on table content_revisions is
  '콘텐츠 개정 원장. append-only. 3축(고지/콘텐츠/판본) 독립 상태 관리.';

-- 인덱스
create index if not exists idx_rev_target
  on content_revisions (content_type, content_id, created_at desc);
create index if not exists idx_rev_notice
  on content_revisions (notice_status, subject_code, created_at desc)
  where notice_status <> 'none';
create index if not exists idx_rev_merge
  on content_revisions (merge_status, source_edition_id)
  where merge_status = 'pending';
create index if not exists idx_rev_node
  on content_revisions (node_id) where node_id is not null;
create index if not exists idx_rev_scheduled
  on content_revisions (scheduled_for)
  where apply_status = 'scheduled';
create index if not exists idx_rev_created
  on content_revisions (created_at desc);
```

**`content_id`를 `text`로 둔 이유:** Phase 0에서 테이블별 PK 타입이 uuid/bigint 혼재로 확인될 가능성이 높습니다. 다형 참조이므로 FK를 걸 수 없고, text 정규화가 가장 안전합니다.

### 2.2 append-only 가드

```sql
create or replace function trg_revision_append_only()
returns trigger language plpgsql as $$
begin
  if new.content_type    is distinct from old.content_type
  or new.content_id      is distinct from old.content_id
  or new.op              is distinct from old.op
  or new.before_snapshot is distinct from old.before_snapshot
  or new.after_snapshot  is distinct from old.after_snapshot
  or new.changed_fields  is distinct from old.changed_fields
  or new.created_at      is distinct from old.created_at then
    raise exception
      '개정 원장의 변경 실체는 불변입니다 (revision_id=%). 상태/서술 필드만 수정 가능합니다.',
      old.revision_id;
  end if;
  return new;
end $$;

drop trigger if exists revision_append_only on content_revisions;
create trigger revision_append_only
  before update on content_revisions
  for each row execute function trg_revision_append_only();

-- 삭제 전면 금지
create or replace function trg_revision_no_delete()
returns trigger language plpgsql as $$
begin
  raise exception '개정 원장은 삭제할 수 없습니다 (revision_id=%).', old.revision_id;
end $$;

drop trigger if exists revision_no_delete on content_revisions;
create trigger revision_no_delete
  before delete on content_revisions
  for each row execute function trg_revision_no_delete();
```

### 2.3 자동 기록 트리거 함수

```sql
create or replace function fn_log_content_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_type text := tg_argv[0];   -- 'statute' 등
  v_pk_col       text := tg_argv[1];   -- PK 컬럼명
  v_node_col     text := tg_argv[2];   -- node 컬럼명 ('' 이면 없음)
  v_subject_col  text := tg_argv[3];   -- 과목 컬럼명 ('' 이면 없음)
  v_ignore       text[] := coalesce(string_to_array(tg_argv[4], ','), '{}');

  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
  v_changed text[];
begin
  -- 대량 마이그레이션 시 우회 스위치
  if coalesce(current_setting('lidam.skip_revision_log', true), 'off') = 'on' then
    return null;
  end if;

  v_before := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_after  := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row    := coalesce(v_after, v_before);

  -- 변경 필드 산출 (노이즈 컬럼 제외)
  select coalesce(array_agg(k order by k), '{}')
    into v_changed
    from (
      select key as k
        from jsonb_object_keys(coalesce(v_before, '{}'::jsonb) || coalesce(v_after, '{}'::jsonb)) as key
    ) t
   where (coalesce(v_before, '{}'::jsonb) -> k) is distinct from (coalesce(v_after, '{}'::jsonb) -> k)
     and k <> all(v_ignore);

  -- 노이즈 컬럼만 변경된 UPDATE는 기록하지 않음
  if tg_op = 'UPDATE' and cardinality(v_changed) = 0 then
    return null;
  end if;

  insert into content_revisions (
    content_type, content_id, node_id, subject_code,
    op, before_snapshot, after_snapshot, changed_fields,
    apply_status, applied_at,
    created_by, created_by_label
  ) values (
    v_content_type,
    v_row ->> v_pk_col,
    case when v_node_col <> '' then v_row ->> v_node_col else null end,
    case when v_subject_col <> '' then v_row ->> v_subject_col else null end,
    tg_op, v_before, v_after, v_changed,
    'applied', now(),
    auth.uid(),
    case when auth.uid() is null then 'system' else null end
  );

  return null;  -- AFTER 트리거
end $$;
```

### 2.4 트리거 설치 — ⚠ Phase 0 결과로 확정

아래는 **템플릿**입니다. 테이블명·컬럼명은 Phase 0 A1/A2/A6 결과로 치환합니다.

```sql
-- 인자 순서: content_type, PK컬럼, node컬럼, 과목컬럼, 제외컬럼(CSV)
-- 예시 (실제 값은 Phase 0 확정 후 교체)

create trigger log_revision_statute
  after insert or update or delete on <조문테이블>
  for each row execute function fn_log_content_revision(
    'statute', '<pk컬럼>', '<node컬럼>', '<과목컬럼>',
    'updated_at,search_vector,view_count'
  );

create trigger log_revision_precedent
  after insert or update or delete on <판례테이블>
  for each row execute function fn_log_content_revision(
    'precedent', '<pk컬럼>', '<node컬럼>', '<과목컬럼>',
    'updated_at,search_vector,view_count'
  );

create trigger log_revision_mcq
  after insert or update or delete on <객관식테이블>
  for each row execute function fn_log_content_revision(
    'mcq', '<pk컬럼>', '<node컬럼>', '<과목컬럼>',
    'updated_at,attempt_count,correct_rate'
  );

create trigger log_revision_essay
  after insert or update or delete on <주관식테이블>
  for each row execute function fn_log_content_revision(
    'essay', '<pk컬럼>', '<node컬럼>', '<과목컬럼>',
    'updated_at,attempt_count'
  );
```

**제외 컬럼 선정이 이 단계에서 가장 중요합니다.** 통계 캐시 컬럼(정답률, 응시횟수)이 실시간 갱신되고 있다면 반드시 제외해야 합니다. 누락하면 원장이 하루 만에 수만 건으로 부풀고 실제 개정이 묻힙니다.

### 2.5 RLS

```sql
alter table content_revisions enable row level security;

-- 관리자만 조회 (판별 조건은 Phase 0 A8 결과로 확정)
create policy revision_admin_select on content_revisions
  for select using ( <관리자 판별 조건> );

create policy revision_admin_update on content_revisions
  for update using ( <관리자 판별 조건> );

-- INSERT는 security definer 트리거만 수행. 정책 부여 없음.
-- 수험생 조회 정책은 Phase 4에서 notice_status='published' 한정으로 추가.
```

### 2.6 운영 확인용 뷰

```sql
create or replace view v_revision_recent as
select revision_id, content_type, content_id, node_id, subject_code,
       op, changed_fields,
       notice_status, apply_status, merge_status,
       created_by_label, created_at
  from content_revisions
 order by created_at desc;

-- 축C 대기 현황 (차기 판 원고 반영 대상)
create or replace view v_revision_merge_pending as
select content_type, subject_code, count(*) as cnt,
       min(created_at) as oldest, max(created_at) as latest
  from content_revisions
 where merge_status = 'pending'
 group by content_type, subject_code
 order by cnt desc;
```

---

## 3. 검증 절차

Phase 1 적용 직후 반드시 수행합니다.

```sql
-- 1) 트리거 설치 확인
select event_object_table, trigger_name
  from information_schema.triggers
 where trigger_name like 'log_revision_%';

-- 2) 정상 기록 테스트 (트랜잭션 롤백)
begin;
  update <조문테이블>
     set <본문컬럼> = <본문컬럼> || ' [TEST]'
   where <pk컬럼> = '<임의 1건>';
  select revision_id, op, changed_fields, apply_status
    from content_revisions order by created_at desc limit 1;
rollback;

-- 3) 노이즈 필터 동작 확인 (기록되지 않아야 함)
begin;
  select count(*) from content_revisions \gset before_
  update <객관식테이블> set <통계컬럼> = <통계컬럼> + 1
   where <pk컬럼> = '<임의 1건>';
  select count(*) from content_revisions;  -- 증가하지 않아야 정상
rollback;

-- 4) append-only 가드 확인 (에러 발생해야 정상)
begin;
  update content_revisions set after_snapshot = '{}'::jsonb
   where revision_id = (select revision_id from content_revisions limit 1);
rollback;

-- 5) 우회 스위치 확인
begin;
  set local lidam.skip_revision_log = 'on';
  update <조문테이블> set <본문컬럼> = <본문컬럼> where <pk컬럼> = '<임의 1건>';
  -- 신규 revision이 생기지 않아야 정상
rollback;
```

### 3.1 배포 후 48시간 모니터링

```sql
select content_type, op, count(*), max(created_at)
  from content_revisions
 where created_at > now() - interval '48 hours'
 group by 1,2 order by 3 desc;
```

**하루 수백 건 이상이면 노이즈 컬럼 누락입니다.** 즉시 §2.4의 제외 목록을 보강하고 해당 기간 레코드를 정리해야 합니다(원장 삭제 트리거를 임시 해제 → 정리 → 재설치).

---

## 4. 롤백 스크립트

```sql
drop trigger if exists log_revision_statute   on <조문테이블>;
drop trigger if exists log_revision_precedent on <판례테이블>;
drop trigger if exists log_revision_mcq       on <객관식테이블>;
drop trigger if exists log_revision_essay     on <주관식테이블>;
drop function if exists fn_log_content_revision();

-- 테이블은 남깁니다. 수집된 원장은 소실되면 복구 불가입니다.
-- 완전 제거가 필요하면 별도 승인 후:
-- drop trigger revision_no_delete on content_revisions;
-- drop table content_revisions cascade;
```

---

## 5. 작업 규칙

1. **Phase 0 종료 후 반드시 정지.** 보고서 출력 → 임별님 확인 → Phase 1 착수.
2. 마이그레이션 파일은 로컬 작성 후 **`--dry-run` 또는 `supabase db diff`로 검토**하고, 원격 적용 전 승인받습니다.
3. `content_revisions` 테이블은 **DROP·TRUNCATE 금지**.
4. 기존 콘텐츠 테이블의 **스키마는 일절 변경하지 않습니다.** Phase 1은 트리거 부착만 합니다.
5. Phase 2 이후 항목(판본 테이블, 추록호, PDF, 알림톡, UI)은 **착수하지 않습니다.**
6. 작업 완료 후 `docs/errata/phase1-completion.md`에 설치된 트리거 목록, 제외 컬럼 목록, 검증 결과를 기록합니다.

---

## 6. Phase 1 완료 후 임별님 확인 사항

- [ ] Phase 0 보고서의 `node_id` 커버리지 — 상표/디자인 태깅 작업을 Phase 3 이전에 넣을지 판단
- [ ] 48시간 모니터링 결과 — 일 기록 건수가 예상 범위(수 건~수십 건)인지
- [ ] 현행 유통 교재 판본 목록 정리 (Phase 2 `publication_editions` 시드용)
- [ ] 조판 원본 파일 형식 확인 (InDesign / HWP / DOCX) — Phase 7 페이지 역주입 경로 결정
