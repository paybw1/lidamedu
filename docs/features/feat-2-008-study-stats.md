# feat-2-008 — 통합 학습 통계 페이지 (`/study/stats`)

## 배경 (Why)

학습관리 드롭다운(`학습목표 / 빈칸 학습 통계 / 알림`)에서 "통계" 성격을 가진 항목이 **빈칸뿐**이라 IA 가 비대칭이었다.
문제 풀이·조문·판례 통계는 `/dashboard` 위젯과 `/goals` 의 과목별 진도 테이블에 흩어져 있어,
"내 학습 결과를 한 곳에서 깊게 드릴다운" 하는 입구가 없다.

세 화면의 역할을 분리한다:

- `/dashboard` — 스냅샷(위젯 모음)
- `/goals` — 목표 vs 현재 (D-day 기반 권장량 비교)
- `/study/stats` — **결과 드릴다운** (조문·판례·객관식·주관식·빈칸·암기를 탭으로)

## 결정 사항

- 학습관리 드롭다운에서 "빈칸 학습 통계" 항목을 **"학습 통계"** 로 교체. URL `/study/blanks` 는 `/study/stats?tab=blanks` 로 redirect 유지(외부 링크·즐겨찾기 보존).
- 기존 `app/features/blanks/screens/blanks-stats.tsx` 는 폐기하지 않고 통합 페이지의 "빈칸·암기" 탭에서 재사용할 수 있도록 **컴포넌트만 추출**(`BlankStatsTabs`). 라우트는 redirect 만.
- 통계 구조를 **변리사 시험 차수**(1차/2차)로 분리. 콘텐츠 유형(객관식/주관식)으로 묶는 것보다 학생 관점에서 응시 과목군과 자연스럽게 매칭됨.
- 조문/판례는 1차/2차 모두 학습하지만 **응시 과목군이 다르므로**(특히 민법 ↔ 민사소송법) 각 차수 탭 내부에 sub-section 으로 통합. 독립 "조문"/"판례" 탭은 두지 않음.
- 자연과학은 별도 탭으로 분리하지 않고 **1차 통계 탭** 내부 섹션으로(법률 표 + 자연과학 표 2단). 자연과학은 article/case 개념이 없어 별도 탭이 비대칭.
- 주관식 본인 통계 함수가 없어 신규 추가(`getUserSubjectiveStats`). 조문·판례 학습 통계도 함수 부재 — 신규 추가(`getArticleStudyStats`, `getCaseStudyStats`).
- **`LAW_SUBJECTS.design.exam` 동반 정정** — 기존 `"first"` 였으나 디자인보호법은 1·2차 모두 응시이므로 `"both"` 로 수정. 이 변경은 과목 hub badge(EXAM_LABEL) 와 problems-tab 의 주관식 섹션 노출 분기에도 함께 적용된다.

## 탭 구조 — 변리사 시험 차수 기준

```
/study/stats?tab={overview|first_exam|second_exam|blanks}
```

변리사 시험 구조:
- **1차 시험(객관식)** — 특허법 · 상표법 · 디자인보호법 · 민법 + 자연과학 1과목 선택
- **2차 시험(주관식)** — 특허법 · 상표법 · 디자인보호법 · 민사소송법

LAW_SUBJECTS 의 `exam` 필드(`first` / `second` / `both`)로 분기. 디자인보호법은 기존 `"first"` 였던 것을 `"both"` 로 정정(2차 응시 과목이므로). 자연과학은 1차 전용.

| 탭 | URL key | 포함 콘텐츠 |
|---|---|---|
| 한눈에 | `overview` (default) | 전체 KPI 8종 · 1차 법률 4과목 표 · 1차 자연과학 4과목 표 · 2차 법률 4과목 표 |
| 1차 통계 | `first_exam` | 객관식 KPI 4종 + 법률 4과목 객관식 + 자연과학 4과목 + **조문 학습**(1차 4과목) + **판례 학습**(1차 4과목) + 약점 |
| 2차 통계 | `second_exam` | 주관식 KPI 4종 + 법률 4과목 주관식 + **조문 학습**(2차 4과목) + **판례 학습**(2차 4과목) |
| 빈칸·암기 | `blanks` | 기존 `BlankStatsTabs` 컴포넌트 (내용/주체/시기/암기 4 sub-tab) |

조문/판례는 차수마다 응시 과목이 다르므로(특히 민법 ↔ 민사소송법 분기) **각 차수 탭 내부의 sub-section**으로 둔다. 별도 "조문" / "판례" 탭은 두지 않음.

### 데이터 소스

| 영역 | 함수 | 위치 |
|---|---|---|
| 전체 진척 | `getOverallProgress` | study/queries.server.ts |
| 문제 풀이 KPI | `getDashboardKpis` | study/queries.server.ts |
| 학습 보조 카운트 | `getStudyAidCounts` | study/queries.server.ts |
| 법률 5과목 진도 | `getAllSubjectsProgress` | study/queries.server.ts |
| 일별 학습 | `getDailyStudyStats` | study/queries.server.ts |
| 조문 학습 분포 (NEW) | `getArticleStudyStats` | study/queries.server.ts |
| 판례 학습 분포 (NEW) | `getCaseStudyStats` | study/queries.server.ts |
| 주관식 통계 (NEW) | `getUserSubjectiveStats` | study/queries.server.ts |
| 자연과학 4과목 | `getAllScienceSubjectsProgress` | subjects/lib/science.server.ts |
| 약점 5건 | `getWeakAreas` | study/queries.server.ts |
| 빈칸 4종 | `getUserBlankStats` / `getUserAutoBlankStats(subject\|period)` / `getUserRecitationStats` | blanks/recitation/queries.server.ts |

