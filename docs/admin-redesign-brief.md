# 리담변리사학원 운영자 영역 리디자인 브리프

> **Claude Design 핸드오프용.** claude.ai/design 의 `리담 디자인 시스템`(lidam-design-system) 프로젝트에 전달해 **운영자 영역 전체**(`/admin/*`, 약 49개 화면)의 UI kit 를 만들기 위한 명세다. 새 UI kit: `ui_kits/lidam-admin/`.
>
> **앞선 작업과의 관계** — 같은 프로젝트의 랜딩·대시보드·학습과목·학습보조·학습정보·커뮤니티 UI kit 는 이미 Wantedly 기반 **딥 로열블루 `#2D5BA8`** 디자인 시스템으로 진행됐다. 운영자 영역도 **같은 디자인 시스템**으로 통일한다.
>
> **이 영역의 특수성** — 운영자 영역은 49개 화면으로 다른 어느 영역보다 크다. 화면 하나하나를 개별 명세하는 대신, **공통 셸 + 7개 재사용 패턴**(§5)을 먼저 확정하고, 49개 화면을 **9개 기능 클러스터**(§6)로 묶어 클러스터별·패턴별로 명세한다.

---

## 0. 산출물 한 줄

> 학원 원장·강사가 **콘텐츠를 만들고 수강생을 관리하고 시험을 운영하는** 백오피스. 조문·판례·문제·빈칸·법 개정을 등록하고, 반·커리큘럼·과제를 굴리고, 온라인 GS 를 채점하고, 합격자 데이터를 분석한다. 학생 화면이 아닌 *운영* 화면 — 밀도 높고, 빠르고, 실수가 적어야 한다.

---

## 1. 영역 정체성

| 항목 | 값 |
|------|----|
| 영역 | 네비게이션 "운영자" 메뉴 — `/admin` 허브 + `/admin/*` 전체 |
| 대상 | 원장(admin) · 강사(instructor). 학생(student)에게는 미노출 (허브 진입 시 안내 화면) |
| 화면 수 | 약 49 — 허브 1 + 9개 클러스터 48 (`admin-announcement-audiences` 는 UI 없는 데이터 라우트, 제외) |
| 성격 | 백오피스 CRUD·검수·운영·분석. 정보 밀도 높음. 한 화면에서 여러 건을 빠르게 처리 |
| 셸 | **현재 자체 셸 없음** — 전역 navigation-bar + footer 안에서 각 화면이 독립 렌더. §5.2 에서 운영자 전용 셸을 신설한다 |
| 현재 디자인 | 디자인 토큰(`#2D5BA8`·Pretendard)은 적용되나, 폼 컴포넌트가 화면마다 제각각(shadcn `Input` vs raw `<input>`), 데이터 시각화는 손수 만든 div 막대 + 하드코딩 색 |
| 데이터 출처 | 각 화면 loader — admin / gs / blanks / problems / exam-results / laws 등 다수 피처 쿼리 |
| 권한 | 모든 loader·action 이 서버에서 `getStaffRole()` 검사 (§10.C). 학생 차단 |
| 언어 | 한국어 단일 (하드코딩) |

---

## 2. 핵심 목적 — 운영자 영역이 지켜야 하는 3원칙

1. **운영자는 길을 잃지 않아야 한다** — 현재 49개 화면 중 절반 가까이가 허브에서 도달 불가능하고, 모든 화면이 `← 운영자` 뒤로가기 링크를 손수 붙인다. **운영자 전용 네비게이션 셸**(§5.2)을 신설해 9개 클러스터 어디로든 한 번에 이동하고, breadcrumb 으로 현재 위치를 항상 안다.
2. **밀도는 높되 어수선하지 않게** — 백오피스는 한 화면에 표·필터·폼이 빽빽하다. 8pt 그리드·일관된 표 스타일·정돈된 필터 바로 *밀도를 유지하면서* 숨 쉴 공간을 준다. 학생 화면보다 촘촘하되, 같은 디자인 언어.
3. **위험한 동작은 분명하게** — 발행·삭제·채점 확정·역할 변경처럼 되돌리기 어려운 동작은 시각적으로 또렷하게(코랄·확인 단계). 일상 동작과 위험 동작을 한눈에 구분한다.

