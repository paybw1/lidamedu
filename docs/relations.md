# relations.md — 5종 연관관계 (조문 ↔ 판례 ↔ 문제) 설계

> **목적**: SPEC.md 의 핵심 차별점 "3자 연관관계 그래프"를 구체화. 5개 link 테이블, 방향성 규칙, 양방향 union 조회 패턴, 정합성 보장 트리거를 한 곳에 정리한다.
> **의존**: `docs/article-tree.md` (조문), `docs/db-schema.md` (테이블 정의), `docs/spec-detail-5-4-subjects-A.md` (사용 컨텍스트).
> **결정 근거**: CLAUDE.md Layer 2 #9 (대칭 저장 지양, 쿼리에서 대칭 조회), spec-detail 결정사항 #13.

---

## 1. 한 줄 요약

> **연관관계는 한 방향만 저장한다. 조회 시 양방향으로 union. 중복 저장 시 정합성 지옥이 시작된다.**

---

## 2. 5종 link 테이블 (Polymorphic 아님 — 각 페어마다 별도)

CLAUDE.md 의 5종을 그대로 따른다. polymorphic 단일 테이블 대신 **페어마다 별도 테이블** — 외래키 제약·인덱스·RLS 가 자연스럽다.

| # | 테이블 | 좌 | 우 | 방향성 | 자체 루프 |
|---|---|---|---|---|---|
| 1 | `article_article_links` | article | article | **무방향** (정규화) | 금지 (자기 자신 link 금지) |
| 2 | `article_case_links` | article | case | **유방향** (article → case) | — |
| 3 | `case_case_links` | case | case | **무방향** (정규화) | 금지 |
| 4 | `problem_article_links` | problem | article | **유방향** (problem → article) | — |
| 5 | `problem_case_links` | problem | case | **유방향** (problem → case) | — |

> "유방향" 이라도 UI 에서는 양쪽에서 조회한다. 단지 저장 row 가 한 줄이라는 의미.

### 2.1 무방향 정규화 — 작은 ID 가 왼쪽

`article_article_links` 와 `case_case_links` 는 의미적으로 양방향(서로 관련). **저장은 `(smaller_id, larger_id)` 순서로만 한다** — DB 레벨에서 강제.

```sql
create table public.article_article_links (
  link_id           uuid primary key default gen_random_uuid(),
  article_a         uuid not null references articles(article_id) on delete cascade,
  article_b         uuid not null references articles(article_id) on delete cascade,
  relation_type     public.aa_relation_type not null,
  note              text,
  created_by        uuid not null references profiles(profile_id),
  created_at        timestamptz not null default now(),
  -- 정규화: 항상 article_a < article_b
  constraint aa_normalized check (article_a < article_b),
  -- 자기 자신 금지
  constraint aa_no_self check (article_a <> article_b),
  -- 같은 페어 + 같은 관계 타입 중복 금지
  unique (article_a, article_b, relation_type)
);
```

> `article_a < article_b` 비교는 uuid 의 binary 순서. 입력 단계에서 **항상 둘을 정렬**해서 insert.

### 2.2 유방향 — 의미가 비대칭

`article_case_links` 는 의미상 **"이 조문에 관련된 판례"** = "이 판례가 해석한 조문". 둘 다 존재할 수 있지만 **저장은 article 쪽이 출발점**으로 통일.

```sql
create table public.article_case_links (
  link_id        uuid primary key default gen_random_uuid(),
  article_id     uuid not null references articles(article_id) on delete cascade,
  case_id        uuid not null references cases(case_id) on delete cascade,
  relation_type  public.ac_relation_type not null,  -- 'directly_interprets' / 'cites' / 'similar_to' / 'contrary_to'
  note           text,
  created_by     uuid not null references profiles(profile_id),
  created_at     timestamptz not null default now(),
  unique (article_id, case_id, relation_type)
);

create index article_case_links_article on article_case_links(article_id);
create index article_case_links_case on article_case_links(case_id);
```

`problem_article_links`, `problem_case_links` 도 동일 구조 (problem 출발, article/case 목적지).

---

## 3. relation_type enum

각 페어마다 의미 있는 관계 타입을 두어 **필터·통계·UI 라벨**에 사용한다.

### 3.1 article ↔ article (`aa_relation_type`)

