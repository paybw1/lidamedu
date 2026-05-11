# SPEC.md — 리담에듀 (변리사 학습 플랫폼)

> 이 문서는 기능 로드맵과 진행 상태의 Single Source of Truth. **메뉴 진입 단위로 작업 구간(섹션)이 분할되어 있다.** 각 메뉴의 하위 화면이 곧 feature 묶음. 기능 착수/완료 시 본 문서의 상태(🔲 → 🟡 → ✅)를 갱신한다.

## 범례
- 🔲 미착수 · 🟡 진행 중 · ✅ 완료 · ⛔ 보류
- `P0` 출시 필수 · `P1` 출시 직후 · `P2` 향후

---

## 1. 프로젝트 개요

### 목표
변리사 1·2차 시험 수험생이 **법령 조문 / 대법원 판례 / 객관식·주관식 문제 / 논문**을 메뉴 트리를 따라 체계적으로 학습하고, 학습 진도·약점을 한눈에 파악할 수 있는 통합 플랫폼.

### 핵심 차별점
1. **메뉴 진입 트리** — 과목별 학습 → 산업재산권법 → 특허법 → 조문/판례/문제로 자연스러운 계층 진입
2. **3자 연관관계 그래프** — 조문 ↔ 판례 ↔ 문제, 어디서 진입하든 관련 자료로 곧장 이동
3. **콘텐츠 자체 추적** — 법 개정, 신규 판례, 신규 문제, 신규 논문이 "최신 정보" 메뉴에 자동 집계
4. **과목 특성별 학습 구조** — 법률 과목(조문+판례+문제) vs 자연과학(문제만)
5. **역할 기반 콘텐츠 파이프라인** — 강사가 콘텐츠를 일상적으로 업데이트, 운영자가 사용자/결제 관리

### 시험 구조 (도메인 컨텍스트)
- **1차 시험**: 객관식. 산업재산권법(특허·상표·디자인보호법), 민법, 자연과학(물리/화학/생물/지구과학 중 1과목 선택)
- **2차 시험**: 주관식/논술. 산업재산권법, 상표법, 민사소송법 등
- **자연과학**: 1차 선택과목. 변리사 시험에서 조문/판례 개념 없이 **객관식 문제만** 다룸

### 범위 외 (YAGNI, v1에서 제외)
- 라이브 강의/영상 스트리밍 (외부 링크 위임)
- 다국어
- 해외 결제
- AI 자동 해설 생성

---

## 2. 메뉴 구조 (전체 사이트맵)

```
1. 대시보드
2. 학습목표 및 과목별 진도
3. 최신 정보
   ├─ 법 개정
   ├─ 최근 판례
   ├─ 객관식 문제
   ├─ 주관식 문제
   ├─ 논문
   └─ 도서 추록·정오표
4. 과목별 학습
   ├─ 민법                    [조문/판례/문제]
   ├─ 산업재산권법
   │   ├─ 특허법              [조문/판례/문제]
   │   ├─ 상표법              [조문/판례/문제]
   │   └─ 디자인보호법         [조문/판례/문제]
   ├─ 민사소송법              [조문/판례/문제]
   └─ 자연과학
       ├─ 물리                [문제만]
       ├─ 화학                [문제만]
       ├─ 생물                [문제만]
       └─ 지구과학            [문제만]
5. 온라인 GS  (placeholder, P1+)
6. 커뮤니티   (placeholder, P1+)
7. 운영자     (P0 일부 + P1+)
```

상세 화면 구성은 `docs/screens.md` 참고.

---

## 3. 도메인 모델 (한눈에)

```
                ┌─────────────┐
                │    law      │ 특허·상표·디자인·민법·민사소송법
                └──────┬──────┘
                       │ 1:N
                ┌──────▼──────┐            ┌──────────────────┐
                │   article   │◄───────────│ article_revision │
                │ (조/항/호/목)│            └──────────────────┘
                └──┬────────┬─┘
                   │        │   M:N (relations 5종)
                   ▼        ▼
              ┌────────┐  ┌────────┐
              │  case  │  │problem │   ← 자연과학 problem은 article/case 연결 없음
              │ (판례) │  │ (문제) │       (subject_type='science')
              └────────┘  └────┬───┘
                              │
                       ┌──────▼──────────┐
                       │ science_section │ 물리/화학/생물/지구과학의 단원
                       └─────────────────┘

           ┌──── papers ────┐  논문 (최신 정보 메뉴에서 노출)
           └────────────────┘

        ┌──────── user (profiles) ────────┐
        │  role: student | instructor | admin │
        └─┬──────┬──────┬──────┬──────┬────┘
          ▼      ▼      ▼      ▼      ▼
        memo  bookmark highlight progress attempt   (모두 polymorphic)
```

**자연과학 모델 분기**: `problem.subject_type`이 `'law'`(법률)인지 `'science'`(자연과학)인지로 구분. 자연과학 문제는 `science_subject` (`'physics'|'chemistry'|'biology'|'earth_science'`) + `science_section` (단원) 분류만 사용.

---

## 4. 역할별 권한 매트릭스

| 기능 | student | instructor | admin |
|------|:-------:|:----------:|:-----:|
| 콘텐츠(조문/판례/문제/논문) 읽기 | ✅ | ✅ | ✅ |
| 본인 메모/즐겨찾기/하이라이트/진도 | ✅ | ✅ | ✅ |
| 조문 개정 반영 | ❌ | ✅ | ✅ |
| 판례 등록/수정 | ❌ | ✅ | ✅ |
| 문제 출제/수정 | ❌ | ✅ | ✅ |
| 논문 등록/수정 | ❌ | ✅ | ✅ |
| 연관관계 지정 | ❌ | ✅ | ✅ |
| 자기 반 학생 진도 열람 | ❌ | ✅ | ✅ |
| 온라인 GS 운영 | ❌ | ✅ | ✅ |
| 커뮤니티 모더레이션 | ❌ | (반 한정) | ✅ |
| 사용자/강사/결제 관리 | ❌ | ❌ | ✅ |
| 운영자 메뉴 진입 | (안내) | (자기 권한 영역) | ✅ |

---

## 5. 기능 로드맵 (메뉴 진입 단위)

### 작업 단위 명명 규칙
`feat-{메뉴번호}-{서브번호}` 형태. 메뉴 트리 위치를 보면 어느 화면에서 다루는 기능인지 즉시 파악 가능.