화면에서 1차/2차 분기는 `LAW_SUBJECTS[row.lawCode].exam !== "second"` (1차) / `!== "first"` (2차) 필터로 처리. 자연과학은 모두 1차로 분류.

기본 탭은 `overview`. 탭 전환은 `?tab=` URL 동기화.

## 신규 쿼리 시그니처

```ts
// app/features/study/queries.server.ts

export interface ArticleStudyStats {
  visitedDistinct: number;
  totalArticles: number;
  bookmarks: number;
  memos: number;
  highlights: number;
  bySubject: Array<{
    lawCode: LawSubjectSlug;
    name: string;
    visited: number;
    total: number;
    bookmarks: number;
    memos: number;
    highlights: number;
  }>;
}
export async function getArticleStudyStats(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ArticleStudyStats>;

export interface CaseStudyStats {
  visitedDistinct: number;
  totalCases: number;
  bookmarks: number;
  memos: number;
  highlights: number;
  bySubject: Array<{
    lawCode: LawSubjectSlug;
    name: string;
    visited: number;
    total: number;
  }>;
}
export async function getCaseStudyStats(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<CaseStudyStats>;

export interface SubjectiveStats {
  totalAttempts: number;        // 본인 subjective_attempts 총수
  submittedAttempts: number;    // submitted_at NOT NULL
  avgSelfScore: number | null;  // self_score 평균(있는 것만)
  reviewRequested: number;      // review_requested_at NOT NULL AND review_completed_at IS NULL
  reviewCompleted: number;      // review_completed_at NOT NULL
  bySubject: Array<{
    lawCode: LawSubjectSlug;
    name: string;
    attempts: number;
    avgSelfScore: number | null;
  }>;
}
export async function getUserSubjectiveStats(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<SubjectiveStats>;

export interface ScienceProblemStats {
  scienceSubject: "physics" | "chemistry" | "biology" | "earth_science";
  name: string;
  attemptedCount: number;
  correctCount: number;
  wrongCount: number;
  totalAttempts: number;
  accuracyPct: number | null;
}
export async function getUserScienceProblemStats(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ScienceProblemStats[]>;
```

자연과학 라벨은 `app/features/subjects/lib/subjects.ts` 의 SCIENCE_SUBJECTS 를 재사용.

## UX/레이아웃

- 헤더: 타이틀 "학습 통계", 서브헤더 "내 학습 결과를 한 곳에서". 우상단에 `/dashboard` · `/goals` 백링크 (관계 표시).
- 탭 바: `Tabs` (shadcn) — 6 트리거. 모바일에서는 `ScrollArea` 가로 스크롤.
- 각 탭은 첫 행에 KPI 카드 3~5개, 그 아래에 분포 표(과목별/유형별) + 약점/오답 quick chip.
- 빈 상태 처리: 시도/열람 0 인 카드는 dim 처리 + "지금 시작" CTA (조문/판례/객관식 hub 진입 링크).

## 라우팅 변경

- 신규: `app/features/study/screens/stats.tsx`
- 기존: `app/features/blanks/screens/blanks-stats.tsx` → **삭제하지 않음**. 라우트만 redirect 처리(loader 에서 `throw redirect("/study/stats?tab=blanks")`).
  - 이유: 외부 즐겨찾기/Slack 링크 보존, 코드 회수는 후속에서.
  - 추출: 화면 내부의 4 sub-tab 렌더 로직을 `app/features/blanks/components/blank-stats-tabs.tsx` 로 추출하고 양쪽에서 import. (현 시점에는 통합 페이지에서만 사용)
- `app/routes.ts` 의 `/study/blanks` 라우트 유지 + 새 라우트 `/study/stats` 추가.

## nav-bar 메뉴 변경

```diff
 const studyItems: SimpleLink[] = [
   { label: "학습목표 및 과목별 진도", to: "/goals" },
-  { label: "빈칸 학습 통계", to: "/study/blanks" },
+  { label: "학습 통계", to: "/study/stats" },
   { label: "알림", to: "/inbox" },
 ];
```

`/dashboard` 의 재학습 진입점 타일 4개("오답노트/즐겨찾기/메모/하이라이트")는 그대로 유지(서로 다른 진입점).

## 3계층 게이트 결과

- **Judgment**: 메뉴 IA 비대칭 해소 + 결과 드릴다운 부재. 사용자 명시 요청. → 만든다.
- **Structure**: 서버 loader 가 6개 데이터 묶음을 병렬 fetch (`Promise.all`). 탭 전환은 클라(같은 loader 데이터 재사용). KPI 카드는 표시만, 집계는 서버 함수에 단일 소유.
- **Code**: shadcn `Tabs` · `Card` · `Table`. URL 쿼리 `?tab=` 동기화는 `useSearchParams`. 새 쿼리 4종은 `queries.server.ts` 동일 파일에 추가(파일 분리 임계 미달).

## 변경 파일 목록 (예정)

```
SPEC.md                                                  ★ feat-2-008 등록
docs/features/feat-2-008-study-stats.md                  ★ 본 문서
app/features/study/queries.server.ts                      + 4 함수 추가
app/features/study/screens/stats.tsx                     ★ 신규
app/features/blanks/components/blank-stats-tabs.tsx      ★ 추출(현 stats 페이지에서 사용)
app/features/blanks/screens/blanks-stats.tsx              redirect loader 로 축소
app/routes.ts                                             + /study/stats 라우트
app/core/components/navigation-bar.tsx                    메뉴 라벨/URL 갱신
```

## 후속 (out of scope)

- 통계 결과 PDF 내보내기
- 학습 패턴 분석(요일별/시간대별 정답률 등) — `daily_study_stat` 이 일별까지만 집계
- 자연과학 단원별 정답률 매트릭스 (현재는 과목 단위까지)
