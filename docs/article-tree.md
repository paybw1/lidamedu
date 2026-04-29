# article-tree.md — 조문 트리 저장 / 조회 / 식별자 전략

> **목적**: 변리사 학습 플랫폼이 다루는 5개 법령(특허법·상표법·디자인보호법·민법·민사소송법)의 조문 트리를 PostgreSQL 에서 어떻게 저장·조회·식별·시점 조회하는지 단일 진실로 정리한다.
> **의존**: `docs/spec-detail-5-4-subjects-A.md` (도메인 모델), `docs/db-schema.md` (테이블 정의), `docs/relations.md` (5종 관계).
> **결정 근거**: spec-detail 9절 #1·#2·#11·#12

---

## 1. 조문 계층 구조 (도메인)

대한민국 법령은 다음 4단계 계층을 가진다 (예: 특허법 제 29조 제 1항 제 2호 가목).

```
조 (article)        — 제 29조
 └ 항 (clause)      — 제 1항  (①, ②, …)
    └ 호 (item)     — 제 1호  (1., 2., …)
       └ 목 (sub)   — 가목    (가, 나, 다, …)
```

추가로 조 위에 **편(part) / 장(chapter) / 절(section)** 같은 그룹 노드가 존재한다 (예: "제 2장 특허요건 및 특허출원"). 이 그룹 노드는 본문이 없지만 트리에 포함된다.

---

## 2. 저장 모델 — `articles` + `article_revisions`

### 2.1 `articles` (구조만)

조문의 **변하지 않는 골격**을 저장. 본문(텍스트)은 **저장하지 않는다** — 본문은 항상 `article_revisions` 에서 가져온다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `article_id` | `uuid` PK | |
| `law_id` | `uuid` FK → `laws.law_id` | 어느 법령에 속하는가 |
| `parent_id` | `uuid` FK → `articles.article_id` (nullable) | 부모 노드 (편/장/절은 부모, 조는 절을 부모로 가짐. 조 위에 그룹 노드가 없으면 root) |
| `level` | `enum article_level` | `part` / `chapter` / `section` / `article` / `clause` / `item` / `sub` |
| `path` | `ltree` | 자기까지의 조상 경로 (PostgreSQL ltree 확장) |
| `article_number` | `text` (nullable) | `29` (조 번호). 항/호/목/그룹 노드는 null |
| `clause_number` | `int` (nullable) | `1` (항 번호) |
| `item_number` | `int` (nullable) | `2` (호 번호) |
| `sub_item_number` | `text` (nullable) | `가` (목, 1글자 한글) |
| `display_label` | `text` | 화면용 라벨 (`제 2장 특허요건 및 특허출원`, `제 29조`, `제 1항`, `1.`, `가.`) |
| `current_revision_id` | `uuid` FK (nullable) | 현재 시행 중인 본문 스냅샷 |
| `importance` | `smallint` | ★ 1~3 (PPT slide 15) |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` (nullable) | 소프트 삭제 |

### 2.2 `article_revisions` (본문 + 시점)

조문 개정마다 **불변 스냅샷**.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `revision_id` | `uuid` PK | |
| `article_id` | `uuid` FK | |
| `law_revision_id` | `uuid` FK → `law_revisions.law_revision_id` | 어떤 법 개정에 묶이는가 |
| `body_json` | `jsonb` | **구조화 본문** (다음 절 참고) |
| `effective_date` | `date` | 시행일 |
| `expired_date` | `date` (nullable) | 후속 개정으로 종료된 날짜 |
| `change_kind` | `enum` | `created` / `amended` / `deleted` |
| `created_at` | `timestamptz` | |
| `created_by` | `uuid` FK → profiles | 강사·운영자 |

**불변 강제**: `article_revisions` 의 `body_json`, `effective_date`, `change_kind` 는 발행 후 update 금지 (DB 트리거로 강제).

---

## 3. 본문 저장 포맷 — `body_json` (결정사항 #1)

마크다운/HTML 대신 **구조화 JSON** 으로 저장. 항·호·목 트리를 잃지 않고, 관련조문 inline 링크·약식 표기·주석을 토큰으로 보존한다.

### 3.1 스키마 (TypeScript)

```ts
type ArticleBody = {
  // 본문 자체가 트리. 항/호/목까지 한 articles row 의 body 안에 모두 들어 있다.
  // (=articles 테이블은 '조 단위'까지만 row. 항/호/목은 body_json 안에서만 표현)
  blocks: Block[];
};

