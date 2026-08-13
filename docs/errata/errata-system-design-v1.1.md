# 리담 플랫폼 — 추록/정오표 시스템 설계서 v1.1

> **v1.0을 전면 대체합니다.** 임별님 결정사항 6건을 반영해 3축 상태 모델로 재구성했습니다.
>
> | 항목 | 내용 |
> |---|---|
> | 대상 콘텐츠 | 조문 · 판례 · 객관식 · 주관식 (+ 이론) |
> | 목적 | 오프라인 교재/온라인 콘텐츠 이중 관리 제거, 개정 신속 전달, 차기 판 원고 자동 축적 |
> | 스택 | React Router 7 (SSR) + Supabase(Seoul, `mcgdoplo`) + Vercel |
> | SSOT 스파인 | `systematic_nodes.node_id` |
> | 실행 지시서 | `errata-phase01-instruction.md` (Phase 0·1 전용, 본 문서와 병행) |

---

## 0. 확정 사항

| # | 결정 | 설계 반영 지점 |
|---|---|---|
| 1 | "원본 반영" = **책 원고 + 플랫폼 DB 둘 다** | §2 3축 상태 모델 (v1.0 단일 status 폐기) |
| 2 | 검수 **필수 아님** | §4.2 발행 직행이 기본, `pending`은 선택 경유 |
| 3 | **최신판만 지원** | §3.3 매핑은 최신 frozen edition만, §6.2 구판 병행 고지 제거 |
| 4 | 재채점 **건별 판단** | §5.3 자동 재채점 없음, dry-run 후 수동 실행 |
| 5 | 추록호 **월 1회 원칙 + 운영자 선택** | §8 pg_cron이 draft만 생성, 발행은 수동 |
| 6 | **원장만 먼저** | §12 Phase 1 단독 선행 배포 |

---

## 1. 설계 원칙

### 1.1 마스터를 하나로 줄인다

이중 관리의 통증은 도구로 해결되지 않습니다. 마스터가 둘이면 무슨 수를 써도 어긋납니다.

```
[기존]  책 원고(마스터 A)  ⇄ 수작업 ⇄  플랫폼 DB(마스터 B)

[전환]  플랫폼 DB (유일 마스터)
           │
           ├─ freeze() ──→ 판본 스냅샷 ──→ 인쇄 원고 ──→ 책
           │                   │
           └─ 이후 개정 ─── diff ──→ 추록/정오표 (파생)
```

**책은 마스터가 아니라 특정 시점의 렌더링 결과물**입니다. 판본마다 `frozen_at`(원고 마감 시각)을 박아두면, 그 이후의 개정 이력이 곧 그 판의 추록/정오표입니다.

### 1.2 추록/정오표는 "쓰는 문서"가 아니라 "승인하는 diff"

집필자가 변경 전/후 텍스트를 다시 타이핑하는 순간 이 시스템은 무너집니다. 시스템이 diff를 만들어 프리필하고, 사람은 다듬고 승인만 합니다.

### 1.3 원장은 전부 남기고, 고지는 골라서 한다

모든 수정은 `content_revisions`에 자동으로 쌓입니다(append-only). 추록/정오표 버튼은 **그중 수험생에게 알릴 것을 고르는 게이트**입니다. 편집 속도를 죽이지 않으려면 기록과 고지를 분리해야 합니다.

---

## 2. 3축 독립 상태 모델 ★ v1.1 핵심

하나의 개정이 세 목적지를 갖고, 각각 시점이 다릅니다. 단일 status로는 표현되지 않습니다.

```
                      ┌─ 축A. 고지    → 수험생 (추록/정오표)
개정 1건 (revision) ──┼─ 축B. 콘텐츠  → 플랫폼 DB 정식 레코드
                      └─ 축C. 판본    → 차기 판 인쇄 원고
```

### 2.1 각 축의 상태값

| 축 | 컬럼 | 상태값 | 기본값 |
|---|---|---|---|
| A. 고지 | `notice_status` | `none` · `pending` · `published` · `withdrawn` | `none` |
| B. 콘텐츠 | `apply_status` | `applied` · `scheduled` · `pending` · `skipped` · `reverted` | `applied` |
| C. 판본 | `merge_status` | `pending` · `merged` · `excluded` | `pending` |

### 2.2 실제 조합 대조표