---

## 3. 화면 인벤토리 — 9개 클러스터 49화면

| 클러스터 | 화면 수 | 화면 (route) |
|---|---|---|
| **0. 허브** | 1 | 운영자 허브 `/admin` |
| **1. 콘텐츠 — 법령·개정** | 3 | 개정 목록 `/admin/laws/:law/revisions` · 개정 워크스페이스 `/admin/laws/:law/revisions/:id` · 법령 완성도 `/admin/laws/:law/completeness` |
| **2. 콘텐츠 — 판례** | 2 | 판례 매핑 `/admin/cases` · 판례 편집 `/admin/cases/edit(/:caseId)` |
| **3. 콘텐츠 — 문제(객관식/OX)** | 5 | 문제 목록 `/admin/problems` · 신규 출제 `/admin/problems/new` · 문제 편집 `/admin/problems/:id` · 체계별 일괄 편집 `/admin/problems/system/:nodeId` · OX 검수 `/admin/problems/ox` |
| **4. 콘텐츠 — 빈칸 자료** | 4 | 빈칸 세트 목록 `/admin/blanks` · 빈칸 통계 `/admin/blanks/stats` · 법령별 일괄 `/admin/blanks/law/:law` · 빈칸 세트 편집 `/admin/blanks/:setId` |
| **5. 연관관계 관리** | 3 | 미배정 점검 `/admin/relations/gaps` · 일괄 등록 `/admin/relations/bulk` · 조문별 연관 편집 `/admin/relations/article/:law/:no` |
| **6. 수강생·반·커리큘럼·과제** | 10 | 사용자 `/admin/users` · 반 목록 `/admin/cohorts` · 반 상세 `/admin/cohorts/:id` · 반 진도 `…/progress` · 반 통계 `…/stats` · 반 과제 목록 `…/assignments` · 과제 편집 `…/assignments/:id` · 커리큘럼 목록 `/admin/curricula` · 커리큘럼 편집 `/admin/curricula/:id` · 수강생 상세 `/admin/students/:id` |
| **7. 온라인 GS 운영** | 12 | GS 회차 목록 `/admin/gs` · 회차 편집 `/admin/gs/new(/:id)` · 회차 통계 `…/stats` · 채점 목록 `…/grade` · 답안 채점 `…/grade/:sub` · 동료 채점 배정 `…/peer-review` · 분쟁 문항 `…/disputes` · 우수 답안 선정 `…/distinctions` · 포인트 관리 `/admin/gs/points` · 시리즈 목록 `/admin/gs/series` · 시리즈 편집 `…/series/:id` · 시리즈 통계 `…/series/:id/stats` |
| **8. 합격자 분석** | 3 | 합격 결과 운영 `/admin/exam-results` · 합격자 케이스 `/admin/analytics/passers` · 합격 vs 비합격 패턴 `/admin/analytics/failure-patterns` |
| **9. 공지·알림·감사** | 5 | 공지 발송 `/admin/announcements` · 알림 인박스 `/admin/inbox` · 감사 로그 `/admin/audit-logs` · 주관식 첨삭 큐 `/admin/subjective-reviews` · (공지 대상 데이터 라우트 — UI 없음) |

> 클러스터 1~5 = **콘텐츠 제작**, 6 = **수강생 운영**, 7 = **시험 운영**, 8 = **데이터 분석**, 9 = **소통·감사**. 9개 클러스터가 §5.2 운영자 셸 네비게이션의 그룹이 된다.

---

## 4. 디자인 방향

### 4.1 톤