type Block =
  | { kind: "clause"; number: number; label: string; inline: Inline[]; children: Block[] }
  | { kind: "item"; number: number; label: string; inline: Inline[]; children: Block[] }
  | { kind: "sub"; letter: string; label: string; inline: Inline[]; children: Block[] }
  | { kind: "para"; inline: Inline[] }   // 단순 단락 (조 본문 직속 등)
  | { kind: "title_marker"; text: string }; // (정의), (실시의 정의) 같은 라벨 마커

type Inline =
  | { type: "text"; text: string }
  | { type: "ref_article"; raw: string; target: ArticleRef } // "法 89" → 다른 조문
  | { type: "ref_law"; raw: string; lawCode: string }
  | { type: "amendment_note"; text: string } // <개정 2019. 12. 10., 2025. 1. 21.>
  | { type: "footnote"; n: number; body_md: string };

type ArticleRef = {
  law_code: string;        // patent / trademark / design / civil / civil-procedure
  article: number;         // 89
  clause?: number;         // 3
  item?: number;
  sub_item?: string;
};
```

### 3.2 예시 — 특허법 제 2조 정의

PPT slide 15 의 조문이 정확히 `body_json` 으로는 다음과 같다.

```json
{
  "blocks": [
    {
      "kind": "para",
      "inline": [
        { "type": "text", "text": "이 법에서 사용하는 용어의 뜻은 다음과 같다." },
        { "type": "amendment_note", "text": "<개정 2019. 12. 10., 2025. 1. 21.>" }
      ]
    },
    {
      "kind": "item", "number": 1, "label": "1.",
      "inline": [
        { "type": "title_marker", "text": "(발명의 정의)" },
        { "type": "text", "text": " \"발명\"이란 자연법칙을 이용한 기술적 사상의 창작으로서 고도(高度)한 것을 말한다." }
      ],
      "children": []
    },
    {
      "kind": "item", "number": 3, "label": "3.",
      "inline": [{ "type": "title_marker", "text": "(실시의 정의)" },
                 { "type": "text", "text": " \"실시\"란 다음 각 목의 구분에 따른 행위를 말한다." }],
      "children": [
        {
          "kind": "sub", "letter": "가", "label": "가.",
          "inline": [
            { "type": "title_marker", "text": "(물건발명)" },
            { "type": "text", "text": " 물건의 발명인 경우: 그 물건을 생산·사용·양도·대여·수출 또는 수입하거나…" }
          ],
          "children": []
        }
      ]
    }
  ]
}
```

### 3.3 렌더링 규칙

- `inline[].type === "ref_article"` 토큰은 **클릭 가능한 링크** 로 렌더 → `feat-4-A-111` 관련조문 링크
- `amendment_note` 는 **회색 작은 텍스트** 로 별도 라인
- `title_marker` 는 **굵은 글씨** (`(발명의 정의)`)
- 항(`clause`) / 호(`item`) / 목(`sub`) 단위로 **접기 가능** — `feat-4-A-113` "제목만 보기" (결정사항 #11: **항 단위** 가 기본 접기 단위)

### 3.4 본문 변경 절차 (요약)

1. 강사가 `/admin/content/laws/:lawCode/revisions/draft` 에서 새 `law_revision` 작성
2. 변경된 조문들의 새 `article_revision` 을 `body_json` 으로 입력 (UI 는 트리 에디터 + diff 미리보기)
3. `effective_date` 지정 후 **publish** → 트랜잭션:
   - 새 `article_revisions` 일괄 insert (불변)
   - 기존 `articles.current_revision_id` 일괄 update
   - 기존 활성 `article_revisions.expired_date` 채움
4. 알림 큐: 해당 조문을 즐겨찾기/메모한 사용자 → Resend 이메일 + 대시보드 알림 (`feat-7-004`)

---

## 4. ltree path 저장 (결정사항 #2)

PostgreSQL `ltree` 확장으로 트리 경로를 저장. 부분트리 쿼리·정렬·인덱스가 자연스럽다.

### 4.1 path 표기 규칙

`ltree` 는 점(`.`) 으로 구분된 라벨 시퀀스. 각 라벨은 `[A-Za-z0-9_]+` 만 허용 → 한국어·특수문자는 영문 토큰으로 매핑.

```
patent.ch02.s01.a29.c01.i02.gA
        │    │    │    │    │  └ 목 가
        │    │    │    │    └ 호 2
        │    │    │    └ 항 1
        │    │    └ 조 29
        │    └ 절 (있다면)
        └ 장 02
