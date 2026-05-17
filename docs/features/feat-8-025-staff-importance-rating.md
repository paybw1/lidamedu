# feat-8-025 — 운영자·강사 중요도 별점

## 배경

콘텐츠 중요도(`cases.importance` 1~3, `articles.importance` 0~3)는 그동안
수동 number 입력이었고 문제가 누적됐다.

- `admin-case-edit` 중요도 입력란은 "0~5" 라벨·`min=0 max=5` 인데 DB 제약은
  `1~3` — 범위 밖 값 입력 시 저장 실패.
- 판례 `importance` 와 `is_en_banc` 가 따로 놀아 전원합의체 판례 9건이 전부 ★1.
- 운영자가 판례·조문 뷰어에서 바로 중요도를 조정할 경로가 없었다.

## 목표

운영자·강사는 **판례·조문 뷰어 오른쪽 패널의 "즐겨찾기" 자리에서 ★ 별점으로
중요도를 직접 매긴다.** 학생은 기존 개인 즐겨찾기를 그대로 본다. 그 별점이 곧
`importance` — 별도 편집 화면이나 매핑이 필요 없다.

## 범위

- 대상 = **판례(case)·조문(article)**. 문제(problem)는 범위 밖.
- 즐겨찾기(`user_bookmarks.star_level`)는 학생용 개인 평점으로 그대로 둔다 —
  importance 와 연동하지 않는다(별개 기능).

## 데이터 모델

스키마 변경 없음. 기존 컬럼 그대로 — `cases.importance`(NOT NULL,
`CHECK 1~3`, default 1) · `articles.importance`(nullable, `CHECK 0~3`).

## 동작

### 오른쪽 패널 (`ArticleRightPanel`)

- "즐겨찾기" 탭 콘텐츠: 뷰어가 **운영자/강사면** `ImportanceRating`(중요도 ★
  에디터), **학생이면** 기존 `BookmarkStars`(개인 즐겨찾기). staff 에게는 탭
  라벨·아이콘도 "중요도 / ★" 로 표시.
- `case-viewer`·`article-viewer` 의 데스크톱·모바일(Sheet) 패널 양쪽에 적용.
- problem 타깃은 `importance` prop 미전달 → staff 여도 항상 `BookmarkStars`.

### `ImportanceRating` 컴포넌트

- ★ 3칸. 클릭 시 해당 단계로 설정, 현재 최고 별을 다시 클릭하면 한 단계 내림
  (case 는 최소 1, article 은 0 까지).
- `/api/admin/importance` 로 `useFetcher` 제출, 낙관적 갱신 후 revalidate.

### `/api/admin/importance` (신규)

- POST. 로그인 + `getStaffRole` 확인 — staff 아니면 403.
- body: `targetType`(`case`|`article`), `targetId`(uuid), `importance`(int).
- 범위 검증: case `1~3`, article `0~3`. `cases`/`articles` importance UPDATE.
- `logAuditEvent` 로 변경 기록.

## 판례 중요도 초기화 (1회성 backfill)

판례 `importance` 를 기출횟수 기반으로 1회 재산정한다.

- 기출횟수 = 1차 객관식 기출 출제 수(`problem_case_links` ⋈ `problems`
  `origin='past_exam' AND exam_round='first'`) + 2차 기출 연도 수
  (`cases.exam_2nd_years`).
- 매핑: **0~2회 → ★1 · 3회 → ★2 · 4회 이상 → ★3**.
- dry-run 분포(특허 382건): ★1 303 · ★2 33 · ★3 46. 사용자 승인 후 UPDATE.
- 반영 후엔 staff 의 패널 별점이 우선 — 기출 변동에 자동 재동기화하지 않는다
  (staff 조정값 보존). 신규 판례는 DB 기본값 ★1 로 시작.
- 조문은 backfill 없음 — 현재 `importance` 값 유지.

## 정리

- `admin-case-edit` 의 "중요도" 입력 `Field` 제거. `case.tsx` 액션의
  `upsertSchema`·payload 에서 `importance` 제거 — 판례 생성 시 DB 기본값(1),
  이후 패널 별점으로만 조정.
- `ArticleEditor`(조문 편집 모드)의 importance 입력은 유지 — 범위 밖.

## 범위 밖

- 문제(problem) 중요도.
- 기출횟수의 실시간 자동 연동(트리거) — 1회성 backfill 만.
- 즐겨찾기 `star_level` ↔ importance 연동.

## 관련 파일

- 신규: `app/features/admin/api/importance.tsx`,
  `app/features/admin/components/importance-rating.tsx`
- `app/features/laws/components/article-right-panel.tsx` — 탭 분기
- `app/features/subjects/screens/case-viewer.tsx` ·
  `app/features/subjects/screens/article-viewer.tsx` — prop 전달
- `app/features/admin/screens/admin-case-edit.tsx` ·
  `app/features/admin/api/case.tsx` — 중요도 입력 제거
- `app/routes.ts` — `/api/admin/importance`
- backfill: Supabase 직접 UPDATE (1회성)
