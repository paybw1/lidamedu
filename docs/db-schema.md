# db-schema.md — DB 스키마 SSoT

> **목적**: 변리사 학습 플랫폼 DB 의 모든 테이블/컬럼/인덱스/RLS 의 단일 진실. 변경 시 본 문서 + 마이그레이션 + `npm run db:typegen` 을 동시에 갱신한다.
> **의존**: `docs/spec-detail-5-4-subjects-A.md` (5.4 도메인), `docs/article-tree.md` (조문 트리), `docs/relations.md` (5종 관계).
> **현재 적용 마이그레이션** (Supabase): `20260427063558 create_profiles_for_signup`, `20260427064032 harden_signup_and_add_email_lookup`. 본 문서의 다른 모든 테이블은 **계획 상태** 로, M2 진입 시 단계적 마이그레이션으로 적용한다.

---

## 0. 한 눈에 보는 도메인 맵

```
auth.users (Supabase)
  └ profiles                            [✅ 적용됨]
       ├ user_role (student/instructor/manager/admin)
       └ marketing_consent

laws  ──┐
        ├ articles ── article_revisions  ─ law_revisions
        │     │
        │     ├ article_systematic_links ─ systematic_nodes
        │     │
        │     ├ article_article_links             [관계 1/5]
        │     ├ article_case_links                [관계 2/5]
        │     │
        │     ├ user_bookmarks (target_type='article')
        │     ├ user_memos
        │     ├ user_highlights
        │     └ user_qna_threads
        │
cases ──┤
        ├ case_case_links                          [관계 3/5]
        ├ case_papers (관련논문)
        ├ case_articles (선거기사)
        └ user_* (annotations)

problems ──┐
        │  ├ problem_choices (1차 객관식 보기)
        │  ├ problem_grading_criteria (2차 채점기준)
        │  ├ problem_model_answers (2차 모범답안)
        │  ├ problem_article_links                 [관계 4/5]
        │  ├ problem_case_links                    [관계 5/5]
        │  └ user_* (annotations)
        │
        ├ user_problem_attempts (객관식 시도)
        └ essay_submissions (2차 답안)
              └ essay_grade_assignments (교차 배정)
                    └ essay_grades (채점 결과)

study_sessions / daily_study_stats   (학습 진도 집계)
papers (논문)
science_sections / science_subjects   (자연과학 단원)
cohorts / cohort_members              (반·기수)
notification_queue                    (이메일·알림)
```

---

## 1. 컨벤션

### 1.1 명명

- 테이블: 소문자 복수 snake_case (`articles`, `problem_choices`)
- 기본키: `<단수>_id` (`article_id`, `case_id`)
- 외래키: 참조 테이블의 PK 컬럼명 그대로
- enum: 도메인 prefix (`user_role`, `aa_relation_type`)
- 인덱스: `<table>_<col(s)>_<kind>` (`articles_path_gist`)