| 사례 | 축A 고지 | 축B 콘텐츠 | 축C 판본 |
|---|---|---|---|
| 단순 오탈자 | `published` | `applied` (즉시) | `pending` → `merged` |
| 법령개정 (미래 시행) | `published` (지금) | `scheduled` (시행일) | `pending` → `merged` |
| 내부 표현 다듬기 | `none` | `applied` | `pending` → `merged` |
| 판례 보충 설명 | `published` | `applied` | `pending` → `merged` |
| 시험 직전 임시 안내 | `published` | `skipped` | `excluded` |
| 오발행 철회 | `withdrawn` | `reverted` | `excluded` |
| 인쇄 후 시행 예정 개정 | `published` | `scheduled` | `pending` (다음 판까지 유예) |

마지막 행이 축C를 독립시켜야 하는 결정적 이유입니다. 2027 시험 대비 교재를 2026년 10월에 인쇄하는데 2027년 1월 시행 개정이 있다면, 온라인은 시행일에 반영하되 이번 판 원고에는 "시행 예정" 병기로만 넣거나 아예 유예해야 합니다. 축B와 축C의 시점이 갈립니다.

### 2.3 revision 생성 경로 2개

| 경로 | 트리거 | `apply_status` | 구현 시점 |
|---|---|---|---|
| **경로1. 자동 기록** | 어드민이 콘텐츠 저장 → DB 트리거 | `applied` | Phase 1 |
| **경로2. 예약 개정** | 별도 폼에서 미래 개정 입력 | `scheduled` + `pending_payload` | Phase 3 |

경로2가 필요한 이유: 트리거는 **이미 일어난 변경**만 기록합니다. 시행일이 미래인 법령 개정은 지금 콘텐츠를 바꾸면 안 되므로(현행 시험은 구법 적용), 콘텐츠를 건드리지 않고 revision만 먼저 만들어야 합니다.

---

## 3. 데이터 모델

### 3.1 개정 원장 — `content_revisions`

```sql
create table content_revisions (
  revision_id      uuid primary key default gen_random_uuid(),

  -- ── 대상 식별 ────────────────────────────────────────
  content_type     text not null
    check (content_type in ('statute','precedent','mcq','essay','theory')),
  content_id       text not null,          -- PK 타입 혼재 대비 text 정규화
  node_id          text,                   -- FK는 Phase 6 (태깅 공백 대응)
  subject_code     text,

  -- ── 변경 실체 (불변) ─────────────────────────────────
  op               text not null check (op in ('INSERT','UPDATE','DELETE')),
  before_snapshot  jsonb,
  after_snapshot   jsonb,
  changed_fields   text[] not null default '{}',

  -- ── 축A: 고지 ────────────────────────────────────────
  notice_status    text not null default 'none'
    check (notice_status in ('none','pending','published','withdrawn')),
  errata_kind      text check (errata_kind is null or errata_kind in
    ('typo','law_amend','precedent_change','addendum','answer_change','deletion')),
  errata_severity  text check (errata_severity is null or errata_severity in
    ('critical','normal','minor')),
  errata_title     text,
  errata_payload   jsonb,                  -- kind별 구조 (§3.2)
  errata_reason    text,
  legal_basis      jsonb,                  -- {law, amend_no, promulgated_on, effective_date}
  published_at     timestamptz,
  withdrawn_at     timestamptz,
  withdraws_revision_id uuid references content_revisions(revision_id),

  -- ── 축B: 콘텐츠 반영 ─────────────────────────────────
  apply_status     text not null default 'applied'
    check (apply_status in ('applied','scheduled','pending','skipped','reverted')),
  applied_at       timestamptz default now(),
  scheduled_for    date,
  pending_payload  jsonb,                  -- scheduled일 때 적용할 내용

  -- ── 축C: 판본 병합 ───────────────────────────────────
  merge_status     text not null default 'pending'
    check (merge_status in ('pending','merged','excluded')),
  source_edition_id      uuid references publication_editions(edition_id),
  merged_into_edition_id uuid references publication_editions(edition_id),
  merged_at        timestamptz,

  -- ── 수험 도메인 ──────────────────────────────────────
  effective_date          date,
  applies_from_exam_round int,
  requires_regrade        boolean not null default false,
  regrade_executed_at     timestamptz,

  -- ── 감사 ─────────────────────────────────────────────
  created_by       uuid,
  created_by_label text,
  created_at       timestamptz not null default now()
);

create index idx_rev_target on content_revisions (content_type, content_id, created_at desc);
create index idx_rev_notice on content_revisions (notice_status, subject_code, created_at desc)
  where notice_status <> 'none';
create index idx_rev_merge  on content_revisions (merge_status, source_edition_id)
  where merge_status = 'pending';
create index idx_rev_node   on content_revisions (node_id) where node_id is not null;
create index idx_rev_sched  on content_revisions (scheduled_for) where apply_status = 'scheduled';
```

**불변 보장 (append-only):**

