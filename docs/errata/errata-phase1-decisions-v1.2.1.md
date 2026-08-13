# 결정서 — Phase 0 감사 반영 / Phase 1 지시서 §2 개정판 (v1.2.1)

> 근거: `docs/errata/phase0-audit-report.md` (e71c166c)
> **지시서 v1.1의 §2.3 트리거 함수 및 §2.4 트리거 설치 템플릿을 폐기하고 본 문서로 대체합니다.**
> §2.1 원장 테이블, §2.2 append-only 가드는 컬럼 3개 추가(§2) 외 그대로 유효합니다.
> v1.2 대비 변경: §7.1 확인 3건 해소, `article_revisions` 시행일 구조 반영(§1.6·§3.2).

---

## 0. 결정 요약

| # | 감사 지적 | 결정 | 근거 |
|---|---|---|---|
| 1 | 조문 본문은 `article_revisions.body_json` | **권고안 채택 + 전용 함수 신설** | 범용 함수로는 before 산출 불가 |
| 2 | 정답 실체가 `problem_choices`에 있고 무흔적 | **채택. 최우선 순위로 격상** | 정답 정정 추적 불가 = 시스템 존재 이유 훼손 |
| 3 | mcq/essay는 `problems.format`, 과목은 uuid FK/배열 | **정규화 포기, 원본 참조 보존** | Phase 1 목적은 정규화가 아니라 이력 확보 |
| 4 | 노이즈 지배 변수는 배치, GUC가 PostgREST로 불가 | **억제 창(window) 방식 병행** | 규율 의존은 1회 실수로 복구 불가 오염 |
| 5 | PK 전부 uuid 단일 | `content_id`는 **text 유지** | 다형 참조라 FK 불가, 부모 정규화 여지 |
| 6 | pg_cron 미설치 | **설치하지 않음. Vercel Cron 채택** | Phase 1 무영향, Phase 5에서 구현 |
| 7 | staff 판별은 `private.is_staff()` | **`private.is_staff()` 사용** | 감사 실측 우선 |
| 8 | node 커버리지 실제 공백은 자과 문제·주관식 primary·민소 조문 | **설계서 §5.2 수정. Phase 1 무영향** | `node_id` nullable이 이미 흡수 |
| 9 | `audit_logs` 병존 권고 | **채택. 통합하지 않음** | 목적이 다름 |
| 10 | A9 교재 판본 질의 | **§7 확정 완료** | HWPX / 2026년판 / 2027-02-26 |

**Phase 1 착수를 막는 항목: 없습니다.** §7.1 확인 3건이 감사 보고서에서 해소되었으므로 즉시 진행 가능합니다.

---

## 1. 결정 상세

### 1.1 조문 — `article_revisions` 훅 (지적 1)

권고안대로 `article_revisions AFTER INSERT`로 갑니다. 다만 **범용 함수를 쓸 수 없습니다.**

범용 함수는 `OLD`/`NEW`로 before/after를 얻지만, `article_revisions`는 INSERT만 일어나므로 `OLD`가 없습니다. before는 **같은 `article_id`의 직전 리비전 행**을 조회해야 나옵니다. 전용 함수 `fn_log_revision_article()`을 신설합니다(§3.2).

`articles` 본체(조문번호·제목 등 메타)에는 **Phase 1에서 트리거를 붙이지 않습니다.** 본문 개정과 동시에 메타가 바뀌면 한 변경이 revision 2건으로 갈라져 정오표 발행 시 혼란이 생깁니다. 48시간 모니터링으로 메타 단독 변경 빈도를 확인한 뒤 Phase 2에서 재판단합니다.

### 1.2 `problem_choices` — 최우선 (지적 2)

**5번째가 아니라 첫 번째 우선순위입니다.** `errata_kind`의 `answer_change`가 이 시스템의 핵심 기능인데, 정답 정정이 `updated_at`조차 없이 무흔적이라면 그 기능은 처음부터 성립하지 않습니다. 다른 트리거가 다 실패해도 이건 붙어야 합니다.

**정규화 결정:** `content_id`는 선택지 ID가 아니라 **부모 `problem_id`**로 기록합니다. 수험생에게 보이는 단위는 "문제 15번"입니다. 선택지 식별 정보는 `source_ref`에 보존합니다.

