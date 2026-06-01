# 학습 과목 영역 — 화면 이동 속도 진단 (2026-06-01)

## 한 줄 요약

학습 과목(조문·판례·문제) 화면 이동이 느린 **주원인 2가지**: ① **링크 prefetch 0건** — 첫 이동마다 풀 SSR + DB 쿼리 ~20건 부담. ② **loader sequential RTT 5-9단계** — `getLawByCode`/`auth.getUser`/대규모 fan-out 사이가 직렬. **인덱스·N+1은 갭 없음**(처방 불요). 처방 우선순위: **prefetch → sequential 통합 → 탭 분기/defer → staff 컴포넌트 lazy**.

---

## 1. 진단 범위

학습 과목 영역(/subjects/*)의 목록 + 상세 6 라우트:

| 화면 | 라우트 | loader 파일 |
|---|---|---|
| 과목 hub (목록 종합) | `/subjects/:subject` (예: `/subjects/patent`) | `app/features/subjects/screens/patent.tsx` → `subjects/lib/loader.server.ts:loadSubjectHub` |
| 조문 상세 | `/subjects/:subject/articles/:articlePath` | `app/features/subjects/screens/article-viewer.tsx` |
| 판례 상세 | `/subjects/:subject/cases/:caseId` | `app/features/subjects/screens/case-viewer.tsx` |
| 문제 상세 | `/subjects/:subject/problems/:problemId` | `app/features/subjects/screens/problem-viewer.tsx` |
| 맞춤 퀴즈 setup | `/subjects/:subject/quiz/setup` | `app/features/subjects/screens/quiz-setup.tsx` |
| 과목 OX | `/subjects/:subject/ox` | (이번 진단 범위 밖, 동일 패턴 예상) |

> 판례/문제의 단독 목록 라우트는 없음. 과목 hub 한 화면 안에서 `?tab=articles|cases|problems` 로 전환.

---

## 2. loader DB 쿼리 패턴 (sequential RTT)

각 라우트의 loader가 발행하는 DB 쿼리 수와 sequential round-trip 단계. RTT는 서버↔Supabase 왕복(보통 100-300ms).

### 2.1 과목 hub `loadSubjectHub` (`subjects/lib/loader.server.ts:442-`)

순서:
1. **RTT1** `getLawByCode` (단건)
2. **RTT2** `Promise.all([getArticleSkeleton, getSystematicSkeleton, getCasePlacementMaps, totalCaseCount, totalProblemCount])` — 5병렬
3. **RTT3 (조건)** `getCaseIdsByArticleLinks` / `getCaseIdsByPlacement` — cases 탭 + 필터 켤 때만
4. **RTT4** `Promise.all([listCasesBySubject, listProblemsBySubject, getLatestPublishedRevisionDate, listProblemYears, getSystematicNodeProblemStats, problemNodeSeq?])` — 6병렬
5. **RTT5** `client.auth.getUser()` — Supabase auth 토큰 검증
6. **RTT6 (로그인 시)** `Promise.all([getSubjectProgress, getUserArticleBookmarkLevels, getUserArticleAnnotationCounts, getUserProblemStats, getRecommendedArticles, buildNodeProgressByArticle])` — 6병렬
7. **RTT7** `getProblemStatsBulk(problemIds)` — 4단계 결과 의존

**총 ~20 쿼리 / 6-7 sequential RTT**.

### 2.2 조문 상세 `article-viewer.tsx:108-`

1. **RTT1** `getLawByCode`
2. **RTT2** `Promise.all([article, articleSkeleton, systematicNodes])` — 3병렬
3. **RTT3 (조건)** `getArticleByNumberAt` (compare 모드)
4. **RTT4** `auth.getUser`
5. **RTT5** `Promise.all` 12개 — relatedCases, bookmark, memos, highlights, bookmarkLevels, annotationCounts, qnaThreads, blankSets, staffRole, oxQuestions, articleComments, lectureResources
6. **RTT6 (조건)** `getUpcomingArticleRevision`
7. **RTT7 (staff)** `listArticleRevisionHistory`
8. **RTT8** `getOxAnnotationsForRefs(oxQuestions)` — 5단계 결과 의존
9. **RTT9** `getSubjectAxisCounts`

**총 ~20 쿼리 / 6-9 RTT**.

### 2.3 판례 상세 `case-viewer.tsx:90-`

1. **RTT1** `getLawByCode`
2. **RTT2** `Promise.all([kase, articleSkeleton, systematicNodes, placementMaps])` — 4병렬
3. **RTT3** `auth.getUser`
4. **RTT4** `Promise.all` 12개 — relatedArticles, relatedProblems, bookmark, memos, highlights, qnaThreads, references, staffRole, caseComments, examProblems, lectureResources, siblings(내부 1-2건)
5. **RTT5** `getSubjectAxisCounts`

**총 ~18 쿼리 / 5-6 RTT**.

### 2.4 문제 상세 `problem-viewer.tsx:99-`

1. **RTT1** `getProblemById`
2. **RTT2** `auth.getUser`
3. **RTT3 (조건)** `getSystematicNodeProblemSequence`
4. **RTT4 (조건)** `getQuizSession` 또는 `createQuizSession` + redirect
5. **RTT5** `getLawByCode`
6. **RTT6** `Promise.all` 13개 — systematicNodes, bookmark, memos, highlights, bookmarkLevels, annotationCounts, qnaThreads, problemStats, relatedProblems, citedCases, problemComments, staffRole, adjacent
7. **RTT7** `getChoiceLinkRefs`

**총 ~20 쿼리 / 5-7 RTT**.

### 2.5 quiz-setup `quiz-setup.tsx:55-`

1. **RTT1** `auth.getUser`
2. **RTT2** `listProblemYears`

**총 2 쿼리 / 2 RTT**. 가벼움 — 처방 대상 아님.

---

## 3. N+1 / 본문 과적재

- **N+1 없음**. bulk 패턴 일관 적용 — `getProblemStatsBulk(problemIds[])`, `getChoiceLinkRefs(articleIds[], caseIds[])`, `buildNodeProgressByArticle(articleIds[])`.
- 목록 본문 과적재 시그널 약함 — `listCasesBySubject` / `listProblemsBySubject` 가 카드 메타만 select하는 듯. 단 한 번 더 확인 권장 (저우선순위).

---

## 4. 인덱스 점검 (Supabase pg_indexes 조회 결과)

자주 거르는 컬럼 전부 커버:

| 테이블 | 인덱스 |
|---|---|
| `articles` | `articles_law` (law_id), `articles_active` (law_id, path) WHERE deleted_at IS NULL, `articles_path_gist` (ltree GIST), `articles_path_btree`, `articles_parent` |
| `cases` | `cases_subject_laws` (gin), `cases_court`, `cases_decided` (decided_at DESC), `idx_cases_primary_node`, `idx_cases_primary_article`, `idx_cases_search_tsv` |
| `problems` | `problems_law` (law_id) WHERE deleted_at IS NULL, `problems_year`, `problems_round_format`, `problems_source_doc_idx` |
| `article_revisions` | `article_revisions_article` (article_id, effective_date DESC) |
| `article_case_links` | `acl_article` (article_id, relation_type), `acl_case` (case_id, relation_type) |
| `problem_case_links` | `problem_case_links_problem_idx`, `problem_case_links_case_idx` |
| `systematic_nodes` | `systematic_nodes_law`, `systematic_nodes_path_gist`, `systematic_nodes_parent` |
| `user_problem_attempts` | user_id 다양한 변형 인덱스 (`user_recent`, `user_problem`, `user_ox`, `session`, `user_choice_ox`, `user_box`) |
| `user_bookmarks` / `user_memos` / `user_highlights` | `target` (target_type, target_id), `user` (user_id, target_type) |
| `case_references` | `case_id, ord, created_at` |

**갭 0건**. 인덱스 추가 처방 불요.

---

## 5. 링크 prefetch 점검

`<Link prefetch="intent">` 사용:
- `app/features/subjects/` 내 **0건**
- 전체 `app/` 1건만 (`core/components/student/SectionTabs.tsx`)

학습 과목 영역의 사용자 동선은 **조문 ↔ 판례 ↔ 문제 잦은 왕복** — prefetch가 가장 잘 맞는 패턴인데 미적용. **첫 이동마다 풀 SSR + ~20 쿼리 + ~6 RTT 부담**.

---

## 6. 컴포넌트 무게

| 파일 | 줄수 | 첫 로드 부담 |
|---|---:|---|
| `subjects/screens/article-viewer.tsx` | 1261 | staff 전용 `ArticleEditor`(347줄), `HighlightOverlay`/`Toolbar`, `BlankFillView`, `PeriodAmbiguousPanel`, `RecitationView` 모두 임포트 |
| `subjects/screens/problem-viewer.tsx` | 2110 | 가장 큼 |
| `subjects/screens/case-viewer.tsx` | 578 | 보통 |
| `subjects/screens/quiz-setup.tsx` | 411 | 보통 |
| `subjects/components/subject-hub.tsx` | 302 | hub 컨테이너 |

article-viewer/problem-viewer의 staff/조건부 컴포넌트는 `React.lazy`로 뺄 수 있음(번들 KB 감축, 첫 paint 단축).

---

## 7. 주원인 우선순위

| 순위 | 원인 | 영향 추정 | 처방 |
|:---:|---|---|---|
| **★★★ 1** | **prefetch 0건** | 첫 이동 100% SSR + 쿼리 부담 (체감 가장 큼) | `<Link prefetch="intent">` 학습 과목 전역 |
| **★★★ 2** | **sequential RTT 5-9단계** (loadSubjectHub + viewer 3종) | 매 RTT 200ms × N 누적 | loader sequential 통합 — `getLawByCode`+`auth.getUser`+skeleton/systematic을 1단계 Promise.all로 |
| **★★ 3** | **21개 필드 일괄 로드** (탭별 안 보이는 데이터 포함) | 일부 쿼리 낭비 | 탭 분기 또는 React Router `defer` |
| **★ 4** | staff 컴포넌트(`ArticleEditor` 등) 번들 포함 | 번들 KB | `React.lazy` 분리 |
| — 5 | DB 인덱스 | 갭 0 | 처방 불요 |
| — 6 | N+1 | 0 | 처방 불요 |

---

## 8. 처방 권장 순서 (효과 큰 것부터, 단계별)

### Phase A — 가장 큰 효과, 가장 적은 변경 (데이터 변경 0)

**A1. `<Link prefetch="intent">` 적용**
- 대상: SubjectHub의 article-tree / case-card / problem-card 카드 Link. viewer 3종의 prev/next 인접 네비 Link. 조문↔판례 chip, 문제↔조문 chip 등 cross-link.
- 효과: 사용자가 카드를 hover (intent) 하는 순간 다음 화면의 SSR 응답을 미리 받음. "두 번째부터 빠른" 경험을 첫 이동에도 제공.
- 위험: 0 (취소·재요청은 React Router가 관리). 롤백 = git revert.

**A2. loader sequential 통합**
- 대상:
  - `loadSubjectHub` — RTT1(`getLawByCode`) + RTT5(`auth.getUser`)를 RTT2 병렬에 합치기. lawId 의존성은 `getLawByCode` 결과를 RTT2 직후 사용하므로 동시 시작 가능 (Promise resolve 순서만 관리).
  - article-viewer — RTT1(`getLawByCode`) + RTT4(`auth.getUser`)를 RTT2 병렬에 합치기. `getSubjectAxisCounts`(RTT9)도 RTT5 12병렬에 동참.
  - case-viewer — RTT1(`getLawByCode`) + RTT3(`auth.getUser`)를 RTT2 4병렬에 합치기. `getSubjectAxisCounts`(RTT5)도 RTT4 12병렬에 동참.
  - problem-viewer — RTT5(`getLawByCode`) + RTT2(`auth.getUser`)를 RTT6 13병렬에 합치기. `getChoiceLinkRefs`(RTT7)는 problem.choices 의존이라 분리 유지.
- 효과: 각 화면 RTT 1-3단 감축 → loader time -30%~-50% 예상.
- 위험: 낮음 (의존성 그래프 보존). typecheck + 수동 이동 검증.

### Phase B — 선택적

**B1. 탭별 조건 로드**
- `?tab=articles` 일 때만 `recommendedArticles`/`progressByArticle` 로드
- `?tab=cases` 일 때만 cases 풀 목록
- `?tab=problems` 일 때만 `getProblemStatsBulk` + `problemAggStats`
- React Router `defer({...})` + `<Await>` 패턴으로 첫 paint는 메타·skeleton 만, 나머지는 스트리밍.

**B2. staff/조건부 컴포넌트 `React.lazy`**
- `ArticleEditor` — staff 전용, 학생 번들에서 제외
- `RevisionHistory` — staff 전용
- 효과: 학생 번들 KB 감축, 첫 paint 단축 (TTI 개선)

---

## 9. 검증 방법

각 Phase 적용 후:

**측정**
- Chrome DevTools Network → 첫 이동 SSR HTML 응답 시간(TTFB). 목표: 600-2000ms → 200-500ms.
- Phase A1(prefetch): 두 번째 hover→click 이동의 SSR 응답이 0ms에 가깝게 (이미 받아둔 상태).
- Phase A2(sequential): 각 viewer 진입 시 TTFB 절댓값 비교.

**비회귀**
- `npm run typecheck`
- 수동 이동 5경로: 조문 목록(hub `articles` 탭) → 조문 상세 → 판례 상세 → 문제 상세 → hub `cases` 탭.
- 데이터 누락(메모/즐겨찾기/하이라이트)·정렬·페이지네이션·필터 보존 확인.

---

## 10. 변경 안 한 것 (의도)

- **인덱스**: 갭 0, 처방 불요.
- **N+1**: 없음, 처방 불요.
- **DB 마이그레이션**: 불필요.
- **테스트 코드 수정**: Phase A는 동작 불변, 비회귀만 확인.

## 11. 진행 시작 시 단계 게이트

1. Phase A1 prefetch — 한 번에 적용 → typecheck → 수동 5경로 → 첫 이동 TTFB 측정
2. Phase A2 sequential 통합 — viewer 1개씩(article → case → problem → hub) 적용·측정 후 다음 진행
3. Phase B는 A 결과 보고 사용자 결정

각 단계 시작 전 사용자 승인.