```sql
create or replace function trg_revision_append_only() returns trigger
language plpgsql as $$
begin
  if new.content_type    is distinct from old.content_type
  or new.content_id      is distinct from old.content_id
  or new.op              is distinct from old.op
  or new.before_snapshot is distinct from old.before_snapshot
  or new.after_snapshot  is distinct from old.after_snapshot
  or new.changed_fields  is distinct from old.changed_fields
  or new.created_at      is distinct from old.created_at then
    raise exception '개정 원장의 변경 실체는 불변입니다 (revision_id=%)', old.revision_id;
  end if;
  return new;
end $$;

create trigger revision_append_only before update on content_revisions
  for each row execute function trg_revision_append_only();

create or replace function trg_revision_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception '개정 원장은 삭제할 수 없습니다 (revision_id=%)', old.revision_id;
end $$;

create trigger revision_no_delete before delete on content_revisions
  for each row execute function trg_revision_no_delete();
```

### 3.2 `errata_payload` — 유형별 구조

정오표는 유형에 따라 필요한 정보가 다릅니다. 하나의 폼으로 뭉개면 인쇄물 품질이 떨어집니다.

| kind | payload | 렌더링 |
|---|---|---|
| `typo` | `{before_text, after_text, locator}` | p.312, 3행: ~~전용실시권자~~ → **특허권자** |
| `law_amend` | `{old_article, new_article, comparison_table}` | 신·구조문 대비표 2단 |
| `precedent_change` | `{old_case, new_case, holding_diff}` | 대법원 전합 변경 안내 |
| `addendum` | `{insert_after_locator, body_html}` | p.312 하단에 삽입 |
| `answer_change` | `{question_no, old_answer, new_answer, explanation}` | 객15 정답 ③ → ② |
| `deletion` | `{locator, reason}` | p.400 문제 15번 출제범위 제외 |

### 3.3 판본 관리

```sql
create table publications (
  publication_id   uuid primary key default gen_random_uuid(),
  title            text not null,
  subject_code     text not null,
  track            text,                             -- '1차'|'2차'|'공통'
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table publication_editions (
  edition_id       uuid primary key default gen_random_uuid(),
  publication_id   uuid not null references publications(publication_id),
  edition_label    text not null,                    -- '2027 대비 제3판 1쇄'
  edition_seq      numeric not null,                 -- 3.1 = 3판1쇄 (정렬/비교)
  target_exam_year int,
  frozen_at        timestamptz,                      -- ★ 스냅샷 기준시각
  print_date       date,
  isbn             text,
  status           text not null default 'draft'
    check (status in ('draft','frozen','printed','superseded')),
  created_at       timestamptz not null default now(),
  unique (publication_id, edition_seq)
);

-- frozen 이후 기준시각 불변
create or replace function trg_edition_immutable() returns trigger
language plpgsql as $$
begin
  if old.status in ('frozen','printed')
     and new.frozen_at is distinct from old.frozen_at then
    raise exception 'frozen 판본의 frozen_at은 변경할 수 없습니다 (edition_id=%)', old.edition_id;
  end if;
  return new;
end $$;

create trigger edition_immutable before update on publication_editions
  for each row execute function trg_edition_immutable();
```

### 3.4 콘텐츠 ↔ 책 위치 매핑

> **결정 3 반영:** 최신판만 지원하므로 매핑은 최신 `frozen` edition에 대해서만 유지합니다. 구판 매핑은 이력으로 남기되 조회 경로에서 제외합니다.

```sql
create table publication_content_map (
  map_id           uuid primary key default gen_random_uuid(),
  edition_id       uuid not null references publication_editions(edition_id),
  content_type     text not null,
  content_id       text not null,
  node_id          text,

  page_no          int,
  page_no_end      int,
  line_hint        text,                    -- '상단 3행', '각주 12'
  toc_path         text,                    -- '제2편 제3장 II.2.(3)' ← 페이지 없을 때 폴백
  sort_key         numeric,                 -- 책 내 물리적 순서 (원고 익스포트 순서)

  created_at       timestamptz not null default now(),
  unique (edition_id, content_type, content_id)
);

create index idx_pcm_lookup on publication_content_map (content_type, content_id, edition_id);
create index idx_pcm_node   on publication_content_map (node_id);

-- 최신 지원 판본 뷰 (구판 자동 제외)
create or replace view v_current_editions as
select distinct on (publication_id) *
  from publication_editions
 where status in ('frozen','printed')
 order by publication_id, edition_seq desc;
```

`page_no`가 null이면 `toc_path`로 폴백 표기합니다. 초기에는 `toc_path`만으로도 정오표가 성립합니다(§11).

### 3.5 추록호(Bulletin)

