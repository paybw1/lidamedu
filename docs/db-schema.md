# db-schema.md — DB 스키마 SSoT

> **목적**: 변리사 학습 플랫폼 DB 의 모든 테이블/컬럼/인덱스/RLS 의 단일 진실. 변경 시 본 문서 + 마이그레이션 + `npm run db:typegen` 을 동시에 갱신한다.
> **의존**: `docs/spec-detail-5-4-subjects-A.md` (5.4 도메인), `docs/article-tree.md` (조문 트리), `docs/relations.md` (5종 관계).
> **현재 적용 마이그레이션** (Supabase): `20260427063558 create_profiles_for_signup`, `20260427064032 harden_signup_and_add_email_lookup`. 본 문서의 다른 모든 테이블은 **계획 상태** 로, M2 진입 시 단계적 마이그레이션으로 적용한다.

---

## 0. 한 눈에 보는 도메인 맵

```
auth.users (Supabase)
  └ profiles                            [✅ 적용됨]
       ├ user_role (student/instructor/admin)
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
| `role` | `user_role` enum (`student`/`instructor`/`admin`) | default `student` |
| `marketing_consent` | boolean default false | |
| `created_at` / `updated_at` | timestamptz | |

**RLS**: select/update/delete-own-profile (본인만).
**트리거**: `on_auth_user_created` → `handle_new_user()` 가 가입 시 자동 row 생성.

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
  promulgated_at  date not null,
  effective_date  date not null,
  reason_md       text,                         -- 개정이유
  comparison_pdf  text,                         -- 신구조문대비표 URL (Storage)
  explanation_md  text,                         -- 개정해설
  video_url       text,                         -- 동영상
  status          text not null default 'draft', -- 'draft' / 'review' / 'published'
  published_at    timestamptz,
  published_by    uuid references profiles(profile_id),
  created_at      timestamptz not null default now()
);
```

- "최신 정보 — 법 개정" (`feat-3-101~103`) 화면이 이 테이블 직접 사용
- `comparison_pdf` 와 `explanation_md` 는 다운로드 가능 (PPT slide 14)

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
  is_en_banc         boolean not null default false,
  importance         smallint default 1 check (importance between 1 and 3),
  summary_title      text,                       -- 판결요지 제목
  summary_body_md    text,                       -- 판결요지 내용
  reasoning_md       text,                       -- 판시이유
  full_text_pdf      text,                       -- 판결전문 PDF URL (Storage)
  comment_source     text,                       -- 코멘트 출처
  comment_body_md    text,                       -- 코멘트 본문
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
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  created_by          uuid references profiles(profile_id)
);

create index problems_law on problems(law_id);
create index problems_systematic_gist on problems using gist (systematic_path);
create index problems_year on problems(year desc);
create index problems_format on problems(format);
create index problems_subject_type on problems(subject_type);
```

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
  color            text not null check (color in ('green','yellow','red','blue')),
  label            text,                     -- '핵심','암기','의문','참고' (옵션)
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
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

### 10.1 RLS — 본인만

```sql
alter table public.user_bookmarks enable row level security;
create policy "own-bookmarks"
  on public.user_bookmarks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- user_memos / user_highlights / user_qna_threads / user_qna_replies 동일 패턴
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
  ('tested','referenced_in_choice','explanation','model_answer_cites');

-- (5개 테이블 정의는 docs/relations.md 참조)
```

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

대시보드 카드들의 데이터 소스. 일별 집계는 Cloudflare Workers Cron 으로 채움 (`feat-000-015`).

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
