# feat-3-205 — 학습정보 자체 콘텐츠 뷰어

> 학습정보(`/latest/*`) 피드의 콘텐츠 상세를 학습과목(`/subjects/*` — feat-8-008 에서 회원2 게이트)으로
> 보내지 않고, 학습정보 안의 경량 read-only 뷰어로 본다. **feat-8-008 영역 게이팅의 선행 조건.**
> 검토용 설계문서 — 승인 후 SPEC 갱신 → 구현.

## 1. 목표 / 배경

학습정보 메뉴(법 개정·최근 판례·1·2차 기출·논문·추록)는 회원1(무료)도 이용한다(feat-8-008). 그런데 일부 피드는 콘텐츠 상세를 학습과목(`/subjects/*`) 뷰어로 링크한다 — feat-8-008 이 학습과목을 회원2 게이트로 막으면 회원1 의 학습정보가 막다른 길이 된다.

이 문서는 학습정보가 **자체적으로** 콘텐츠를 보여주는 경량 뷰어를 신설한다.

## 2. 현황 — 학습정보 → 학습과목 연결 (조사 결과)

| 피드 | 상세 진입 | 자체 뷰어 |
|------|-----------|:--------:|
| 최근 판례 (`/latest/cases`) | `/subjects/.../cases/:id` | **신설** |
| 2차 기출 (`/latest/essay`) | `/subjects/.../problems/:id` | **신설** |
| 1차 기출 (`/latest/mcq`) | `/latest/mcq/*` 팩 상세·시트 — 자족 | — |
| 법 개정 (`/latest/laws`) | 본문 인라인 패널 + "과목 가기" 링크 | 링크만 정리 |
| 논문 (`/latest/papers`) | 외부 URL/PDF 자족 + 관련 조문·판례 chip → 학습과목 | chip 정리 |
| 추록 (`/latest/book-updates`) | 외부 URL/PDF — 자족 | — |

→ 신규 뷰어 **2개**: `/latest/cases/:caseId`, `/latest/essay/:problemId`.

## 3. 핵심 설계 결정

### 3.1 본문 렌더 컴포넌트 공용화
학습과목 판례 뷰어(`subjects/screens/case-viewer.tsx`, 805줄)는 본문을 파일 내부 컴포넌트(`BodySection`·`SummaryBlock`·`Prose`·`ImportanceStars`·헤더 메타 카드)로 렌더한다. 이를 **공용 컴포넌트로 추출**:
- `features/cases/components/case-body.tsx` ← `CaseBody` (헤더 메타 + 판결요지·판시이유·PDF·비고)
- 2차 문제도 동형 — `problem-viewer.tsx` 의 본문부를 `features/problems/components/` 로 추출.

학습과목 뷰어는 추출된 컴포넌트를 쓰도록 리팩터(**동작 무변경** — typecheck 로 확인). 학습정보 뷰어는 같은 컴포넌트를 read-only 로 렌더 → 본문 렌더 로직 한 벌(DRY).

### 3.2 학습정보 뷰어 = read-only
**제외**: 하이라이트(`HighlightOverlay`/`HighlightToolbar`)·메모·즐겨찾기·Q&A 패널(`ArticleRightPanel`)·판례 트리(`CasesTree`)·`FlowNav`·`SubjectBookmarkRail`·`recordStudySession` 진도 기록 — 학습보조·학습과목(회원2+)의 몫.
**포함**: 콘텐츠 본문, `CiteCopyButton`(인용 복사), 기출 chip(연도 표시·비링크), 관련문헌(`CaseReferencesPanel`, read-only).

`HighlightOverlay` 는 `CaseBody` 에서 **optional** — 학습정보 뷰어는 미전달(평문), 학습과목 뷰어는 전달.

### 3.3 회원1 의 잔여 학습과목 링크 정리
법 개정 행의 "과목 가기"(`/subjects/:lawCode`) 링크, 논문 카드의 관련 조문·판례 chip 은 회원1 에게 학습과목 게이트로 이어진다 → **feat-8-008 에서** `hasFeature("area_subjects")` 로 분기해 회원1 에겐 숨김(회원2+ 유지). 이 문서 범위에선 뷰어 신설만.

## 4. 화면 / 라우트

```
/latest/cases/:caseId      학습정보 판례 뷰어     latest/screens/latest-case-viewer.tsx
/latest/essay/:problemId   학습정보 2차문제 뷰어  latest/screens/latest-essay-viewer.tsx
```

- `/latest/cases/:caseId` 와 `/latest/cases`(색인)는 별개 경로 — 충돌 없음. `/latest/essay` 동일.
- 두 뷰어 모두 인증 필요(`requireAuthentication`) — 게이트 없음(학습정보 = 전 티어). feat-8-008 게이팅 대상 아님.

## 5. 구현 단계

1. `CaseBody` 추출 — `case-viewer.tsx` 본문부 → `features/cases/components/case-body.tsx`. `HighlightOverlay` optional prop. `case-viewer.tsx` 가 사용하도록 리팩터 → typecheck(동작 무변경).
2. 2차 문제 본문 컴포넌트 동형 추출 — `problem-viewer.tsx` 구조 확인 후.
3. `/latest/cases/:caseId`·`/latest/essay/:problemId` 라우트 + 경량 뷰어 화면.
4. `cases.tsx`·`essay.tsx` 카드 링크 재지정 → 학습정보 뷰어.
5. `routes.ts` + `SPEC.md` feat-3-205.

## 6. 위반 가드 / 결정사항

- 본문 렌더는 **공용 컴포넌트 한 벌** — 학습정보·학습과목 뷰어 공유, 중복 금지.
- 학습정보 뷰어는 read-only — 학습 데이터(메모/하이라이트/진도) 생성 경로 없음.
- 한 판례·문제가 URL 2개(`/latest/...` read-only / `/subjects/...` full)를 갖는다 — 의도. SEO canonical 은 범위 밖.
- DB 변경 없음.

## 7. 범위 밖 (YAGNI)

- 학습정보 뷰어의 주석·진도·Q&A — 학습과목(회원2)에서.
- 1차 기출·논문·추록 전용 뷰어 — 이미 자족.
- 법 개정 전용 뷰어 — 인라인 패널로 충분.