- `5.0` 인프라 (메뉴 무관 횡단)
- `5.1` 메뉴 1 = 대시보드
- `5.2` 메뉴 2 = 학습목표 및 과목별 진도
- `5.3` 메뉴 3 = 최신 정보 (5개 탭)
- `5.4` 메뉴 4 = 과목별 학습 (A: 법률, B: 자연과학)
- `5.5` 메뉴 5 = 온라인 GS
- `5.6` 메뉴 6 = 커뮤니티
- `5.7` 메뉴 7 = 운영자

---

## 5.0 인프라 & 공통 (Foundation)

화면별 메뉴와 무관한 횡단 기반.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-000-001 | React Router 7 + Cloudflare Workers SSR 부트스트랩 | P0 | 🔲 |
| feat-000-002 | Supabase Auth (이메일/비밀번호, 매직링크, 소셜) | P0 | 🔲 |
| feat-000-003 | Drizzle + Supabase 연결, RLS 기본 정책 | P0 | 🔲 |
| feat-000-004 | `profile` 테이블 + 역할(student/instructor/admin) | P0 | 🔲 |
| feat-000-005 | 역할 기반 가드 (`requireAuth`, `requireRole`) | P0 | 🔲 |
| feat-000-006 | shadcn/ui 도입 + 테마(라이트/다크) | P0 | 🔲 |
| feat-000-007 | 상단 네비게이션 (메뉴 트리, 드롭다운, 모바일 햄버거) | P0 | 🔲 |
| feat-000-008 | Resend 연동 + 가입/비밀번호 재설정 템플릿 | P0 | 🔲 |
| feat-000-009 | 전역 검색 — Command Palette (⌘K, 조문/판례/문제 통합) | P1 | 🔲 |
| feat-000-010 | Sentry 에러 모니터링 | P1 | 🔲 |
| feat-000-011 | 콘텐츠 공통 스키마 (`articles`, `article_revisions`, `cases`, `problems`) | P0 | 🟡 |
| feat-000-012 | Polymorphic 주석 시스템 (북마크/메모/하이라이트, target_type/id) | P0 | ✅ |
| feat-000-013 | 5종 연관관계 스키마 + RLS | P0 | 🟡 |
| feat-000-014 | 학습 진도 자동 기록 미들웨어 (loader hook) | P0 | ✅ |
| feat-000-015 | `daily_study_stat` 일별 집계 배치 (읽기 시점 GROUP BY; Workers Cron 보류) | P1 | ✅ |

상세 스펙: `docs/architecture.md`, `docs/db-schema.md`, `docs/spec-detail-foundation.md` (작성 예정).

---

## 5.1 메뉴: 대시보드 (`/dashboard`)

수험생이 로그인 후 처음 보는 학습 현황 종합 화면.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-1-001 | 대시보드 진입 가드 + 인사말/D-day 헤더 | P0 | ✅ |
| feat-1-002 | 전체 학습 진척도 카드 (원형 차트, 법령/판례/문제) | P0 | ✅ |
| feat-1-003 | 이번 주 학습 카드 (요일별 + streak) | P0 | ✅ |
| feat-1-004 | 과목별 진척도 카드 5개 (법률 과목, 클릭 시 과목 진입) | P0 | ✅ |
| feat-1-005 | 자연과학 진척도 카드 — 대시보드에 4과목 (물리/화학/생물/지구과학) 풀이 수·정답률 표시. 문제 미시드 과목은 dim 처리. 카드 클릭 시 해당 science hub 로 이동. | P1 | ✅ |
| feat-1-006 | 신규 개정 · 판례 알림 위젯 (최신 정보 메뉴로 링크) | P0 | ✅ |
| feat-1-007 | 오늘의 학습 목표 카드 (목표 진척도 + 빠른 진입 액션) | P0 | ✅ |
| feat-1-008 | 즐겨찾기 빠른 접근 (조문/판례/문제 chip) | P1 | ✅ |
| feat-1-009 | 최근 학습 피드 (시간순 활동 로그) | P1 | ✅ |
| feat-1-010 | 약점 지표 위젯 (정답률 하위, 미학습, 재도전 추천) | P1 | ✅ |

상세 스펙: `docs/spec-detail-5-1-dashboard.md` (작성 예정).

---

## 5.2 메뉴: 학습목표 및 과목별 진도 (`/goals`)

시험 일자 + 목표 점수 기준으로 과목별 권장 진도와 현재 진도의 차이를 시각화. "목표 vs 현재"의 차이에 집중.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-2-001 | 목표 설정 화면 (시험일·목표점수·일일학습량·목표과목) | P1 | ✅ |
| feat-2-002 | 권장 진도 계산 엔진 (D-day 기반 일평균 권장량) | P1 | ✅ |
| feat-2-003 | 목표 vs 현재 KPI 카드 3종 (D-day · 조문 · 문제) | P1 | ✅ |
| feat-2-004 | 과목별 진도 상세 테이블 (조문/문제/정답률) | P1 | ✅ |
| feat-2-005 | 과목별 "학습하러 가기" 버튼 (해당 과목 허브로 이동) | P1 | ✅ |
| feat-2-006 | 진도 추이 그래프 (주별 12주 미니바) | P2 | ✅ |
| feat-2-007 | 목표 달성 알림 (마일스톤 25/50/75/100% 뱃지) | P2 | ✅ |

상세 스펙: `docs/spec-detail-5-2-goals.md` (작성 예정).

---

## 5.3 메뉴: 최신 정보 (`/latest`)