```

라벨 매핑 규칙:

| level | 라벨 패턴 | 예 |
|---|---|---|
| 법령 | `<law_code>` | `patent`, `trademark`, `design`, `civil`, `cprocedure` (민사소송법) |
| 편 | `pt<NN>` | `pt01` |
| 장 | `ch<NN>` | `ch02` |
| 절 | `s<NN>` | `s01` |
| 조 | `a<NNNN>` | `a29` (자릿수 가변, 큰 법 대비 4자리까지) |
| 항 | `c<NN>` | `c01` |
| 호 | `i<NN>` | `i02` |
| 목 | `g<X>` | `gA` (가→A, 나→B, …, 카→K, 타→L, 파→M, 하→N) |

> 한글 자모를 영문으로 매핑하는 이유: ltree 라벨 제약 + 정렬 안정성. 표시(display)는 `display_label` 컬럼이 별도로 제공.

### 4.2 인덱스

```sql
-- ltree GiST 인덱스 (부분트리 쿼리·조상/자손 매칭)
create index articles_path_gist on public.articles using gist (path);

-- ltree btree 인덱스 (정확 매칭·정렬)
create index articles_path_btree on public.articles using btree (path);
```

### 4.3 자주 쓰는 쿼리

```sql
-- 특허법 제 2장 전체 (부분트리)
select * from articles where path <@ 'patent.ch02';

-- 특허법 제 29조의 모든 항/호/목
select * from articles where path <@ 'patent.ch02.s01.a29';

-- 단일 조문 조회 (정확 매칭)
select * from articles where path = 'patent.ch02.s01.a29';

-- 어떤 조문의 직속 자식만
select * from articles where path ~ 'patent.ch02.s01.a29.c*{1}';

-- 특정 노드의 부모들 (조상)
select * from articles where path @> 'patent.ch02.s01.a29.c01';
```

### 4.4 갱신 시 path 일관성

- 부모가 바뀌거나 번호가 재배치되면 **부분트리 path 일괄 update** 가 필요 → 마이그레이션 스크립트 또는 트리거
- `ltree` 의 `subpath`, `nlevel`, `index` 함수로 path 조작 가능

---

## 5. 식별자 변환 (`feat-4-A-102`)

3 가지 표기 사이를 양방향으로 변환한다.

### 5.1 3가지 표기

| 표기 | 예 | 용도 |
|---|---|---|
| **사람 친화** (display) | `특허법 제 29조 제 1항 제 2호 가목` | UI 본문, 인용, 강의 자료 |
| **약식** (shorthand) | `特法 §29①2.가` 또는 `法 29①2.가` | 본문 inline 참조 (관련조문) |
| **구조** (struct) | `{law_code:"patent", article:29, clause:1, item:2, sub_item:"가"}` | DB·코드·URL 빌더 |
| **URL slug** | `patent/29-1-2-ga` | 라우트 `/subjects/patent/articles/:articlePath` |
| **ltree path** | `patent.ch02.s01.a29.c01.i02.gA` | DB 쿼리 |

### 5.2 헬퍼 단일 소유 — `app/features/laws/lib/identifier.ts`

```ts
// 단일 소유. 조문 식별자 변환은 이 모듈만 통과.
export type ArticleIdent = {
  lawCode: "patent" | "trademark" | "design" | "civil" | "civil-procedure";
  article: number;
  clause?: number;
  item?: number;
  subItem?: string; // "가" 등
};

export function parseDisplay(s: string): ArticleIdent | null;
export function parseShorthand(s: string): ArticleIdent | null;
export function parseSlug(s: string): ArticleIdent | null;
export function parseLtreePath(s: string): ArticleIdent | null;

export function toDisplay(ident: ArticleIdent): string;
export function toShorthand(ident: ArticleIdent): string;
export function toSlug(ident: ArticleIdent): string;
export function toLtreePath(ident: ArticleIdent, ancestors: { chapter?: number; section?: number }): string;