### 1.2 공통 컬럼

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `created_at` | `timestamptz` not null default `now()` | |
| `updated_at` | `timestamptz` not null default `now()` | `set_updated_at` 트리거로 자동 갱신 |
| `deleted_at` | `timestamptz` (nullable) | **사용자 학습 데이터** + **조문/판례** 는 soft-delete (CLAUDE.md Non-negotiable #9) |

### 1.3 RLS 원칙

- **콘텐츠 (조문/판례/문제/논문/연관관계)**: 인증 사용자 전체 읽기, 강사·운영자 쓰기
- **사용자 학습 데이터 (메모/하이라이트/즐겨찾기/Q&A/시도)**: 본인만 R/W. 강사는 자기 반 학생 데이터 옵션 (학생 동의 시)
- **커뮤니티 게시판 (글/댓글)**: 인증 사용자 전체 읽기 + 본인만 작성 + 본인·운영자(manager↑) 수정·삭제 (하이브리드). §21
- **관리 데이터 (cohort/notification)**: 운영자만

### 1.4 Drizzle 미사용 — Supabase 클라이언트 직접

CLAUDE.md 결정사항에 따라 Drizzle 제거 완료. 서버 쿼리는 `supa-client` (`makeServerClient(request)`) 또는 `supa-admin-client` (RLS 우회 필요 시) 로 작성한다.

---

## 2. profiles  ✅ 적용됨

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `profile_id` | uuid PK | `auth.users.id` 참조 (cascade) |
| `name` | text not null | |
| `avatar_url` | text | |
| `role` | `user_role` enum (`student`/`instructor`/`manager`/`admin`) | default `student`. 등급: student<instructor<manager<admin (feat-7-031) |
| `marketing_consent` | boolean default false | |
| `access_approved_at` | timestamptz | 서비스 접근 승인 게이트. NULL=승인 대기(신규 가입 기본), NOT NULL=승인. 승인/해제는 `/admin/users` (service_role 전용). 게이트: `requireAccessApproval` (private/dashboard layout, staff 면제) |
| `membership_test_grade` | text | 등급 체험 테스트(원장 전용, `/admin/membership-test`). `trial`/`free_member`/`cohort`/`plan:<code>`/NULL. `getMembershipAccess` 가 staff 역할일 때만 반영 — 학생이 조작해도 무효 |
| `created_at` / `updated_at` | timestamptz | |

**RLS**: select/update/delete-own-profile (본인만).
**트리거**: `on_auth_user_created` → `handle_new_user()` 가 가입 시 자동 row 생성. `profiles_guard_role_change` → `role` 자가 변경(self-escalation) 차단 — service_role(운영자 API)만 허용 (feat-7-031). `trg_prevent_access_approval_self_change` → `access_approved_at` 자가 변경 차단 — service_role 만 허용 (`scripts/sql/add_access_approved_at.sql`).

> 적용된 SQL: `sql/signup_setup.sql` + `harden_signup_and_add_email_lookup`.
> 추가 RPC: `email_already_registered(p_email text) returns boolean` (service_role 만 호출 가능).

---

## 3. laws / law_revisions

```sql
create type public.law_change_kind as enum ('created','amended','deleted');

create table public.laws (
  law_id          uuid primary key default gen_random_uuid(),
  law_code        text not null unique,        -- 'patent' / 'trademark' / 'design' / 'civil' / 'civil-procedure'
  display_label   text not null,                -- '특허법'
  short_label     text not null,                -- '特法'
  ord             int not null,                 -- 메뉴 정렬 순서
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.law_revisions (
  law_revision_id uuid primary key default gen_random_uuid(),
  law_id          uuid not null references laws(law_id),
  revision_number text not null,               -- '법률 제 21065호'
  revision_kind   public.law_revision_kind not null default 'act', -- act/decree/rule
  promulgated_at  date,                         -- 공포일 ("조문에 반영" 시 set)
  effective_date  date,                         -- 시행일 ("조문에 반영" 시 set). 노출·현행 여부의 단일 기준
  reason_md       text,                         -- 개정이유
  comparison_pdf  text,                         -- 신구조문대비표 URL (Storage)
  explanation_pdf text,                         -- 개정해설 PDF URL
  video_url       text,                         -- 동영상
  created_at      timestamptz not null default now()
);
```

- "최신 정보 — 법 개정" (`feat-3-101~103`) 화면이 이 테이블 직접 사용. **초안/검토/발행 상태·발행일(`status`/`published_at`) 없음** — 노출·현행 전환은 `effective_date` 로만 결정 (`feat-7-004`).
- `effective_date IS NULL` = 미반영(작성 중, staff 만 열람) / `effective_date > 오늘` = 시행 예정 / `<= 오늘` = 시행 중.
- 반영 RPC `apply_law_revision(p_law_revision_id, p_promulgated_at, p_effective_date)`: article_revisions 에 시행일 스탬프 + 직전본 `expired_date` 마감 + 시행일 도래분만 `articles.current_revision_id` 스왑. 시행일 도래 자동 전환은 cron `promote_effective_revisions()`.
- 불변성: 트리거 `article_revisions_protect_in_force` — 시행 중(effective_date ≤ 오늘) 스냅샷의 본문·식별 필드 수정·삭제 금지 (미래/미반영은 편집 가능, `expired_date` 는 예외).
- `comparison_pdf` 와 `explanation_pdf` 는 다운로드 가능 (PPT slide 14)

---

## 4. articles + article_revisions

자세한 설계는 **`docs/article-tree.md`** 참조. 핵심만 재게시:

```sql
create extension if not exists ltree;
create extension if not exists pg_trgm;

create type public.article_level as enum
  ('part','chapter','section','article','clause','item','sub');

create table public.articles (
  article_id            uuid primary key default gen_random_uuid(),
  law_id                uuid not null references laws(law_id),
  parent_id             uuid references articles(article_id),
  level                 public.article_level not null,
  path                  ltree not null,
  article_number        text,
  clause_number         int,
  item_number           int,
  sub_item_number       text,
  display_label         text not null,
  current_revision_id   uuid,                    -- FK 추가는 article_revisions 생성 후
  importance            smallint default 1 check (importance between 1 and 3),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (law_id, path)
);

create index articles_path_gist on articles using gist (path);
create index articles_path_btree on articles using btree (path);
create index articles_label_trgm on articles using gin (display_label gin_trgm_ops);
create index articles_law on articles(law_id);

create table public.article_revisions (
  revision_id      uuid primary key default gen_random_uuid(),
  article_id       uuid not null references articles(article_id) on delete cascade,
  law_revision_id  uuid not null references law_revisions(law_revision_id),
  body_json        jsonb not null,
  effective_date   date not null,
  expired_date     date,
  change_kind      public.law_change_kind not null,
  created_at       timestamptz not null default now(),
  created_by       uuid references profiles(profile_id)
);

create index article_revisions_article on article_revisions(article_id);
create index article_revisions_effective on article_revisions(effective_date);

alter table public.articles
  add constraint articles_current_revision_fk
  foreign key (current_revision_id)
  references article_revisions(revision_id);
```

### 4.1 불변 강제 트리거

```sql
create or replace function public.article_revisions_immutable()
returns trigger
language plpgsql
as $$
begin
  if OLD.body_json is distinct from NEW.body_json
     or OLD.effective_date is distinct from NEW.effective_date
     or OLD.change_kind is distinct from NEW.change_kind
  then
    raise exception 'article_revisions are immutable once written';
  end if;
  return NEW;
end;
$$;

create trigger article_revisions_no_modify
  before update on public.article_revisions
  for each row execute function public.article_revisions_immutable();
```

### 4.2 RLS

```sql
alter table public.articles enable row level security;
alter table public.article_revisions enable row level security;

create policy "read-articles"
  on public.articles for select to authenticated using (deleted_at is null);

create policy "instructor-admin-write-articles"
  on public.articles for all to authenticated
  using ((select get_role()) in ('instructor','admin'))
  with check ((select get_role()) in ('instructor','admin'));

-- helper
create or replace function public.get_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role::text from public.profiles where profile_id = auth.uid()
$$;
```

> `get_role()` 은 RLS 정책에서 반복 사용. SECURITY DEFINER 로 두되 EXECUTE 는 authenticated 에만 grant.

---

## 5. systematic_nodes (체계도 트리)

```sql
create table public.systematic_nodes (
  node_id         uuid primary key default gen_random_uuid(),
  law_code        text not null,
  parent_id       uuid references systematic_nodes(node_id),
  path            ltree not null,
  display_label   text not null,
  ord             int not null default 0,
  created_at      timestamptz not null default now()
);

create index systematic_nodes_path_gist on systematic_nodes using gist (path);

create table public.article_systematic_links (
  article_id  uuid references articles(article_id) on delete cascade,
  node_id     uuid references systematic_nodes(node_id) on delete cascade,
  primary key (article_id, node_id)
);

create index asl_article on article_systematic_links(article_id);
create index asl_node on article_systematic_links(node_id);
```

`feat-4-A-004` 정렬축 토글에서 사용.

---

## 6. cases + 관련 자료

```sql
create type public.case_court as enum
  ('supreme', 'patent_court', 'high_court', 'district_court');

create table public.cases (
  case_id            uuid primary key default gen_random_uuid(),
  subject_laws       text[] not null,            -- {'patent','design'} 다과목 가능
  court              public.case_court not null,
  decided_at         date not null,
  case_number        text not null,              -- '2013도10265'
  case_title         text not null,              -- '【특허법 위반】'
  nickname           text check (char_length(nickname) <= 100),  -- 판례 통칭 (예: 수지상 세포 사건). 선택
  is_en_banc         boolean not null default false,
  importance         smallint default 1 check (importance between 1 and 3),
  summary_title      text,                       -- 판결요지 제목
  summary_body_md    text,                       -- 판결요지 내용
  reasoning_md       text,                       -- 판시이유 (교재 기반 편집물)
  full_text_pdf      text,                       -- 판결전문 PDF URL (Storage)
  comment_source     text,                       -- 코멘트 출처
  comment_body_md    text,                       -- 코멘트 본문
  -- 국가법령정보 OPEN API 적재 (scripts/precedents/import-law-precedents.ts).
  -- 교재 reasoning_md/comment_body_md 와 의미·임베딩 청크 분리(A안).
  official_text_md   text,                       -- 공식 판결 전문 (API <판례내용> 정규화 결과)
  law_api_serial_id  text,                       -- API <판례정보일련번호> — 본문 재호출 캐시
  search_tsv         tsvector generated always as
                     (to_tsvector('simple', coalesce(summary_body_md,'') || ' ' || coalesce(reasoning_md,''))) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index cases_decided on cases(decided_at desc);
create index cases_court on cases(court);
create index cases_case_number_trgm on cases using gin (case_number gin_trgm_ops);
create index cases_search_tsv on cases using gin (search_tsv);
create index cases_subject_laws on cases using gin (subject_laws);
create index cases_law_api_serial_id_idx on cases (law_api_serial_id) where law_api_serial_id is not null;

-- 관련 논문/기사
create table public.case_papers (
  case_id      uuid references cases(case_id) on delete cascade,
  paper_id     uuid references papers(paper_id) on delete cascade,
  primary key (case_id, paper_id)
);

create table public.case_articles (
  link_id      uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases(case_id) on delete cascade,
  title        text not null,
  url          text,
  pdf_url      text,
  created_at   timestamptz not null default now()
);
```

> 판례 전문 검색은 `tsvector + pg_trgm` 우선 (결정사항 #3). pgvector 는 P2.

---

## 7. problems + 부속

```sql
create type public.problem_exam_round as enum ('first', 'second');
create type public.problem_subject_type as enum ('law', 'science');
create type public.problem_origin as enum ('past_exam', 'past_exam_variant', 'expected', 'mock');
create type public.problem_format as enum
  ('mc_short', 'mc_box', 'mc_case', 'ox', 'blank', 'subjective');
create type public.problem_polarity as enum ('positive', 'negative');
create type public.problem_scope as enum ('unit', 'comprehensive');

create table public.problems (
  problem_id          uuid primary key default gen_random_uuid(),
  exam_round          public.problem_exam_round not null,
  subject_type        public.problem_subject_type not null,
  law_id              uuid references laws(law_id),
  science_subject     text,                       -- 'physics','chemistry','biology','earth_science'
  science_section_id  uuid references science_sections(section_id),
  origin              public.problem_origin not null,
  format              public.problem_format not null,
  scope               public.problem_scope,        -- 단원/종합 (1차)
  polarity            public.problem_polarity,     -- 긍정/부정 (1차)
  year                int,                         -- 2019, 2026 …
  exam_round_no       int,                         -- 회차 (예: 63회)
  examined_at         date,                        -- 출제일
  problem_number      int,                         -- 문제 번호 (시험 안에서)
  systematic_path     ltree,                       -- 체계도 분류
  primary_article_id  uuid references articles(article_id),
  body_md             text not null,               -- 문제 본문
  total_points        smallint,                    -- 2차: 30점 등
  importance          integer check (importance is null or importance between 0 and 3), -- 강사·운영자 중요도 0~3 (feat-8-025). null=미평가
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  created_by          uuid references profiles(profile_id),
  source_gs_question_id uuid references gs_questions(question_id) on delete set null,  -- feat-10-001: GS 문항에서 승격된 경우 원본 문항
  released_at         timestamptz   -- feat-10-002: origin=mock 문제의 학습과목 공개 시각 (null=비노출)
);

create index problems_law on problems(law_id);
create index problems_systematic_gist on problems using gist (systematic_path);
create index problems_year on problems(year desc);
create index problems_format on problems(format);
create index problems_subject_type on problems(subject_type);
-- feat-10-001: GS 문항 → 주관식 문제 승격 멱등성 키 (soft delete 분 제외 → 재승격 허용)
create unique index uq_problems_source_gs_question on problems(source_gs_question_id)
  where source_gs_question_id is not null and deleted_at is null;
```

> **feat-10-001 — GS 문항 승격**: 종료된 GS 회차의 `gs_questions` 를 `problems`(format=subjective, origin=mock)로 승격할 때 `source_gs_question_id` 로 원본을 역참조한다. 단방향 스냅샷 — 승격 후 동기화 없음. 상세: `docs/features/feat-10-001-gs-question-promotion.md`.

> **feat-10-002 — 1차 모의고사 mock 가시성**: `origin='mock'` 문제는 `released_at IS NULL` 동안 학습과목 색인·맞춤 퀴즈에 비노출(`listProblemsBySubject` 게이트). 운영자가 mcq 팩 단위로 "학습과목 공개" 하면 `released_at` 설정. staff 문제 관리 화면(`admin-problems-list`)은 게이트 우회. 상세: `docs/features/feat-10-002-mock-exam-authoring.md`.

### 7.1 problem_choices (1차 객관식 보기)

```sql
create type public.choice_reference_kind as enum ('article', 'case', 'practice_theory');

create table public.problem_choices (
  choice_id          uuid primary key default gen_random_uuid(),
  problem_id         uuid not null references problems(problem_id) on delete cascade,
  ord                int not null,
  body_text          text not null,
  is_correct         boolean not null default false,
  explanation_md     text,
  reference_kind     public.choice_reference_kind,
  related_article_id uuid references articles(article_id),
  related_case_id    uuid references cases(case_id),
  created_at         timestamptz not null default now(),
  unique (problem_id, ord)
);

create index pc_problem on problem_choices(problem_id);
create index pc_article on problem_choices(related_article_id) where related_article_id is not null;
create index pc_case on problem_choices(related_case_id) where related_case_id is not null;
```

### 7.2 problem_keywords (2차 키워드)

```sql
create table public.problem_keywords (
  problem_id  uuid references problems(problem_id) on delete cascade,
  keyword     text not null,
  primary key (problem_id, keyword)
);
```

### 7.3 problem_grading_criteria + model_answers (2차)

```sql
create table public.problem_grading_criteria (
  criteria_id    uuid primary key default gen_random_uuid(),
  problem_id     uuid not null references problems(problem_id) on delete cascade,
  sub_question   smallint not null,         -- 1, 2, 3, 4 (소문제)
  points         smallint not null,
  description_md text,
  rubric_json    jsonb,                     -- 정량/정성 평가 항목 구조
  created_at     timestamptz not null default now(),
  unique (problem_id, sub_question)
);

create table public.problem_model_answers (
  answer_id      uuid primary key default gen_random_uuid(),
  problem_id     uuid not null references problems(problem_id) on delete cascade,
  body_md        text not null,
  related_case_ids uuid[],                  -- 관련 판례
  created_at     timestamptz not null default now(),
  created_by     uuid references profiles(profile_id)
);
```

---

## 8. user_problem_attempts (객관식 시도)

```sql
create table public.user_problem_attempts (
  attempt_id      uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(profile_id) on delete cascade,
  problem_id      uuid not null references problems(problem_id) on delete cascade,
  mode            text not null check (mode in ('study','exam')),
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  selected_choice_id uuid references problem_choices(choice_id),
  is_correct      boolean,
  time_spent_ms   int,
  retry_count     int default 0,
  exam_session_id uuid                       -- 모의고사 회차 묶음
);

create index upa_user on user_problem_attempts(user_id, submitted_at desc);
create index upa_problem on user_problem_attempts(problem_id);
create index upa_session on user_problem_attempts(exam_session_id);
```

> RLS: 본인 R/W. 통계 집계는 별도 view + service_role.

---

## 9. essay_submissions (2차 답안)

```sql
create table public.essay_submissions (
  submission_id   uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(profile_id) on delete cascade,
  problem_id      uuid not null references problems(problem_id) on delete cascade,
  mode            text not null check (mode in ('study','exam')),
  uploaded_files  jsonb not null,            -- [{kind:'pdf'|'jpeg', url, page_order, sub_question}]
  submitted_at    timestamptz,
  exam_session_id uuid,
  status          text not null default 'submitted' check (status in
                  ('draft','submitted','assigned','graded','published')),
  created_at      timestamptz not null default now()
);

create index essay_user on essay_submissions(user_id);
create index essay_problem on essay_submissions(problem_id);
```

### 9.1 essay_grade_assignments (교차 배정)

PPT slide 37·38 — 답안지 N개 생성, M명에게 부작위 교차 배정.

```sql
create type public.grader_role as enum ('peer_student', 'instructor', 'admin', 'ai');

create table public.essay_grade_assignments (
  assignment_id   uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references essay_submissions(submission_id) on delete cascade,
  grader_id       uuid references profiles(profile_id),  -- ai 일 때 null 가능
  grader_role     public.grader_role not null,
  shard_index     smallint not null,         -- 답안지 N분할 중 몇 번째 (1..N)
  total_shards    smallint not null,
  assigned_at     timestamptz not null default now(),
  due_at          timestamptz,
  status          text not null default 'pending' check (status in
                  ('pending','graded','reviewed','rejected')),
  unique (submission_id, grader_id, shard_index)
);

create index ega_submission on essay_grade_assignments(submission_id);
create index ega_grader on essay_grade_assignments(grader_id, status);
```

### 9.2 essay_grades (채점 결과)

```sql
create table public.essay_grades (
  grade_id          uuid primary key default gen_random_uuid(),
  assignment_id     uuid not null references essay_grade_assignments(assignment_id) on delete cascade,
  scores_json       jsonb not null,          -- {sub_q: {points: int, rubric: {...}}}
  total_score       int not null,
  qualitative_md    text,                     -- 정성 평가
  comment_md        text,                     -- 채점자 코멘트
  graded_at         timestamptz not null default now(),
  reviewer_id       uuid references profiles(profile_id), -- 강사 검수자
  reviewed_at       timestamptz
);
```

> 1 submission × N shards × M graders → 통계는 view 로 집계 (회차별 평균/표준점수/등급/순위).

---

## 10. Polymorphic 사용자 학습 데이터

CLAUDE.md Layer 2 #1 — 타깃은 polymorphic `(target_type, target_id)`.

```sql
create type public.annotation_target_type as enum
  ('article', 'case', 'problem', 'problem_choice');

-- 즐겨찾기 (♡ 5단계)
create table public.user_bookmarks (
  bookmark_id      uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(profile_id) on delete cascade,
  target_type      public.annotation_target_type not null,
  target_id        uuid not null,
  star_level       smallint not null check (star_level between 0 and 5),
  note_md          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (user_id, target_type, target_id)
);

-- 메모
create table public.user_memos (
  memo_id          uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(profile_id) on delete cascade,
  target_type      public.annotation_target_type not null,
  target_id        uuid not null,
  body_md          text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- 하이라이트
create table public.user_highlights (
  highlight_id     uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(profile_id) on delete cascade,
  target_type      public.annotation_target_type not null,
  target_id        uuid not null,
  field_path       text not null,            -- e.g. 'body_json.blocks[3].inline[2]' or 'reasoning_md'
  start_offset     int not null,
  end_offset       int not null,
  content_hash     text not null,            -- sha256 of selected text — 본문 변경 감지
  color            text not null check (color in ('green','yellow','red','blue',
                     -- 밑줄 계열(배경 없이 데코만): 기본색·주황(amber, 교재 밑줄 톤)·파랑 × 보통·굵게 (2026-07-18)
                     'underline','underline_thick','underline_orange','underline_orange_thick',
                     'underline_blue','underline_blue_thick')),
  label            text,                     -- '핵심','암기','의문','참고' (옵션)
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- 메모 (조문/판례/문제 자유 텍스트 — feat-8-021/023). 강사 작성=전체 공개, 수험생 작성=본인 전용.
create table public.content_comments (
  comment_id       uuid primary key default gen_random_uuid(),
  target_type      public.content_comment_target_type not null, -- article|case|problem
  target_id        uuid not null,
  body_md          text not null,
  author_id        uuid references profiles(profile_id) on delete set null,
  is_pinned        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz                                  -- feat-8-023 soft delete
);

-- Q&A 스레드
create table public.user_qna_threads (
  thread_id        uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(profile_id) on delete cascade,
  target_type      public.annotation_target_type not null,
  target_id        uuid not null,
  question_md      text not null,
  status           text not null default 'open' check (status in ('open','answered','closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.user_qna_replies (
  reply_id         uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references user_qna_threads(thread_id) on delete cascade,
  responder_id     uuid not null references profiles(profile_id),
  body_md          text not null,
  question_grade   text check (question_grade in ('high','mid','low')), -- 답변자가 질문 수준 평가
  created_at       timestamptz not null default now()
);
```

### 10.1 RLS

`user_bookmarks` / `user_qna_threads` / `user_qna_replies` — 본인만 R/W.

```sql
alter table public.user_bookmarks enable row level security;
create policy "own-bookmarks"
  on public.user_bookmarks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

`user_memos`(포스트잇) / `user_highlights`(하이라이트) / `content_comments`(메모)
— feat-8-023 작성자 역할 기반 가시성. SELECT 는 본인 작성물 + 강사·원장
작성물(전체 공개), INSERT/UPDATE/DELETE 는 본인(또는 admin)만.

```sql
-- 헬퍼: 인자 사용자가 강사·원장인지 (SECURITY DEFINER · STABLE)
-- create function private.is_staff(p_user_id uuid) returns boolean ...

-- SELECT: 본인 OR 작성자가 강사·원장. INSERT/UPDATE/DELETE: 본인만.
create policy user_memos_select on public.user_memos
  for select to authenticated
  using (user_id = auth.uid() or private.is_staff(user_id));
-- user_highlights 동일 패턴.

-- content_comments: SELECT using (author_id = auth.uid() or private.is_staff(author_id)),
--   INSERT with check (author_id = auth.uid()), UPDATE/DELETE 는 author 또는 admin.
```

---

## 11. 5종 link 테이블

자세한 설계는 **`docs/relations.md`** 참조.

```sql
create type public.aa_relation_type as enum
  ('cross_reference','parent_child','precondition','exception');
create type public.ac_relation_type as enum
  ('directly_interprets','cites','similar_to','contrary_to');
create type public.cc_relation_type as enum
  ('cited_by','same_topic','overruled_by','companion');
create type public.pa_relation_type as enum
  ('tested','referenced_in_choice','explanation','comparison');
create type public.pc_relation_type as enum
  ('cited','illustrates','contrasts','similar');

-- (5개 테이블 정의는 docs/relations.md 참조)
```

> **feat-8-024** — `problem_case_links` 중 1차 객관식 기출문제의 링크는
> `scan_exam_case_links()` 함수가 문제 지문(선택지·박스항목)의
> `related_case_number` 에서 사건번호를 추출해 자동 생성한다(`note='exam-scan'`).
> 운영자 수동 매칭은 `/admin/relations/exam-cases` 화면. 상세:
> `docs/features/feat-8-024-exam-case-linking.md`.

---

## 12. study_sessions / daily_study_stats

학습 진도 집계 (`feat-000-014`, `feat-000-015`).

```sql
create table public.study_sessions (
  session_id    uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(profile_id) on delete cascade,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  scope         jsonb,                       -- {tab: 'articles', subject: 'patent', article_id: ...}
  duration_ms   int                          -- ended_at - started_at
);

create index study_sessions_user_started on study_sessions(user_id, started_at desc);

create table public.daily_study_stats (
  user_id       uuid not null references profiles(profile_id) on delete cascade,
  stat_date     date not null,
  total_minutes int not null default 0,
  problems_attempted int not null default 0,
  problems_correct   int not null default 0,
  articles_viewed    int not null default 0,
  cases_viewed       int not null default 0,
  primary key (user_id, stat_date)
);
```

대시보드 카드들의 데이터 소스. 일별 집계는 일일 cron 으로 채움 (`feat-000-015`).

---

## 13. cohorts / cohort_members

```sql
create table public.cohorts (
  cohort_id     uuid primary key default gen_random_uuid(),
  name          text not null,                -- '27기 1차 준비'
  exam_round    public.problem_exam_round,
  exam_date     date,
  instructor_id uuid references profiles(profile_id),
  created_at    timestamptz not null default now()
);

create table public.cohort_members (
  cohort_id     uuid references cohorts(cohort_id) on delete cascade,
  member_id     uuid references profiles(profile_id) on delete cascade,
  role          text not null check (role in ('student','assistant')),
  joined_at     timestamptz not null default now(),
  primary key (cohort_id, member_id)
);
```

`feat-7-009` 반/기수 관리.

---

## 14. notification_queue (이메일·알림)

```sql
create type public.notification_kind as enum
  ('article_revision','case_new','exam_reminder','grade_complete','qna_answered');

create table public.notification_queue (
  notification_id  uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(profile_id) on delete cascade,
  kind             public.notification_kind not null,
  payload          jsonb not null,
  channel          text not null default 'email' check (channel in ('email','kakao','in_app')),
  scheduled_at     timestamptz not null default now(),
  sent_at          timestamptz,
  attempt_count    int not null default 0,
  last_error       text
);

create index nq_pending on notification_queue(scheduled_at)
  where sent_at is null;
```

조문 개정/판례 신규 발행 시 즐겨찾기·메모 보유자에게 알림 (`feat-7-004`). 카카오톡은 P2 (결정사항 #9).

---

## 15. papers (논문)

```sql
create table public.papers (
  paper_id      uuid primary key default gen_random_uuid(),
  subject_laws  text[] not null,
  authors       text[] not null,
  title         text not null,
  journal       text,
  publisher     text,
  published_at  date,
  external_url  text,
  pdf_url       text,
  comment_md    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
```

`feat-3-501~504` 최신 정보 — 논문.

---

## 16. science_sections (자연과학 단원)

```sql
create table public.science_sections (
  section_id    uuid primary key default gen_random_uuid(),
  subject       text not null check (subject in ('physics','chemistry','biology','earth_science')),
  parent_id     uuid references science_sections(section_id),
  display_label text not null,
  ord           int not null default 0,
  created_at    timestamptz not null default now()
);
```

`feat-4-B-007` 단원 시드 데이터.

---

## 17. lecture_resources (강의노트·동영상)

```sql
create type public.resource_kind as enum ('lecture_note','lecture_video','reference','answer_video');
create type public.resource_target_type as enum
  ('article','case','problem','science_section');

create table public.lecture_resources (
  resource_id   uuid primary key default gen_random_uuid(),
  target_type   public.resource_target_type not null,
  target_id     uuid not null,
  kind          public.resource_kind not null,
  title         text not null,
  url           text,                        -- YouTube unlisted (결정사항 #10)
  pdf_url       text,                        -- 강의노트
  duration_sec  int,                          -- 동영상 길이
  ord           int not null default 0,
  created_by    uuid references profiles(profile_id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index lr_target on lecture_resources(target_type, target_id);
```

조문/판례/문제 우측 패널의 "관련자료" + 문제의 "동영상 풀이" 가 모두 이 테이블 사용.

---

## 18. 마이그레이션 적용 순서 (M2 진입 시)

1. `001_extensions_and_helpers` — `ltree`, `pg_trgm` 확장 + `get_role()` 헬퍼
2. `002_laws_and_articles` — laws / law_revisions / articles / article_revisions / systematic_nodes / article_systematic_links + 트리거(불변/path 동기화) + RLS
3. `003_cases_and_papers` — cases / case_papers / case_articles / papers + RLS
4. `004_problems_and_choices` — problems / problem_choices / problem_keywords / problem_grading_criteria / problem_model_answers + RLS
5. `005_relations` — 5종 link 테이블 (`docs/relations.md`) + 트리거(정규화 + choice sync)
6. `006_user_data` — user_bookmarks / user_memos / user_highlights / user_qna_threads / user_qna_replies + RLS
7. `007_attempts_and_essays` — user_problem_attempts / essay_submissions / essay_grade_assignments / essay_grades + RLS
8. `008_study_stats` — study_sessions / daily_study_stats + RLS + 일별 집계 함수
9. `009_cohorts_and_resources` — cohorts / cohort_members / lecture_resources + RLS
10. `010_notifications` — notification_queue + RLS + Cron 처리 함수
11. `011_science_sections` — science_sections + 시드

각 마이그레이션 적용 후 `npm run db:typegen` 으로 `database.types.ts` 갱신 필수.

---

## 19. 결정사항 반영 매핑

| 결정사항 # | 적용 위치 |
|---|---|
| #1 본문 JSON | `articles.body_json` (없음) → `article_revisions.body_json jsonb` |
| #2 ltree | `articles.path ltree` + GiST 인덱스 |
| #3 tsvector + pg_trgm | `cases.search_tsv` generated column + GIN |
| #4 채점자 매칭 | `essay_grade_assignments.grader_role enum` |
| #5 Claude API 채점 | `grader_role='ai'` + 별도 워커 (인프라) |
| #6 OCR 미적용 | `essay_submissions.uploaded_files` 그대로 저장 |
| #7 포인트 백분위 | (P2 - 별도 admin 미니 스펙) |
| #8 색별 라벨 | `user_highlights.color` + `label` 컬럼 |
| #9 이메일 알림 | `notification_queue.channel='email'` 기본 |
| #10 YouTube unlisted | `lecture_resources.url` (외부 URL) |
| #11 항 단위 접기 | `body_json.blocks[].kind='clause'` 단위 |
| #12 연도 정렬 | `cases.decided_at` + `problems.year` 인덱스 |
| #13 지문 단위 정오문제 | `problem_choices.related_article_id` + `pa_relation_type='referenced_in_choice'` |
| #14 강사 입력 시드 | `systematic_nodes` 와 `science_sections` 모두 강사가 직접 입력 (5.7 콘텐츠 관리 허브) |

---

## 20. 자주 발생하는 함정

1. **timestamp without timezone 사용** — UTC/KST 혼란. **항상 `timestamptz`**.
2. **소프트 삭제 데이터를 query 에서 누락 검사 안 함** — `where deleted_at is null` 빠뜨리면 관 데이터 노출. View 로 감싸기.
3. **JSONB 인덱스 미사용** — `body_json` 안의 inline ref 검색이 풀 스캔. 필요한 키 별도 컬럼 추가.
4. **RLS 미적용** — 신규 테이블 만들 때 `enable row level security` + 정책을 같이 작성. 누락 시 service_role 만 접근 가능 → 에러로 빨리 발견.
5. **ENUM 변경의 어려움** — PostgreSQL ENUM 은 값 추가는 쉽지만 **삭제·이름 변경이 어렵다**. 보수적으로 시작.
6. **양방향 link 중복 저장** — 무방향 정규화 (`article_a < article_b`) 트리거로 강제. `docs/relations.md` 참조.

---

## 21. community_posts / community_post_comments (커뮤니티 게시판)

`feat-6-002` — 자유게시판 · 스터디 모집 · 합격 후기 3종을 단일 테이블 + `board` enum 으로 통합.

```sql
create type public.community_board as enum ('free', 'study', 'review');

create table public.community_posts (
  post_id    uuid primary key default gen_random_uuid(),
  board      public.community_board not null,
  author_id  uuid references profiles(profile_id) on delete set null,
  title      text not null check (char_length(title) between 1 and 200),
  body_md    text not null check (char_length(body_md) between 1 and 20000),
  is_pinned  boolean not null default false,   -- 운영자 전용 (트리거 강제)
  closed_at  timestamptz,                      -- study 게시판 모집 마감 (null = 모집 중)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                       -- soft delete
);

create table public.community_post_comments (
  comment_id uuid primary key default gen_random_uuid(),
  post_id    uuid not null references community_posts(post_id) on delete cascade,
  author_id  uuid references profiles(profile_id) on delete set null,
  body_md    text not null check (char_length(body_md) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

**RLS** (§1.3 커뮤니티 패턴): 두 테이블 모두 — `select` 인증 사용자 전체(`deleted_at is null`) / `insert` 본인(`author_id = auth.uid()`) / `update` 본인 또는 `private.is_manager`. `delete` 정책 없음 — soft delete 만.

**트리거**: `set_updated_at` (공용) + `community_posts_guard_pin` — `is_pinned` 변경은 `private.is_manager` 만 허용 (RLS 는 컬럼 단위 제어 불가하므로 트리거로 강제).

### 21.1 public_profiles 뷰

`profiles` RLS 가 "본인 행만 조회" 라 게시판에서 타인 작성자명이 보이지 않는다. 안전 컬럼만 노출하는 뷰로 해결.

```sql
create view public.public_profiles
  with (security_invoker = false) as
  select profile_id, name, avatar_url, role from public.profiles;
grant select on public.public_profiles to authenticated;  -- anon 제외
```

`security_invoker = false` → 뷰 소유자 권한으로 실행돼 `profiles` RLS 를 우회하되, 노출 컬럼은 4종뿐(전화·동의 등 비공개 컬럼 미노출). 게시판 쿼리는 글·댓글의 `author_id` 를 모아 이 뷰를 batch 조회한다. Supabase Security Advisor 가 "security definer view" 로 표시하지만 의도된 설계.

상세: `docs/features/feat-6-002-community-boards.md`.

## 22. mcq_exams (다과목 통합 1차 모의고사)

`feat-10-005` — 여러 모의고사 팩(`mcq_packs`)을 한 "시험"으로 묶어 **과목별 과락 + 전 과목 평균**으로 합격을 판정한다. 한 교시 = `mcq_pack` 한 개, 한 응시 = 교시별 `quiz_sessions` 묶음.

```sql
create table public.mcq_exams (
  exam_id       uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  year          integer,
  exam_round_no integer,
  pass_average  smallint not null default 60 check (pass_average between 0 and 100),  -- 전 과목 평균 합격선 (%)
  is_published  boolean not null default false,   -- 교시 구성 후 운영자가 공개
  published_at  date,
  created_by    uuid references profiles(profile_id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),   -- set_updated_at 트리거
  deleted_at    timestamptz                            -- soft delete
);

create table public.mcq_exam_papers (              -- 시험 ↔ 교시(팩) 매핑
  exam_id    uuid not null references mcq_exams(exam_id) on delete cascade,
  pack_id    uuid not null references mcq_packs(pack_id),
  ord        smallint not null default 0,          -- 교시 순서 (0 = 1교시)
  fail_floor smallint not null default 40 check (fail_floor between 0 and 100),  -- 과락선 (%)
  primary key (exam_id, pack_id)
);

create table public.mcq_exam_attempts (            -- 한 응시 = 전 교시 묶음
  attempt_id   uuid primary key default gen_random_uuid(),
  exam_id      uuid not null references mcq_exams(exam_id),
  user_id      uuid not null references profiles(profile_id),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,                         -- 전 교시 완료 시각 (finalizeExamAttemptIfComplete)
  created_at   timestamptz not null default now()
);

alter table public.quiz_sessions
  add column exam_attempt_id uuid references mcq_exam_attempts(attempt_id);  -- 교시 세션 → 응시 묶음 (null = 단독 팩 응시)
```

**RLS**: `mcq_exams` 는 콘텐츠 패턴 — 공개분(`is_published`) 전체 읽기 + staff 전체 읽기·쓰기(`private.is_staff`). `mcq_exam_papers` 는 읽기 전체 공개(`true`) + 쓰기 staff. `mcq_exam_attempts` 는 학습 데이터 — 본인(`user_id = auth.uid()`)만 R/W.

**교시 순차 응시**: 교시별 `quiz_sessions`(`mode='exam'`, `pack_id`+`exam_attempt_id`)는 `/api/mcq-pack/start` 단일 경로로 생성된다. 이전 교시(작은 `ord`)가 완료돼야 다음 교시가 열린다(서버 게이트). 마지막 교시 완료 시 `mcq_exam_attempts.completed_at` 설정.

**등수 RPC** `mcq_exam_attempt_stats(p_exam_id uuid)` — `SECURITY DEFINER` + `search_path` 고정. 사용자별 최신 완료 응시의 전 교시 평균으로 `rank`/`percentile`/`z_score` 산출, 호출자(`auth.uid()`) 한 행 반환. `mcq_pack_attempt_stats`(feat-10-004) 본뜸. 과락·합격 판정은 RPC 밖(`getExamAttemptBreakdown`, 본인 데이터)에서 단일 산출.

상세: `docs/features/feat-10-005-integrated-mock-exam.md`.

## 23. app_settings (운영자 전역 설정)

`feat-3-204` — 운영자가 설정하는 전역 플랫폼 설정을 담는 범용 key-value 테이블. 첫 용도는 `/latest/cases`(최근 판례)의 수험생 노출 기간.

```sql
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,                       -- 스칼라/객체
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(profile_id)
);
```

**RLS**: 읽기 전체 공개(`using (true)`) — 비민감 설정이고 학생 loader 가 노출 기간을 읽어 cutoff 를 계산해야 한다. 쓰기는 staff(`private.is_staff(auth.uid())`).

**키**:
- `latest_cases_recency_months` — `/latest/cases` 노출 기간(롤링 개월). 시드값 `0`(제한 없음). N>0 이면 `decided_at ≥ 오늘−N개월` 판례만 노출(수험생·운영자 공통, `/latest/cases` 전용 — 학습과목 판례 탭·뷰어는 미적용). 접근 헬퍼 `app/core/lib/app-settings.server.ts`.

상세: `docs/features/feat-3-204-latest-cases-recency.md`.

---

## 24. content_chunks (feat-9-001 RAG 색인)

생성형 AI Q&A(feat-9, `docs/features/feat-9-ai-qna.md`) 의 검색·임베딩 단위. 조문/판례/문제 콘텐츠를 청킹해 평문(`body_text`) + 임베딩(`embedding`) 둘 다 저장. 하이브리드 검색 — pgvector(의미) + pg_trgm(키워드) + 구조화 필터(`law_code`) + 연관관계 그래프 확장.

```sql
create extension if not exists vector with schema extensions;

create type public.chunk_source_type as enum ('article','case','problem');

create table public.content_chunks (
  chunk_id       uuid primary key default gen_random_uuid(),
  source_type    chunk_source_type not null,
  source_id      uuid not null,                       -- polymorphic, FK 없음 (relations 패턴)
  chunk_index    int not null,                        -- 한 source 안에서 청크 순서
  law_code       text,                                -- 구조화 필터
  heading_path   text,                                -- "특허법 제29조" / "대법원 2018후10844 · 요지" 식 표시·재랭킹용
  body_text      text not null,                       -- 임베딩 + trigram 양쪽 대상
  token_count    int not null,                        -- 비용 추적
  embedding      vector(1024),                        -- Voyage voyage-3-large. null=임베딩 대기(dirty)
  content_hash   text not null,                       -- sha256(body_text). 동일 시 재임베딩 skip
  embedded_at    timestamptz,                         -- null=dirty, set=완료
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- upsert 키.
create unique index content_chunks_source_index_uniq
  on content_chunks (source_type, source_id, chunk_index);

-- 의미 검색.
create index content_chunks_embedding_hnsw
  on content_chunks using hnsw (embedding vector_cosine_ops);

-- 키워드 검색.
create index content_chunks_body_trgm
  on content_chunks using gin (body_text gin_trgm_ops);

-- 구조화 필터.
create index content_chunks_law_code
  on content_chunks (law_code) where law_code is not null;

-- dirty 큐.
create index content_chunks_dirty
  on content_chunks (created_at) where embedded_at is null;
```

**RLS**: 인증 사용자 read all(`for select to authenticated using (true)`). 콘텐츠 평문은 이미 공개 콘텐츠에서 파생이므로 별도 차단 의미 없음. write 는 service_role 만 (`supa-admin-client`) — 임베딩 cron / 백필 스크립트.

**dirty 마킹 hooks**:
- 조문 개정 publish (`article_revisions` 발효) 후 영향 조문 → `markChunksDirtyForSource('article', ids)`
- 판례 수정 저장 후 해당 case → `markChunksDirtyForSource('case', [id])`
- 문제 출제/수정 후 해당 problem → `markChunksDirtyForSource('problem', [id])`
- source 삭제 시 → `deleteChunksForSource(...)`

**임베딩 워커**: `/api/cron/embed-chunks` (`CRON_SECRET` 보호). 외부 cron 주기적 호출. `VOYAGE_API_KEY` 미설정 시 dry-run(보고만). `runAfterResponse()` 로 즉시 임베딩 트리거도 가능.

**차원 변경 주의**: `vector(1024)` 의 1024 는 임베딩 모델(현재 Voyage `voyage-3-large`)에 종속. 모델·차원 변경 시 마이그레이션 + 전체 재임베딩 필요. 단일 소유 상수: `app/features/ai-qna/lib/constants.ts`.

> v1 에서 `ai_conversations` / `ai_messages` 는 feat-9-004 단계에 도입(별도 마이그레이션). 이 섹션은 RAG 색인 인프라만.

---

## popup_notices  ✅ 적용됨 (2026-07-03)

운영자가 만드는 사이트 팝업(모달) 공지. `/admin/popup-notices` 관리, `navigation.layout` 이 활성 공지를 모달로 표시.

```sql
create table public.popup_notices (
  notice_id   uuid primary key default gen_random_uuid(),
  title       text not null,
  body_md     text not null default '',
  image_url   text,                  -- 디자인 이미지(public 버킷 popup-notices, A안)
  youtube_url text,                  -- 유튜브 영상(표시 시 embed)
  link_url    text,
  link_label  text,
  starts_at   timestamptz,          -- 노출 시작 (null=즉시)
  ends_at     timestamptz,          -- 노출 종료 (null=무기한)
  is_active   boolean not null default false,
  created_by  uuid references profiles(profile_id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

**RLS**: select 는 노출 조건 행만(`is_active` + 기간내) 전체 공개 / 전체 열람·쓰기는 `manager`·`admin` (profiles role 서브쿼리). 적용 SQL: `scripts/sql/add_popup_notices.sql`.
**학생 닫기 상태**: DB 아님 — localStorage(`popupNoticeHiddenUntil:<id>`, 닫기=10분·오늘 하루 보지 않기=자정까지).

## offline_tests / offline_test_questions / offline_test_results  ✅ 적용됨 (2026-07-05, feat-7-042)

오프라인 시험지 — 종합반 과제(assignment)에 붙는 빈칸·OX·객관식 조합 테스트.

- **offline_tests**: test_id PK, assignment_id FK(cascade), cohort_id FK, title, law_code(5법 check, dash 표기 'civil-procedure'), duration_min, instructions_md, created_by, soft-delete(deleted_at).
- **offline_test_questions**: test_id FK, ord, points numeric(5,1), question_type check('mcq'|'ox'|'blank') + **유형별 참조 XOR check** — mcq=problem_id / ox=ox_ref_type('choice'|'box')+ox_ref_id(폴리모픽, FK 없음)+ox_problem_id / blank=blank_set_id(article_blank_sets, 세트 전체=1문항).
- **offline_test_results**: (test_id,user_id) unique, status('taken'|'absent'), score/max_score, wrong_ords int[](입력 당시 오답 ord 스냅샷 — 표시용), session_id(신호 합류로 만든 학생 명의 quiz_session, set null), taken_at date, entered_by.
- **RLS**: 3테이블 staff(`private.is_staff`) 전체 CRUD. results 는 학생 본인 select 추가(과제 상세 결과 카드).
- **문항별 정오의 원본은 이 테이블이 아니라** 학생별 quiz_session(scope_payload.source='offline_test') + user_problem_attempts/user_blank_attempts — 온라인 학습 신호와 통합 분석을 위해 backbone 에 합류시킨다. 상세: docs/features/feat-7-042-offline-test.md.

## LMS 시청 골격 (feat-11-001, M2)  ✅ 적용됨 (2026-07-08)

영상 강의 LMS 1단계 — 설계 SSOT: `docs/features/lidamedu-이전-M1-설계.md`. 기존 `lecture_*`(강의노트 PDF 도메인)와 별개 — 신규는 `course_/lesson_/enrollment_` 접두어.

- **course_series**: 시리즈(에디션 무관 정체성). title, subject_code, instructor_id(대표 강사).
- **courses**: 에디션(연도판). series_id FK, edition_label/year, **is_current(시리즈당 1개 partial unique — 신판 기본 노출)**, status('draft'|'published'|'archived'), soft-delete. 전면 재촬영=새 에디션(구판 수강권·이력 보존), 소규모 수정=lesson_videos 교체.
- **course_lessons**: 회차. unique(course_id, lesson_no), sort_order(노출 순서 분리), instructor_id(회차별, null=대표), **is_preview**(맛보기 — 배수 차감 예외 근거), is_published(기본 false).
- **lesson_staff_memos**: 운영 메모 — **별도 테이블+staff 전용 RLS**(published 행이 공개 SELECT 라 같은 행 컬럼은 anon 이 읽을 수 있음 → 구조로 방어. 원장 단서 2026-07-08).
- **lesson_videos**: 영상 슬롯+교체 이력(append-only). drm_provider/drm_video_id(불투명, **staff 만 SELECT** — 학생은 playback_grants 경유), duration_seconds(배수 모수), **is_active(회차당 1개 partial unique)** — 교체=기존 false+새 행.
- **lesson_materials**: 회차 자료 PDF(storage_path, 열람은 서버 판정 후 signed URL).
- **lesson_node_links**: 회차↔체계도 노드 다대다(약점 단원→재수강 루프. M2엔 테이블만).
- **subscription_plans 확장**: product_kind CHECK += 'course'|'tpass'('book'은 예약), **sale_status**('scheduled'|'on_sale'|'paused'|'closed'|'hidden') — 백필: is_active=true→on_sale(6), false→hidden(3).
- **plan_courses**: 상품↔강의(단과 1행/패키지 N행/T-PASS 명시 연결 — 에디션 발행 시 연결 제안 필수).
- **plan_books**: 상품↔사용 교재(도서) 연결(relation_kind required|recommended, sort_order). 공개 읽기·staff 쓰기. 수강신청 카탈로그 교재 크로스셀에 사용(판매중 listed 도서만 노출).
- **plan_policies**: 상품 정책 1:1 명시 컬럼 — duration_days XOR fixed_end_date(CHECK 둘 중 하나), multiplier(null=무제한), pause_*(허용·총일수·횟수·1회 min/max), allow_pc/mobile/download, max_devices_pc/mobile, extension_allowed/extension_plan_ids.
- **enrollments**: 영상 수강권(user_subscriptions 와 별개 축 — course 단위). course_id(에디션 고정), plan_id(정책 참조), source('order'|'manual'|'migration'|'event'), order_item_id(M4 FK 승격 예정), granted_by/admin_note, starts_at/expires_at(저장 — 연장·정지로 변동), **multiplier_snapshot + base_duration_snapshot_seconds(지급 시점 고정 — ★자동 재계산 금지, 조정은 adjust 이벤트로)**, status('active'|'paused'|'expired'|'revoked'), blocked_lesson_ids uuid[](회차 재생 차단).
- **enrollment_pauses**: 일시정지 이력(신청자·기간·is_admin_exception). 잔여 일수/횟수=정책−이력 합(파생).
- **enrollment_admin_logs**: 지급·연장·회수·차단·모수조정 감사(before/after jsonb, reason 필수).
- **playback_grants**: 재생 판정 스냅+단기 토큰(수 분). user_id null=비로그인 맛보기, enrollment_id null=맛보기·무료(배수 미차감), device_id(M3 FK 승격 예정). 클라엔 grant_id 만 — drm_video_id 비노출.
- **RLS**: 카탈로그(series/courses/lessons/materials/links/plan_*)=published 공개+staff 전량, lesson_videos·staff_memos=staff 전용, enrollments/pauses=본인+staff SELECT(쓰기 정책 없음 — 서버 adminClient 전용), grants=본인+staff SELECT(발급 서버만).
- M3 예정: watch_events/watch_positions/watch_ledger, user_devices. M4 예정: orders/order_items, bank_transfers, books/shipments, user_coupons.

## LMS 시청 기록·배수 회계·기기 (feat-11-003, M3)  ✅ 적용됨 (2026-07-08)

- **watch_events**: 구간 보고 원본(append-only, 서버만 INSERT). grant_id FK(restrict — 회계 근거 보존), **unique(grant_id, client_seq)=멱등 키**, from/to CHECK. ★환불 기준·회계 근거라 영구 보존(법적 근거=처리방침, M1 단서 2). user_id/enrollment_id null=맛보기·무료.
- **watch_positions**: 이어보기 upsert. PK(user_id, lesson_id).
- **watch_ledger**: 배수 원장(append-only). kind debit(+)/credit(−)/adjust/reset(−), seconds<>0, credit·adjust·reset=reason 필수 CHECK. **사용량=SUM(seconds)**. ★UPDATE/DELETE 경로 금지(코드 규약 — service_role 은 RLS 미적용).
- **v_enrollment_watch_balance**: 잔여 파생 뷰(security_invoker). allowed=snapshot×multiplier(null=무제한), used=원장 SUM, remaining=차. ★모수 변경(영상 교체)은 snapshot 갱신+enrollment_admin_logs(adjust_snapshot) — ledger adjust 를 모수에 쓰면 이중 계상(설계 §4.5 확정).
- **user_devices**: 등록 기기(pc/mobile/tablet). fingerprint=[벤더] 확정 전 null, partial unique(user, fingerprint, 미해제). 슬롯=plan_policies max_devices_*(기본 PC1+모바일1).
- **device_reset_logs**: 초기화 이력 — 본인 셀프=월 1회 파생 판정, 관리자=무제한.
- **RLS**: 전부 본인+staff SELECT, 쓰기 정책 없음(서버 adminClient 전용).
- 하트비트 파이프: /api/lms/watch-heartbeat — grant 소유 검증·구간 정합(길이≤120s·영상 길이 초과 금지)·granted_at 6h 보고 창·멱등. 차감은 enrollment 있는 grant 만(맛보기 예외). 판정 플래그: ENFORCE_MULTIPLIER=**ON**, ENFORCE_DEVICE=OFF([벤더] fingerprint 확정 시 ON — ★M4 결제 오픈 체크리스트).

## LMS 주문·무통장·도서몰·쿠폰·CS (feat-11-004 M4)  ✅ 적용됨 (2026-07-08)

- **orders / order_items**: 주문 일반화 — 항목 XOR(plan|book), 부분 환불=항목 단위(refund_*). ★단건 결제도 1-item 주문 경유(payments.order_id) — 이중 경로 금지. 상태: pending_payment/pending_deposit/paid/partially_refunded/refunded/cancelled/failed. 지급: paid 전이 시 course/tpass→enrollments(plan_courses 전 강의, order_item 멱등)·book→shipments+재고 sale 차감. 회수: 환불 전이 시 enrollments revoke·shipments returned·재고 refund 복원(멱등). 구독형(subject/bundle/membership)의 user_subscriptions 지급은 기존 confirmPayment/웹훅 경로 유지.
- **bank_transfers**: 무통장(주문당 1건). 신청→pending_deposit→관리자 입금 확인(confirmed_by)→paid·지급(무통장 구독형은 upsertPaidSubscription 직접 호출, paymentId null 허용). 기한 초과=lazy(주문 화면)+cron(/api/cron/bank-transfer-expire).
- **books / book_stock_moves / v_book_stock**: 재고=append-only 원장 SUM 파생. plan_book_links(필수/선택). **shipments**(order_item 1:1, 본인 RLS self-read — 관리자 갱신 즉시 마이페이지 반영).
- **user_coupons**: 개인 발급(unique user+discount), discounts.auto_issue('signup'|'first_purchase') — welcome 로더·첫 paid 주문 훅에서 멱등 발급. 사용=기존 체크아웃 code 흐름, paid 시 discount_id 매칭 used_at 마킹.
- **cs_actions**: CS 공통 원장 — enrollment 조치(enrollment_admin_logs 미러)·기기 강제 초기화·항목 환불 자동 기록. **playback_issues**: 재생 오류 로그([벤더] 콜백 대기).
- **book_settlement_rules** (feat-8-029 P6): 도서정산 배분규칙(관리자 입력). book_id(null=전체 기본)·payee_name(저자/출판사)·share_kind(percent/fixed)·share_value·effective_from·memo·is_active. 세대교체 모델(값수정 대신 새 규칙+비활성). RLS enable+정책無(adminClient 전용).
- **book_settlements / book_settlement_items** (feat-8-029 P6): 도서정산 계산·지급(강사 instructor_settlements 와 동형). payee(저자/출판사)×월 unique, draft→confirmed→paid. 월별 도서판매 order_items 에 배분규칙 적용→payee별 정산, draft 재생성/confirmed·paid 불변, 이중계상 방지((payee,order_item,kind) 전기간 대조), 확정분 환불은 익월 refund_adjustment 음수차감. 배분=percent(기준액×%)/fixed(권당×수량, 부분=비례). RLS enable+정책無(adminClient 전용).
- **refund_requests** (feat-8-029 P3): 사용자 개시 환불요청. order_item_id·user_id·reason·status(pending/approved/rejected)·resolved_by/at·resolve_note·refunded_krw. 항목당 대기중 1건 부분 유니크 인덱스. RLS: 학생 insert 본인·select 본인+staff, 승인/거절 UPDATE 는 service_role(adminClient). 승인=refundOrderItem(토스 부분취소·회수·CS 미러) 실행 후 approved 기록.
- **v_sales_daily / v_sales_books**: 주문 기준 매출 파생 뷰(저장 아님, security_invoker).
- **duty 확장**: staff_duty_assignments CHECK += lms_video_admin(시리즈·도서)/lms_cs(수강권·기기)/lms_orders_admin(주문·배송)/lms_stats_view — 6개 LMS 화면 access 게이트(원장 항상, 관리자 관리에서 배정).
