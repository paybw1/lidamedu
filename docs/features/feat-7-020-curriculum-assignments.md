# feat-7-020 / feat-7-021 — 커리큘럼 + 과제 배포

## 비전 매핑

> "온라인 종합반을 운영하면서, 우리가 제시하는 프로그램만 따라오면 시험에 합격할 수 있도록 종합적인 관리를 할 수 있는 플랫폼."

- **커리큘럼(feat-7-020)** = "프로그램" 자체. 학원이 짠 N주 학습 트랙.
- **과제(feat-7-021)** = "프로그램 이행 강제". 주 단위 마감 + 자동 채점.

콘텐츠(조문/판례/문제/빈칸/암기/논문) + 통계 인프라는 이미 깔려 있음. 이 두 feat 가 비전의 핵심 누락 조각.

## 결정 사항

- **커리큘럼은 템플릿 + cohort 적용 분리**. 같은 트랙("특허법 8주 종합반")을 매 기수마다 재사용하기 위해. `curricula` + `cohort_curricula` 두 단계.
- **주(week) 단위로 잘게 분할** — 학생이 "이번 주는 이걸"을 명확히 알 수 있도록. 일(day) 단위는 over-engineering, 월 단위는 너무 거침.
- **curriculum_items 와 assignment_items 는 polymorphic** — `kind` enum (`article` / `case` / `problem` / `blank_set` / `recitation` / `lecture`) + 각각의 FK nullable. 새 콘텐츠 유형 추가 시 enum 만 확장.
- **자동 완수 판정** — submission.status 는 cache. loader 시점에 user 활동(attempts/sessions) 검사해서 갱신 또는 derived. 트리거는 안 씀(복잡).
- **알림** — 과제 발행 시 announcements 시스템(feat-7-011) 재사용. cohort fanout.
- **lecture kind** — 외부 영상 URL + 강의 메타. 라이브 강의/영상 스트리밍은 SPEC YAGNI에서 외부 위임이지만 메타데이터 + 외부 링크는 트랙에 필수.

## 데이터 모델

### 5.7.20 커리큘럼

```sql
-- 트랙 템플릿
CREATE TABLE curricula (
  curriculum_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  duration_weeks  int NOT NULL CHECK (duration_weeks > 0 AND duration_weeks <= 52),
  subject_laws    text[] DEFAULT ARRAY[]::text[],  -- 다과목 가능
  owner_id        uuid NOT NULL REFERENCES profiles(profile_id),
  is_published    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- 주차
CREATE TABLE curriculum_weeks (
  week_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id   uuid NOT NULL REFERENCES curricula(curriculum_id) ON DELETE CASCADE,
  week_number     int NOT NULL CHECK (week_number > 0),
  title           text NOT NULL,
  goal_md         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (curriculum_id, week_number)
);

-- 학습 항목 enum
CREATE TYPE curriculum_item_kind AS ENUM (
  'article','case','problem','blank_set','recitation','lecture'
);

-- 항목 (polymorphic)
CREATE TABLE curriculum_items (
  item_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id         uuid NOT NULL REFERENCES curriculum_weeks(week_id) ON DELETE CASCADE,
  ord             int NOT NULL,
  kind            curriculum_item_kind NOT NULL,
  -- FK 타깃 (kind 에 맞는 컬럼 하나만 NOT NULL)
  article_id      uuid REFERENCES articles(article_id) ON DELETE CASCADE,
  case_id         uuid REFERENCES cases(case_id) ON DELETE CASCADE,
  problem_id      uuid REFERENCES problems(problem_id) ON DELETE CASCADE,
  blank_set_id    uuid REFERENCES article_blank_sets(set_id) ON DELETE CASCADE,
  -- lecture 는 외부 영상 — 인라인 메타
  lecture_title   text,
  lecture_url     text,
  lecture_duration_min int,
  -- 공통
  target_quantity int,  -- 예: "이 article 5번 복습"
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- kind 와 target 컬럼 정합성은 CHECK constraint 로 강제 (각 kind 별 대응 컬럼 NOT NULL)

-- cohort 적용 (one-to-many: 같은 커리큘럼을 여러 cohort 가 쓸 수 있음)
CREATE TABLE cohort_curricula (
  cohort_id       uuid NOT NULL REFERENCES cohorts(cohort_id) ON DELETE CASCADE,
  curriculum_id   uuid NOT NULL REFERENCES curricula(curriculum_id) ON DELETE CASCADE,
  start_date      date NOT NULL,  -- week_number=1 시작 날짜
  is_active       boolean NOT NULL DEFAULT true,
  assigned_by     uuid REFERENCES profiles(profile_id),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_id, curriculum_id)
);
```