// 약식 표기 안의 ref 토큰을 inline 으로 추출 (본문 렌더링용)
export function extractRefs(text: string): { raw: string; ident: ArticleIdent }[];
```

### 5.3 약식 표기 정규식 (참고)

```
法\s*(\d+)(의\s*(\d+))?(([①-⑳])(\d+(\.[가-하])?)?)?
```

예시 매칭:
- `法 89` → `{article:89}`
- `法 81의 3③` → `{article:81, branch:3, clause:3}` (\* 가지조 — 위 정규식 확장 필요)
- `法 29①2.가` → `{article:29, clause:1, item:2, subItem:"가"}`
- `法 107①Ⅰ,Ⅱ` → 둘로 분리 `[{article:107, clause:1, item:1}, {article:107, clause:1, item:2}]`

> 가지조(`81의 3`) 표현은 별도 컬럼 `article_branch` 추가 가능 (1차 시드 후 필요 시 도입).

---

## 6. 시점 조회 (`feat-4-A-108`, 결정사항 #12)

조문은 **시점**으로 본다. 사용자는 `?at=YYYY-MM-DD` 또는 픽커로 시점을 선택할 수 있고, 그 시점에 시행 중이던 본문이 렌더링된다.

### 6.1 SQL 패턴

```sql
-- 특정 시점의 활성 본문
select ar.*
from articles a
join article_revisions ar on ar.article_id = a.article_id
where a.path = 'patent.ch02.s01.a29'
  and ar.effective_date <= :at
  and (ar.expired_date is null or ar.expired_date > :at)
order by ar.effective_date desc
limit 1;
```

> `(ar.effective_date, ar.expired_date)` 에 GiST 범위 인덱스(또는 일반 btree 두 개)를 둔다.

### 6.2 비교 모드

`?at=2025-10-01&compare=2026-01-01` 같은 옵션으로 두 시점의 `body_json` 을 받아 **diff 뷰** 렌더 — 강사용 개정 워크스페이스(`feat-7-004`) 와 학생용 시점 조회가 같은 컴포넌트 사용.

### 6.3 사용자 데이터(메모/하이라이트) 와 시점

- 메모/하이라이트는 **content snapshot hash** 를 같이 저장 (CLAUDE.md Non-negotiable #9)
- 시점이 바뀌거나 본문이 개정되면 hash 비교 → 매칭 안 되는 range 는 **회색 처리** + 사용자에게 "본문이 바뀌어 표시 위치가 모호합니다" 안내

---

## 7. 정렬축 토글 (`feat-4-A-004`, 결정사항 #12)

화면에서 트리/리스트를 **체계도 순서** 또는 **조문 순서** 로 보여준다. 둘 다 같은 데이터지만 정렬 키가 다르다.

| 축 | 정렬 키 | 사용 |
|---|---|---|
| **체계도 순서** | `articles.systematic_path` (ltree) | 학습 논리 흐름 (특허요건 → 신규성 → …) |
| **조문 순서** | `articles.path` (ltree) | 법전 구조 (제 1장 → 제 2장 → …) |

### 7.1 체계도 별도 트리 — `systematic_paths`

조문 순서(`path`)는 법령 그대로지만, 체계도 순서는 **별도 트리**다 (PPT slide 11/15). 같은 조문이 체계도에서는 다른 위치에 매핑될 수 있고 **여러 체계도 노드에 동시 매핑 가능**.

```sql
create table public.systematic_nodes (
  node_id        uuid primary key default gen_random_uuid(),
  law_code       text not null,         -- 'patent' / 'trademark' / 'design' / ...
  parent_id      uuid references systematic_nodes(node_id),
  path           ltree not null,        -- e.g. 'patent.specreq.patentable.novelty'
  display_label  text not null,         -- '신규성'
  ord            int not null,          -- 형제 사이 정렬 순서
  created_at     timestamptz default now()
);