콘텐츠 업데이트를 한 곳에서 추적. 5개 탭(법 개정 / 최근 판례 / 객관식 / 주관식 / 논문) 공통 레이아웃.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-3-000 | 최신 정보 공통 레이아웃 (탭, 필터, 무한스크롤) | P0 | 🔲 |
| **5.3.1 법 개정** | | | |
| feat-3-101 | 법 개정 피드 (`law_revisions` published 시간순) | P0 | ✅ |
| feat-3-102 | 영향 조문 수 + 내 즐겨찾기 포함 여부 표시 | P0 | ✅ |
| feat-3-103 | 클릭 시 해당 법 과목 허브로 이동 (개정 탭 활성) | P0 | ✅ |
| **5.3.2 최근 판례** | | | |
| feat-3-201 | 신규 판례 피드 (선고일 최신순) | P0 | ✅ |
| feat-3-202 | 과목별 필터 + 중요판례 필터 (importance ≥ 3) | P0 | ✅ |
| feat-3-203 | 판례 카드에서 판례 상세로 이동 | P0 | ✅ |
| **5.3.3 객관식 문제** | | | |
| feat-3-301 | 객관식 문제 색인 (PPT 운영계획 반영) — `mcq_packs` 테이블(kind: past_exam/mock_full/mock_progressive/other, subject_scope: industrial/civil/civil_procedure/science, year/exam_round_no/duration_min/video_url/result_doc_url/published_at) + `mcq_pack_problems` (pack↔problem 매핑). `quiz_sessions.pack_id` 추가. RLS: 학생은 published만 read, staff CRUD. `/latest/mcq` 표 색인(No·과목·구분·명칭·출제일·문항), staff inline CRUD. | P1 | ✅ |
| feat-3-302 | 팩 상세 페이지 — `/latest/mcq/:packId` 헤더(과목·구분·명칭·출제일·문항·제한시간) + 동영상/결과자료 카드 + 학습/모의고사 시작 액션 + 문제 목록 (staff: problem_id로 추가/제거). 학습 시작은 quiz_session(mode=study), 모의는 mode=exam + time_limit. | P1 | ✅ |
| feat-3-303 | 팩 응시 결과 통계 — `/latest/mcq/:packId/result/:sessionId`. KPI(본인 정답률/총문항/오답/소요시간). 유형별(단답/박스/사례) + 지문별(조문/판례/이론) 정답률 — 본인 vs 전체 평균. 문제별 본인 정답 + 전체 정답률(get_problem_stats RPC). mock 완료 시 자동 리디렉트. | P1 | ✅ |
| **5.3.4 주관식 문제** | | | |
| feat-3-401 | 신규 주관식 문제 피드 | P1 | ✅ |
| feat-3-402 | 모범답안 보기 + 첨삭 요청 | P1 | 🔲 |
| **5.3.5 논문** | | | |
| feat-3-501 | 논문 데이터 모델 — `papers` (title/authors/source/publishedAt/abstract/url/pdfUrl/subject_laws[]/importance/tags) + `paper_article_links` + `paper_case_links`. RLS: public read, staff write. pg_trgm 인덱스 + 다과목 GIN. Soft delete. | P1 | ✅ |
| feat-3-502 | 논문 등록/수정 — `/api/admin/paper` (create/update/delete, Zod 검증) + `/api/admin/paper-link` (add/remove article/case by number). staff inline 폼 on /latest/papers. | P1 | ✅ |
| feat-3-503 | 논문 피드 + 관련 링크 — `/latest/papers` 검색·과목·중요 필터 + 페이지네이션. 카드: 제목·저자·출처·초록·subject 배지·관련 조문/판례 chip·외부 링크/PDF 버튼. staff: inline 추가/수정/삭제 + 링크 관리 토글. | P1 | ✅ |
| feat-3-504 | PDF 첨부 (Supabase Storage) | P2 | 🔲 |
| **5.3.6 도서 추록·정오표** | | | |
| feat-3-601 | 도서 추록/정오표 데이터 모델 — `book_updates` (book_title/publisher/edition/kind:supplement\|errata\|other/title/description/publishedAt/url/pdfUrl/subject_laws[]/importance/tags). RLS: public read, staff write. trgm + subject_laws GIN 인덱스. Soft delete. | P1 | ✅ |
| feat-3-602 | 도서 자료 등록/수정 — `/api/admin/book-update` (create/update/delete, Zod 검증) + staff inline 폼 on /latest/book-updates. | P1 | ✅ |
| feat-3-603 | 도서 추록/정오표 피드 — `/latest/book-updates` 검색·과목·유형·중요 필터 + 페이지네이션. 카드: 자료 제목·책 제목·판/쇄·출판사·내용·subject 배지·외부 링크/PDF 버튼. 네비게이션 메뉴 6번째 항목. | P1 | ✅ |

상세 스펙: `docs/spec-detail-5-3-latest.md` (작성 예정).

---

## 5.4 메뉴: 과목별 학습 (`/subjects`)

핵심 학습 영역. 과목 단위로 진입하면 그 안에서 조문/판례/문제 탭으로 학습.

### 5.4.A 공통 — 법률 과목 학습 허브

5개 법률 과목(특허·상표·디자인·민법·민사소송법)이 **동일한 화면 구조**를 공유. 데이터(과목)만 다름.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-A-001 | 과목 허브 레이아웃 (헤더 + 3탭: 조문/판례/문제) | P0 | ✅ |
| feat-4-A-002 | 과목 헤더 (과목명, 진도, 개정 배지, KPI 칩 조문/판례/문제) | P0 | ✅ |
| feat-4-A-003 | 탭 상태 URL 동기화 (`?tab=articles\|cases\|problems`) | P0 | ✅ |
| feat-4-A-004 | 정렬축 글로벌 토글 (체계도 / 조문 순서) — 과목 허브 헤더 + 조문 뷰어 트리 카드 inline 토글. 특허법 체계도2 기준 systematic_nodes(107)/article_systematic_links(301) 시드 완료. 모든 학습 조문 분류, 누락 0건 | P0 | ✅ |