> "정돈된 관제실". 정보 밀도는 높지만 어수선하지 않게. 운영자가 빠르게 훑고, 정확히 누르고, 실수 없이 처리한다. 학생 화면의 따뜻함보다 **명료함·효율**이 우선. 단, 디자인 언어(색·타이포·형태)는 학생 영역과 100% 동일.

### 4.2 색 · 타이포 · 형태 (디자인 시스템 SSOT 그대로)

- **색**: `colors_and_type.css` Wantedly 토큰. 전경 black-with-alpha, 브랜드 딥 블루 `#2D5BA8`. 중성 배경 흰색 / `#FAFAFA` / `#EEEEEE`.
- **타이포**: Pretendard 단일. 표·라벨은 작고 촘촘(13~14px), 헤더는 800. 표 헤더는 uppercase mono eyebrow. 모든 숫자(건수·점수·정답률·날짜)는 `tabular-nums`.
- **형태**: 8pt 그리드. 카드·표 카드 `R12`, chip·pill `R100`. 2-layer 중성 그림자. 버튼은 pill. 폼 인풋은 일관된 한 컴포넌트.
- **밀도**: 백오피스는 학생 화면보다 한 단계 촘촘하게 — 표 행 높이 ~44px, 카드 패딩 16px, 섹션 간격 24px.

### 4.3 의미색 (현재 raw 하드코딩 → 토큰화)

- 상태/검수: 완료·발행·검증됨 = **에메랄드 `#10A37F`** · 대기·초안·미검수 = **앰버 `#F7B500`** · 반려·오류·미배정 = **코랄 `#F65948`** · 중립 = 회색.
- 위험 동작(삭제·발행·확정·역할 변경) = 코랄 강조 + 확인 단계.
- 진행률·정답률 막대: 낮음 코랄 → 중간 앰버 → 높음 에메랄드 (차트 라이브러리 없이 div, 색은 의미색 컨벤션).
- 역할 badge: 원장 = blue solid · 강사 = blue outline.
- `최신 정보`처럼 다른 영역으로 나가는 카드는 보조 위계로 표시.

---

## 5. 공통 패턴 — 49개 화면이 공유하는 셸 + 7 패턴

> **이 영역 재설계의 핵심.** 49개 화면을 개별 디자인하지 않는다. 공통 셸 1벌 + 패턴 7개를 확정하면 모든 화면이 조합으로 완성된다.

### 5.1 페이지 셸

- 가운데 정렬. 폭은 패턴별: 표·워크스페이스 넓게(`~1280px`, 매트릭스류는 `~1400px`), 폼·상세 중간(`~960px`).
- 좌우 거터 데스크톱 24~40px / 모바일 20px.

### 5.2 운영자 셸 (신규 — 이 브리프의 1순위)

> **현재의 문제**: 운영자 전용 네비게이션이 없다. 허브가 유일한 진입점인데 49개 중 ~25개는 허브에서 도달 불가. 모든 화면이 `← 운영자` 링크를 손수 붙인다.

- **운영자 사이드 네비 또는 상단 서브바** — 모든 `/admin/*` 화면에 상시 노출. §3 의 **9개 클러스터를 그룹**으로, 각 그룹에 주요 화면 링크. 현재 화면 하이라이트.
  - 데스크톱: 좌측 레일(`~220px`, 접기 가능) 또는 헤더 아래 그룹 탭. 대시보드 사이드바(`lidam-dashboard`)와 시각 일관.
  - 모바일: 햄버거 → 시트(Sheet) 안에 그룹 트리.
- **breadcrumb** — `운영자 › 클러스터 › 화면 (› 항목)`. 현재 위치를 항상 표시. 손수 붙이던 뒤로가기 링크를 대체.
- **페이지 헤더** — eyebrow(`ADMIN · 운영자` + 클러스터 아이콘) + 제목(800) + 한 줄 설명 + 우측 주요 액션 슬롯(신규 등록 등).
- 운영자 셸은 전역 navigation-bar 안쪽에 렌더(라우트 변경 없이 공통 컴포넌트로). 학생에게는 미노출.