**부수 효과 인지:** 문제 1건 수정 시 선택지 여러 개가 각각 revision을 만듭니다. Phase 1은 **기록을 충실히 남기고**, Phase 3 발행 UI에서 `problem_id` + 근접 시각으로 묶어 1건으로 표시합니다.

### 1.3 과목·유형 정규화 포기 (지적 3)

`subject_code`를 Phase 1에서 채우지 않습니다. `subject_ref jsonb`에 원본을 보존합니다.

```
문제:   {"law_id": "uuid…"}
주관식: {"subject_laws": ["uuid…", "uuid…"]}
```

원본 참조만 확보되면 정규화는 언제든 뷰나 백필로 파생됩니다. 완벽한 정규화를 착수 조건으로 걸면 그만큼 이력이 소실됩니다.

### 1.4 억제 창 방식 (지적 4)

`run-prod-sql.mjs` SQL 경로 규칙화를 원칙으로 채택하되, **그것만으로는 부족합니다.**

GUC 우회는 사람의 규율에 의존합니다. 한 번 잊으면 수백 건이 원장에 박히고, `revision_no_delete` 때문에 지울 수 없습니다. 규율 의존 + 삭제 불가가 결합하면 첫 실수가 영구 손상이 됩니다.

**억제 창을 주 수단으로 추가합니다.**

- PostgREST 경유든 SQL 직결이든 **경로와 무관하게 동작**
- 창 자체가 사유와 함께 남아 **감사 기록이 됨**
- **최대 2시간 자동 만료** — 열어두고 잊는 실수를 구조적으로 차단
- `scope`로 특정 `content_type`만 억제 가능

GUC는 SQL 직결 경로의 보조 수단으로 유지합니다. 둘 중 하나만 걸려도 억제됩니다.

**주체 미상 해결:** `app_name` 컬럼에 `current_setting('application_name')`을 기록합니다. `cases 8/12 124건` 유형이 앞으로는 원천 식별됩니다.

### 1.5 pg_cron 대신 Vercel Cron (지적 6)

pg_cron을 설치하지 않습니다. Phase 3·5의 스케줄링은 **Vercel Cron → API Route → Supabase RPC**로 갑니다. 스케줄이 `vercel.json`에 코드로 남고, 실패 알림·재시도가 기본 제공되며, 확장 설치가 불필요합니다. Phase 1에는 영향 없습니다.

### 1.6 ★ `article_revisions` 시행일 구조 — v1.2.1 신규

감사에서 `effective_date` · `expired_date` · `change_kind` 존재가 확인되었습니다. **조문에 대해서는 시행일 기반 시간축 버전 관리가 이미 구현되어 있습니다.** 설계 §4.3의 예약 반영 로직을 조문에 대해 새로 만들 필요가 없습니다.

**세 가지가 달라집니다.**

**(1) `apply_status` 자동 판정**
조문 revision은 `applied` 고정이 아니라 시행일 기준으로 갈립니다.

```
effective_date <= current_date  →  'applied'   (이미 시행)
effective_date >  current_date  →  'scheduled' (시행 예정)
```

`pending_payload`도 불필요합니다. 적용할 내용이 `article_revisions`에 이미 행으로 존재하므로, 시행일이 되면 조회 조건이 자연히 바뀝니다. `fn_apply_scheduled_revisions()`는 조문에 대해 **상태 전이만** 수행하면 됩니다.

**(2) before 리비전 조회 축**
정오표는 "무엇이 무엇으로 바뀌는가"이므로 **시행 순서**가 기준입니다. 기록 순서(`created_at`)로 잡으면 미래 시행분이 이미 입력된 경우 어긋납니다.

```sql
order by r.effective_date desc, r.created_at desc
```

**(3) `change_kind` → `errata_kind` 프리필**
개정 종류가 이미 분류되어 있습니다. Phase 1에서는 `source_ref`에 보존만 하고, Phase 3 발행 모달에서 `errata_kind` 기본값으로 프리필합니다. 매핑 규칙은 `change_kind`의 실제 값 목록 확인 후 Phase 3에서 확정합니다.