**RLS**
- `curricula`/`curriculum_weeks`/`curriculum_items`: published=true 는 모두 read. staff CRUD.
- `cohort_curricula`: cohort owner(instructor) 또는 admin 만 CRUD. 학생은 본인 cohort 의 row read.

### 5.7.21 과제

```sql
CREATE TABLE assignments (
  assignment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES cohorts(cohort_id) ON DELETE CASCADE,
  title           text NOT NULL,
  description_md  text,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  due_at          timestamptz NOT NULL,
  created_by      uuid NOT NULL REFERENCES profiles(profile_id),
  -- 커리큘럼에서 자동 생성된 과제인지 추적 (optional 링크)
  source_curriculum_id uuid REFERENCES curricula(curriculum_id),
  source_week_id  uuid REFERENCES curriculum_weeks(week_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TYPE assignment_item_kind AS ENUM (
  'article_read','case_read','problem','blank_set','recitation'
);

CREATE TABLE assignment_items (
  item_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES assignments(assignment_id) ON DELETE CASCADE,
  ord             int NOT NULL,
  kind            assignment_item_kind NOT NULL,
  article_id      uuid REFERENCES articles(article_id) ON DELETE CASCADE,
  case_id         uuid REFERENCES cases(case_id) ON DELETE CASCADE,
  problem_id      uuid REFERENCES problems(problem_id) ON DELETE CASCADE,
  blank_set_id    uuid REFERENCES article_blank_sets(set_id) ON DELETE CASCADE,
  target_quantity int,
  note            text
);

CREATE TYPE assignment_status AS ENUM ('pending','partial','completed');

CREATE TABLE assignment_submissions (
  submission_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES assignments(assignment_id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
  status          assignment_status NOT NULL DEFAULT 'pending',
  completed_items int NOT NULL DEFAULT 0,
  total_items     int NOT NULL DEFAULT 0,
  completed_at    timestamptz,
  last_checked_at timestamptz NOT NULL DEFAULT now(),  -- 마지막 자동 판정 시각
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id)
);
```

**RLS**
- `assignments`/`assignment_items`: cohort owner 또는 admin write. cohort 멤버 read.
- `assignment_submissions`: 본인 row read/insert/update. cohort owner/admin 모든 row read.

### 자동 완수 판정 (kind 별 규칙)

| kind | 완수 조건 |
|---|---|
| `article_read` | 해당 article_id로 `study_sessions` 1건 이상 (`scope.target_type='article'`) |
| `case_read` | 해당 case_id로 `study_sessions` 1건 |
| `problem` | `user_problem_attempts` 에 problem_id + `is_correct=true` 1건 (가장 최근이면 더 엄격) |
| `blank_set` | `user_blank_attempts` 에 해당 set 의 모든 blank_idx 가 `is_correct=true` 한 번 이상 |
| `recitation` | (P2) `user_recitation_attempts` 의 best_similarity ≥ 0.9 |

호출 시점:
- 학생이 `/assignments/:id` 진입 시 loader 가 submission 재계산 + UPDATE
- 운영자가 `/admin/cohorts/:id/assignments/:aid/progress` 진입 시 모든 멤버 submission 재계산
- (선택) Workers Cron 으로 새벽 일괄 재계산 — 후속

