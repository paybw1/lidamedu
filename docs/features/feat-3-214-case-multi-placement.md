# feat-3-214 — 판례 다중 배치 (한 판례, 주제별 서술)

상태: 🔲 계획 (2026-08-28 작성, 사용자 승인 대기)

## 1. 왜

리담상표법 판례집은 **같은 판결을 두 주제에서 다른 각도로** 다룬다. 지금은 판례 1건 = 배치 1곳이라 뒤 주제의 서술이 통째로 안 보인다.

| 판례 | 보이는 쪽 | 안 보이는 쪽 |
|---|---|---|
| 96후1866 | 주제9 — 등록적격성 개별 판단 (357자) | 주제19 — **지정상품 감축으로 제34①11 극복** (2,055자·사실관계·전심·본심) |
| 2002후567 | 주제25 — 공유 상표권에 민법 공유 규정 (427자) | 주제40 — **공유자 1인의 심결취소소송 제기 가부** (1,577자·**63회 기출**) |
| 2000후3708 | 주제26 — 상호의 보통 사용(제90조) (2,020자) | 주제27 — **병행수입업자의 상표 사용 범위** (3,124자) |
| 2017나1148 | 주제1 — 사용의사 (3,009자) | 주제32 — 사용권자 사용 시 손해 발생 (2,752자·평석 포함) |
| 2019허6747 | 주제15 — 제34①6 (481자) | 주제18 — 제34①11의 '혼동' (487자) |

**어느 쪽을 고르든 나머지 절반이 사라진다.** 구판부터 같은 상태였다(신규 결함 아님).

## 2. 지금 모델과 그 근거

`cases.primary_node_id` 단일 배치. `app/features/cases/queries.server.ts` 주석에 정책이 박혀 있다 —
> "체계도 axis: 한 case 는 단일 placement … 중복 배치 불가" (사용자 결정)

반면 **조문 axis 는 이미 다대다**(`article_case_links`)다. 즉 "판례가 여러 곳에 걸린다"는 개념 자체는 이 화면에 이미 있고, 체계도 축만 단일로 묶여 있다.

선례: 주관식 문제는 `problem_systematic_links(problem_id, node_id, seq, note, created_by)` 로 다중 배치를 쓴다([[subjective-node-mapping]]). **같은 형태를 판례에 적용한다.**

## 3. 설계

### 3.1 스키마

```sql
create table case_systematic_links (
  link_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(case_id) on delete cascade,
  node_id uuid not null references systematic_nodes(node_id) on delete cascade,
  seq smallint not null default 1,        -- 교재 수록 순서
  is_primary boolean not null default false, -- 대표 배치(딱 1개)
  book_sections jsonb,                    -- ★그 주제에서의 서술. null 이면 cases.book_sections
  source_seq integer,                     -- 그 주제 안에서의 교재 순번
  note text,
  created_by uuid references profiles(profile_id),
  created_at timestamptz not null default now(),
  unique (case_id, node_id)
);
```

- **`book_sections` 를 링크에 둔다** — 이게 이 작업의 핵심이다. 배치만 늘리고 본문이 하나면 주제19에서 눌러도 주제9 내용이 나와 문제가 그대로다.
- `cases.primary_node_id` 는 **남긴다**(대표 배치 = `is_primary` 링크와 동기화). 27개 파일이 읽고 있어 한 번에 걷어내면 위험하다. 트리거로 정합 유지.
- RLS: `cases` 와 동일(공개 읽기 + staff 쓰기).

### 3.2 읽기 경로 — 바꿀 곳

| 곳 | 지금 | 뒤 |
|---|---|---|
| `getCasePlacementMaps` (트리 카운트) | `primary_node_id` 1:1 | 링크 union. 부모 집계는 기존 "자손 union → size" 그대로라 이중집계 없음 |
| `getCaseIdsByPlacement` (목록 필터) | `in(primary_node_id, …)` | 링크 조회 후 union |
| 판례 뷰어 | `cases.book_sections` | **온 주제**의 링크 본문 우선, 없으면 `cases.book_sections` |
| 진도 분모(`getOverallProgress`) | `cases` 행 수 | **그대로** — 판례 수는 안 변한다 |
| 최신판례 트리거 | `primary_node_id` 강제 | 그대로(대표 배치만 건드림) |

### 3.3 뷰어 — 어느 주제인지 어떻게 아나

목록 URL 은 이미 `case_node` 를 쓴다. 다만 뷰어에는 `?back=%3Ftab%3Dcases%26case_node%3D…` 처럼 **back 안에 접혀** 들어와 있어 뷰어가 직접 읽지 않는다.

→ 뷰어에 `?node=<nodeId>` 를 명시로 넘긴다(트리·목록의 판례 링크가 붙인다). 없으면 대표 배치.
→ 본문 상단에 **주제 전환 칩**: `주제9 등록적격성` / `주제19 제34①12` — 다중 배치 판례에서만 노출.

### 3.4 편집

`admin-case-edit` 의 "교재 구조 본문" 카드를 **배치 탭**으로 감싼다. 배치 추가·삭제·대표 지정 + 배치별 본문 편집. 미러 파생(요지·이유·평석)은 **대표 배치 기준** 유지.

## 4. 단계

| 단계 | 내용 | 하드스톱 |
|---|---|---|
| A | 마이그레이션 + 백필(359건 → 링크 1개, 중복 5건 → 링크 2개) + 트리거 | 적용 후 카운트 대조 |
| B | 읽기 경로 전환(카운트·목록 필터) | 트리 숫자 변화 보고 |
| C | 뷰어 주제 전환 칩 + `?node=` | 화면 확인 |
| D | 편집 화면 배치 탭 | — |

A 만 해도 데이터는 살아나고(트리에 양쪽 노출), B~D 는 그 위의 UX다.

## 5. 결정해야 할 것

1. **트리 카운트에서 중복 판례를 양쪽 다 세는가** → 권고: **센다**(그 주제에서 실제로 읽을 게 있으므로). 과목 총계는 distinct 로 별도 표기.
2. **다른 과목 확대** → 특허·디자인 판례집도 같은 구조면 재사용. 이번엔 상표만 백필.
3. `cases.book_sections` 의 최종 운명 → 당분간 대표 배치의 사본으로 유지(외부 참조 27곳 안정화 후 제거 검토).

## 6. 범위 밖

- 판례 원문(`official_text_md`)·이미지·미러는 판례 단위 그대로. 배치별로 갈리지 않는다.
- 조문 축(`article_case_links`)은 이미 다대다라 손대지 않는다.