### 5.3 7개 재사용 패턴

운영자 화면은 아래 7개 패턴 중 하나(또는 조합). 패턴 1벌씩 확정해 반복 적용한다.

**P1 — HUB (허브)**: 카운터 타일 그리드 + 진행률 표 + 클러스터별 카드 그리드. 운영자 허브 1개.

**P2 — LIST/TABLE (목록·표)** ~14화면: `R12` 카드 안의 표. 헤더 행 = `bg-muted` + uppercase mono 컬럼명, 행 hover 강조, 행 높이 ~44px. 상단에 통일된 **필터 바**(검색 인풋 + chip/select + 초기화) + 우측 `신규` 버튼. 페이지네이션. 셀 안 chip·상태 badge·아이콘 일관 스타일. 일부 화면은 행 내 인라인 생성 폼(반·공지)을 허용 — 행 위 카드로 펼침.

**P3 — EDIT FORM (편집 폼)** ~9화면: 카드 안의 2열 라벨-필드 그리드. **폼 컴포넌트 통일이 최우선 과제** — 현재 화면마다 shadcn `Input`/`Textarea` 와 raw `<input>` 가 섞여 있다. 한 벌의 필드 컴포넌트(텍스트·셀렉트·텍스트영역·날짜·체크박스·rubric 입력)로 통일. 신규/수정 한 컴포넌트(라우트 2개 공유 — 판례·GS회차·GS시리즈). 하단 저장/취소 pill, 삭제는 코랄 + 확인.

**P4 — STATS/ANALYTICS (통계·분석)** ~8화면: 요약 KPI 카드 그리드 + 분포·추이 표 + div 기반 막대 시각화(차트 라이브러리 없음, 의미색 컨벤션). 필터 바(과목·기간 등). "가장 어려운 TOP" 류 표.

**P5 — WORKSPACE (워크스페이스)** ~6화면: 다중 패널 화면 — 좌측 목록/트리 + 우측 편집, 또는 붙여넣기→검증→적용 흐름. 법 개정 워크스페이스(발행 체크리스트 + 조문 추가 사이드바), 연관관계 일괄(TSV 붙여넣기→미리보기→적용), 빈칸 법령별 일괄, 체계별 문제 일괄, 동료 채점 배정.

**P6 — REVIEW QUEUE (검수 큐)** ~6화면: 처리 대기 항목을 위→아래 카드/행으로. 미처리 우선 정렬, 인라인 처리(점수·코멘트·승인/반려). 주관식 첨삭, OX 검수, GS 채점 목록, 합격 결과 검증, GS 분쟁·우수 답안 선정.

**P7 — DETAIL (상세)** 3화면: 한 대상(수강생·반)의 종합 정보 — 요약 카드 + 섹션 스택(진도·통계·최근 활동·구성원).

### 5.4 필터 바 (P2·P4·P6 공통)

- 통일된 한 줄 — 검색 인풋(아이콘 inset) + 필터 컨트롤(과목·역할·상태·연도 등) + `초기화`. GET `<Form>` 유지 허용하되 시각 통일. 정돈된 select 또는 chip.

### 5.5 빈 상태 · 로딩 · 위험 동작

- 빈 상태: 아이콘 + 카피 + (해당 시) CTA. 데이터 0 vs 필터 0 구분.
- 상태 렌더 순서: `에러 → 로딩 스켈레톤 → 빈 상태 → 콘텐츠`.
- 위험 동작: 삭제·발행·채점 확정·역할 변경은 코랄 + `confirm` 단계 또는 확인 다이얼로그. 발행 전 체크리스트(법 개정 워크스페이스의 `checklist-*`)는 ok/warn/missing pill.

---

## 6. 클러스터별 명세

각 클러스터는 §5.3 의 패턴 조합으로 구성된다. 클러스터별로 적용 패턴과 주의점만 명시한다.