### 5.4.A.1 — 조문 탭

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-A-101 | 조문 트리 데이터 모델 (`articles`, 조/항/호/목, ltree 또는 path) | P0 | ✅ |
| feat-4-A-102 | 조문 식별자 양방향 변환 유틸 (`§29②2.가` ↔ struct ↔ URL). 표시(parseDisplay/toDisplay), 본문 약식(parseShorthand/toShorthand `法 29의2②2.가`), URL slug(parseSlug/toSlug — 가지조 branch round-trip 포함), inline ref 추출(extractRefs) 모두 대칭. DB 조회 caller 는 `articleSlug(article_number)` 직접 사용 (ltree 경유는 branch 손실). | P0 | ✅ |
| feat-4-A-103 | 조문 트리 렌더 (편/장/조 펼침, 진도 마커, 즐겨찾기 별) | P0 | ✅ |
| feat-4-A-104 | "최근 학습"·"미열람 권장" 카드 (importance 기반 chips) | P0 | ✅ |
| feat-4-A-105 | 조문 뷰어 (3분할: 트리/본문/관련자료) | P0 | ✅ |
| feat-4-A-106 | 조문 본문 하이라이트·메모·즐겨찾기 (polymorphic 주석) | P0 | ✅ |
| feat-4-A-107 | 관련 자료 사이드바 (조문/판례/문제/개정/메모 탭 + 정오/코멘트) | P0 | ✅ |
| feat-4-A-108 | 조문 시점 조회 (`?at=YYYY-MM-DD`) + 비교 모드(`?compare=`) — 본문 영역 2칼럼 분할, 시행일 캡션 | P1 | ✅ |
| feat-4-A-109 | 조문 트리 검색 — 트리 카드 안 검색 인풋, displayLabel substring 매칭 + 매칭 노드의 조상까지 노출 | P1 | ✅ |
| feat-4-A-110 | 큰 법 lazy-load — 본문은 활성 조문만 fetch. 서버 `getArticleChildren(lawId, parentId)` + `/api/laws/article-children` 라우트 + ArticleTree `lazyExpand={lawId}` UI 연결 완료(민법 적용). 펼침 시 fetch + 로딩 스피너 + 자식 dedup 누적. 전체 skeleton 이 미리 로드되어 있으면 fetch 가 no-op 라 안전. 트리 가상화(react-window 등) 는 1000+ 노드 노출 시 후속 | P1 | ✅ |
| feat-4-A-111 | 관련조문 inline 링크 (`法 89` 등 약식 표기 파서 + 클릭 이동, 본문 안에서는 dotted underline 형태 / header_refs 안에서는 chip) | P0 | ✅ |
| feat-4-A-112 | 해설 링크 → 코멘트 탭 활성 | P1 | 🔲 |
| feat-4-A-113 | 제목만 보기 (항 단위 본문 접기) | P1 | ✅ |
| feat-4-A-114 | 정오문제 위젯 (객관식 자동 연동 + 별도 업로드, 무작위 노출, 정답+해설) | P0 | ✅ |
| feat-4-A-115 | 코멘트 / 평석 패널 (staff 작성, 학생 read-only, 마크다운) | P0 | ✅ |
| feat-4-A-116 | Q&A 패널 — 동일 공용 컴포넌트(QnaPanel/qna-list). 검색 + 새 질문 → staff 알림 + 답변자 질문수준 평가 상/중/하. | P0 | ✅ |
| feat-4-A-130 | 조문 빈칸 채우기 학습 (article_blank_sets, 빈칸 모드 토글, 입력+채점, 시도 기록). 운영자 편집은 article-viewer "빈칸 자료" 버튼 → 자기 set 자동 생성+편집 / 모든 조문 한 화면(setless 카드도 drag→자동 생성). 매칭: ±30자 컨텍스트 + ANCHOR_LENGTHS=[30,20,12,10,8,6,4] + cross-token cumulative fallback. 미매칭 일괄검수/새 자료 업로드 진입점은 제거(article-viewer 통합 흐름) | P0 | 🟡 |

### 5.4.A.2 — 판례 탭

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-A-201 | 판례 데이터 모델 (`cases`, 사건번호 정규화, tsvector) | P0 | ✅ |
| feat-4-A-202 | 판례 KPI 카드 (전체/중요/기출 보유). "내가 본 판례" 는 user_progress 매핑 후속. | P0 | ✅ |
| feat-4-A-203 | 판례 필터 (법원 4종 + 기출 4종(전체/1차/2차/1·2차 모두) + 정렬 3종 + 검색). hub cases 탭과 /latest/cases 모두 적용. | P0 | ✅ |
| feat-4-A-204 | 판례 카드 목록 (사건번호, 사건유형, 요약, 선고일, 기출년도 chip 1차=blue/2차=rose). | P0 | ✅ |
| feat-4-A-205 | 판례 상세 뷰어 — 헤더(법원·사건번호·사건유형·전합·중요도·선고일·기출년도) / 판결요지(복수 [1][2] 분리) / 판시이유 / 비고. 좌측 조문트리 · 우측 패널 3분할. | P0 | ✅ |
| feat-4-A-206 | 판례 본문 하이라이트 — 요지·이유·비고 3 영역에 fieldPath 별 HighlightOverlay + 상단 HighlightToolbar. 메모/즐겨찾기는 우측 패널(ArticleRightPanel). | P0 | ✅ |
| feat-4-A-207 | 인용 복사 버튼 — case-viewer 헤더 우측 "인용 복사" / buildCitation: "{법원} {YYYY. M. D.} 선고 {사건번호} 판결 【{유형}】". 클립보드 API + 폴백 prompt. | P1 | ✅ |
| feat-4-A-208 | 판례 전문 검색 — case_number / case_title / summary_title / summary_body_md / reasoning_md / comment_body_md 에 pg_trgm GIN 인덱스 + ilike 다중 컬럼 OR. 한국어 부분 매칭 안정 작동. search_tsv(simple config) 는 generated 컬럼으로 유지 — 향후 정확 매칭 ranking 도입 시 활용 가능. | P1 | ✅ |
| feat-4-A-209 | 판례 색인 화면 (테이블 — 중요·법원·선고일·사건번호·사건유형·사건명+기출년도·전합). 검색·정렬·기출 필터·페이지네이션(50/페이지). | P0 | ✅ |
| feat-4-A-210 | 판례 트리 진입 — cases 탭 좌측 사이드바: 조문 트리 + 체계도(SortAxisToggle 공유). 각 노드별 leaf 카운트(판례 수). 클릭 시 `?case_article` / `?case_chapter` / `?case_node` URL 파라미터로 필터링 + 필터 활성 chip + 전체 보기 해제 버튼. chapter 는 자손 article 합산, systematic 노드는 부분트리 article 합산(중복 제거). 0건 노드는 hide. | P1 | ✅ |
| feat-4-A-211 | 판결전문 PDF 뷰어 — cases.full_text_pdf URL 이 있으면 case-viewer 본문에 iframe 임베드(80vh) + "새 탭에서 열기" 버튼. 미첨부 case 는 섹션 자체 숨김. | P0 | ✅ |
| feat-4-A-212 | 관련문제 패널 — case-viewer 우측 패널 "유사 문제" 탭: `getRelatedProblemsByCase` (article_case_links 가 가리키는 article 의 primary_article_id 문제 12건). 1차/2차 양방향 링크는 explicit problem_case_links 모델 추가 시 보강. | P0 | ✅ |
| feat-4-A-213 | 비고/코멘트(평석) 출처/내용 분리 — comment_source 가 있으면 본문 위에 별도 박스(왼쪽 border-l)로 노출. 내용은 HighlightOverlay 로 wrap. | P0 | ✅ |
| feat-4-A-214 | 관련논문/기사 링크 — `case_references` 테이블(kind: paper/article/other, title/authors/source/publishedAt/url/pdfUrl/note/ord). case-viewer 본문에 패널 추가, 학생은 read-only (외부 링크 + PDF 열기 버튼). staff(instructor/admin) 는 inline 추가/수정/삭제. API: `/api/admin/case-reference` (create/update/delete). RLS: public read, staff write. | P1 | ✅ |
| feat-4-A-215 | Q&A 패널 — 우측 패널 통합(article/case/problem 공용). qna-list 검색 + 필터(scope/target/q). 새 질문 → 모든 staff fanout 알림(이메일+카카오 Alimtalk). 답변 시 질문수준 평가 상/중/하(qna_quality_grade) + asker 알림. | P0 | ✅ |