---

## 2. §2.1 원장 테이블 — 컬럼 3개 추가

```sql
alter table content_revisions
  add column source_ref   jsonb,
  add column subject_ref  jsonb,
  add column app_name     text;

comment on column content_revisions.source_ref is
  '기록 원천. 예: {"table":"article_revisions","id":"…","change_kind":"…"} / {"table":"problem_choices","id":"…"}';
comment on column content_revisions.subject_ref is
  '과목 원본 참조. subject_code 정규화는 Phase 3에서 파생.';

create index idx_rev_app on content_revisions (app_name, created_at desc);
```

`subject_code`는 그대로 두되 Phase 1에서는 항상 null입니다.

---

## 3. §2.3 개정 — 트리거 함수 4종

### 3.1 공통 억제 가드

```sql
create table revision_suppress_windows (
  window_id   uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  reason      text not null,
  scope       text[],
  created_by  uuid,
  closed_at   timestamptz,
  constraint chk_window_max_2h check (expires_at <= started_at + interval '2 hours'),
  constraint chk_window_order  check (expires_at > started_at)
);

create index idx_suppress_active on revision_suppress_windows (expires_at)
  where closed_at is null;

comment on table revision_suppress_windows is
  '대량 배치 중 개정 원장 기록을 일시 억제. 최대 2시간 자동 만료.';

create or replace function fn_revision_suppressed(p_content_type text)
returns boolean language sql stable as $$
  select coalesce(current_setting('lidam.skip_revision_log', true), 'off') = 'on'
      or exists (
           select 1 from revision_suppress_windows
            where closed_at is null
              and now() < expires_at
              and (scope is null or p_content_type = any(scope))
         );
$$;

create or replace function fn_open_suppress_window(
  p_reason text, p_minutes int default 30, p_scope text[] default null
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  if p_minutes > 120 then
    raise exception '억제 창은 최대 120분입니다 (요청: %분)', p_minutes;
  end if;
  insert into revision_suppress_windows (expires_at, reason, scope, created_by)
  values (now() + make_interval(mins => p_minutes), p_reason, p_scope, auth.uid())
  returning window_id into v_id;
  return v_id;
end $$;

create or replace function fn_close_suppress_window(p_window_id uuid)
returns void language sql security definer as $$
  update revision_suppress_windows set closed_at = now()
   where window_id = p_window_id and closed_at is null;
$$;
```

### 3.2 조문 전용 — `fn_log_revision_article()`

> 확정값: PK = `revision_id`, 순서 판별 = `effective_date` → `created_at`, 시행일 컬럼 = `effective_date`
> `<node컬럼>`만 감사 A2 결과로 치환. `article_revisions`에 node 컬럼이 없으면 `null`로 두세요.

```sql
create or replace function fn_log_revision_article()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prev    jsonb;
  v_after   jsonb := to_jsonb(new);
  v_changed text[];
  v_ignore  text[] := array['revision_id', 'created_at', 'created_by'];
  v_apply   text;
begin
  if fn_revision_suppressed('statute') then return null; end if;

  -- 직전 리비전 = before (시행 순서 기준)
  select to_jsonb(r) into v_prev
    from article_revisions r
   where r.article_id = new.article_id
     and r.revision_id <> new.revision_id
     and (r.effective_date < new.effective_date
          or (r.effective_date = new.effective_date and r.created_at < new.created_at))
   order by r.effective_date desc, r.created_at desc
   limit 1;

  select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select jsonb_object_keys(coalesce(v_prev,'{}'::jsonb) || v_after) as k) t
   where (coalesce(v_prev,'{}'::jsonb) -> k) is distinct from (v_after -> k)
     and k <> all(v_ignore);

  -- ★ 시행일 기준 축B 자동 판정
  v_apply := case
    when new.effective_date is null then 'applied'
    when new.effective_date <= current_date then 'applied'
    else 'scheduled'
  end;

  insert into content_revisions (
    content_type, content_id, source_ref, node_id,
    op, before_snapshot, after_snapshot, changed_fields,
    apply_status, applied_at, scheduled_for, effective_date,
    created_by, created_by_label, app_name
  ) values (
    'statute',
    new.article_id::text,
    jsonb_build_object(
      'table','article_revisions',
      'id', new.revision_id,
      'change_kind', v_after ->> 'change_kind',
      'expired_date', v_after ->> 'expired_date'),
    v_after ->> '<node컬럼 or NULL>',
    case when v_prev is null then 'INSERT' else 'UPDATE' end,
    v_prev, v_after, v_changed,
    v_apply,
    case when v_apply = 'applied' then now() end,
    case when v_apply = 'scheduled' then new.effective_date end,
    new.effective_date,
    auth.uid(),
    case when auth.uid() is null then 'system' end,
    current_setting('application_name', true)
  );
  return null;
end $$;
```