### 6.0 운영자 허브 (`/admin`) — P1

- 헤더 + 역할 badge(원장/강사) + 내 콘텐츠 현황(7타일 카운터) + **과목 시드 진행률**(1차·객관식 표 / 2차·주관식 표 2개로 분리 — 1차 표는 조문·판례·객관식, 2차 표는 조문·판례·주관식. 산업재산권법은 양쪽, 민법은 1차에만, 민사소송법은 2차에만) + 9개 클러스터 카드 그리드.
- 학생 진입 시: 권한 안내 화면(앰버 tint — "운영자 전용입니다 + 학생이 할 수 있는 것").
- 현재 4개 섹션 그룹핑이 클러스터와 어긋남 — §3 의 9개 클러스터 기준으로 재편.

### 6.1 콘텐츠 — 법령·개정 — P2 + P5 + P4

- 개정 목록(P2): draft/review/published 상태 표.
- 개정 워크스페이스(P5): 상태 전환 버튼 행 + **발행 체크리스트**(7항목 ok/warn/missing) + 첨부 폼 + `좌측 조문 목록 / 우측 320px 조문 추가` 2패널.
- 법령 완성도(P4): 조문별 콘텐츠 충실도 진단.
- **data-testid 보존**: `checklist-{key}` (key ∈ number, articles, body-changed, reason, comparison, explanation, video).

### 6.2 콘텐츠 — 판례 — P2 + P3

- 판례 매핑(P2): 판례↔조문 매핑 도구, 검색 + 페이지네이션.
- 판례 편집(P3): 사건번호·요지·이유·평석 폼. 신규/수정 한 컴포넌트(라우트 `/edit`·`/edit/:caseId` 공유).

### 6.3 콘텐츠 — 문제(객관식/OX) — P2 + P3 + P6 + P5

- 문제 목록(P2): 다중 필터(출처·유형·polarity·scope·연도·검수 상태·미디어) + 정렬. 셀에 상태 마커(미분류·불일치·검수·표·이미지).
- 신규 출제(P3): 최소 메타 + 본문 → 편집으로.
- 문제 편집(P3): 메타 + 본문 + 선지 5개. **data-testid 보존**: `problem-video-url`, `problem-subjective-kind`, `problem-subjective-topic`, `problem-subjective-keywords`, `problem-model-answer`, `problem-grading-rubric`, `problem-rubric-items`.
- OX 검수(P6): OX 후보 지문 일괄 검수 + 인라인 편집.
- 체계별 일괄 편집(P5): 체계 노드 하위 문제 전체를 한 화면에서.

### 6.4 콘텐츠 — 빈칸 자료 — P2 + P4 + P5 + P3

- 세트 목록(P2) · 통계(P4) · 법령별 일괄(P5) · 세트 편집(P3). 빈칸 도메인 규칙은 별도 명세 참조([[domain_blanks]] 메모).

### 6.5 연관관계 관리 — P2 + P5

- 미배정 점검(P2): 미배정 조문·판례·문제 목록 + 매핑 진입점.
- 일괄 등록(P5): TSV/CSV 붙여넣기 → 검증 → 일괄 적용. **data-testid 보존**: `bulk-text`, `bulk-preview`, `bulk-apply`, `bulk-results`.
- 조문별 연관 편집(P5): 한 조문의 연관관계 일괄 편집.

### 6.6 수강생·반·커리큘럼·과제 — P2 + P7 + P3 + P4

- 사용자(P2, 원장 전용): 역할 필터·검색·페이지네이션 + 역할 변경.
- 반 목록(P2) + 인라인 신규 폼 · 반 상세(P7) · 반 진도(P2) · 반 통계(P4) · 반 과제 목록(P2) · 과제 편집(P3).
- 커리큘럼 목록(P2) · 커리큘럼 편집(P3, 메타+주차+항목).
- 수강생 상세(P7): 과목별 진도·통계 + 최근 활동.
- 권한: 반 계열은 *원장 또는 반 소유 강사*. 커리큘럼·과제 명세는 `docs/features/feat-7-020-curriculum-assignments.md` 참조.