### 5.4.A.3 — 문제 탭

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-A-301 | 문제 데이터 모델 (`problems`, 4유형: mc/ox/blank/subjective) | P0 | 🟡 |
| feat-4-A-302 | 문제 KPI 카드 (출제/풀이/정답률) | P0 | 🟡 |
| feat-4-A-303 | 퀴즈 설정 폼 (유형/연도/극성/문항수/모드) + 오답만 모드 | P0 | ✅ |
| feat-4-A-304 | 문제 풀이 Runner — 객관식 (mc_short) | P0 | ✅ |
| feat-4-A-305 | 문제 풀이 Runner — 주관식 (자기채점 + 첨삭 요청) | P1 | 🔲 |
| feat-4-A-306 | 학습 모드 (즉시 해설) vs 시험 모드 (타이머 + 일괄 제출) | P0 | ✅ |
| feat-4-A-307 | 풀이 결과 화면 + 오답 노트 자동 수집 | P0 | ✅ |
| feat-4-A-308 | 문제 북마크·메모·하이라이트 (polymorphic 패널) | P0 | ✅ |
| feat-4-A-309 | 유사 문제 추천 (같은 primary_article) | P2 | ✅ |
| feat-4-A-310 | 객관식 색인 화면 — 정렬·필터·난이도·본문 검색 | P0 | ✅ |
| feat-4-A-311 | 분류 라벨 시스템 (기출/변형/예상/모의 × 단원/종합 × 단답/박스/사례 × 긍정/부정) | P0 | 🟡 |
| feat-4-A-312 | 정답률 기반 난이도 동적 계산 (RPC + 5단계 버킷) | P0 | ✅ |
| feat-4-A-313 | 지문별 색인 (problem_choice 자식 entity) + 정오문제 자동 연동 (article 패널 + /:subject/ox 페이지) | P0 | ✅ |
| feat-4-A-314 | 해설 — 지문별 O/X + 분류(조문/판례/실무) + 링크 | P0 | ✅ |
| feat-4-A-315 | 동영상 풀이 (강사 업로드, 문제 우측 패널) | P1 | 🔲 |
| feat-4-A-316 | Q&A 패널 — 공용 QnaPanel. ArticleRightPanel 통해 problem 타깃도 동일 흐름. | P0 | ✅ |
| feat-4-A-320 | 주관식 색인 화면 (기출+모의 통합 테이블) | P1 | 🔲 |
| feat-4-A-321 | 주관식 분류 라벨 (기출/변형/예상, 키워드, 사례·논점) | P1 | 🔲 |
| feat-4-A-322 | 채점기준·모범답안·채점결과 우측 패널 | P1 | 🔲 |
| feat-4-A-323 | 답안 작성 시간제한·자동 저장 | P1 | 🔲 |
| feat-4-A-330 | 2차 답안 업로드 — submission 단위 N페이지 슬롯 그리드 (1슬롯=1파일, JPG/PNG/WebP/PDF), 페이지별 OCR + 판독 자가확인, swap/끼워넣기 재배치. `gs_submission_pages` + `gs_question_pages` (M:N 매핑). → 5.5.1 GS 응시 흐름과 동일 모델 | P1 | ✅ |
| feat-4-A-331 | 답안지 N분할 — `gs_rounds.expected_pages` (default 20) 기반 슬롯 그리드 + PDF 다페이지 자동 분할. 페이지 ↔ 문항 매핑은 수동 다중 선택 | P1 | ✅ |
| feat-4-A-332 | 답안 교차 배정 (M명 채점자 부작위 매칭) → 5.5.2-203 (gs_peer_assignments) | P1 | ✅ |
| feat-4-A-333 | 채점기준·채점표 양식 (정량+정성) — `gs_questions.rubric` + `gs_answers.rubric_scores`. 항목별 입력 → 합산 자동. AI 채점도 rubric 항목별 점수 제안 (ai_grader 분기). AI 제안값은 `gs_answers.ai_suggested_*` 로 로깅 — 강사 최종값과 차이 분석 가능 | P1 | ✅ |
| feat-4-A-334 | 채점 입력 UI (소문제별 점수 + 정성 평가 + 코멘트) → 5.5.2-201 admin-gs-grade | P1 | ✅ |
| feat-4-A-335 | 평균/표준점수/등급/순위 자동 계산 → 5.5.3-301..303 RPCs (gs_round_student_stats 등) | P1 | ✅ |
| feat-4-A-336 | AI 채점 (Claude API) → 5.5.2-202 ai-grader.server.ts | P2 | ✅ |
| feat-4-A-337 | 채점결과 통계 화면 → 5.5.3-301..303 admin-gs-round-stats / admin-gs-series-stats | P1 | ✅ |
| feat-4-A-338 | 우수답안 노출 → 5.5.3-304 gs-distinguished + admin-gs-distinctions | P1 | ✅ |
| feat-4-A-339 | 포인트 지급 시스템 (순위 백분위 기반) → 5.5.3-305 gs-points | P2 | ✅ |

