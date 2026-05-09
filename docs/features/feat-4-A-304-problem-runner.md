# feat-4-A-304 — 문제 풀이 Runner (객관식)

> 변리사 1차 객관식 문제 풀이 화면 — 조문 뷰어와 동일한 3-column 패턴.

## 목표
- 좌측 체계도 + 가운데 문제 카드 + 우측 학습 패널(즐겨찾기/메모/하이라이트/Q&A/관련자료/코멘트)
- 학습 모드 채점(즉시 정답·해설) → 시도 이력 적재
- 단일 문제 / 체계도 노드별 풀이 / 색인 그리드 3가지 진입점

## 라우트
- `/subjects/:subject/problems/:problemId` — 단일 문제 (Phase 1)
- `/subjects/:subject/problems/system/:nodeId` — 체계도 노드별 풀이 (Phase 2)
- `/subjects/:subject/problems` — 색인(필터 + 그리드) (Phase 2)

## 레이아웃
```
grid lg:grid-cols-[260px_minmax(0,1fr)_320px]
┌──────────┬──────────────────────────┬──────────────┐
│ 체계도   │ 문제 카드 (메타/본문/    │ Tabs:        │
│ (좌)     │  선지/채점/해설)         │ 즐겨찾기     │
│          │                          │ 메모         │
│ 활성 노드│ Q&A (스레드 목록)        │ 하이라이트   │
│ + active │                          │ Q&A          │
│ article  │                          │ 관련자료†    │
│ 하이라이 │                          │ 코멘트†      │
│ 트       │                          │              │
└──────────┴──────────────────────────┴──────────────┘
```
† 관련자료/코멘트 탭은 `ArticleRightPanel.PLACEHOLDER_TABS` 패턴 그대로 (구현 대기).

## 구성 결정

### 우측 패널 — `ArticleRightPanel` 재사용
- `target.type='problem'` 으로 polymorphic 동작.
- `relatedCases` / `revisions` 둘 다 optional 이라 problem 에서는 생략 가능.
- 재사용 이유: bookmark/memo/highlight/Q&A 4개 탭이 이미 polymorphic, 신규 컴포넌트는 중복.

### 좌측 트리 — `SystematicTree` 재사용
- `activeArticleId = problem.primaryArticleId` 로 활성 표시.
- Phase 2 에서 `countMode="problems"` prop 추가 + 노드별 문제수 배지로 확장.

### 가운데 문제 카드
- 기존 `problem-viewer.tsx` 의 채점 UI 그대로. Phase 1 에서는 **컴포넌트 분리 안 함** (YAGNI).
- Phase 2 에서 노드/색인 페이지가 추가되면 `MCQCard` 로 추출.

## 데이터 흐름 (Phase 1 loader)
```
problemId
  → getProblemById              (이미 있음)
  → getLawByCode                (subject.slug → law)
  → getSystematicSkeleton       (체계도 트리)
  → getBookmark/Memos/Highlights (target_type='problem')
  → getUserArticleBookmarkLevels / AnnotationCounts (좌측 트리 진도 표시)
  → listThreadsForTarget        (이미 있음)
  → recordStudySession          (target_type='problem')
```

## Phase 별 범위

| Phase | 범위 | 산출물 |
|-------|------|--------|
| **1** | 단일 문제 3-column | problem-viewer.tsx 갱신, ArticleRightPanel 재사용, recordStudySession 연결 |
| **2** | 색인/필터/노드 풀이 + attempt 기록 | `problems-index.tsx`, `problem-runner.tsx`(node), `MCQCard` 추출, attempt API |
| **3** | 오답노트, 마스터리, 추가 보조 기능 | `wrong-note.tsx`, dashboard 진도 카드, 비교 모드 |

## Non-goals (현 단계 제외)
- 시험 모드(타이머·일괄 제출) — feat-4-A-306
- OX/빈칸/주관식 카드 — feat-4-A-304/305 별 분기
- 정답률/난이도 계산 — feat-4-A-312
- Spaced Repetition — feat-4-A-309 이후

## 관련 feat-ID
- feat-4-A-304 (Runner 본체 / 이 문서)
- feat-4-A-307 (오답노트 — Phase 3)
- feat-4-A-308 (북마크/메모/하이라이트 — Phase 1 에서 `ArticleRightPanel` 재사용으로 자동 충족)
- feat-4-A-310 (색인 — Phase 2)
- feat-4-A-314 (지문별 해설/링크 — 기존 UI 유지)
- feat-4-A-316 (Q&A — 기존 컴포넌트 재사용)
