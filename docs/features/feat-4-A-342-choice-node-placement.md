# feat-4-A-342 — 지문(OX) 체계도 소분류 picker

## 1. 배경
feat-4-A-341 은 OX 지문을 **부모 문제 primary_node_id 상속**으로 배치했다. 하지만
운영자가 **지문(choice)별로** 조문을 분류하는데(전체 문제 보기 → 문제 편집기), 제29조를
선택해도 **지문 레벨 소분류 picker 가 없어** OX 가 정밀 분류되지 않는다(문제 단위는
feat-4-A-340 으로 picker 가 있음). 종합형/교차참조 지문은 문제 상속만으론 부정확.

## 2. 설계
지문에 **명시 소분류** `related_node_id` 를 추가하고, OX 배치 우선순위를 3단계로:
1. **지문 `related_node_id`** 명시 → 그 노드 (feat-4-A-342)
2. 없으면 **부모 문제 primary_node_id** 상속 (feat-4-A-341, related_article=primary_article 일 때)
3. 그래도 없으면 **조문 파생 scatter** (현행)

### DB
```sql
alter table problem_choices  add column related_node_id uuid references systematic_nodes(node_id) on delete set null;
alter table problem_box_items add column related_node_id uuid references systematic_nodes(node_id) on delete set null;
-- + index
```

### 편집기 (ChoiceEditor / BoxItemEditor)
- prop `subNodeOptions`(조문번호→노드 옵션, admin-problem-edit loader 가 feat-4-A-340 용으로 이미 계산) 전달.
- 각 지문의 입력 조문번호가 세분화(≥2 노드)면 **"체계도 소분류" select** 노출(제29조면 산업상/신규성/진보성/확대), 아니면 hidden(빈 값). 조문 바꾸면 유효성 검증·해제.
- 제출: `choice_{i}_node_id` / `box_{id}_node_id`. action 에서 uuid 검증 후 `related_node_id` 저장.

### 타입/로더
- `ProblemChoice`/`ProblemBoxItem` 에 `relatedNodeId?`(optional — getProblemById 에서만 채움).
- getProblemById select/map 에 related_node_id 추가.

### OX 수집
- `getOxQuestionsForArticle`: choice/box select 에 `related_node_id` 추가 + `placed()` 에 우선순위 1 로 반영.

## 3. 변경 파일
- scripts/sql/20260613_choice_box_related_node.sql, database.types.ts
- app/features/problems/labels.ts (타입)
- app/features/problems/queries.server.ts (getProblemById, getOxQuestionsForArticle)
- app/features/problems/components/choice-editor.tsx, box-item-editor.tsx (picker)
- app/features/problems/screens/admin-problem-edit.tsx (전달 + 저장)

## 4. 동작 메모
- 비파괴적: 미지정 지문은 feat-4-A-341 상속 → 조문 파생 순(현행 유지).
- 지문 picker 는 그 지문의 입력 조문이 세분화된 경우에만 노출(대부분 조문은 안 보임).
- 교차참조 지문(다른 조문)은 우선순위 2에서 조문 단위 유지 — 상실 없음.