### 5.4.B — 자연과학 학습 허브 (문제만)

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-B-001 | 자연과학 과목 허브 레이아웃 — 4과목 공용 ScienceHub (헤더 + KPI 실값 + 단원 카드 + 맞춤 퀴즈 진입) | P1 | ✅ |
| feat-4-B-002 | 자연과학 데이터 모델 — `science_subject` enum, `science_sections` 테이블 (parent_id 자기참조), `problems.science_subject` + `problems.science_section_id` + 정합성 가드 | P1 | ✅ |
| feat-4-B-003 | KPI 카드 — 출제 / 내 풀이 / 내 정답률 (user_problem_attempts 조인) | P1 | ✅ |
| feat-4-B-004 | 단원별 정답률 표 — science hub 단원 행에 풀이수/문제수·정답률 컬럼 추가. accuracy tone 4단계 색상(emerald/lime/amber/rose). | P1 | ✅ |
| feat-4-B-005 | 퀴즈 설정 폼 — `/subjects/science/:subject/quiz/setup`. 단원 다중 선택 + 문항수 + 모드 | P1 | ✅ |
| feat-4-B-006 | 자연과학 문제 풀이 Runner — `/subjects/science/:subject/problems/:id` 최소 viewer (선지 4지 + 정답·해설 + 세션 prev/next). LaTeX/도식 후속 | P1 | 🟡 |
| feat-4-B-007 | 단원 시드 데이터 — 4과목 × 5~6 대단원 (총 21개). 샘플 문제 8개(과목별 2) 도 함께 시드. 변리사 협회 공식 분류 검증 후속 | P1 | ✅ |

상세 스펙: `docs/spec-detail-5-4-subjects-A.md` ✅ (5.4 도메인 모델·UX·결정사항·feat ID 정리), `docs/db-schema.md` ✅, `docs/article-tree.md` ✅, `docs/relations.md` ✅. `docs/spec-detail-5-4-subjects-B.md` (자연과학 — 작성 예정).

---

## 5.5 메뉴: 온라인 GS (`/gs`)

변리사 2차 모의고사를 온라인으로 응시·채점하는 흐름. 상시 회차/시리즈, 답안지 페이지 슬롯 그리드, AI/peer/강사 채점, 통계, 우수답안, 포인트.

### 5.5.0 — 회차/시리즈 인프라

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-5-001 | 회차(`gs_rounds`) 도메인 모델 + RLS — 과목/시작·종료·상태(draft/published/closed)/시험지·모범답안 PDF | P0 | ✅ |
| feat-5-002 | 시리즈(`gs_series`) — 회차 묶음, 시리즈별 통계용 | P1 | ✅ |
| feat-5-003 | GS 메뉴 진입 화면 (`/gs`) — 노출 가능 회차 목록, 내 응시 현황 | P0 | ✅ |
| feat-5-004 | 시리즈 상세 (`/gs/series/:id`) — 회차 카드 + 내 추이 | P1 | ✅ |

### 5.5.1 — 학생 응시

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-5-101 | 응시 시작 + 카운트다운 + 가드 (응시 시각·1회 제한) | P0 | ✅ |
| feat-5-102 | 답안지 페이지 슬롯 그리드 (회차별 `expected_pages`, default 20) | P0 | ✅ |
| feat-5-103 | 페이지 1슬롯 = 1파일 업로드 (JPG/PNG/WebP/PDF, 해상도·크기 검증, OCR) | P0 | ✅ |
| feat-5-104 | 페이지 ↔ 문항 매핑 (M:N 칩 다중 선택) | P0 | ✅ |
| feat-5-105 | 페이지별 판독 자가확인 토글 | P0 | ✅ |
| feat-5-106 | 다페이지 PDF 자동 분할 — confirm 후 PDF.js 가 페이지별 JPEG 으로 분배 | P0 | ✅ |
| feat-5-107 | 페이지 swap (드래그&드롭) — `gs_swap_pages` RPC + ON UPDATE CASCADE 매핑 | P0 | ✅ |
| feat-5-108 | 페이지 끼워넣기 — `gs_shift_pages_down` RPC, 마지막 페이지가 채워져 있으면 차단 | P0 | ✅ |
| feat-5-109 | 제출 가드 (모든 문항 매핑 + 모든 페이지 판독확인) | P0 | ✅ |
| feat-5-110 | 결과 페이지 — 답안지 페이지 갤러리 + 문항별 점수/피드백 + 매핑 anchor | P0 | ✅ |

### 5.5.2 — 채점 (강사·AI·peer)

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-5-201 | 강사 채점 화면 — 답안지 인덱스 + 문항별 매핑 페이지 합본 갤러리 + 점수/피드백 | P0 | ✅ |
| feat-5-202 | AI 채점 초안 (Claude API + OCR 합본) | P0 | ✅ |
| feat-5-203 | 동료 채점 배정 (M명 균등 분배, 자기 답안 제외) — `gs_peer_assignments` | P1 | ✅ |
| feat-5-204 | 동료 채점 화면 (익명) — 단일 답안 모드(/gs/peer-review/:assignmentId) + 매트릭스 모드(/gs/peer-review/round/:roundId, 한 라운드의 배정 답안 N개를 컬럼으로 늘어놓고 문제·rubric criterion 행 × 답안 컬럼 입력, 소계·총계·순위 실시간, 정성평가 textarea, 디바운스 자동 저장 — 채점강의 PPT 6페이지 레이아웃 반영). gs_peer_review_answers.rubric_scores jsonb 컬럼 추가, score 는 rubric 합으로 자동 채움. | P1 | ✅ |
| feat-5-205 | 채점 마무리 → 학생에게 결과 공개 (`graded_at`, `total_score`) | P0 | ✅ |
| feat-5-206 | 채점 분쟁 표시 (동료 채점 표준편차 ≥ maxScore × 0.15) | P1 | ✅ |
| feat-5-207 | 자동 동료 배정 cron (응시 종료 후) | P1 | ✅ |

### 5.5.3 — 통계·우수답안·포인트

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-5-301 | 회차별 학생 통계 (z·rank·percentile) | P1 | ✅ |
| feat-5-302 | 회차별 문항 통계 (avg·median·stdev·quartile) | P1 | ✅ |
| feat-5-303 | 시리즈 학생/회차 매트릭스 + 본인 추이 | P1 | ✅ |
| feat-5-304 | 우수답안(`gs_distinctions`) — 회차/문항 단위, 익명 옵션, 학생 화면 노출 | P1 | ✅ |
| feat-5-305 | 포인트 적립/소진 (`gs_points_*`) — 우수답안/응시 보상 | P2 | ✅ |