| value | 의미 | 예시 |
|---|---|---|
| `cross_reference` | 본문이 서로 인용 | 法 29 ↔ 法 36 |
| `parent_child` | 일반/특수 | 일반 법 ↔ 특별법 조항 |
| `precondition` | 적용 선후 | 신규성 → 진보성 (전자가 선결) |
| `exception` | 예외 관계 | 본문 ↔ 단서 |

### 3.2 article ↔ case (`ac_relation_type`)

| value | 의미 |
|---|---|
| `directly_interprets` | 그 조문을 직접 해석 |
| `cites` | 그 조문을 인용 |
| `similar_to` | 유사 사건 |
| `contrary_to` | 반대 결론 |

### 3.3 case ↔ case (`cc_relation_type`)

| value | 의미 |
|---|---|
| `cited_by` | 인용 관계 (방향은 별도 컬럼 또는 normalize 시 작은 case 가 a) |
| `same_topic` | 같은 쟁점 |
| `overruled_by` | 후속 판례가 뒤집음 |
| `companion` | 동일 일자/사건 |

> `overruled_by` 는 명백히 **유방향**. 무방향 정규화와 충돌 → `case_case_links` 도 결국 **유방향** 으로 두는 게 맞다. 결론: **case_case_links 는 유방향**으로 변경 (방향이 의미 있을 때).

```sql
create table public.case_case_links (
  link_id        uuid primary key default gen_random_uuid(),
  source_case_id uuid not null references cases(case_id) on delete cascade,
  target_case_id uuid not null references cases(case_id) on delete cascade,
  relation_type  public.cc_relation_type not null,
  note           text,
  created_by     uuid not null references profiles(profile_id),
  created_at     timestamptz not null default now(),
  constraint cc_no_self check (source_case_id <> target_case_id),
  unique (source_case_id, target_case_id, relation_type)
);
```

> 결론적으로 **2종(article↔article)만 무방향 정규화**, 나머지 4종은 유방향. CLAUDE.md 의 `(smaller_id, larger_id)` 정규화 규칙은 article-article 에만 적용.

### 3.4 problem ↔ article (`pa_relation_type`)

| value | 의미 |
|---|---|
| `tested` | 그 조문을 출제 (문제 본문이 조문을 묻는다) |
| `referenced_in_choice` | 지문(보기) 안에서 인용 — 자동 정오문제 연동의 트리거 |
| `explanation` | 해설에서 인용 |
| `comparison` | 비교 대상 |

> `referenced_in_choice` 는 **`problem_choices.related_article_id`** 컬럼으로 1:1 직접 저장(다음 절). 즉 link 테이블의 같은 row 와 중복될 수 있는데, **link 테이블이 SSoT**. choice 컬럼은 캐시.

### 3.5 problem ↔ case (`pc_relation_type`)

| value | 의미 |
|---|---|
| `tested` | 판례를 출제 |
| `referenced_in_choice` | 지문에서 인용 |
| `explanation` | 해설에서 인용 |
| `model_answer_cites` | (2차) 모범답안이 인용 |

---

## 4. 지문 단위 연동 (결정사항 #13)

PPT slide 19·20 의 "지문별 색인" 핵심.

### 4.1 `problem_choices` 와 link 의 관계

1차 객관식 문제는 5지선다. 각 보기는 `problem_choices` 에 row 하나.

```sql
create table public.problem_choices (
  choice_id          uuid primary key default gen_random_uuid(),
  problem_id         uuid not null references problems(problem_id) on delete cascade,
  ord                int not null,                     -- 보기 번호 (1~5)
  body_text          text not null,                    -- 보기 본문
  is_correct         boolean not null default false,
  explanation_md     text,                             -- 보기별 해설 (O/X 분류 포함)
  reference_kind     public.choice_reference_kind,     -- 'article' / 'case' / 'practice_theory'
  related_article_id uuid references articles(article_id),  -- reference_kind='article' 일 때
  related_case_id    uuid references cases(case_id),         -- reference_kind='case' 일 때
  created_at         timestamptz not null default now()
);
```