### 6.7 온라인 GS 운영 — P2 + P3 + P6 + P4 + P5

- 회차 목록(P2) · 시리즈 목록(P2) · 회차 편집(P3) · 시리즈 편집(P3).
- 채점 목록(P6): 미채점 우선. **data-testid 보존**: `grade-row-{submissionId}`, `grade-link-{submissionId}`.
- 답안 채점(P3/P6): 문항별 점수·rubric·피드백 → 확정. **data-testid 보존**: `grade-finalize`, `grade-rubric-{q}-{i}`, `grade-score-{q}`, `grade-save-{q}`.
- 동료 채점 배정(P5) · 분쟁 문항(P6, 표준편차 큰 쌍) · 우수 답안 선정(P6, 자동 추천+수동).
- 회차 통계·시리즈 통계(P4): 학생×회차 점수/z 매트릭스, 문항별 분포.
- 포인트 관리(P2): 잔액 + 수동 적립/차감.
- GS 도메인 모델은 `community-redesign-brief.md` §3 참조. 학생용 GS 화면과 시각 일관.

### 6.8 합격자 분석 — P6 + P4

- 합격 결과 운영(P6): 결과 목록 + 검증/반려(원장 검증, 강사 읽기 전용). **data-testid 보존**: `exam-result-row-{resultId}`.
- 합격자 케이스(P4, 원장 전용): 합격자별 학습 요약 카드. **data-testid 보존**: `passer-card-{resultId}`.
- 합격 vs 비합격 패턴(P4, 원장 전용): 비교 분석.

### 6.9 공지·알림·감사 — P2 + P6

- 공지 발송(P2): 공지 목록 + 인라인 생성/수정 + 발행. 대상(전체/반/개인) 선택.
- 알림 인박스(P2): 운영진 알림 수신함, 미읽음 우선.
- 감사 로그(P2, 원장 전용): 운영자 행위 로그.
- 주관식 첨삭 큐(P6): 첨삭 대기 큐 + 인라인 검토/점수. **data-testid 보존**: `review-comment`, `review-score`, `review-submit`.

---

## 7. 애니메이션

- **셸·breadcrumb**: 정적. 사이드 레일 접기/펴기만 트랜지션.
- **표 행 / 카드 진입**: in-view fade-up stagger (상위 N개만). hover 강조.
- **인라인 폼 펼침**(반·공지 신규, 조문 추가): height 트랜지션 + chevron rotate.
- **검수 처리**: 처리 완료 행 fade-out 또는 상태 전환.
- **숫자**: 허브 카운터·통계 KPI count-up (선택).
- 과한 모션 금지 — 운영 화면은 빠른 처리가 우선. 전 구간 `prefers-reduced-motion: reduce` 존중.

---

## 8. 데이터 (구현 참고 — 대표 화면 loader 형태)

| 화면 | loader 반환 (요지) |
|------|----|
| 허브 | `role`, 콘텐츠 현황(7카운트), 과목 시드 진행률(1차/2차 분리) |
| 문제 목록 (P2 대표) | `problems`(행+상태 플래그), `years`, `subject`, `filters`, `systematicNodes` |
| GS 회차 편집 (P3 대표) | `round`(null=신규), `questions`, `allSeries`, `paperUrl`, `answerKeyUrl` |
| 문제 통계 (P4 대표) | `subject`, `minAttempts`, `summary`(mcq/ox), `mcqHardest`, `oxHardest`, `yearStats` |
| 개정 워크스페이스 (P5 대표) | `lawCode`, `allArticles`, `chapterLabelByPath`, `law`, `revision`(status·번호·첨부), `articles`(changeKind·body) |

> 각 화면의 정렬·필터·페이지네이션·집계 쿼리 의미는 고정. 본 작업은 시각 디자인이다.