### 3.3 문제 전용 — `fn_log_revision_problem()`

> `problems.format`은 6종 정의 중 실데이터가 mc 계열 3종 + `subjective`입니다.
> **접두 매칭으로 처리**해 정확한 리터럴에 의존하지 않게 했습니다. 적용 후 실제 값 목록을
> 확인하고, `mc` 접두가 아닌 객관식 계열이 있으면 보고하세요.

```sql
create or replace function fn_problem_content_type(p_format text)
returns text language sql immutable as $$
  select case
    when p_format is null            then 'mcq'
    when p_format like 'mc%'         then 'mcq'
    when p_format like 'subjective%' then 'essay'
    when p_format like 'essay%'      then 'essay'
    else 'mcq'
  end;
$$;

create or replace function fn_log_revision_problem()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_target   text := tg_argv[0];
  v_ignore   text[] := coalesce(string_to_array(tg_argv[1], ','), '{}');
  v_before   jsonb := case when tg_op='INSERT' then null else to_jsonb(old) end;
  v_after    jsonb := case when tg_op='DELETE' then null else to_jsonb(new) end;
  v_row      jsonb := coalesce(v_after, v_before);
  v_changed  text[];
  v_problem_id text;
  v_format   text;
  v_law_id   uuid;
  v_node     text;
  v_ctype    text;
  v_src      jsonb;
begin
  if v_target = 'problems' then
    v_problem_id := v_row ->> '<problems_pk>';
    v_format     := v_row ->> 'format';
    v_law_id     := nullif(v_row ->> 'law_id','')::uuid;
    v_node       := v_row ->> '<problems_node컬럼>';
    v_src        := jsonb_build_object('table','problems','format', v_format);
  else
    v_problem_id := v_row ->> 'problem_id';
    select p.format, p.law_id, p.<problems_node컬럼>
      into v_format, v_law_id, v_node
      from problems p where p.<problems_pk> = v_problem_id::uuid;
    v_src := jsonb_build_object(
               'table','problem_choices',
               'id', v_row ->> '<choices_pk>',
               'choice_no', v_row ->> '<선지번호컬럼>',
               'format', v_format);
  end if;

  v_ctype := fn_problem_content_type(v_format);
  if fn_revision_suppressed(v_ctype) then return null; end if;

  select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select jsonb_object_keys(coalesce(v_before,'{}'::jsonb) || coalesce(v_after,'{}'::jsonb)) as k) t
   where (coalesce(v_before,'{}'::jsonb) -> k) is distinct from (coalesce(v_after,'{}'::jsonb) -> k)
     and k <> all(v_ignore);

  if tg_op = 'UPDATE' and cardinality(v_changed) = 0 then return null; end if;

  insert into content_revisions (
    content_type, content_id, source_ref, subject_ref, node_id,
    op, before_snapshot, after_snapshot, changed_fields,
    apply_status, applied_at,
    created_by, created_by_label, app_name
  ) values (
    v_ctype,
    v_problem_id,
    v_src,
    jsonb_build_object('law_id', v_law_id),
    v_node,
    tg_op, v_before, v_after, v_changed,
    'applied', now(),
    auth.uid(),
    case when auth.uid() is null then 'system' end,
    current_setting('application_name', true)
  );
  return null;
end $$;
```

### 3.4 범용 — `fn_log_content_revision()`

지시서 v1.1 §2.3 함수를 유지하되 3곳만 수정합니다.