```sql
create table errata_bulletins (
  bulletin_id      uuid primary key default gen_random_uuid(),
  edition_id       uuid not null references publication_editions(edition_id),
  bulletin_no      int not null,
  title            text,
  summary          text,
  period_start     date,                    -- 자동 생성 시 대상 기간
  period_end       date,
  issued_at        timestamptz,
  pdf_url          text,
  status           text not null default 'draft'
    check (status in ('draft','issued','canceled')),
  generated_by     text not null default 'manual'
    check (generated_by in ('manual','cron')),
  created_at       timestamptz not null default now(),
  unique (edition_id, bulletin_no)
);

create table errata_bulletin_items (
  bulletin_id      uuid not null references errata_bulletins(bulletin_id),
  revision_id      uuid not null references content_revisions(revision_id),
  sort_order       int not null,
  primary key (bulletin_id, revision_id)
);
```

### 3.6 수험생 확인 추적

```sql
create table errata_reads (
  user_id          uuid not null,
  revision_id      uuid not null references content_revisions(revision_id),
  read_at          timestamptz not null default now(),
  acknowledged_at  timestamptz,
  primary key (user_id, revision_id)
);
```

발송했다는 사실이 아니라 **열었다는 사실**을 추적해야 "신속히 전달"이 실효를 갖습니다.

### 3.7 사용자 교재 등록

```sql
create table user_publications (
  user_id          uuid not null,
  edition_id       uuid not null references publication_editions(edition_id),
  registered_at    timestamptz not null default now(),
  primary key (user_id, edition_id)
);
```

정오표 발송 대상 산정에 사용합니다. 미등록자는 수강 과목 기준으로 폴백합니다.

---

## 4. 워크플로

### 4.1 경로1 — 자동 기록 후 고지 (기본 경로)

```
① 어드민이 편집기에서 콘텐츠 수정 → 저장
        ↓
② DB 트리거가 content_revisions 자동 INSERT
   notice_status='none' / apply_status='applied' / merge_status='pending'
   (온라인 콘텐츠는 이 시점 이미 최신, 축C는 자동으로 차기 판 대기열 진입)
        ↓
③ 저장 직후 배너: "이 변경을 수험생에게 고지할까요?"
   [내부 수정] → 그대로 종료 (원장에는 남음)
   [추록/정오표 발행] → ④
        ↓
④ 발행 모달 — diff 자동 프리필
   유형 / 중요도 / 근거 / 시행일 / 적용 회차 / 재채점 여부
   대상 위치: node_id → publication_content_map 역참조로 자동 산출
        ↓
⑤ notice_status='published', published_at=now()
   (결정 2: 검수 필수 아님. '나중에 발행'을 고르면 pending으로 대기)
        ↓
⑥ severity='critical' → 즉시 개별 알림톡 + 학습화면 인라인 배너 활성
   그 외 → 추록호 대기열 적재
        ↓
⑦ 매월 1일 pg_cron이 draft 추록호 자동 생성 → 운영자 확인·발행 (§8)
        ↓
⑧ 차기 판 인쇄 시 freeze_edition() → merge_status='merged' (§7)
```

### 4.2 축별 상태 전이

```
축A. 고지
  none ──[발행 버튼]──→ published ──[오발행]──→ withdrawn
    └──[나중에 발행]──→ pending ──[발행]──→ published
                          └──[취소]──→ none

축B. 콘텐츠
  applied                              (트리거 자동 기록의 기본값)
  scheduled ──[시행일 도래/pg_cron]──→ applied
  pending ──[승인]──→ applied
  applied ──[철회]──→ reverted
  skipped                              (추록 전용, 본문 미반영)

축C. 판본
  pending ──[freeze_edition]──→ merged
  pending ──[원고 미반영 결정]──→ excluded
```

`withdrawn`은 삭제가 아닙니다. 철회 사실 자체를 새 revision(`withdraws_revision_id`)으로 남기고 **"직전 정오표 제N-3항 철회" 고지가 나가야** 합니다. 잘못된 정오표를 조용히 지우는 것이 가장 위험합니다.

### 4.3 예약 반영 처리 (축B `scheduled` → `applied`)

```sql
-- pg_cron 일 1회 실행
create or replace function fn_apply_scheduled_revisions(p_dry_run boolean default true)
returns jsonb language plpgsql security definer as $$
declare v_targets jsonb; v_cnt int;
begin
  select jsonb_agg(jsonb_build_object(
           'revision_id', revision_id, 'content_type', content_type,
           'content_id', content_id, 'scheduled_for', scheduled_for)),
         count(*)
    into v_targets, v_cnt
    from content_revisions
   where apply_status = 'scheduled' and scheduled_for <= current_date;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'count', v_cnt, 'targets', coalesce(v_targets,'[]'::jsonb));
  end if;

  -- ⚠ 콘텐츠 UPDATE 시 로깅 트리거 우회 (중복 revision 방지)
  perform set_config('lidam.skip_revision_log', 'on', true);
  --   … pending_payload를 대상 테이블에 적용 …
  perform set_config('lidam.skip_revision_log', 'off', true);

  update content_revisions
     set apply_status = 'applied', applied_at = now()
   where apply_status = 'scheduled' and scheduled_for <= current_date;

  return jsonb_build_object('applied', true, 'count', v_cnt);
end $$;
```