## 화면 흐름

### 운영자 — 커리큘럼

```
/admin/curricula
  ├─ 목록 (이름·과목·duration·발행 상태·적용 cohort 수)
  ├─ "신규 커리큘럼" 폼 (이름/과목/주수)
  └─ 행 클릭 → /admin/curricula/:id

/admin/curricula/:id
  ├─ 메타 편집 (이름·설명·과목·발행 토글)
  ├─ 주차 N개 (week_number 순)
  │   └─ 각 주차에 학습 항목 N개 (kind 별 폼)
  │       ├─ article: 조문 검색·선택 + target_quantity
  │       ├─ case: 판례 검색·선택
  │       ├─ problem: 문제 검색·선택 또는 bulk import
  │       ├─ blank_set: 빈칸 세트 선택
  │       └─ lecture: 제목/외부 URL/시간
  └─ "발행" 토글 (publish)
```

### 운영자 — cohort 에 커리큘럼 적용

```
/admin/cohorts/:id
  └─ 새 카드 "커리큘럼"
      ├─ 적용된 커리큘럼 표시 (이름·시작일·현재 주)
      └─ 미적용이면 "커리큘럼 선택" 드롭다운 + 시작일 + 적용 버튼
```

### 운영자 — 과제

```
/admin/cohorts/:id/assignments
  ├─ 목록 (제목·마감·총 항목·평균 완수율)
  ├─ "신규 과제" 또는 "커리큘럼 주차 → 과제 자동 변환"
  └─ 행 클릭 → /admin/cohorts/:id/assignments/:aid

/admin/cohorts/:id/assignments/:aid
  ├─ 과제 메타 편집
  ├─ 항목 추가/삭제 (article_read/case_read/problem/blank_set)
  └─ "학생 진척" 탭
      └─ 멤버별 row (이름·status·N/총·완수 시각)
```

### 학생

```
/dashboard
  ├─ "이번 주 학습 트랙" 카드 (cohort_curricula 가 있을 때만)
  │   └─ 현재 주차 + N개 학습 항목 + 완수 체크
  └─ "마감 임박 과제" 카드 (status≠completed, due_at 가까운 순)

/assignments
  └─ 본인 과제 목록 (마감일 정렬, 상태별 필터)

/assignments/:id
  └─ 과제 상세 + 학습 항목 + 각 항목 진입 버튼
```

## 단계별 구현 계획

1. **이 라운드**: SPEC 등록 + 본 계획 문서 + 사용자 검토.
2. **다음 라운드 (Step A)**: 커리큘럼 스키마 + 운영자 CRUD UI.
3. **그 다음 (Step B)**: 과제 스키마 + 운영자 배포 UI + 자동 완수 판정 함수.
4. **그 다음 (Step C)**: 학생 대시보드/과제함 + e2e 스모크.
5. **그 다음 (Step D)**: 커리큘럼 → 과제 자동 변환(주별 일괄 배포) + 알림 fanout.

## 3계층 게이트

- **Judgment**: 비전의 핵심 빈 자리. spec/운영 필수. → 만든다.
- **Structure**: 템플릿/적용 분리 · polymorphic items · submission cache · RLS (cohort 멤버 + staff). 서버 권위.
- **Code**: 새 DB 테이블 9개 (`curricula`/`curriculum_weeks`/`curriculum_items`/`cohort_curricula`/`assignments`/`assignment_items`/`assignment_submissions`) + enum 3개. 신규 라우트 5개. 학생 대시보드 카드 2개.

## 후속 (out of scope)

- 자동 채점 정밀화 (단순 시도 기록 → 학습 패턴 분석)
- 시계열 완수율 추이 차트 (assignment 단위)
- 학생 자율 학습 트랙 (현 모델은 학원이 짠 트랙만)
- 라이브 강의/Zoom 통합 (외부 위임 유지)
