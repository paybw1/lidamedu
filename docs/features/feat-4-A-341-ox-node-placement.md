# feat-4-A-341 — OX 지문 체계도 소분류 배치

## 1. 배경
feat-4-A-340 으로 **문제(problem)** 단위 소분류 배치는 됐지만, **OX 지문**(problem_choices /
problem_box_items)은 `related_article_id`(조문 단위)로만 분류돼, 체계도 트리에서 제29조
OX 가 산업상/신규성/진보성/확대 **4개 소분류에 전부 합쳐져** 보였다.

## 2. 설계 (DB 변경 없음 — 부모 문제 배치 상속)
지문에 별도 `related_node_id` 컬럼을 추가하지 않고, **OX 수집 시 부모 문제의
`primary_node_id` 로 배치**한다. 단 지문의 `related_article_id` 가 문제의
`primary_article_id` 와 같을 때만(= 지문이 문제의 주제 조문에 대한 것일 때) 노드를
적용하고, 다른 조문에 대한 교차참조 지문은 조문 단위로 둔다.

`getOxQuestionsForArticle(client, articleId, limit, opts?)`:
- `opts.nodeSubtreeIds` 주어지면, 각 지문에 대해:
  - `problem.primary_article_id !== articleId` → **유지**(교차참조 지문은 조문 단위)
  - `problem.primary_node_id == null` → **유지**(미태깅 → scatter, 현행)
  - `problem.primary_node_id ∈ nodeSubtreeIds` → **유지**(이 노드에 배치)
  - 그 외 → **제외**
- `opts` 없으면 조문 단위(article-viewer / chapter-viewer 현행 유지).

`systematic-node-viewer` 는 현재 노드의 subtree node_id 를 계산해 각
`getOxQuestionsForArticle` 호출에 전달.

## 3. 이 방식의 장점
- **DB 마이그레이션·백필·지문 편집기 picker 불필요.** feat-4-A-340 의 문제 태그를
  그대로 재사용 — 이미 태깅한 61문제의 OX 가 즉시 정렬.
- 문제 `primary_node_id` 변경 시 OX 배치 **자동 동기화**(별도 재처리 없음).
- 교차참조 지문(다른 조문 관련)은 자기 조문 노드에 올바르게 노출(상실 없음).

## 4. 한계 / 후속
- 한 문제의 같은-조문 지문들이 **서로 다른 소분류**여야 하는 경우(종합형) 구분 불가 —
  그런 문제는 대개 `primary_node_id=NULL`(미분류)라 scatter 로 처리됨. 진짜 지문별
  override 가 필요해지면 `problem_choices.related_node_id` 컬럼 + 지문 picker 추가
  (원안)로 확장. 현재는 불필요 판단.
- article-viewer / chapter-viewer(조문 트리)는 조문 단위 유지(설계상 정확).

## 5. 검증 (운영 DB)
제29조 OX 지문 239개의 부모 문제 소분류 분포: 진보성 93·신규성 74·산업상 18·확대 12·
미태깅 42. → 4개 소분류가 각자 OX 를 가짐(전엔 239 전부 4곳 중복).

## 6. 변경 파일
- `app/features/problems/queries.server.ts` — `getOxQuestionsForArticle` opts.
- `app/features/subjects/screens/systematic-node-viewer.tsx` — subtree 계산 + 전달.