**중복 기록 방지가 핵심 디테일입니다.** 예약 반영이 콘텐츠 테이블을 UPDATE하면 로깅 트리거가 또 revision을 만듭니다. `lidam.skip_revision_log` GUC로 우회한 뒤 원본 revision의 상태만 전이시켜야 합니다.

---

## 5. 수험 도메인 특수 처리

### 5.1 시행일 vs 시험 적용 회차

변리사 시험은 **시험일 기준 시행 중인 법령**을 적용합니다. 공포됐지만 미시행이면 구법이 정답입니다.

- 모든 revision에 `effective_date` + `applies_from_exam_round` 필수
- 학습 화면 상단 **"2027년 시험 기준" 토글**
- 구법/신법 병기, 신법은 접힌 상태 기본

이걸 빼면 개정 반영이 오히려 수험생을 틀리게 만듭니다.

### 5.2 노드 연동 — 이 시스템의 숨은 핵심

`node_id` 스파인에 spaced repetition과 약점노드 분석이 이미 붙어 있으므로, 개정을 학습 흐름에 주입할 수 있습니다.

```
revision(node_id=X, severity=critical, notice_status='published')
   → 해당 노드 복습카드 보유 학습자 조회
   → 카드에 stale_flag 부여, 다음 복습 우선순위 상향
   → 복습 진입 시 인라인 배너 "이 노드는 2026.1.1. 개정 반영됨"
```

**정오표 탭만 만들면 열람률이 20%를 넘기 어렵습니다.** 학습하다가 만나게 만드는 인라인 배너가 전달률을 좌우합니다.

⚠ 상표/디자인 노드 태깅 공백(기지 이슈)이 해소되지 않으면 해당 과목은 이 기능이 무력화됩니다. `node_id`를 nullable로 둔 이유이며, 태깅 없이도 정오표 탭은 정상 동작합니다.

### 5.3 정답 변경 → 재채점 (결정 4: 건별 판단)

**자동 재채점은 하지 않습니다.** 발행 시 `requires_regrade` 플래그만 세우고, 운영자가 건별로 판단해 실행합니다.

**데이터 원칙:** 과거 시도 기록은 절대 수정하지 않고 채점 버전을 append합니다.

```sql
alter table <응시기록테이블>
  add column grading_version int not null default 1,
  add column regraded_from_revision_id uuid references content_revisions(revision_id);
```

- 기존 레코드 보존 (`grading_version=1`)
- 재채점 결과를 **새 레코드**로 append (`grading_version=2`)
- 통계·약점노드 집계는 `max(grading_version)` 기준
- 재채점 실행 전 **dry-run 필수** (영향 인원·건수 확인)
- 실행 시 해당 수험생에게 "정답 정정으로 채점 결과가 변경되었습니다" 개별 고지

---

## 6. UI 설계

### 6.1 어드민 — 편집기

```
┌─ 조문 편집: 특허법 제94조 ─────────────────────────────┐
│  [본문 에디터]                                          │
│  ┌─ 변경 감지 ────────────────────────────────────┐    │
│  │ 3개 필드 변경됨 · 자동 diff 미리보기 [펼치기]     │    │
│  └────────────────────────────────────────────────┘    │
│         [내부 수정으로 저장]  [저장 + 추록/정오표 발행] │
└────────────────────────────────────────────────────────┘
```

버튼을 둘로 나눕니다. 별도 페이지로 보내면 아무도 안 씁니다.

### 6.2 어드민 — 발행 모달 (결정 2·3·4 반영)