-- 조문 ↔ 체계도 노드 (다대다, 같은 조문이 여러 체계도 노드에 매핑 가능)
create table public.article_systematic_links (
  article_id  uuid references articles(article_id) on delete cascade,
  node_id     uuid references systematic_nodes(node_id) on delete cascade,
  primary key (article_id, node_id)
);
```

체계도 시드는 강사가 `/admin/content/laws/:lawCode/systematic` 에서 입력 (결정사항 #14).

> **현재 시드 상태 (2026-04 기준)**: `patent` 만 시드 완료. 입력 데이터는 `source/_converted/systematic-tree-patent.json` (체계도2.hwp 의 텍스트 트리 기준, 임병웅 변리사 작성), 시드 스크립트는 `scripts/seed-systematic-patent.mjs`.
>
> **파서 규칙**:
> - 약식 표기(`法 29`, `法 89-93`, `法 132의2-132의15`, `법 28-28의5`, `발명진흥법 ...`)를 articles 의 `article_number` 와 매칭.
> - range 구분자는 `~` 또는 `-` 둘 다 허용.
> - **보수적 룰**: `X-Y`(둘 다 본조)는 X..Y 본조만 매핑. 가지조는 ref 토큰으로 명시 (`X-Y, X의Z` 등). 의도치 않은 over-match 방지.
> - `X-Y의Z`, `X의A-Y`, `X의A-X의B`, `X-X의Z` 같은 가지조 명시 표기는 정상 펼침.
> - 원숫자(`①②③`)와 한글 trailing(`본문`, `각호`)는 article 단위 매핑에서 무시.
> - 발진법 / 발명진흥법 토큰은 분리해서 외부 법 처리(노드만 유지, 링크 skip). 같은 ref 안의 法 토큰은 정상 매핑.
>
> **정합성 (특허법 체계도2 시드 후)**: systematic_nodes 107개, article_systematic_links 301개. 학습 조문 누락 0건. 중복 매핑은 모두 체계도2 가 의도한 다중 분류(예: 제29조 → 산업상 이용가능성/신규성/진보성/확대된 선출원).
>
> 다른 4개 법(상표·디자인·민법·민사소송법)은 동일 포맷의 JSON + 동일 스크립트 패턴으로 추후 시드.

### 7.2 트리 렌더 시

| 모드 | 트리 데이터 소스 |
|---|---|
| 조문 순서 | `articles` 자체. 부모-자식 트리, `path` 정렬 |
| 체계도 순서 | `systematic_nodes` 트리. leaf 노드를 클릭하면 매핑된 `articles` 다중 표시 가능 |

---

## 8. 큰 법 lazy-load (`feat-4-A-110`)

민법은 1118조까지. 첫 진입 시 모든 조문을 로드하면 무겁다.

전략:
1. 트리 첫 렌더는 **그룹 노드(편/장/절)만** 로드 — `where level in ('part','chapter','section')`
2. 사용자가 펼치면 그 부분트리만 추가 로드 — `where path <@ :openedNode`
3. 트리 검색(`feat-4-A-109`) 은 별도 인덱스(`pg_trgm` on display_label) 로 즉시

---

## 9. 색인·검색

| 컬럼 | 인덱스 | 용도 |
|---|---|---|
| `articles.path` | `gist` + `btree` | 부분트리·정확 매칭 |
| `articles.display_label` | `gin (display_label gin_trgm_ops)` | 트리 키워드 검색 |
| `articles.law_id` | `btree` | 법령별 필터 |
| `article_revisions.article_id` | `btree` | 조문 시점 조회 |
| `article_revisions(effective_date)` | `btree` | 시점 검색 정렬 |

---

## 10. 자주 발생하는 함정

1. **path 인덱스 없이 `<@`** — 1118 조문 민법 풀 스캔. 반드시 GiST.
2. **본문을 articles 에 직접 저장** — 개정 이력 잃음. 본문은 **항상 article_revisions**.
3. **revision in-place 수정** — 학생 메모/하이라이트 hash 깨짐. **새 revision 발행** 만 허용.
4. **ltree 라벨에 한글** — 제약 위반. 영문 매핑(law_code 등)으로 통일.
5. **양방향으로 path 동기화 누락** — 조문 재배치 시 후속 path 갱신 안 하면 트리가 깨짐. 트리거 필수.

---

## 11. 미니 마이그레이션 청사진 (M2 진입 시)

```sql
-- 1. ltree 확장
create extension if not exists ltree;
create extension if not exists pg_trgm;

-- 2. enums
create type public.article_level as enum
  ('part','chapter','section','article','clause','item','sub');
create type public.law_change_kind as enum ('created','amended','deleted');

-- 3. tables
create table public.laws (...);
create table public.law_revisions (...);
create table public.articles (...);
create table public.article_revisions (...);
create table public.systematic_nodes (...);
create table public.article_systematic_links (...);

-- 4. indexes
create index articles_path_gist on articles using gist (path);
create index articles_path_btree on articles using btree (path);
create index articles_display_label_trgm on articles using gin (display_label gin_trgm_ops);

-- 5. triggers
-- - article_revisions BEFORE UPDATE: published 후 body_json/effective_date/change_kind 수정 차단
-- - articles BEFORE UPDATE/INSERT: parent_id 기반으로 path 재계산
-- - law_revisions AFTER INSERT publish: notification queue 적재
```

자세한 컬럼·RLS·트리거는 `docs/db-schema.md` 의 Articles & Revisions 섹션 참조.