### 5.5.4 — 운영자

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-5-401 | 회차 CRUD (admin-gs-edit) — 시험지/모범답안 PDF, 4문항 시드, expected_pages 설정 | P0 | ✅ |
| feat-5-402 | 시험지 PDF 페이지 수 ↔ expected_pages 동기화 안내 + 한 번에 맞추기 | P1 | ✅ |
| feat-5-403 | 회차 제출 목록 / 채점 진행도 | P0 | ✅ |
| feat-5-404 | 동료 채점 배정 운영 화면 | P1 | ✅ |
| feat-5-405 | 회차/시리즈 통계 화면 | P1 | ✅ |
| feat-5-406 | 우수답안 운영 화면 (자동 추천 + 발행) | P1 | ✅ |
| feat-5-407 | 포인트 운영 화면 | P2 | ✅ |
| feat-5-408 | 분쟁 문항 모니터링 화면 | P1 | ✅ |

### 5.5 데이터 모델 메모

- `gs_submission_pages` (submission 단위 N슬롯, 1슬롯=1파일, jsonb attachment + OCR)
- `gs_question_pages` (페이지 ↔ 문항 M:N, FK ON UPDATE CASCADE)
- `gs_answers` (점수/피드백 only — `attachments`/`legibility_confirmed` 컬럼은 deprecated)

상세 흐름은 `feat-4-A-330`/`feat-4-A-331` (5.4 의 답안 업로드/N분할 라인) 과 동일한 모델을 사용.

---

## 5.6 메뉴: 커뮤니티 (`/community`) — Placeholder

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-6-001 | 커뮤니티 메뉴 라벨 + Placeholder 화면 | P0 | 🔲 |
| feat-6-XXX | 게시판/Q&A/합격수기 | P1+ | 🔲 |

---

## 5.7 메뉴: 운영자 (`/admin`)

학생도 메뉴는 보이되 진입 시 권한별 안내. 강사/원장은 본격 운영 화면.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-7-001 | 운영자 메뉴 진입 가드 — `/admin` loader 가 staff role 확인. 비로그인은 /login 리다이렉트, 학생은 권한 안내 화면(추천 액션 — 대시보드/특허법/최신 정보/학습 목표 링크). | P0 | ✅ |
| feat-7-002 | 콘텐츠 관리 허브 — 콘텐츠 등록·수정(빈칸/문제/판례 매핑/MCQ 팩/논문/도서 추록·정오표) + 통계 분석 + 온라인 GS 3개 섹션으로 정리. 각 카드에 진입 링크 + "최신 정보" 배지. | P0 | ✅ |
| feat-7-003 | 강사 대시보드 (반 진도, 콘텐츠 현황) | P1 | 🔲 |
| feat-7-004 | 법 개정 워크스페이스 (draft → review → publish) | P0 | 🔲 |
| feat-7-005 | 판례 등록/수정 폼 (참조조문/참조판례 동시 지정) | P0 | 🔲 |
| feat-7-006 | 문제 출제 폼 (유형별, 연관 조문/판례 지정) | P0 | 🔲 |
| feat-7-007 | 논문 등록/수정 폼 | P1 | 🔲 |
| feat-7-008 | 연관관계 일괄 편집 | P1 | 🔲 |
| feat-7-009 | 반/기수 관리 — `cohorts` (name/description/owner_id/starts_on/ends_on/is_archived) + `cohort_members` (N:M). RLS: admin 전부, instructor 본인 소유, student 자기 row read. `/admin/cohorts` 카드 일람 + 신규/수정 폼, `/admin/cohorts/:id` 상세에 멤버 목록 + 학생 검색 추가/제거. | P1 | ✅ |
| feat-7-010 | 학생 진도 모니터링 — `/admin/cohorts/:id/progress` 반 학생 요약 테이블(문제 풀이·정답률·조문 열람·빈칸·최근 활동) + KPI 4종. `/admin/students/:profileId` 학생 상세(과목별·자연과학별 진도, 최근 12건 활동, 빈칸 통계). admin client 로 RLS 우회, staff 권한 검사는 loader 에서. | P1 | ✅ |
| feat-7-011 | 공지사항 발송 (반/전체) | P1 | 🔲 |
| feat-7-012 | 사용자 관리 — `/admin/users` admin 전용. listAdminUsers (admin client 로 auth.users + profiles 조인) + 검색·역할 필터 + 페이지네이션. 인라인 select 로 역할 변경(student/instructor/admin), 본인 강등 차단. | P1 | ✅ |
| feat-7-013 | 강사 권한 관리 — feat-7-012 에 통합 (admin 이 user role 을 instructor 로 승격/강등). | P1 | ✅ |
| feat-7-014 | 수강권/결제 관리 (admin 전용) | P2 | 🔲 |
| feat-7-015 | 감사 로그 | P2 | 🔲 |

상세 스펙: `docs/spec-detail-5-7-admin.md` (작성 예정).

---

## 6. 마일스톤

### M1 — Foundation (2~3주)
**목표**: 앱이 열리고, 로그인되고, 메뉴 트리가 동작하고, 빈 화면이라도 모든 메뉴에 진입 가능.

- 5.0 인프라 P0 전부 (`feat-000-001~014`)
- 5.1 대시보드 셸 (`feat-1-001`)
- 5.4.A.1 조문 데이터 모델 (`feat-4-A-101, 102`)
- 운영자 placeholder (`feat-7-001`)
- 메뉴별 placeholder 화면

### M2 — 핵심 학습 (특허법 우선) (4~6주)
**목표**: 특허법 한 과목 한정으로 조문/판례/문제 학습 + 강사 콘텐츠 등록 풀스택.

- 5.4.A 전체 P0 (조문 뷰어 · 판례 상세 · 문제 풀이)
- 5.7 운영자 콘텐츠 등록 P0 (`feat-7-004~006`)
- 5.3 최신 정보 P0 (법 개정/최근 판례)
- 5.1 대시보드 P0 보강

### M3 — 5과목 확장 + 대시보드 완성 (3~4주)
- 5.4.A 전체 5과목 시드 데이터
- 5.1 대시보드 P0 전부 + 자연과학 카드(P1)
- 5.2 학습목표 메뉴 P1
- 5.3 최신 정보 P1 (객관식/주관식/논문)

### M4 — 자연과학 + 운영 고도화 (3~4주)
- 5.4.B 자연과학 P1 전부
- 5.7 운영자 P1 (반 관리, 학생 진도, 공지)
- P1 항목 순차

### M5+ — 확장
- 5.5 온라인 GS, 5.6 커뮤니티 본격
- P2 항목 (그래프 시각화, 유사 문제 추천 등)

---

## 7. 결정 사항