---

## 9. 절대 수정 금지 / Out of scope

- ❌ 네비게이션 "운영자" 메뉴의 라벨·링크, `navigation-bar.tsx` / `footer.tsx`.
- ❌ 라우트 추가·변경 — 49개 화면 고정. (운영자 셸 §5.2 는 라우트가 아니라 공통 컴포넌트로 구현.)
- ❌ DB 스키마 · loader 쿼리 로직 · action 동작 — CRUD·검수·채점·발행·집계 의미 그대로. 본 작업은 시각 디자인.
- ❌ 권한 검사 로직(`getStaffRole`, admin-only / staff / owner-or-admin 분기). 학생 차단·안내 화면 동작.
- ❌ `/api/admin/*` 등 모든 운영 API 엔드포인트.
- ❌ 학생 영역 화면(학습과목·학습보조·학습정보·커뮤니티) — 운영자가 거기로 나가는 링크만 유지.
- ❌ 학생용 온라인 GS 화면(`gs/screens/gs*.tsx`, `admin-` 접두 아님) — `community-redesign-brief.md` 소관.
- ❌ `admin-announcement-audiences.tsx` — UI 없는 데이터 라우트. 디자인 대상 아님.
- ❌ 기존 `data-testid` 제거·변경 — E2E 의존. 보존 목록: `passer-card-*`, `exam-result-row-*`, `review-comment`/`review-score`/`review-submit`, `bulk-text`/`bulk-preview`/`bulk-apply`/`bulk-results`, `checklist-*`, `grade-finalize`/`grade-rubric-*`/`grade-score-*`/`grade-save-*`, `grade-row-*`/`grade-link-*`, `problem-video-url`/`problem-subjective-kind`/`problem-subjective-topic`/`problem-subjective-keywords`/`problem-model-answer`/`problem-grading-rubric`/`problem-rubric-items`. 그 외 화면은 testid 없음 — 재설계 시 추가 권장.
- ❌ shadcn 기본 톤 잔존 — 디자인 시스템으로 통일. 특히 폼 컴포넌트(raw `<input>` vs shadcn `Input` 혼재) 일원화.

---

## 10. 기술 제약 (코딩 단계 참고)

실제 구현은 React Router 7 (SSR) + TypeScript strict + Tailwind v4 + shadcn(New York) + lucide-react + Cloudflare Workers.

- 신규 npm 패키지·이미지/폰트 자산 도입 금지. 차트 라이브러리 도입 금지 — 통계는 div 기반 인라인 시각화.
- **A. 운영자 셸은 공통 컴포넌트** — `app/features/admin/components/admin-shell.tsx`(가칭) 등으로 추출, 각 `/admin/*` 화면이 래핑. 라우트 레이아웃 추가 여부는 구현 재량이나 라우트 *경로*는 불변.
- **B. 폼 컴포넌트 통일** — §5.3 P3. 한 벌의 필드 컴포넌트로 모든 편집 폼 정리. `any`/`@ts-ignore` 금지.
- **C. 권한 검사 유지** — 모든 loader/action 의 `getStaffRole()` 기반 분기(staff / admin-only / owner-or-admin)를 그대로. 시각만 변경.
- **다크 모드 지원** — `dark:` 변형. 두 모드 모두 제공.
- 모바일 반응형 — 표는 가로 스크롤, 셸은 시트, 필터 바 wrap. (운영 화면은 데스크톱 우선이나 깨지지 않아야 함.)
- 파일 길이 목표 300줄 — 49개 화면이 크므로 §5 셸·패턴·필터·표·폼을 컴포넌트로 적극 추출.
- 컴포넌트는 표시 + 이벤트 연결만. `console.log` 잔류 금지.
- 접근성(WCAG AA): 표·폼 라벨 연결, 위험 동작 확인, 상태색은 색 + 라벨/아이콘 병기.

---