- 각 보기가 **조문 / 판례 / 실무·이론** 중 하나로 분류 (slide 20)
- `related_article_id`/`related_case_id` 가 채워지면 → **그 조문 / 판례 우측 패널의 정오문제 위젯**에 자동 노출
- link 테이블에도 동시에 row 가 들어감 (`relation_type = 'referenced_in_choice'`)
- 이 둘은 SSoT(link 테이블) + 캐시(choice 컬럼) 관계 — DB 트리거로 동기화

```sql
-- problem_choices INSERT/UPDATE 시 link 테이블 sync
create or replace function public.sync_choice_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 기존 referenced_in_choice link 정리
  delete from problem_article_links
   where problem_id = (select problem_id from problem_choices where choice_id = NEW.choice_id)
     and relation_type = 'referenced_in_choice'
     and article_id is not distinct from OLD.related_article_id;

  -- 새 link 추가
  if NEW.related_article_id is not null then
    insert into problem_article_links (problem_id, article_id, relation_type, created_by)
    select pc.problem_id, NEW.related_article_id, 'referenced_in_choice', auth.uid()
      from problem_choices pc where pc.choice_id = NEW.choice_id
    on conflict (problem_id, article_id, relation_type) do nothing;
  end if;

  -- case 도 같은 방식 …
  return NEW;
end;
$$;
```

(실제 트리거 SQL 은 `docs/db-schema.md` 의 Problems 섹션에 옮긴다.)

---

## 5. 양방향 union 조회 패턴

### 5.1 article ↔ article (무방향 정규화)

```sql
-- "이 조문(:article_id)과 관련된 다른 조문 전부"
-- 양쪽에서 union — 정규화는 a<b 이므로 a 일 수도, b 일 수도 있음
select case when article_a = :article_id then article_b else article_a end as other_id,
       relation_type, note, created_at
from article_article_links
where article_a = :article_id or article_b = :article_id
order by created_at desc;
```

### 5.2 article ↔ case (유방향)

```sql
-- "이 조문에 관련된 판례 전부" (조문 우측 패널)
select c.*, l.relation_type, l.note
from article_case_links l
join cases c on c.case_id = l.case_id
where l.article_id = :article_id;

-- "이 판례가 해석/인용한 조문 전부" (판례 좌측 트리·우측 패널)
select a.*, l.relation_type, l.note
from article_case_links l
join articles a on a.article_id = l.article_id
where l.case_id = :case_id;
```

### 5.3 case ↔ case (유방향)

```sql
-- "이 판례를 인용한 후속 판례" + "이 판례가 인용한 선행 판례"
-- 양 방향을 union (단 source/target 의미는 다르므로 각각 라벨링)
select target_case_id as related_case_id, relation_type, 'outgoing' as direction
  from case_case_links where source_case_id = :case_id
union all
select source_case_id, relation_type, 'incoming' as direction
  from case_case_links where target_case_id = :case_id;
```

### 5.4 problem ↔ article / case (유방향)

```sql
-- "이 문제와 관련된 조문/판례" (문제 상세 우측 패널)
select a.*, pa.relation_type
from problem_article_links pa
join articles a on a.article_id = pa.article_id
where pa.problem_id = :problem_id;

-- "이 조문에 출제된 문제 전부" (조문 우측 패널 → 출제 문제)
select p.*, pa.relation_type
from problem_article_links pa
join problems p on p.problem_id = pa.problem_id
where pa.article_id = :article_id
  and pa.relation_type in ('tested', 'referenced_in_choice');
```

---

## 6. RLS 정책

연관관계 row 는 **공개 콘텐츠** (조문·판례·문제 자체와 동일 정책).

```sql
alter table public.article_article_links enable row level security;
alter table public.article_case_links enable row level security;
alter table public.case_case_links enable row level security;
alter table public.problem_article_links enable row level security;
alter table public.problem_case_links enable row level security;

-- 모든 인증 사용자 읽기 가능
create policy "read-all-links"
  on public.article_case_links for select
  to authenticated using (true);
-- (동일하게 5개 테이블에 적용)

-- 작성·수정·삭제는 강사·운영자만
create policy "instructor-admin-write-links"
  on public.article_case_links for all
  to authenticated
  using ((select auth.jwt() ->> 'user_role') in ('instructor','admin'))
  with check ((select auth.jwt() ->> 'user_role') in ('instructor','admin'));
```