```
┌─ 추록/정오표 발행 ──────────────────────────────────────┐
│ 유형   ○정오 ●법령개정 ○판례변경 ○추록 ○정답정정 ○삭제 │
│ 중요도 ○긴급(즉시발송) ●보통(추록호) ○경미               │
│                                                         │
│ 대상 위치  [자동] 특허법 기본서 제3판 p.312             │
│                                                         │
│ ┌ 변경 전 ───────────┐ ┌ 변경 후 ───────────┐          │
│ │ (diff 자동 프리필)  │ │ (diff 자동 프리필)  │ ← 편집가능│
│ └────────────────────┘ └────────────────────┘          │
│                                                         │
│ 근거   [법률 제20521호]   공포 [2025-08-01]             │
│ 시행일 [2026-01-01]       적용 [제63회 시험부터 ▾]       │
│ 콘텐츠 반영  ○즉시  ●시행일 예약  ○반영 안 함           │
│                                                         │
│ ☑ 관련 노드 복습카드 재학습 플래그                       │
│ ☐ 과거 응시기록 재채점  [영향 확인 (dry-run)]           │
│                                                         │
│                          [취소]  [나중에]  [발행]       │
└─────────────────────────────────────────────────────────┘
```

v1.0 대비 제거: 구판 병행 고지 블록(결정 3), [검수요청] 버튼(결정 2).
추가: "콘텐츠 반영" 선택(축B 제어), 재채점 dry-run 버튼(결정 4).

### 6.3 어드민 — 추록 대기함

과목 / 판본 / 중요도 / 미발행 경과일 필터. 경과 30일 초과 항목 경고. 일괄 선택 → 추록호 생성 → PDF 미리보기 → 발행.

### 6.4 수험생 — 학습정보 > 추록·정오표

```
┌ 추록 · 정오표 ────────────── [내 교재 등록 ▾] ─────────┐
│  특허법 기본서 제3판 ▾    미확인 3건 ●                  │
│  [전체] [긴급] [법령개정] [정답정정]      [PDF 전체받기] │
│                                                         │
│ ● 긴급 · 정답정정 · 2026-03-12                          │
│   객관식 15번 정답 ③ → ②                                │
│   p.400 · 관련노드: 특허 > 실시권 > 통상실시권           │
│   [자세히] [해당 문제 다시 풀기] [확인]                  │
│ ─────────────────────────────────────────────────────── │
│ ○ 법령개정 · 2026-01-01 시행 (제63회 시험부터)          │
│   제94조 개정 · p.312 · 신·구조문 대비표 [펼치기]        │
└─────────────────────────────────────────────────────────┘
```

**[PDF 전체받기]**가 의외로 중요합니다. 수험생은 출력해서 책에 끼웁니다. 페이지순 정렬 + 여백 최소 레이아웃으로 렌더링합니다.

구판 소지자에게는 목록 대신 **"제3판 정오표만 제공됩니다"** 안내와 최신판 구매 링크를 노출합니다(결정 3).

### 6.5 인라인 배너

콘텐츠 상세 진입 시 해당 `content_id`에 `notice_status='published'` revision이 있고 미확인이면 상단 얇은 배너 → 클릭 확장 → `errata_reads` 기록.

---

## 7. 판본 프리즈 — 축C 반영

```sql
create or replace function fn_freeze_edition(
  p_new_edition_id uuid,
  p_dry_run boolean default true
) returns jsonb
language plpgsql security definer as $$
declare
  v_prev uuid; v_merge_cnt int; v_unresolved jsonb; v_result jsonb;
begin
  -- 1. 직전 판본 식별
  select e.edition_id into v_prev
    from publication_editions e
    join publication_editions n on n.publication_id = e.publication_id
   where n.edition_id = p_new_edition_id
     and e.edition_seq < n.edition_seq
     and e.status in ('frozen','printed')
   order by e.edition_seq desc limit 1;

  -- 2. 병합 대상 (축C pending)
  select count(*) into v_merge_cnt
    from content_revisions
   where source_edition_id = v_prev and merge_status = 'pending';

  -- 3. 미해결 점검 — 축B가 아직 정착되지 않은 항목
  select jsonb_agg(jsonb_build_object(
           'revision_id', revision_id, 'apply_status', apply_status,
           'title', errata_title, 'scheduled_for', scheduled_for))
    into v_unresolved
    from content_revisions
   where source_edition_id = v_prev
     and merge_status = 'pending'
     and apply_status in ('pending','scheduled');

  v_result := jsonb_build_object(
    'dry_run', p_dry_run, 'prev_edition_id', v_prev,
    'to_merge_count', v_merge_cnt,
    'unresolved', coalesce(v_unresolved,'[]'::jsonb),
    'blocked', (v_unresolved is not null));

  if p_dry_run then return v_result; end if;

  if v_unresolved is not null then
    raise exception '미정착 개정이 있어 프리즈할 수 없습니다. 각 항목을 merged 또는 excluded로 결정하세요: %', v_unresolved;
  end if;

  update content_revisions
     set merge_status = 'merged',
         merged_into_edition_id = p_new_edition_id,
         merged_at = now()
   where source_edition_id = v_prev and merge_status = 'pending';

  update publication_editions
     set status = 'frozen', frozen_at = now()
   where edition_id = p_new_edition_id;

  update publication_editions set status = 'superseded' where edition_id = v_prev;

  return v_result || jsonb_build_object('applied', true);
end $$;
```