```sql
-- (1) 억제 판정 교체
    if fn_revision_suppressed(v_content_type) then return null; end if;

-- (2) subject_col 추출을 subject_ref로 변경 (uuid FK/배열 대응)
--   subject_ref = case when v_subject_col <> ''
--                   then jsonb_build_object(v_subject_col, v_row -> v_subject_col)
--                   else null end

-- (3) INSERT 컬럼에 app_name 추가
    current_setting('application_name', true)
```

주관식이 `subject_laws` 배열이면 `v_row -> v_subject_col`이 배열 그대로 들어갑니다. 의도한 동작입니다.

---

## 4. §2.4 개정 — 트리거 설치

**설치 순서가 우선순위입니다. ①이 실패하면 나머지를 중단하고 보고하세요.**

```sql
-- ① 정답 정정 [최우선] — 현재 무흔적 상태 해소
create trigger log_revision_problem_choices
  after insert or update or delete on problem_choices
  for each row execute function fn_log_revision_problem(
    'problem_choices', '<제외컬럼 CSV — 감사 A6>'
  );

-- ② 문제 본체
create trigger log_revision_problems
  after insert or update or delete on problems
  for each row execute function fn_log_revision_problem(
    'problems', 'updated_at,search_tsv,<기타 A6>'
  );

-- ③ 조문 본문
create trigger log_revision_article
  after insert on article_revisions
  for each row execute function fn_log_revision_article();

-- ④ 판례
create trigger log_revision_cases
  after insert or update or delete on cases
  for each row execute function fn_log_content_revision(
    'precedent', '<cases_pk>', '<node컬럼>', '<과목컬럼 or 공백>',
    'updated_at,search_tsv,official_text,<기타 A6>'
  );
```

`articles` 본체 트리거는 §1.1에 따라 Phase 1에서 설치하지 않습니다.

---

## 5. §3 개정 — 검증

지시서 v1.1 §3의 5개 항목에 아래 4개를 추가합니다. **전부 트랜잭션 롤백으로 수행하세요.**

```sql
-- 6) 정답 정정 포착 [최우선 검증]
begin;
  update problem_choices set is_correct = not is_correct
   where <choices_pk> = '<임의 1건>';
  select content_type, content_id, source_ref, changed_fields
    from content_revisions order by created_at desc limit 1;
  -- 기대: content_id = 부모 problem_id, source_ref.table = 'problem_choices'
rollback;

-- 7) 조문 before 산출 (시행 순서 기준)
begin;
  insert into article_revisions (article_id, body_json, effective_date, …)
  values ('<기존 조문 1건>', '{"test":true}'::jsonb, current_date - 1, …);
  select op, (before_snapshot is not null) as has_before, apply_status, changed_fields
    from content_revisions order by created_at desc limit 1;
  -- 기대: op='UPDATE', has_before=true, apply_status='applied'
rollback;

-- 8) ★ 시행일 예약 판정
begin;
  insert into article_revisions (article_id, body_json, effective_date, …)
  values ('<기존 조문 1건>', '{"future":true}'::jsonb, current_date + 90, …);
  select apply_status, scheduled_for, applied_at, effective_date
    from content_revisions order by created_at desc limit 1;
  -- 기대: apply_status='scheduled', scheduled_for=시행일, applied_at is null
rollback;

-- 9) 억제 창 동작
begin;
  select fn_open_suppress_window('검증 테스트', 5, array['precedent']) as wid \gset
  update cases set <본문컬럼> = <본문컬럼> || ' [TEST]' where <cases_pk> = '<임의 1건>';
  -- 기대: content_revisions 증가하지 않음
  update problems set <컬럼> = <컬럼> where <problems_pk> = '<임의 1건>';
  -- 기대: 증가함 (scope 밖)
  select count(*) from content_revisions;
rollback;
```

### 5.2 48시간 모니터링

```sql
select coalesce(app_name,'(unknown)') as app,
       content_type, op, count(*), max(created_at)
  from content_revisions
 where created_at > now() - interval '48 hours'
 group by 1,2,3
 order by 4 desc;
```