(실제 역할 체크는 `profiles.role` 을 JWT 에 싣거나 별도 `requireRole(client,...)` 헬퍼로 처리. 정책 SQL 은 `docs/db-schema.md` 에서 통일.)

---

## 7. 인덱스

```sql
-- article-article
create index aal_a on article_article_links(article_a, relation_type);
create index aal_b on article_article_links(article_b, relation_type);

-- article-case
create index acl_article on article_case_links(article_id, relation_type);
create index acl_case on article_case_links(case_id, relation_type);

-- case-case
create index ccl_source on case_case_links(source_case_id, relation_type);
create index ccl_target on case_case_links(target_case_id, relation_type);

-- problem-article
create index pal_problem on problem_article_links(problem_id, relation_type);
create index pal_article on problem_article_links(article_id, relation_type);

-- problem-case
create index pcl_problem on problem_case_links(problem_id, relation_type);
create index pcl_case on problem_case_links(case_id, relation_type);
```

각 link 의 양방향 union 쿼리에 모두 인덱스가 작동.

---

## 8. 정합성 트리거

### 8.1 article ↔ article 정규화 강제

```sql
create or replace function public.normalize_aa()
returns trigger language plpgsql as $$
declare lo uuid; hi uuid;
begin
  if NEW.article_a = NEW.article_b then
    raise exception 'self-link not allowed';
  end if;
  if NEW.article_a > NEW.article_b then
    lo := NEW.article_b; hi := NEW.article_a;
    NEW.article_a := lo; NEW.article_b := hi;
  end if;
  return NEW;
end;
$$;

create trigger aa_normalize before insert or update
  on public.article_article_links
  for each row execute function public.normalize_aa();
```

> 이렇게 하면 입력 측에서 정렬 안 해도 DB 가 항상 정렬해서 저장.

### 8.2 cascade soft-delete

조문/판례/문제가 soft-delete (`deleted_at`) 될 때 link 는 **유지** (역사 보존). 다만 조회 시 deleted entity 를 제외하는 view 를 별도 제공.

```sql
create view public.v_article_case_links as
select l.*
from article_case_links l
join articles a on a.article_id = l.article_id and a.deleted_at is null
join cases c on c.case_id = l.case_id and c.deleted_at is null;
```

---

## 9. UI 측 사용 예 (관련자료 패널)

조문 우측 패널의 "관련 판례" 탭:

```ts
// app/features/laws/lib/related.server.ts
export async function getRelatedCases(
  client: SupabaseClient<Database>,
  articleId: string,
) {
  const { data, error } = await client
    .from("article_case_links")
    .select(`
      relation_type,
      note,
      cases (
        case_id, court, decided_at, case_number, case_title, importance
      )
    `)
    .eq("article_id", articleId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
```

판례 우측 패널의 "관련 문제":

```ts
// 1차 기출 / 2차 기출 / 2차 예상 분리 — relation_type + problem.exam_round 로 필터
const { data } = await client
  .from("problem_case_links")
  .select(`
    relation_type,
    problems!inner (
      problem_id, exam_round, exam_kind, year, round, title, classification
    )
  `)
  .eq("case_id", caseId);
```

---

## 10. 자주 발생하는 함정

1. **양방향으로 두 row 저장** — `(A→B)` 와 `(B→A)` 를 둘 다 insert. 정합성 깨짐. **반드시 한 row + union 조회**.
2. **link 테이블의 cascade delete** 가 너무 강함 — 조문 개정 시 article row 가 삭제되면 link 사라짐. 조문은 **soft-delete** 만 허용 (`deleted_at`) → cascade 가 트리거되지 않음.
3. **relation_type 의 의미 인플레이션** — 한 enum 에 너무 많은 값. 위 분류는 보수적으로 시작, 실제 사용 데이터 보고 추가.
4. **`problem_choices` 컬럼만 채우고 link 테이블 미동기화** — UI 에서 양방향 조회 시 일부 누락. 트리거로 sync 강제.
5. **무방향 정규화에서 `<` 비교를 잊음** — 정렬 안 한 채 insert 시 unique 제약 우회됨. DB 트리거로 강제.
6. **case ↔ case 를 무방향으로 정규화** — `overruled_by` 같은 명백한 방향성 의미 손실. 결론: **유방향으로 저장** (위 §3.3 참조).