- ✅ 메뉴 구조는 7개 최상위 (대시보드/학습목표/최신정보/과목별학습/온라인GS/커뮤니티/운영자)
- ✅ 과목별 학습 진입은 계층(과목군 → 과목 → 학습탭)
- ✅ 법률 5과목은 동일한 3탭(조문/판례/문제) 구조 공유
- ✅ 자연과학 4과목은 문제만 (조문·판례 개념 없음)
- ✅ 산업재산권법은 그룹핑 노드, 실제 학습은 특허/상표/디자인 단위
- ✅ 학생도 운영자 메뉴는 보이되 권한 안내 화면 (메뉴 자체 숨김 X)
- ✅ "최신 정보"는 법 개정/판례/문제/논문 4종을 통합 추적
- ✅ 조문 본문은 `article_revisions`에만 저장. `articles`는 구조만
- ✅ 발행된 `article_revisions`는 DB 트리거로 불변 강제
- ✅ 주석(북마크/메모/하이라이트)은 polymorphic
- ✅ `cases.subject_laws`는 배열 (다과목 판례 대응)

## 8. 오픈 이슈 (결정 필요)

| 항목 | 옵션 | 결정 |
|------|------|------|
| 법령 원문 저장 (조문 본문) | (a) 마크다운 (b) 구조화 JSON (c) HTML | 🔲 |
| 조문 트리 path 저장 | (a) ltree (b) materialized path 문자열 | 🔲 |
| 판례 전문 검색 | (a) Postgres tsvector + pg_trgm (b) pgvector | 🔲 |
| 주관식 채점 | (a) 강사 수동 (b) 자기 채점 + 강사 리뷰 (c) 키워드 매칭 보조 | 🔲 |
| Cloudflare Workers ↔ Postgres | (a) postgres-js TCP (b) Supabase Data API | 🔲 |
| 결제/수강권 v1 필수? | 외부(계좌이체)로 충분할 수 있음 | 🔲 |
| 자연과학 문제의 도식/수식 | (a) MathJax/KaTeX (b) 이미지 (c) 둘 다 | 🔲 |
| 논문 PDF 저장 위치 | (a) Supabase Storage (b) 외부 링크만 | 🔲 |

---

## 부록 A — 화면별 라우트 매핑

| 메뉴 경로 | 라우트 | 주요 feature |
|----------|--------|-------------|
| 대시보드 | `/dashboard` | feat-1-* |
| 학습목표 및 진도 | `/goals` | feat-2-* |
| 최신 정보 (법 개정) | `/latest/laws` | feat-3-1* |
| 최신 정보 (판례) | `/latest/cases` | feat-3-2* |
| 최신 정보 (객관식) | `/latest/mcq` | feat-3-3* |
| 최신 정보 (주관식) | `/latest/essay` | feat-3-4* |
| 최신 정보 (논문) | `/latest/papers` | feat-3-5* |
| 최신 정보 (도서 추록/정오표) | `/latest/book-updates` | feat-3-6* |
| 민법 학습 | `/subjects/civil` | feat-4-A-* |
| 특허법 학습 | `/subjects/patent` | feat-4-A-* |
| 상표법 학습 | `/subjects/trademark` | feat-4-A-* |
| 디자인보호법 학습 | `/subjects/design` | feat-4-A-* |
| 민사소송법 학습 | `/subjects/civil-procedure` | feat-4-A-* |
| 자연과학 (물리) | `/subjects/science/physics` | feat-4-B-* |
| 자연과학 (화학) | `/subjects/science/chemistry` | feat-4-B-* |
| 자연과학 (생물) | `/subjects/science/biology` | feat-4-B-* |
| 자연과학 (지구과학) | `/subjects/science/earth-science` | feat-4-B-* |
| 조문 뷰어 | `/subjects/:subject/articles/:articlePath` | feat-4-A-105 |
| 판례 상세 | `/subjects/:subject/cases/:caseId` | feat-4-A-205 |
| 문제 풀이 Runner | `/subjects/:subject/quiz/runner` | feat-4-A-304~306 |
| 온라인 GS | `/gs` | feat-5-001 |
| 커뮤니티 | `/community` | feat-6-001 |
| 운영자 진입 | `/admin` | feat-7-001 |
| 콘텐츠 관리 허브 | `/admin/content` | feat-7-002 |
| 법 개정 워크스페이스 | `/admin/content/laws/:lawCode/revisions/:id` | feat-7-004 |
| 판례 등록/수정 | `/admin/content/cases/:id?` | feat-7-005 |
| 문제 출제 | `/admin/content/problems/:id?` | feat-7-006 |
| 반 관리 | `/admin/cohorts/:id?` | feat-7-009 |
| 사용자 관리 | `/admin/users` | feat-7-012 |

---

## 부록 B — 상세 스펙 문서 분할 계획

본 SPEC.md는 로드맵·결정사항·메뉴 구조의 SSoT. 각 메뉴 단위 작업이 시작될 때 다음 상세 스펙 문서로 분리한다.

| 분할 문서 | 다루는 메뉴 | 상태 |
|----------|------------|------|
| `docs/spec-detail-foundation.md` | 5.0 인프라 | 🔲 |
| `docs/spec-detail-5-1-dashboard.md` | 5.1 대시보드 | 🔲 |
| `docs/spec-detail-5-2-goals.md` | 5.2 학습목표 및 진도 | 🔲 |
| `docs/spec-detail-5-3-latest.md` | 5.3 최신 정보 5탭 | 🔲 |
| `docs/spec-detail-5-4-subjects-A.md` | 5.4.A 법률 과목 학습 (PPT 운영계획 반영, 14개 결정사항 확정) | ✅ |
| `docs/spec-detail-5-4-subjects-B.md` | 5.4.B 자연과학 | 🔲 |
| `docs/spec-detail-5-7-admin.md` | 5.7 운영자 | 🔲 |

### 보조 문서 (5.4 가 의존)

| 문서 | 다루는 영역 | 상태 |
|---|---|---|
| `docs/db-schema.md` | 전체 DB 스키마 SSoT (테이블·인덱스·RLS·트리거·마이그레이션 순서) | ✅ |
| `docs/article-tree.md` | 조문 트리 저장(ltree)·식별자 변환·시점 조회·체계도 토글 | ✅ |
| `docs/relations.md` | 5종 link 테이블·방향성·양방향 union 조회·정합성 트리거 | ✅ |