**프리즈 이후 절차:**

1. **원고 익스포트** — 현재 마스터를 `publication_content_map.sort_key` 순으로 DOCX/IDML 렌더 → 조판
2. **개정사항 목록 자동 생성** — `merged_into_edition_id = 신판` 조회 → 개정판 서문의 "이번 판 주요 변경" 섹션
3. **페이지 역주입** — 조판 확정 후 페이지 번호를 신판 `publication_content_map.page_no`에 반영
4. 신판 `frozen_at` 이후 개정이 자동으로 신판 추록 대상이 됨

이 루프가 한 바퀴 돌면 이중 관리는 구조적으로 사라집니다.

---

## 8. 추록호 발행 (결정 5)

### 8.1 월 1회 자동 초안 + 수동 발행

```sql
-- pg_cron: 매월 1일 09:00
select cron.schedule('errata-monthly-draft', '0 9 1 * *', $$
  select fn_generate_monthly_bulletin_draft();
$$);
```

`fn_generate_monthly_bulletin_draft()` 동작:

1. 지난달 `notice_status='published'` + 추록호 미배정 revision 조회
2. 판본별로 그룹핑 → `errata_bulletins` **draft** 생성 (`generated_by='cron'`)
3. `errata_bulletin_items` 자동 채움 (페이지순 정렬)
4. 대상 0건이면 생성하지 않음
5. **발송하지 않음.** 운영자에게 "추록호 초안 N건 대기" 알림만

### 8.2 운영자 개입 지점

| 동작 | 설명 |
|---|---|
| 항목 조정 | 초안에서 제외/추가, 순서 변경 |
| 발행 | `status='issued'` → PDF 렌더 → 알림톡 발송 |
| 수시 발행 | 주기와 무관하게 대기함에서 즉시 추록호 생성·발행 |
| 건너뛰기 | 이번 달 발행 보류 (항목은 다음 호로 이월) |

`severity='critical'`은 추록호와 별개로 발행 즉시 개별 발송합니다.

---

## 9. 알림 연동 (Solapi 알림톡)

기존 인프라(pfId 발급 완료)에 템플릿 2종 추가.

| 상황 | 템플릿 | 대상 |
|---|---|---|
| `critical` 발행 | 긴급 정오 안내 (제목 + 딥링크) | 해당 과목 수강생 |
| 추록 제N호 발행 | 정기 추록 안내 (건수 + PDF 링크) | `user_publications` 등록자 |

- 발송은 상태 전이 이벤트를 **큐에 적재 후 비동기 처리** (편집 트랜잭션과 분리)
- 딥링크 `/study/errata?rev={revision_id}` → 진입 시 `errata_reads` 자동 기록
- 야간 억제(21시~08시 보류), 동일인 일 3건 상한

---

## 10. Phase 0 감사 항목

> 상세 실행 절차는 `errata-phase01-instruction.md` 참조.

| # | 항목 | 판단 기준 |
|---|---|---|
| A1 | 대상 테이블명·PK 컬럼·PK 타입 | `content_id` text 정규화 필요성 확인 |
| A2 | `updated_at`/`node_id`/정답 필드 정확한 컬럼명 | 트리거 인자 확정 |
| A3 | 기존 이력 테이블·트리거 존재 여부 | 중복 시 통합 판단 |
| A4 | `node_id` 태깅 커버리지 | 상표/디자인 0% 이슈 재확인 |
| A5 | 행 수 및 최근 6개월 변경 빈도 | 원장 볼륨 추정 |
| A6 | **노이즈 컬럼 식별** | 최우선. 누락 시 원장 오염 |
| A7 | `pg_cron`·`pgcrypto` 활성 여부 | 예약 반영/정기 발행 전제 |
| A8 | RLS 정책 및 관리자 판별 방식 | 원장 정책 작성 |
| A9 | 유통 중 교재 판본 목록 | `publication_editions` 시드 |

---

## 11. 페이지 매핑 확보 — 3안

수험생에게 쓸모 있는 정오표는 **"p.312 3행"**이 찍혀야 합니다. 없으면 자기 책에서 못 찾고 정오표는 사문화됩니다.

| 안 | 방법 | 비용 | 정확도 | 적용 |
|---|---|---|---|---|
| 1안 | 조판 원본(IDML/HWP)에서 콘텐츠 ID ↔ 페이지 자동 추출 | 중 | 높음 | 조판 파일에 ID가 심겨 있을 때 |
| 2안 | 책 PDF에서 조문번호·문제번호 정규식 추출 | 중 | 중 | 조문·객관식 보강용 |
| 3안 | 페이지 포기, `toc_path`만으로 시작 | 낮음 | 낮음 | **MVP 출발점** |