`(unknown)`이 다수면 `application_name`을 설정하지 않는 경로가 있다는 뜻입니다. `cases 8/12 124건` 유형의 미상 배치가 여기서 정체를 드러냅니다. 확인 즉시 해당 스크립트에 `application_name` 설정을 추가하고, 이후 대량 작업은 억제 창을 경유하도록 규칙화합니다.

**임계:** 일 수백 건 이상이면 노이즈 컬럼 누락입니다. 원장은 삭제가 막혀 있으므로 조기 발견이 중요합니다.

---

## 6. 작업 규칙 (v1.1 §5에 추가)

7. **`problem_choices` 트리거가 최우선**입니다. 설치 실패 시 나머지를 중단하고 보고하세요.
8. 대량 배치 실행 전 `fn_open_suppress_window()`를 호출합니다. GUC는 SQL 직결 경로의 보조 수단으로만 씁니다.
9. `revision_suppress_windows`는 **삭제하지 않습니다.** 억제 이력 자체가 감사 자료입니다.
10. **`pg_cron`을 설치하지 마세요.** 스케줄링은 Phase 3·5에서 Vercel Cron으로 구현합니다.
11. RLS 정책의 관리자 판별은 `private.is_staff()`를 사용합니다.
12. 마이그레이션 파일 작성 후 **원격 적용 전에 정지**하고, 치환한 값 목록과 DDL 전문을 보고하세요.

---

## 7. 확정된 운영 정보 (Phase 2 이후용)

| 항목 | 값 |
|---|---|
| 2026년판 baseline | 현재 DB 상태가 곧 스냅샷. 별도 추출 불필요 |
| 조판 원본 형식 | HWPX (ZIP + OWPML XML) |
| 2027년 1차 시험일 | **2027-02-26** (2월 마지막 토요일은 27일 — 재확인 요망) |
| 2027년 2차 시험일 | 미확정. `target_exam_date = null`, 추정 7월 마지막 금·토 |
| 시행일 판정 | `effective_date <= target_exam_date` 자동 계산 |
| `applies_from_exam_round` | 표시용. 판정은 날짜로 수행 |
| 2027년판 산출 방식 | 첫 사이클은 조판 지시서(추록 PDF). HWPX 자동 생성은 2028년판 |
| Phase 4 데드라인 | 2026년 10월 말 |

### 7.1 §4.3 설계 수정 — 시험일 기준 분류 (Phase 2)

```sql
alter table publication_editions
  add column target_exam_date          date,   -- 확정일. 미확정이면 null
  add column target_exam_date_estimate date;   -- 추정일. 판정에 사용하지 않음
```

미확정일 때 추정치를 판정에 쓰면 경계 개정이 잘못 분류됩니다. `null`이면 "판정 불가"로 처리하고 발행 시 경고를 띄웁니다.

**수험생 화면 분류:**

| 구분 | 조건 | 표시 |
|---|---|---|
| 시험 적용 | `effective_date <= target_exam_date` | `2027년 시험 적용` |
| 시험 후 시행 | `effective_date > target_exam_date` | `2027-06-01 시행 · 이번 시험 미적용` |

두 번째는 **답안에 쓰면 오답**이므로 색·위치를 분리하고 기본 필터를 "시험 적용"으로 둡니다. 신·구 대비 병기가 필요합니다. 2차 시험이 금·토 이틀이면 판정 기준은 **첫날**로 잡습니다.

### 7.2 후속 확인 (Phase 1 무관)

- `article_revisions.expired_date`가 후속 리비전의 `effective_date`와 항상 일치하는지, 공백·중첩이 가능한지 — Phase 3의 "시험일 시점 유효 조문" 조회 로직에 필요
- `change_kind`의 실제 값 목록 — Phase 3의 `errata_kind` 프리필 매핑에 필요
- 2026년판 인쇄 이후 `updated_at` 변경 건수 — 제0차 추록 발행 판단

### 7.3 별건 처리

- `CLAUDE.md`에 `manager` 롤 및 `private.is_staff()` 판별 방식 문서화
- 설계서 v1.1 §5.2의 "상표/디자인 태깅 공백" 서술을 실측대로 수정 — 실제 공백은 **자과 문제·주관식 primary·민소 조문**. 주관식 primary 공백은 기존 P4 이슈와 연결
