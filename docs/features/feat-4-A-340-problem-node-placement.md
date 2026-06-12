# feat-4-A-340 — 문제(객관식) 체계도 소분류 배치

## 1. 배경 / 요구

체계도(`systematic_nodes`)에서 제29조는 **산업상 이용가능성 / 신규성 / 진보성 / 확대된
선출원** 4개 노드로 세분화돼 있고, `article_systematic_links` 가 **제29조 1개를 이 4개
노드 전부**에 연결한다. 따라서 제29조에 연관된 문제·판례가 4개 소분류에 **전부 중복
노출**된다. 신규성 문제를 신규성에만 배치하고 싶다.

## 2. 현황 (조사 결과)

- **판례 쪽은 이미 구현됨**: `cases.primary_node_id` + 배치 우선순위(`getCasePlacementMaps`,
  `getCaseIdsByPlacement`) + staff 소분류 선택기(`admin-case-edit` `SUB_NODE_CONFIGS` /
  `admin/api/case.tsx` `set_primary_placement`). 판례는 노드 미할당이면 조문 파생으로
  fallback. → **판례는 추가 작업 없음**(미할당 판례를 staff 가 지정만 하면 됨).
- **문제 쪽은 미구현**: `problems.primary_article_id`(조문 단위)만 있고 노드 배치 불가.
  배치 함수 전부 `primary_article_id IN (노드의 조문들)` 로만 카운트/리스트 → 4곳 중복.

→ 작업 범위 = **문제 쪽에 판례와 동일한 노드 배치 도입**. (원안의 `article_case_links.node_id`
는 판례 메커니즘과 중복이라 **폐기**.)

## 3. 설계

### 3.1 DB
```sql
alter table public.problems
  add column if not exists primary_node_id uuid references public.systematic_nodes(node_id) on delete set null;
create index if not exists idx_problems_primary_node_id on public.problems(primary_node_id);
```
- nullable. NULL = 기존처럼 `primary_article_id` 파생 배치(하위호환). 값 있으면 그 노드에만.
- `on delete set null` — 노드 삭제 시 문제는 조문 파생으로 자연 복귀.

### 3.2 배치 우선순위 (판례 미러링, 단 ACL 없음 → 2단계)
노드 N(및 subtree)에 배치되는 문제 =
1. `primary_node_id ∈ subtree(N)` (정확 배치), **∪**
2. `primary_node_id IS NULL AND primary_article_id ∈ articleIds(N)` (조문 파생 fallback)

→ 신규성 문제(`primary_node_id=신규성`)는 신규성에만. 진보성 노드는 (조문은 제29조라도
`primary_node_id≠NULL` 이라) fallback 에서 제외 → 안 나옴.

### 3.3 수정 대상 (배치 함수 — 전부 일관 적용)
`app/features/problems/queries.server.ts`:
- `getSystematicNodeProblemStats` (트리 칩 카운트) — **핵심**. node-pinned 는 노드별, 나머지는 조문별 집계로 분리.
- `getSystematicNodeProblemSequence` (노드 클릭 풀이 시퀀스)
- `getSystematicNodeProblems` (admin 노드별 문제 편집 목록)
- `listSystematicTopNodes` (top 노드 카운트)

`app/features/study/queries.server.ts`:
- `getSessionWeakNodes` — 문제→노드 귀속을 `primary_node_id` 우선.

`app/features/subjects/lib/node-progress.server.ts`:
- 트리 게이지 — 조문 키 집계. node-pinned 문제는 해당 노드 게이지에만 반영하도록 검토·정렬.

### 3.4 staff 편집 UI
`app/features/problems/screens/admin-problem-edit.tsx`:
- loader: 과목 `getSystematicSkeleton` → `articleNumber → [{nodeId,label}]` 맵(소분류 ≥2 노드인 조문만) 전달.
- 폼: 현재 입력된 조문번호의 노드가 ≥2개면 **"체계도 소분류" select** 노출(+ "(자동)" = NULL).
  기본값 = 문제의 현재 `primary_node_id`.
- save 액션: `primaryNodeId`(uuid|"") 읽어 검증 후 `primary_node_id` 기록(빈값=NULL).
- 조문이 바뀌면(노드 불일치) 소분류 자동 초기화.

> 제너릭 방식(조문의 ASL 노드 목록) 채택 — 판례의 하드코딩 `SUB_NODE_CONFIGS` 대신
> 어떤 세분화 조문에도 동작. 제29조면 4개 노드가 자동 노출.

## 4. 결정 사항
1. 문제당 소분류 **1개**(단일 `primary_node_id`). 복수 필요 시 후속 링크테이블.
2. 판례는 기존 `cases.primary_node_id` 재사용 — `article_case_links.node_id` 안 만든다.
3. 배치 우선순위 2단계(node → article 파생). 기존 데이터·타 과목 무손상(미할당=현행).
4. 선택기는 조문 ASL 노드 기반 제너릭(하드코딩 X).

## 5. 체크리스트
- [x] DB: `problems.primary_node_id` + index + `db:typegen`
- [x] 배치 함수 4종(`getSystematicNodeProblemStats`/`Sequence`/`Problems`/`listSystematicTopNodes`, 공유 헬퍼 `fetchPlacedProblemRows`) + `getSessionWeakNodes`
- [x] admin-problem-edit 소분류 선택기(제너릭, ASL 노드) + save
- [x] typecheck, SPEC feat-4-A-340 등록
- [ ] **후속**: `node-progress.server.ts`(트리 진도 게이지)는 article-키 구조라 node-aware 로 바꾸려면 `node-progress-gauge` 컴포넌트의 tree-walk 까지 손봐야 함. 카운트·리스트는 정확하나 게이지는 미태깅처럼 조문 파생(소분류 간 약간 분산). 별도 태스크.

## 6. 동작 메모
- 기존 문제는 전부 `primary_node_id=NULL` → **현행과 100% 동일**(4곳 분산). staff 가 소분류를 지정한 문제만 정밀 배치. 비파괴적.
- 선택기는 조문의 ASL 노드(caseOnly 제외)가 ≥2개일 때만 노출. 제29조면 산업상/신규성/진보성/확대 4개 자동.
- 판례는 기존 `cases.primary_node_id`(admin-case-edit ★ + 소분류 select)로 이미 가능 — 미할당 판례를 지정만 하면 동일하게 정밀 배치됨.