## 11. 우선순위 — 디자이너가 시간을 어디에 쓸지

1. **운영자 셸** (§5.2) — 사이드 네비 + breadcrumb + 페이지 헤더. 49화면 전부의 뼈대. 이 영역 재설계의 1순위.
2. **7개 패턴 1벌씩** (§5.3) — HUB · LIST/TABLE · EDIT FORM · STATS · WORKSPACE · REVIEW QUEUE · DETAIL. 패턴이 완성되면 49화면은 조합.
3. **필터 바 + 표 + 폼 컴포넌트 통일** (§5.4, P2·P3) — 가장 많이 반복되고 현재 가장 들쭉날쭉.
4. **허브 재편** (§6.0) — 9개 클러스터 기준 IA.
5. **클러스터별 대표 화면** — 각 클러스터에서 패턴이 가장 잘 드러나는 1~2화면을 mockup 으로.
6. **GS 채점·검수 큐** (§6.7, P6) — rubric 입력, 위험 동작(확정).
7. **빈 상태 / 로딩 스켈레톤 / 위험 동작 확인**.

---

## 12. 점검 체크리스트 (mockup 완성 시)

- [ ] 운영자 셸(사이드 네비 + breadcrumb)이 9개 클러스터를 모두 잇는다 — 손수 붙이던 뒤로가기 링크 탈피.
- [ ] 7개 패턴(HUB/LIST/EDIT/STATS/WORKSPACE/REVIEW/DETAIL)이 각각 한 벌로 확정됐다.
- [ ] 표·필터 바가 화면 간 시각 통일됐다.
- [ ] 편집 폼이 한 벌의 필드 컴포넌트로 통일됐다 (raw `<input>` vs shadcn `Input` 혼재 해소).
- [ ] 통계 화면의 막대·분포가 일관된 의미색 컨벤션을 따른다.
- [ ] 위험 동작(삭제·발행·채점 확정·역할 변경)이 코랄 + 확인 단계로 또렷하다.
- [ ] 신규/수정 라우트를 공유하는 폼(판례·GS회차·GS시리즈)이 한 컴포넌트다.
- [ ] 검수 큐가 미처리 우선 + 인라인 처리로 빠르다.
- [ ] 허브 IA 가 §3 의 9개 클러스터와 일치한다.
- [ ] 학생 진입 시 권한 안내 화면이 정돈됐다.
- [ ] 빈 상태가 화면별로 디자인됐고, 데이터 0 vs 필터 0 카피가 구분된다.
- [ ] 색·타이포·radius·그림자·모션이 `colors_and_type.css` 와 일치한다 (shadcn 기본 톤 잔존 0).
- [ ] 데스크톱 / 태블릿 / 모바일 반응형. light·dark 두 모드 모두.
- [ ] 한국어 카피가 표기 그대로다. 네비 라벨 "운영자" 변경 금지.

---

## 13. 참고

- 콘텐츠 · 네비게이션 · voice 규칙: `landing-redesign-brief.md`.
- 디자인 토큰 SSOT: `colors_and_type.css`.
- 완성된 UI kit: `ui_kits/lidam-web/` · `lidam-dashboard/` · `lidam-subjects/` · `lidam-study-aids/` · `lidam-latest/` · `lidam-community/` — 같은 톤·컴포넌트 패턴 재사용. 운영자 셸은 `lidam-dashboard` 사이드바와 시각 일관.
- GS 도메인 모델: `community-redesign-brief.md` §3.
- 커리큘럼·과제 명세: `docs/features/feat-7-020-curriculum-assignments.md`. 그 외 운영자 화면 전용 명세 문서는 미작성 — feature ID 는 각 화면 헤더 주석·`SPEC.md` 참조.
- 운영자 화면은 전역 navigation-bar + footer 안에서 렌더되며 자체 라우트 레이아웃은 없다 (`core/layouts/` 에 admin/staff 레이아웃 없음).

— 끝.