**권장 경로: 3안 출시 → 2안 보강 → 신판부터 1안 정착(§7-3 역주입).**
신판을 한 번 이 파이프라인으로 찍으면 페이지 매핑이 자동 확보됩니다. 구판 소급은 하지 않습니다(결정 3).

---

## 12. 로드맵 (결정 6 반영)

| Phase | 범위 | 산출물 | 예상 |
|---|---|---|---|
| **0** | 읽기 전용 감사 | `phase0-audit-report.md` | 0.5일 |
| **1** ★ | **원장 인프라 단독 배포** | `content_revisions` + 자동 기록 트리거 + append-only 가드. UI 없음 | 2일 |
| 2 | 판본·매핑 | `publications`/`publication_editions`/`publication_content_map` + 현행 판본 시드(toc_path) | 2일 |
| 3 | 어드민 발행 | 편집기 이중 버튼, 발행 모달, diff 프리필, 예약 개정 폼, 대기함 | 3일 |
| 4 | 수험생 노출 | 추록·정오표 탭, `errata_reads`, 미확인 뱃지, 교재 등록 | 2일 |
| 5 | 배포 | 추록호 생성(cron draft), PDF 렌더, 알림톡 | 3일 |
| 6 | 학습 연동 | 인라인 배너, 복습카드 stale 플래그, 재채점 dry-run | 3일 |
| 7 | 판본 프리즈 | `fn_freeze_edition`, 원고 익스포트, 페이지 역주입 | 차기 개정판 시점 |

**Phase 1을 즉시 단독 배포합니다.** UI가 없어도 원장이 쌓이기 시작하면 Phase 3 개시 시점에 이미 축적분이 있습니다. **지금 켜지 않으면 그 기간의 모든 수정 이력은 영구 소실됩니다.**

---

## 13. 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| **노이즈 컬럼 누락** | 원장이 하루 수만 건으로 오염, 실제 개정 매몰 | Phase 0 A6, 트리거 제외 목록, 48시간 모니터링 |
| 페이지 매핑 부재 | 정오표 실용성 급락 | §11 3안 출발, 신판부터 자동화 |
| 노드 태깅 공백(상표/디자인) | 인라인 배너·복습 연동 무력화 | `node_id` nullable, 후행 연동 |
| **잘못된 정오표 발행** | 수험생 오답 유발 — 최악 | `withdrawn` 명시 고지, 조용한 삭제 금지 |
| 시행일 오적용 | 현행 대비생에게 신법 노출 | `applies_from_exam_round`, 시험기준 토글 |
| 예약 반영 중복 기록 | 원장 왜곡 | `lidam.skip_revision_log` GUC 우회 |
| 재채점 부작용 | 통계·약점노드 왜곡 | `grading_version` append, dry-run 게이트 |
| 열람률 저조 | 전달 목적 미달성 | 인라인 배너(§5.2)가 핵심 |
| 원장 볼륨 증가 | 스토리지·쿼리 성능 | jsonb 압축, 24개월 후 콜드 파티션 |

---

## 부록 A. 용어

| 용어 | 정의 |
|---|---|
| 원장 (revision ledger) | `content_revisions`. 모든 콘텐츠 변경의 append-only 기록 |
| 판본 프리즈 (freeze) | 특정 시점 마스터를 인쇄 원고로 확정, `frozen_at` 기록 |
| 3축 | 고지(축A) / 콘텐츠 반영(축B) / 판본 병합(축C) |
| 추록호 (bulletin) | 여러 정오 항목을 묶은 배포 단위, 제N차 추록 |
| 노이즈 컬럼 | 조회수·정답률 등 실시간 갱신되어 원장 기록 대상이 아닌 컬럼 |

## 부록 B. v1.0 → v1.1 변경 요약

| v1.0 | v1.1 |
|---|---|
| 단일 `status` (recorded→published→merged) | **3축 독립 상태** (`notice_status`/`apply_status`/`merge_status`) |
| `pending_review` 필수화 검토 | 선택 경유로 격하, 발행 직행이 기본 |
| 구판 병행 고지 자동탐지 | 제거, 최신판만 지원 |
| 재채점 정책 3안 병기 | 건별 판단 + dry-run 확정 |
| 추록호 주기 미정 | 월 1회 cron draft + 수동 발행 확정 |
| revision 생성 경로 1개(트리거) | 경로 2개(트리거 / 예약 개정 폼) 명시 |
| 예약 반영 중복 기록 미검토 | GUC 우회 로직 명시 |
