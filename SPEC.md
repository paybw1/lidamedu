# SPEC.md — 리담변리사학원 (변리사 학습 플랫폼)

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
- **1차 시험**: 객관식. 산업재산권법(특허·상표·디자인보호법), 민법, 자연과학(물리/화학/생물/지구과학 **4과목 모두 필수**)
- **2차 시험**: 주관식/논술. 산업재산권법, 상표법, 민사소송법 등
- **자연과학**: 1차 필수과목 (4과목 모두 응시). 변리사 시험에서 조문/판례 개념 없이 **객관식 문제만** 다룸

### 범위 외 (YAGNI, v1에서 제외)
- 라이브 강의/영상 스트리밍 (외부 링크 위임)
- 다국어
- 해외 결제
- AI 자동 해설 생성 (단, 콘텐츠 검색 기반 RAG 질의응답은 §5.9 feat-9 로 별도 계획 — v1 이후)

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

4단계 등급 — **원장 > 관리자 > 강사 > 수험생** (`user_role` enum `admin/manager/instructor/student`). 상세: `docs/features/feat-7-031-roles.md`.

| 기능 | 수험생 | 강사 | 관리자 | 원장 |
|------|:-----:|:---:|:-----:|:---:|
| 콘텐츠(조문/판례/문제/논문) 읽기 | ✅ | ✅ | ✅ | ✅ |
| 본인 메모/즐겨찾기/하이라이트/진도 | ✅ | ✅ | ✅ | ✅ |
| 콘텐츠 CRUD (조문 개정·판례·문제·논문·연관관계·빈칸) | ❌ | ✅ | ✅ | ✅ |
| 온라인 GS 운영·채점 | ❌ | ✅ | ✅ | ✅ |
| 반·커리큘럼·과제·학생 진도 | ❌ | 자기 반 | 전체 | 전체 |
| 커뮤니티 모더레이션 | ❌ | (반 한정) | ✅ | ✅ |
| 사용자 목록·공지·감사 로그·합격데이터 운영·인증 | ❌ | ❌ | ✅ | ✅ |
| 결제·수강 내역 조회 / 수강권 부여·환불 | ❌ | ❌ | ✅ | ✅ |
| 요금제·가격·PG 설정 | ❌ | ❌ | ❌ | ✅ |
| 역할 변경·강사 임명 | ❌ | ❌ | ❌ | ✅ |
| 운영자 메뉴 진입 | (안내) | ✅ | ✅ | ✅ |

> 역할 변경은 원장 전용(`updateUserRole` API) + `profiles` 트리거로 self-escalation 차단. RLS 는 `private.is_staff`(강사+)·`private.is_manager`(관리자+) 함수로 등급 판정.

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
| feat-000-001 | React Router 7 + Vercel SSR 부트스트랩 | P0 | ✅ |
| feat-000-002 | Supabase Auth (이메일/비밀번호, 매직링크, 소셜) | P0 | ✅ |
| feat-000-003 | Drizzle + Supabase 연결, RLS 기본 정책 | P0 | ✅ |
| feat-000-004 | `profile` 테이블 + 역할(student/instructor/admin) | P0 | ✅ |
| feat-000-005 | 역할 기반 가드 (`requireAuth`, `requireRole`) | P0 | ✅ |
| feat-000-006 | shadcn/ui 도입 + 테마(라이트/다크) | P0 | ✅ |
| feat-000-007 | 상단 네비게이션 (메뉴 트리, 드롭다운, 모바일 햄버거) — 7 top-level 그룹핑(`d33a08e`) | P0 | ✅ |
| feat-000-008 | Resend 연동 + 가입/비밀번호 재설정 템플릿 | P0 | ✅ |
| feat-000-009 | 전역 검색 — Command Palette (⌘K, 조문/판례/문제 통합) + 검색 ranking + 최근 검색어 히스토리 | P1 | ✅ |
| feat-000-010 | Sentry 에러 모니터링 (`@sentry/react-router` + browser/node profiling) | P1 | ✅ |
| feat-000-011 | 콘텐츠 공통 스키마 (`articles`, `article_revisions`, `cases`, `problems`) | P0 | ✅ |
| feat-000-012 | Polymorphic 주석 시스템 (북마크/메모/하이라이트, target_type/id) | P0 | ✅ |
| feat-000-013 | 5종 연관관계 스키마 + RLS | P0 | ✅ |
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
| feat-2-008 | 통합 학습 통계 페이지 (`/study/stats`) — 학습관리 메뉴의 "빈칸 학습 통계"를 "학습 통계"로 격상. 변리사 시험 차수(1차/2차)로 분리 — **1차 통계**(특허·상표·디자인·민법 + 자연과학) 객관식, **2차 통계**(특허·상표·디자인·민사소송법) 주관식. 탭 4종(한눈에 / 1차 통계 / 2차 통계 / 빈칸·암기). 각 차수 탭 내부에 **조문 + 판례 + 문제** sub-section을 시험 응시 과목으로 필터링해서 노출. 분기는 `LAW_SUBJECTS[code].exam` 필드(first/second/both)로 — 디자인보호법은 "first"였던 메타데이터를 "both"로 정정(`feat-2-008` 동반 fix). 한눈에=getOverallProgress+getDashboardKpis+getAllSubjectsProgress+getDailyStudyStats+getStudyAidCounts+자연과학(1차)+주관식(2차) 두 표. 신규 쿼리=getArticleStudyStats / getCaseStudyStats / getUserSubjectiveStats(study/queries.server.ts). 빈칸·암기=BlankStatsTabs 컴포넌트 추출하여 기존 4 sub-tab(내용/주체/시기/암기) 흡수. /study/blanks 라우트는 유지 + `/study/stats?tab=blanks` 로 redirect. | P1 | ✅ |

상세 스펙: `docs/spec-detail-5-2-goals.md` (작성 예정), `docs/features/feat-2-008-study-stats.md`.

---

## 5.3 메뉴: 최신 정보 (`/latest`)

콘텐츠 업데이트를 한 곳에서 추적. 5개 탭(법 개정 / 최근 판례 / 객관식 / 주관식 / 논문) 공통 레이아웃.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-3-000 | 최신 정보 공통 레이아웃 — 각 탭(/latest/laws, /cases, /mcq, /essay, /papers, /book-updates)이 독립 페이지로 구현. 상단 네비게이션이 탭 라우팅 담당. 공통 레이아웃 컴포넌트는 미적용(YAGNI — 각 탭의 필터/색인 형태가 상이) | P0 | ⛔ |
| **5.3.1 법 개정** | | | |
| feat-3-101 | 법 개정 (`/latest/laws`) — PPT 색인 양식 10컬럼 표(No/구분/명칭/법률번호/개정일/시행일/개정이유 O/신구조문대비표 O/개정해설 O/동영상 O). `law_revisions.revision_kind` ENUM(act/decree/rule) — 명칭에 '법령'/'시행령'/'시행규칙' 분기. published 시간순. | P0 | ✅ |
| feat-3-102 | 영향 조문 수 + 내 즐겨찾기 포함 여부 chip | P0 | ✅ |
| feat-3-103 | 첨부 O 클릭 시 행 아래 인라인 panel — 개정이유/개정해설 MarkdownView · 신구조문대비표/개정해설 PDF iframe(70vh) · 동영상 YouTube/Vimeo embed (그 외 URL은 외부 링크). | P0 | ✅ |
| **5.3.2 최근 판례** | | | |
| feat-3-201 | 신규 판례 피드 (선고일 최신순) | P0 | ✅ |
| feat-3-202 | 과목별 필터 + 중요판례 필터 (importance ≥ 3) | P0 | ✅ |
| feat-3-203 | 판례 카드에서 판례 상세로 이동 | P0 | ✅ |
| **5.3.3 객관식 문제** | | | |
| feat-3-301 | 객관식 문제 (PPT 운영계획 반영) — `mcq_packs` 테이블(kind: past_exam/mock_full/mock_progressive/other, subject_scope: industrial/civil/civil_procedure/science, year/exam_round_no/duration_min/video_url/result_doc_url/published_at) + `mcq_pack_problems` (pack↔problem 매핑). `quiz_sessions.pack_id` 추가. RLS: 학생은 published만 read, staff CRUD. `/latest/mcq` 표 색인(No·과목·구분·명칭·출제일·문항), staff inline CRUD. | P1 | ✅ |
| feat-3-302 | 팩 상세 페이지 — `/latest/mcq/:packId` 헤더(과목·구분·명칭·출제일·문항·제한시간) + 동영상/결과자료 카드 + 학습/모의고사 시작 액션 + 문제 목록 (staff: problem_id로 추가/제거). 학습 시작은 quiz_session(mode=study), 모의는 mode=exam + time_limit. | P1 | ✅ |
| feat-3-303 | 팩 응시 결과 통계 — `/latest/mcq/:packId/result/:sessionId`. KPI(본인 정답률/총문항/오답/소요시간). 유형별(단답/박스/사례) + 지문별(조문/판례/이론) 정답률 — 본인 vs 전체 평균. 문제별 본인 정답 + 전체 정답률(get_problem_stats RPC). mock 완료 시 자동 리디렉트. | P1 | ✅ |
| **5.3.4 주관식 문제** | | | |
| feat-3-401 | 신규 주관식 문제 피드 | P1 | ✅ |
| feat-3-402 | 모범답안 보기 + 첨삭 요청 — subjective problem-viewer 의 모범답안/채점기준 reveal + `/api/study/subjective-attempt` autosave + 첨삭 요청 워크플로우 + 강사 알림(이메일 + Kakao Alimtalk). | P1 | ✅ |
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
| feat-4-A-112 | 해설 링크 → 코멘트 탭 활성 — problem-viewer 해설 안의 조문/판례 ref 클릭 시 article-viewer 우측 패널 코멘트 탭으로 진입(comment_target_id 자동 스크롤). | P1 | ✅ |
| feat-4-A-113 | 제목만 보기 (항 단위 본문 접기) | P1 | ✅ |
| feat-4-A-114 | 정오문제 위젯 (객관식 자동 연동 + 별도 업로드, 무작위 노출, 정답+해설) | P0 | ✅ |
| feat-4-A-115 | 코멘트 / 평석 패널 (staff 작성, 학생 read-only, 마크다운) | P0 | ✅ |
| feat-4-A-116 | Q&A 패널 — 동일 공용 컴포넌트(QnaPanel/qna-list). 검색 + 새 질문 → staff 알림 + 답변자 질문수준 평가 상/중/하. | P0 | ✅ |
| feat-4-A-130 | 조문 빈칸 채우기 학습 (article_blank_sets, 빈칸 모드 토글, 입력+채점, 시도 기록). 운영자 편집은 article-viewer "빈칸 자료" 버튼 → 자기 set 자동 생성+편집 / 모든 조문 한 화면(setless 카드도 drag→자동 생성). 매칭: ±30자 컨텍스트 + ANCHOR_LENGTHS=[30,20,12,10,8,6,4] + cross-token cumulative fallback (queries.server.ts collectCumulativeOccurrences) + blockIndex/cumOffset hints 로 정확 위치 추적. 입력 흐름: 정답 commit 후 **자동 focus 이동 제거** — 다음 빈칸은 시각적 highlight(primary ring + pulse) 만 표시, 사용자가 Tab/클릭으로 직접 진입(한국어 IME composer 충돌 우회). leak detection(다른 빈칸 정답 substring) 은 방어선 유지. | P0 | ✅ |

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
| feat-4-A-208 | 판례 전문 검색 — case_number / case_title / nickname / case_type / summary_title / summary_body_md / reasoning_md / comment_body_md 에 pg_trgm GIN 인덱스 + ilike 다중 컬럼 OR. 한국어 부분 매칭 안정 작동. search_tsv(simple config) 는 generated 컬럼으로 유지 — 향후 정확 매칭 ranking 도입 시 활용 가능. | P1 | ✅ |
| feat-4-A-209 | 판례 색인 화면 (테이블 — 중요·법원·선고일·사건번호·사건유형·닉네임+사건명+기출 chip·전합). 1차 기출 chip 은 출제문제 링크(클릭 시 문제 뷰어, feat-8-024), 2차는 연도 배지. 검색·정렬·기출 필터·페이지네이션(50/페이지). | P0 | ✅ |
| feat-4-A-210 | 판례 트리 진입 — cases 탭 좌측 사이드바: 조문 트리 + 체계도(SortAxisToggle 공유). 각 노드별 leaf 카운트(판례 수). 클릭 시 `?case_article` / `?case_chapter` / `?case_node` URL 파라미터로 필터링 + 필터 활성 chip + 전체 보기 해제 버튼. chapter 는 자손 article 합산, systematic 노드는 부분트리 article 합산(중복 제거). 0건 노드는 hide. | P1 | ✅ |
| feat-4-A-211 | 판결전문 PDF 뷰어 — cases.full_text_pdf URL 이 있으면 case-viewer 본문에 iframe 임베드(80vh) + "새 탭에서 열기" 버튼. 미첨부 case 는 섹션 자체 숨김. | P0 | ✅ |
| feat-4-A-212 | 관련문제 패널 — case-viewer 우측 패널 "유사 문제" 탭: `getRelatedProblemsByCase` (article_case_links 가 가리키는 article 의 primary_article_id 문제 12건). 1차/2차 양방향 링크는 explicit problem_case_links 모델 추가 시 보강. | P0 | ✅ |
| feat-4-A-213 | 비고/코멘트(평석) 출처/내용 분리 — comment_source 가 있으면 본문 위에 별도 박스(왼쪽 border-l)로 노출. 내용은 HighlightOverlay 로 wrap. | P0 | ✅ |
| feat-4-A-214 | 관련논문/기사 링크 — `case_references` 테이블(kind: paper/article/other, title/authors/source/publishedAt/url/pdfUrl/note/ord). case-viewer 본문에 패널 추가, 학생은 read-only (외부 링크 + PDF 열기 버튼). staff(instructor/admin) 는 inline 추가/수정/삭제. API: `/api/admin/case-reference` (create/update/delete). RLS: public read, staff write. | P1 | ✅ |
| feat-4-A-215 | Q&A 패널 — 우측 패널 통합(article/case/problem 공용). qna-list 검색 + 필터(scope/target/q). 새 질문 → 모든 staff fanout 알림(이메일+카카오 Alimtalk). 답변 시 질문수준 평가 상/중/하(qna_quality_grade) + asker 알림. | P0 | ✅ |
| feat-4-A-216 | 판례 닉네임 — `cases.nickname`(중요 판례 통칭, 예: 수지상 세포 사건. 선택·≤100자). 색인 목록·상세 뷰어에서 사건명 앞 amber 라벨로 표시, admin-case-edit 입력란 + `/api/admin/case` 저장, 전문 검색(feat-4-A-208) 대상 포함. | P1 | ✅ |

### 5.4.A.3 — 문제 탭

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-4-A-301 | 문제 데이터 모델 — `problems` + 4유형(mc_short/mc_box/mc_case + ox + blank + subjective). enum problem_format 에 6종 모두 포함. OX 는 별도 풀이 흐름 (feat-4-A-313 /:subject/ox), blank 는 feat-4-A-130, subjective Runner 는 feat-4-A-305 (P1) 별도. | P0 | ✅ |
| feat-4-A-302 | 문제 KPI — subject hub 헤더 칩에 "문제 N · 풀이 N · 정답률 N%" + ProblemsTab 카드 3종(출제·내 풀이·정답률). problemStats(getUserProblemStats) 기반. | P0 | ✅ |
| feat-4-A-303 | 퀴즈 설정 폼 (유형/연도/극성/문항수/모드) + 오답만 모드 | P0 | ✅ |
| feat-4-A-304 | 문제 풀이 Runner — 객관식 (mc_short) | P0 | ✅ |
| feat-4-A-305 | 문제 풀이 Runner — 주관식 (자기채점 + 첨삭 요청). problem-viewer subjective 분기 + 답안 textarea autosave (`/api/study/subjective-attempt`) + 자기채점 점수 입력 + 모범답안/채점기준 reveal + 첨삭 요청 액션 + 시간제한 응시(타이머 + 자동 제출). | P1 | ✅ |
| feat-4-A-306 | 학습 모드 (즉시 해설) vs 시험 모드 (타이머 + 일괄 제출) | P0 | ✅ |
| feat-4-A-307 | 풀이 결과 화면 + 오답 노트 자동 수집 | P0 | ✅ |
| feat-4-A-308 | 문제 북마크·메모·하이라이트 (polymorphic 패널) | P0 | ✅ |
| feat-4-A-309 | 유사 문제 추천 (같은 primary_article) | P2 | ✅ |
| feat-4-A-310 | 객관식 색인 화면 — 정렬·필터·난이도·본문 검색 | P0 | ✅ |
| feat-4-A-311 | 분류 라벨 시스템 (기출/변형/예상/모의 × 단원/종합 × 단답/박스/사례 × 긍정/부정). problems 테이블 origin/scope/format/polarity 4 enum + 운영자 편집 폼 + 학생/운영자 색인 4축 필터 + 학생 색인 표에 4축 모두 노출. 시드 데이터 97.86% 라벨링 완료. | P0 | ✅ |
| feat-4-A-312 | 정답률 기반 난이도 동적 계산 (RPC + 5단계 버킷) | P0 | ✅ |
| feat-4-A-313 | 지문별 색인 (problem_choice 자식 entity) + 정오문제 자동 연동 (article 패널 + /:subject/ox 페이지) | P0 | ✅ |
| feat-4-A-314 | 해설 — 지문별 O/X + 분류(조문/판례/실무) + 링크 | P0 | ✅ |
| feat-4-A-315 | 동영상 풀이 (강사 업로드, 문제 우측 패널) — problem-viewer 우측 패널 동영상 임베드(YouTube/Vimeo URL) + admin-problem-edit 폼에 video_url 컬럼. | P1 | ✅ |
| feat-4-A-316 | Q&A 패널 — 공용 QnaPanel. ArticleRightPanel 통해 problem 타깃도 동일 흐름. | P0 | ✅ |
| feat-4-A-320 | 주관식 색인 화면 (기출+모의 통합 테이블) — 과목 hub의 ProblemsTab 하단 "2차 주관식" 카드. `listProblemsBySubject` 가 반환하는 problems 중 `examRound='second'` 인 항목(secondRound)을 카드 리스트로 노출. SubjectiveCard 컴포넌트(주관식 배지·출처·연도/번호·subjective_kind·기본 조문 chip + 논점/본문 snippet/풀이 CTA). 기존 hub 필터(origin/year/format/polarity/scope/search)와 동일 필터 적용. exam !== 'first' 과목(특허·상표·디자인·민소법)에만 노출. 빈 상태는 필터 적용 시/미적용 시 안내 분기. | P1 | ✅ |
| feat-4-A-321 | 주관식 분류 라벨 (기출/변형/예상, 키워드, 사례·논점) — `problems.subjective_kind`(case_study/issue_set/discussion) + `subjective_keyword` 컬럼 + /latest/essay 필터. 색인은 /latest/essay 가 담당(과목 hub 의 ProblemsTab 은 MC 만 — feat-4-A-320 별도). | P1 | ✅ |
| feat-4-A-322 | 채점기준·모범답안·채점결과 우측 패널 — subjective problem-viewer 의 model answer + rubric reveal + self-score 입력 + 채점 체크리스트. admin-problem-edit 에서 모범답안/채점기준 작성. | P1 | ✅ |
| feat-4-A-323 | 답안 작성 시간제한·자동 저장 — 시간제한 응시 모드(타이머 + 만료시 자동 제출) + 답안 textarea autosave(debounce → `/api/study/subjective-attempt`). | P1 | ✅ |
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
| feat-4-B-006 | 자연과학 문제 풀이 Runner — `/subjects/science/:subject/problems/:id` 최소 viewer (선지 4지 + 정답·해설 + 세션 prev/next). KaTeX 수식 렌더 적용(`$...$`/`$$...$$`/`\(...\)`). 도식 이미지는 problem.body markdown 으로. | P1 | ✅ |
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
| feat-6-001 | 커뮤니티 메뉴 라벨 + Placeholder 화면 — `/community` ComingSoon 컴포넌트 사용. | P0 | ✅ |
| feat-6-002 | 커뮤니티 게시판 3종 (자유게시판·스터디 모집·합격 후기) — 단일 `community_posts`+`community_post_comments`+`board` enum. `/community` 허브 + `/community/:board` 목록·검색 + 작성/수정 + 상세·댓글. RLS 하이브리드(인증 전체 읽기 + 본인 쓰기 + manager 모더레이션·고정), soft delete, `public_profiles` 뷰로 작성자 표시. 상세: `docs/features/feat-6-002-community-boards.md`. | P1 | ✅ |
| feat-6-XXX | (잔여) 좋아요·첨부·알림·페이지네이션 등 게시판 v2 | P2 | 🔲 |

---

## 5.7 메뉴: 운영자 (`/admin`)

학생도 메뉴는 보이되 진입 시 권한별 안내. 강사/원장은 본격 운영 화면.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-7-001 | 운영자 메뉴 진입 가드 — `/admin` loader 가 staff role 확인. 비로그인은 /login 리다이렉트, 학생은 권한 안내 화면(추천 액션 — 대시보드/특허법/최신 정보/학습 목표 링크). | P0 | ✅ |
| feat-7-002 | 콘텐츠 관리 허브 — 콘텐츠 등록·수정(빈칸/문제/판례 매핑/MCQ 팩/논문/도서 추록·정오표) + 통계 분석 + 온라인 GS 3개 섹션으로 정리. 각 카드에 진입 링크 + "최신 정보" 배지. | P0 | ✅ |
| feat-7-003 | 강사 대시보드 (반 진도, 콘텐츠 현황) — `/admin` 운영자 허브가 staff 본인의 콘텐츠 통계(getStaffContentStats — 작성한 문제/판례/논문/도서 자료 수) + 반 진도(feat-7-010 `/admin/cohorts/:id/progress`) 진입점을 제공. | P1 | ✅ |
| feat-7-004 | 법 개정 워크스페이스 — `/admin/laws/:lawCode/revisions` 일람 + 새 초안 생성. `/admin/laws/:lawCode/revisions/:revisionId`: 조문 추가(현재 본문 자동 복사 / bulk add — 콤마/줄바꿈 구분 최대 50개) · 자동완성(조 번호/조 제목 검색 + 이미 추가 여부 안내) · 변경 종류(신설/개정/폐지) · **시각 편집기**(ArticleBlockEditor 재사용 — 카드별 텍스트 + 마커 `__밑줄__`/`[강조]`/`((소제목))` + 미리보기) ↔ JSON 모드 토글 · **Diff highlight**(before/after LCS 라인 diff, 추가/삭제 색칠) · **장/절 자동 그룹화**(path 의 chapter prefix 로 묶음 헤더) · **발행 전 체크리스트**(개정번호/조문≥1/본문변경/개정이유/신구조문대비표/개정해설/동영상 7종 점검) · 발행 dialog. **첨부 PDF 파일 업로드** — `law-revision-files` 버킷(public, 30MB, PDF only) + 정책. RPC `publish_law_revision` 가 transactional 발행 + article_revisions 불변 트리거. | P0 | ✅ |
| feat-7-005 | 판례 등록/수정 폼 — `/admin/cases/edit` (신규) / `/admin/cases/edit/:caseId` (수정). 사건번호/사건명/법원/선고일/전합/중요도/사건유형/1·2차 기출연도/요지·이유·비고 Markdown/판결전문 PDF URL. POST `/api/admin/case` (create/update/delete soft). 관련 조문 매핑은 `/admin/cases?law=` 또는 `/admin/relations/*` 별도 진입. 기존 판례 수정 진입점 — 판례 매핑 카드(`/admin/cases`)의 "수정" 링크 · 판례 뷰어 staff "수정" 버튼. | P0 | ✅ |
| feat-7-006 | 문제 출제 폼 — `/admin/problems/new` 최소 메타(과목·차수·출처·유형·극성·scope·연도·회차·번호·지문수) + 본문 입력 → INSERT (mc 계열은 빈 choices 자동 생성) → `/admin/problems/:problemId` 상세 편집으로 redirect. 상세 편집에서 지문·해설·연관 조문/판례 매핑 진행. | P0 | ✅ |
| feat-7-007 | 논문 등록/수정 폼 — feat-3-502 가 흡수 (/latest/papers staff inline 폼 + `/api/admin/paper`). | P1 | ✅ |
| feat-7-008 | 연관관계 일괄 편집 — TSV/CSV bulk import (`/admin/relations/bulk`). 5종 link 테이블(article-article/article-case/case-case/problem-article/problem-case) 전부 지원. dry-run preview + commit. | P1 | ✅ |
| feat-7-009 | 반/기수 관리 — `cohorts` (name/description/owner_id/starts_on/ends_on/is_archived) + `cohort_members` (N:M). RLS: admin 전부, instructor 본인 소유, student 자기 row read. `/admin/cohorts` 카드 일람 + 신규/수정 폼, `/admin/cohorts/:id` 상세에 멤버 목록 + 학생 검색 추가/제거. | P1 | ✅ |
| feat-7-010 | 학생 진도 모니터링 — `/admin/cohorts/:id/progress` 반 학생 요약 테이블(문제 풀이·정답률·조문 열람·빈칸·최근 활동) + KPI 4종. `/admin/students/:profileId` 학생 상세(과목별·자연과학별 진도, 최근 12건 활동, 빈칸 통계). admin client 로 RLS 우회, staff 권한 검사는 loader 에서. | P1 | ✅ |
| feat-7-011 | 공지사항 발송 — `announcements` + `announcement_audiences` (대상 종류: all/cohort/user) + `announcement_reads` (PK announcement_id, profile_id). RLS: staff(admin 전부 / instructor 본인 작성분) write, 일반 사용자는 자기에게 발송된 published 만 read (audience 측 RLS 가 join 필터링). `/admin/announcements` 인라인 작성 폼(전체/반 다중선택/사용자 검색·태그) + 발행/언발행/삭제 + 고정. 학생은 `/announcements` 수신함에서 카드 펼침 시 자동 읽음 처리. | P1 | ✅ |
| feat-7-012 | 사용자 관리 — `/admin/users` admin 전용. listAdminUsers (admin client 로 auth.users + profiles 조인) + 검색·역할 필터 + 페이지네이션. 인라인 select 로 역할 변경(student/instructor/admin), 본인 강등 차단. | P1 | ✅ |
| feat-7-013 | 강사 권한 관리 — feat-7-012 에 통합 (admin 이 user role 을 instructor 로 승격/강등). | P1 | ✅ |
| feat-7-014 | 수강권/결제 관리 (admin 전용) | P2 | 🔲 |
| feat-7-015 | 감사 로그 — `audit_logs` 테이블 + 운영자 액션(콘텐츠 CRUD, 사용자 역할 변경, 공지 발송, 법 개정 발행) 추적. admin 전용 조회 화면. | P2 | ✅ |
| feat-7-016 | 5과목 시드 진행률 카드 — `/admin` 운영자 허브 상단. `admin_subject_coverage` RPC: 과목별(조문/판례/객관식/주관식/평석/발행 개정) 카운트. 막대 그래프(최댓값 대비) + tone 색상(0=rose / <10%=amber / <50%=sky / 그 외=emerald). 각 행에 "완성도 진단 →" deep link. | P1 | ✅ |
| feat-7-017 | 법령 완성도 진단 — `/admin/laws/:lawCode/completeness`. `admin_law_completeness` RPC: 실 조문(level='article') 기준 미커버 카운트(현행 revision / 빈칸 / 평석 / 관련조문 / 관련판례 / primary 문제 / 판례 요지·매핑 / 객관식 해설 / 주관식). 3섹션(조문/판례/문제) × 11차원 카드. 각 차원에 진행률 막대 + 미커버 카운트 + 작업 도구 deep link. tone: ≥95% 에메랄드 / ≥50% 앰버 / 그 외 로즈. | P1 | ✅ |
| feat-7-018 | 자동 백필 RPC 2종 — staff 권한 가드. (1) `backfill_article_article_links_from_body` — body_json 의 inline `ref_article` 노드를 jsonb_path_query 로 재귀 추출 → `article_article_links` `cross_reference` 백필. (2) `backfill_article_case_links_from_body` — 판례 본문(요지/이유/평석) "(법명) 제N조(의X)?" 자연어 패턴 추출 → `article_case_links` `cites` 백필. 완성도 페이지 헤더 버튼 2개로 수동 재실행. | P1 | ✅ |
| feat-7-019 | 반/기수 통계 모니터링 (`/admin/cohorts/:id/stats`) — feat-7-010 진도(학생별 행)와 분리된 cohort 평균/분포 종합 화면. 평균 KPI(평균 정답률·평균 시도·평균 조문 열람·최근 7일 활동 학생수). 정답률 5구간 분포(80+/60-79/40-59/20-39/0-19) 막대. **최근 4주 주별 추이 차트**(`getCohortAccuracyTrend` — 주별 정답률 막대 + 시도/활동 학생수). 5과목 평균 표(평균 시도·평균 정답률·평균 조문 열람). 상/하위 5명 카드(정답률 기준). 학생 detail(`/admin/students/:profileId`)에 **반 평균 대비 비교 카드**(`getStudentCohortComparisons` — 정답률·시도·조문 열람 차이 chip + 분위 badge + 반 통계 deep link). 신규 함수 3종 (`getCohortAggregateStats`/`getCohortAccuracyTrend`/`getStudentCohortComparisons`) 모두 admin client RLS 우회. cohort-detail 과 progress 양쪽에 진입 링크. e2e: `e2e/admin/cohort-stats.spec.ts`. | P1 | ✅ |
| feat-7-020 | **커리큘럼 / 학습 플랜** — 학원이 짠 N주 학습 트랙을 cohort 에 적용. **1차 종합반 우선** (객관식·빈칸·암기·조문/판례·강의). 2차(주관식)는 후속. `curricula`(이름·기간·소유자) + `curriculum_weeks`(주차·제목·목표) + `curriculum_items`(주차별 학습 단위: article/case/problem/blank_set/recitation/lecture 중 하나, kind 별 CHECK constraint) + `cohort_curricula`(cohort 적용·시작일). lecture 는 인라인 메타(title/url/duration_min) — 통합 LMS 는 후속. 운영자: `/admin/curricula` 목록 + `/admin/curricula/:id` 편집(메타·발행·주차/항목 CRUD) + cohort detail 에서 "커리큘럼 적용" + 시작일. **항목 reference 선택은 `ContentPicker` 검색 UI**(`/api/admin/search-content?kind=...&q=...` — article/case/problem/blank_set 라벨 검색 + 선택). | P0 | ✅ |
| feat-7-021 | **과제 배포** — cohort 단위. **자동(커리큘럼 주차 → 과제 변환) + 수동(임의 신규) 병행**. `assignments`(제목·설명·할당일·마감일·source_curriculum/source_week 추적) + `assignment_items`(학습 단위) + `assignment_submissions`(학생별 상태: pending/partial/completed + 완수 시각, cache). 자동 채점/완수 판정(`recomputeSubmission`) — 문제는 정답 1번 이상, 빈칸은 모든 blank_idx 정답, 조문/판례는 study_sessions 방문 1회, 암기는 user_recitation_attempts.is_complete=true. 운영자: `/admin/cohorts/:id/assignments` CRUD + 커리큘럼 주차 자동 변환 폼 + `/admin/cohorts/:id/assignments/:aid` 편집·학생 진척. 학생: 대시보드 "마감 임박 과제" 배너 + `/assignments` 본인 과제함 + `/assignments/:id` 상세(자동 완수 진척 막대 + **항목별 진입 URL** — article/case/problem/blank_set/recitation 각각 학습 화면으로 직접 진입). 알림 fanout: assignment 생성 시 `announcements` + `announcement_audiences(cohort)` 자동 발송(best-effort). **자동 주간 cron**(`/api/cron/curriculum-weekly`, CRON_SECRET 보호) — 활성 cohort_curricula 별로 현재 주차 계산(KST start_date 기준) → 미발송 주차를 자동 변환. 외부 cron(Vercel Cron/pg_cron/GitHub Actions)에서 매주 호출. e2e: `e2e/admin/curriculum-assignments.spec.ts`. | P0 | ✅ |
| feat-7-022 | **자동 주간 리포트** — 매주 월요일 학생/강사 이메일. 학생: 본인 진척·정답률·streak·약점 top3·미완 과제 top3 + 대시보드 deep link. 강사: cohort 평균 KPI·비활성 학생 명단·이번 주 과제 완수율. React Email 템플릿 2종 (`weekly-report-student/staff.tsx`) + `dispatchWeeklyReports` (notify.server.ts) + `/api/cron/weekly-reports` (CRON_SECRET 보호). notify_channels.email 활성자만. Resend 사용. | P1 | ✅ |
| feat-7-023 | **비활성 학생 자동 알림** — 7일+ 미접속 학생을 staff(cohort owner) 인박스에 push. `staff_notification_kind` enum 에 `cohort_inactive_alert` 추가. `/api/cron/inactive-alert` (CRON_SECRET, `?inactiveDays=N` 매개) → 활성 cohort 순회 → `listCohortProgressSummary` 의 lastActivityAt 기준 필터 → 1명 이상 시 staff inbox 알림 1건 (cohort progress 페이지 deep link). 이메일은 feat-7-022 weekly-report 에 포함되어 중복 안 함. | P1 | ✅ |
| feat-7-024 | **합격 진단 점수** — 학생 대시보드 KPI. 가중평균 모델(`predictPassScore`). **GS 응시 기록이 있으면 5요소**(학습량 25 + 정답률 25 + GS 30 + 활성도 10 + 완수 10), **없으면 4요소**(학습량 40 + 정답률 40 + 활성도 10 + 완수 10) = 0~100점. rating 4단계(안정 80+/가능 60+/주의 40+/취약). 대시보드 상단 큰 카드 — 점수 + tone + component 막대 + hint. `getUserGsAveragePct` 가 채점 완료 GS 응시의 (total_score / round max_score) 평균. **`/study/stats` 한눈에 탭에 최근 12주 정답률 추이 미니 차트**(`getUserAccuracyTrend` — KST Monday 주별 막대). | P1 | ✅ |
| feat-7-025 | **1:1 상담 코멘트** — 강사가 학생에게 비공개 메모. `student_notes` 테이블(student_id/author_id/body_md/visibility/is_pinned). visibility=`staff_only`(강사만)/`share_with_student`(학생도 read). RLS: author 본인 + admin 전부 CRUD, 학생 본인은 공유된 코멘트만 read. `/api/admin/student-note` CRUD + `/admin/students/:profileId` 코멘트 패널(핀/공유 토글, 작성자 + 시각 표시, edit/delete). | P1 | ✅ |
| feat-7-026 | **cron 엔드포인트 e2e 회귀 보호** — `/api/cron/curriculum-weekly` · `/weekly-reports` · `/inactive-alert` 3개 엔드포인트의 인증(secret 없으면 403, 잘못된 secret 도 403) + 정상 응답 shape(ok + summary). `e2e/admin/cron-endpoints.spec.ts`. CRON_SECRET 환경변수 필수. weekly-reports 는 실제 이메일 발송이라 `RUN_WEEKLY_REPORT_E2E=1` 명시적 opt-in 시만 실행. | P1 | ✅ |
| feat-7-027 | **합격 진단 점수 시계열** — `pass_prediction_snapshots`(user_id/score/rating/components jsonb/snapshot_date PK 일 1회). `/api/cron/pass-predict-snapshot` 일별 호출 → 모든 활성 cohort 멤버 predict + upsert. `getUserPassPredictionTrend` 최근 N일. 학생 `/study/stats` 한눈에 탭 + 운영자 `/admin/students/:id` 에 막대 차트(점수+델타 badge). RLS: 본인 + cohort owner/admin. | P1 | ✅ |
| feat-7-028 | **상담 코멘트 학생 알림 fanout** — `staff_notification_kind` enum 에 `student_note_shared` 추가. `createNote` 시 visibility=share_with_student 면 학생 inbox 알림(best-effort). `updateNote` 시 staff_only → share 로 전환되는 경우만 알림. body preview(120자) + `/inbox` deep link. | P1 | ✅ |
| feat-7-029 | **lecture 시청 추적** — `lecture_views`(user_id/item_id/viewed_at/completed_at/last_position_sec, UNIQUE(user,item)) + `/api/student/lecture-progress`(view/complete/position) + `/lectures/:itemId` 학생 viewer. YouTube/Vimeo URL 자동 embed(toEmbedUrl). 페이지 진입 시 자동 view 기록 + "수강 완료" 버튼. RLS: 본인 R/W + cohort owner/admin read. **YouTube/Vimeo postMessage 자동 진행률 추적**(`TrackedLectureFrame` 컴포넌트) — YouTube 는 `enablejsapi=1` + `event:"listening"` 핸드셰이크 + `getCurrentTime`/`getDuration` 5초 폴링 + `infoDelivery` 수신. Vimeo 는 `method:"addEventListener", value:"timeupdate"` 구독 + `timeupdate` 이벤트 수신. 위치 저장 15초 임계 + 시청 비율 ≥85% 시 자동 완료 마킹. `pagehide` 시 `navigator.sendBeacon` 으로 최종 위치 flush. 재진입 시 마지막 위치(`?start=N`)부터 재생. | P1 | ✅ |
| feat-7-030 | **이번 주 트랙 학생 카드** — 대시보드 상단. 학생이 멤버인 cohort 의 활성 cohort_curricula 에서 KST 기준 weekNumber(`floor((today - start_date)/7)+1`) 계산 → `curriculum_weeks` + `curriculum_items` 노출. 항목별 진입 URL(`/subjects/.../articles/:n`, `/subjects/.../cases/:id`, `/subjects/.../problems/:id`, `/subjects/.../articles/:n?blank=...`, `/subjects/.../articles/:n?recitation=1`, `/lectures/:itemId`). 항목별 완수 표시 — lecture_views(completed_at) / study_sessions(article·case) / user_problem_attempts(is_correct) / user_blank_attempts(전 칸 정답) / user_recitation_attempts(is_complete). 자동 생성된 assignment 가 있으면 "과제로 보기" deep link. `getCurrentWeekTrack(userId)` (curricula/queries.server.ts). 카드 컴포넌트는 dashboard.tsx 내부(`WeekTrackCard`). | P0 | ✅ |
| feat-7-031 | **4단계 회원 권한 (원장·관리자·강사·수험생)** — `user_role` enum 에 `manager` 추가(등급 student<instructor<manager<admin). 역할 SSOT `app/core/lib/roles.ts`(rank·label) + `requireMinRole` 가드. RLS 약 92개 정책 4단계 재분류(`private.is_staff`=강사+ / `private.is_manager`=관리자+, `subscription_plans` write 만 원장 전용). **`profiles` self-escalation 취약점 차단 트리거** — role 변경은 service_role(운영자 API)만. 관리자=강사+전체 운영, 원장=관리자+역할변경·요금제. 상세: `docs/features/feat-7-031-roles.md`. | P1 | ✅ |

상세 스펙: `docs/spec-detail-5-7-admin.md` (작성 예정).

---

## 5.8 합격 데이터 / 분석 (Phase A — 데이터 캡처)

플랫폼의 최종 가치 = **합격자 데이터 기반 컨설팅**. 그 전제로 합격 결과(연도×차수 단위)와 학습 데이터 분석 활용 동의를 명시적으로 수집·관리. 분석 화면(Phase B)·합격자 비교 컨설팅(Phase C)·결제(Phase D)는 후속.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-8-001 | **exam_results 데이터 모델** — `exam_round`(first/second), `exam_result_status`(absent/pending/failed/passed), `exam_verification_status`(self_reported/document_submitted/verified/rejected) enum + `exam_results`(user_id/exam_year/exam_round/status/self_reported_total_score/self_reported_subject_scores jsonb/verification_status/certificate_path/verified_by/verified_at/rejection_reason/study_summary_md, UNIQUE(user,year,round)). `profiles` 컬럼 추가: `analytics_consent_at`/`next_exam_year`/`next_exam_round`. RLS: 본인 R/W(verification 컬럼 staff 만 변경, verified row 학생 삭제 차단) + cohort owner read + admin all. `exam-certificates` private storage 버킷(<user_id>/<result_id>/*, PDF/PNG/JPEG/WebP, 10MB). `user_notifications.kind` 에 `exam_certificate_submitted` 추가. | P0 | ✅ |
| feat-8-002 | **학생 결과 입력 + 동의 화면** — `/me/exam-results`. 연도×차수별 카드(상태/자가점수/학습 요약). 합격증 업로드(클라가 직접 Supabase Storage 업로드 → `intent=certificate` action 으로 `certificate_path` 첨부 + admin 인박스 알림 fanout). 분석 활용 동의 토글(`analytics_consent_at` set/null). 차기 응시 의향(연도/차수). | P0 | ✅ |
| feat-8-003 | **운영자 결과 일람·인증** — `/admin/exam-results`. 풀 사이즈 카드(합격 인증·합격 자가·불합격·인증 대기·분석 동의). 필터(연도/차수/상태/인증 상태/학생 검색) + 표 + 합격증 signed URL(5분) 열람 + 인증/반려 처리(admin 만). instructor 는 본인 cohort 학생만 read-only. | P0 | ✅ |
| feat-8-004 | **분석 활용 동의 약관** — `/legal/analytics-consent`. 수집 항목/처리 방식/보유 기간/동의 거부 권리/철회 방법/인증 결과 처리 명시 (PIPA §22, §15 1.1 별도 동의). | P0 | ✅ |
| feat-8-005 | **시즌별 결과 입력 알림 cron** — `/api/cron/exam-result-reminder` (CRON_SECRET, ?year=YYYY 옵션). `profiles.next_exam_year`/`next_exam_round` 설정 + 해당 (year,round) `exam_results` 미입력 학생을 후보로 산출 → 14일 throttle(같은 entity_id 알림 14일 내 존재 시 skip) → `user_notifications` insert(kind=`exam_result_reminder`, entity_id=`{year}-{round}`, href=`/me/exam-results`) + `notify_channels='email'` 활성 사용자에 Resend 이메일 발송(템플릿 `exam-result-reminder.tsx`). best-effort — 이메일 실패해도 인박스 알림은 유지. | P1 | ✅ |
| feat-8-006 | **(Phase B 첫 단계) 합격자 케이스 카드 + 통계 시각화** — `/admin/analytics/passers` admin 전용. 합격자 1명당 카드 — 시험 결과·자가 학습 요약·(분석 동의자만) 학습 로그 집계(`computeAggregates`: 응시 전년도~응시 연도 user_problem_attempts/study_sessions/user_blank_attempts/user_recitation_attempts → 풀이수·정답률·시간·활동일수·최장 streak·과목별 풀이 top5·빈칸/암기). 풀 사이즈 카드(합격 총수/인증/동의/표시) + 연도·차수 분포 + 필터(연도/차수/인증만/동의자만). 미동의자는 결과+자가 요약만, 학습 로그는 가림. `listPasserCases`/`getPasserPoolStats` (analytics.server.ts). **분포 통계 시각화**(`computePasserAggregateStats`/`StatsSection`) — 자가 점수·학습 시간·정답률·활동 일수·최장 streak·총 풀이 회수 6종 히스토그램(N/중간값/평균/IQR) + 과목별 평균 풀이/정답률 막대. 분석 동의자만 표본 포함, 표본 0명일 땐 안내 배너. | P1 | ✅ |
| feat-8-007 | **(Phase C) 합격자 비교 컨설팅 카드** — 대시보드 상단 `PasserBenchmarkCard`. `getPasserBenchmarks(userId)` — 본인 `next_exam_year/round` 매칭 합격자(분석 동의 + aggregates 보유) 표본 산출, 표본 <3 시 (year-1, same round) fallback → 그래도 부족하면 전체 동의 합격자. 5종 지표 비교(학습 시간/총 풀이/정답률/활동 일수/최장 연속) — 본인 값 / 합격자 평균 / 차이(+/-, % delta) / 분위(0~100). `metricFromValues` percentile + 색상 chip(green=ahead, red=behind). fallback 사유/계획 미설정 안내 배너. **`PasserSummariesPreview`** — 합격자 후기 top 3 대시보드 노출. | P1 | ✅ |
| feat-8-009 | **합격자 학습 후기 모음 (anonymized)** — `/study/passer-summaries` 학생 누구나 접근. `listPasserSummaries({year, round, limit})` — 분석 동의 + `study_summary_md` 보유 합격자만, 이름/이메일 마스킹. 표시: 연도·차수·점수 버킷(`60-64점` 등)·인증 chip·markdown 본문. 대시보드 미리보기 카드 3건 + 전체 페이지. | P1 | ✅ |
| feat-8-010 | **시연·QA 시드 데이터 도구** — `profiles.is_synthetic` flag + `seedPasserData(count)`/`cleanupSeedPassers()`/`getSeedCount()` (seed.server.ts). `/admin/analytics/passers` 상단 SeedToolBox: 1~20명 일괄 생성 / 전체 삭제. 합성: auth user(disposable email) → 트리거가 profile 생성 → mark `is_synthetic=true`/`analytics_consent_at` → exam_results(`passed`, 점수 63~92, 60% verified) + study_summary_md 랜덤 → user_problem_attempts(1500~4000건, 정답률 60~85%) + study_sessions(180~340 활동일, 800~2400h). 삭제 시 auth.users.deleteUser → FK CASCADE 정리. 시연·영업·QA 용도, 실제 합격자가 모이면 분석에서 옵션 필터링 가능. | P1 | ✅ |
| feat-8-011 | **약점 단원 합격자 가이드** — 대시보드 "약점 단원 (체계도)" 카드 각 row 에 `PasserLawHint` 인라인 chip. `getPasserLawAverages()` — 분석 동의 합격자의 과목(law_code)별 평균 풀이 회수/정답률/learners. 행 데이터: "합격자 평균 N회 · M% 정답률 · +K회 더 풀어 보세요" (본인이 미달 시) / "이미 합격자 평균 이상" (둘 다 상회 시). tone 3단계(rose/blue/emerald). | P1 | ✅ |
| feat-8-012 | **합격자 학습 곡선 12주 비교** — `/study/passer-trend` 학생 누구나 접근. `getPasserTrendData(userId)` — 합격자 응시일 근사(1차=2/25, 2차=7/20) 기준 D-11주~D-0주 주별 활동(study_sessions/user_problem_attempts) 평균 시리즈 + 본인의 next_exam_year/round 기반 D-W 매핑 + 현재 주차 marker. 3종 SVG 라인 차트(주별 학습 시간 / 풀이 회수 / 정답률) — 합격자 평균(solid) + 본인 곡선(dashed) + "지금" 세로선. 표본/fallback/계획 미설정 안내 배너. 대시보드 PasserBenchmarkCard 에 "12주 곡선 →" 진입 링크. | P1 | ✅ |
| feat-8-013 | **자동 학습 추천 액션 카드** — 대시보드 상단 `RecommendedActionsCard`. `generateRecommendedActions` 순수 함수(recommendations.ts) — 합격자 비교/약점/과제/streak/진단점수 결합해 priority(high/medium/low/celebrate) 별 액션 산출. 7종 룰: 마감 임박 과제, 학습 시간 격차, 정답률 격차, 풀이 회수 격차, 약점 단원(합격자 평균 hint), 슬럼프/연속 학습, 진단 '취약', 계획·표본 미설정 안내. 합격자 평균 모든 지표 상회 시 celebrate 카드. tone 4단계 색상 + 아이콘 + CTA + metric chip. priority 정렬 + top 5 cap. | P1 | ✅ |
| feat-8-014 | **강사용 위험 학생 자동 분류** — `getAtRiskStudents(cohortId)` (at-risk.server.ts) — 합격자 평균(분석 동의자, 풀이 회수 + 정답률) baseline 산출 + cohort 멤버별 격차 + 비활성 일수(7/14/21일 단계)를 weighted 합산 (정답률 0.5 / 풀이 0.3 / 비활성 0.2) → 0~1 risk score → high(≥0.55) / medium(≥0.30) / low. `/admin/cohorts/:id` cohort detail 에 `AtRiskCard` (top 5, 위험 사유 chip, "1:1 코멘트" CTA → `/admin/students/:id#notes` deep link). baseline 0표본 fallback(비활성·낮은 정답률 only). 학생 상세 노트 섹션에 `id="notes"` 앵커 추가. | P1 | ✅ |
| feat-8-015 | **합격 vs 비합격 패턴 비교 분석** — `listFailerCases` + `computeGroupComparison` (analytics.server.ts) — 두 그룹 평균/중간값/IQR + 절대·상대 격차 metric 5종(학습 시간/풀이/정답률/활동일수/streak). `/admin/analytics/failure-patterns` admin 전용 — 표본 크기 카드, 격차 큰 metric top 3 인사이트, 전체 비교 표 + 두 그룹 막대. **학생 위험 신호** — recommendations.ts 에 `failerBaseline` 입력 추가, 본인 metric 2개 이상이 비합격 평균에도 못 미치면 high priority "비합격자 패턴 위험 신호" 액션, 1개면 medium. 시드 도구에 비합격자 시드 폼 추가 — 두 그룹 분포 분리 (passers 점수 63~92/학습 800~2400h vs failers 40~62/250~1100h). | P1 | ✅ |
| feat-8-016 | **랜딩 페이지 합격자 통계 마케팅** — `getPublicPlatformStats()` (analytics.server.ts) — 인증 없이 합격자 카운트(전체/인증/분석동의) + 평균 학습시간/문제풀이/정답률/활동일수 + 후기 카운트. home.tsx 에 `PasserStatsSection` (hero 다음, FeaturesSection 위) — Stat 카드 4종(분석 합격자/평균 학습/평균 풀이/평균 정답률) + 기능 미리보기 3종(평균 대비 비교/자동 추천 액션/12주 곡선) + "가입하고 비교 보기" CTA. 표본 0명일 땐 섹션 숨김. 합격자 시드 도구로 즉시 시연 가능. | P1 | ✅ |
| feat-8-017 | **가입 직후 Onboarding 3단계 wizard** — `profiles.onboarded_at` 컬럼 추가. `/onboarding/welcome` — Step 1 응시 계획(next_exam_year/round/science) → Step 2 분석 동의 → Step 3 학습 목표(examDate/weeklyGoalHours). 각 step 저장 후 진행, 어디서든 "지금은 건너뛰기" 가능, 완료/skip 시 onboarded_at 설정. 대시보드 loader 가 onboarded_at IS NULL 사용자를 wizard 로 redirect (단, 기존 설정 데이터 보유 사용자는 자동 onboarded 처리해 컬럼 도입 이전 가입자 보호). 진행 표시 dots 3단계 + CheckCircle. | P1 | ✅ |
| feat-8-018 | **Phase D 결제·구독 인프라 (MVP)** — `subscription_plans` (code/name/price_krw/duration_days/features jsonb) + `payments` (toss_order_id 유니크, toss_payment_key/toss_response/status) + `user_subscriptions` (started_at/expires_at/status) 3 테이블 + RLS(self read, admin read all). seed 3 플랜(free/pro_monthly ₩29,900 30일/cohort 학원 상담). `/pricing` 공개 가격표 + 토스페이먼츠 client SDK 결제 + `/api/payments/create-order`(pending payment 생성) + `/api/payments/toss/confirm`(서버 confirm + payment.completed + subscription 연장/생성). `/me/subscription` 본인 구독 상태 + 결제 이력. `getActiveSubscription`/`hasFeature` helper. 환경변수 `TOSS_CLIENT_KEY`/`TOSS_SECRET_KEY` 필요. | P1 | ✅ |
| feat-8-019 | **권장 진도 합격자 실측 보정** — `/goals` 화면에 `PasserCalibrationCard` 추가. 합격자 평균(학습 시간/풀이/정답률) vs 본인 누적 + 격차 chip + "실측 권장 일평균 학습 시간 = 부족분/남은 일수" 계산. 본인 일 목표와 비교(±%) 안내. fallback 시 표본 부족 배너. `getPasserBenchmarks` 재활용. | P1 | ✅ |
| feat-8-020 | **모바일 UX 폴리시** — 대시보드 PasserBenchmarkCard `BenchmarkRow` 5→2 cols 모바일 스택. 운영자 `admin-failure-patterns` 표 `overflow-x-auto` + min-width. 기존 Tailwind 반응형 utility 활용한 onboarding/pricing/my-subscription 화면은 정상 작동 확인. | P2 | ✅ |
| feat-8-021 | **통합 코멘트 (조문/판례/문제)** — `content_comments` 폴리모픽 테이블(target_type/target_id/body_md/author/is_pinned) + RLS(public read / staff insert / author or admin update·delete). 기존 `article_comments` (단일 평석) 데이터 마이그레이션 후 DROP. `/api/comments/comment` CRUD endpoint(create/update/delete). `CommentsPanel` 공용 컴포넌트(다중 코멘트 + 핀 + 인라인 수정/삭제). article-viewer / case-viewer / problem-viewer 우측 패널에 통합 적용 — staff 작성, 모든 사용자 read. 기존 ArticleCommentPanel + /api/laws/article-comment 정리. | P0 | ✅ |
| feat-8-022 | ~~하이라이트형 코멘트~~ — **feat-8-023 으로 대체됨.** 앵커형(하이라이트형) 코멘트는 제거되고, 강사 하이라이트의 학생 노출은 작성자 역할 기반 가시성으로 대체. 상세: `docs/features/feat-8-022-comment-highlight.md` | P1 | ✅ |
| feat-8-023 | **주석 3종 통합 · 작성자 역할 기반 가시성** — 하이라이트 / 포스트잇(기존 메모) / 메모(기존 코멘트) 3종으로 정리. 가시성을 작성자 역할로 통일 — 강사 작성 주석은 전체 수험생 공개, 수험생 작성 주석은 본인 전용 (RLS `private.is_staff`). feat-8-022 앵커형 코멘트 제거 — `content_comments` 앵커 컬럼 6종 DROP + `deleted_at` 추가 + 학생 작성 허용. `user_highlights`/`user_memos` SELECT RLS 를 본인 OR 강사작성 으로 확장. 강사 하이라이트는 배경+밑줄(`lidam-hl-staff-*`)로 시각 구분. 용어 변경(화면 표시만): 코멘트→메모, 메모→포스트잇. 상세: `docs/features/feat-8-023-annotation-visibility.md` | P1 | ✅ |
| feat-8-024 | **기출문제 지문 기반 판례 연동** — 객관식 1차 기출문제(origin=past_exam·exam_round=first·format mc_*)의 지문(body_md+choices+box_items)에서 사건번호 토큰을 추출, `cases.case_number` 정확일치로 `problem_case_links` 자동 생성(`scan_exam_case_links()` plpgsql 함수). 판례 뷰어는 1차 기출을 문제별 칩으로 표시(클릭→문제). 미탐지 문제용 수동 매칭 staff 화면. 기존 1차 데이터 정리 — `cases.exam_1st_years` 비우기 + 1차 객관식 기존 링크 삭제 후 재스캔. 역방향 매칭(`case-exam-problems` 화면, bulk 문제↔판례 탭) 제거. 상세: `docs/features/feat-8-024-exam-case-linking.md` | P1 | ✅ |
| feat-8-025 | **운영자·강사 중요도 별점** — 판례·조문 뷰어 오른쪽 패널의 "즐겨찾기" 탭을 staff(instructor/admin)에게는 중요도 ★ 별점 에디터로 분기(`ImportanceRating` + `/api/admin/importance`). 학생은 기존 개인 즐겨찾기 유지. `cases.importance`/`articles.importance` 직접 수정 — 별도 편집 화면 불필요. 판례 importance 는 기출횟수(1차 `problem_case_links` + 2차 `exam_2nd_years`) 기반 1회성 backfill(0~2회→★1·3회→★2·4회+→★3). `admin-case-edit` 중요도 입력란 제거. 상세: `docs/features/feat-8-025-staff-importance-rating.md` | P1 | ✅ |
| feat-8-008 | (Phase D) 구독·결제 3-tier — 무료/자기주도 구독(컨설팅)/종합반(+커리큘럼·과제·강사 첨삭). 토스페이먼츠/포트원 등 외부 PG 정기결제 + 학습권. `feat-7-014` 흡수. | P2 | 🔲 |

상세 스펙: `docs/features/feat-8-001-exam-results.md` (작성 예정).

---

## 5.9 AI 학습 Q&A (RAG) — feat-9 (계획)

생성형 AI 가 조문·판례·문제를 색인(RAG)해 수험생 질문에 **출처를 인용해** 즉답한다. 사람-간 Q&A(`feat-qna`)와 별개 — feat-qna 는 강사 답변, feat-9 는 AI 즉답. v1 출시 이후의 전략적 확장. 상세 계획: `docs/features/feat-9-ai-qna.md`.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-9-001 | RAG 인프라 — `vector` 확장 + `content_chunks`(임베딩) + 청킹 + 임베딩 파이프라인(`/api/cron/embed-chunks`) + 전체 백필 | P2 | 🔲 |
| feat-9-002 | 하이브리드 검색 — pgvector 의미 + pg_trgm 키워드 + 구조화 필터 + 연관관계 그래프 확장 + RRF 융합 | P2 | 🔲 |
| feat-9-003 | 답변 생성 — Claude API + 시스템 프롬프트 가드레일 + 출처 인용 + 스트리밍 | P2 | 🔲 |
| feat-9-004 | AI Q&A 화면 — `/ai` 채팅 UI + `ai_conversations`/`ai_messages` + 대화 이력 + 뷰어·대시보드 진입점 | P2 | 🔲 |
| feat-9-005 | 피드백 · eval · 품질 튜닝 — 👍/👎 + eval셋 + 지표 측정 | P2 | 🔲 |
| feat-9-006 | 구독 게이팅 · 레이트 리밋 — feat-8-018 결제 연계 + 일 한도 | P2 | 🔲 |

> ❓ 착수 전 결정 필요 (`feat-9-ai-qna.md` §14): 임베딩 모델·차원, LLM 모델 정책, 구독 게이팅 한도, 진입점 우선순위, 자연과학 포함 여부.

---

## 5.10 모의고사 체계 정비 (1차·2차 + 문제은행 연결)

1차(객관식)·2차(주관식) 모의고사와 학습과목 문제은행을 잇는 정비. 2차 모의고사 = 온라인 GS(5.5), 1차 모의고사 = `mcq_packs` exam 모드(5.3). 3단계(Phase A/B/C)로 진행.

| ID | 기능 | 우선순위 | 상태 |
|----|------|:-------:|:---:|
| feat-10-001 | **Phase A — GS 문항 → 학습과목 주관식 문제은행 승격.** 종료된 GS 회차의 `gs_questions` 를 `problems`(format=subjective, origin=mock)로 일괄 승격. `problems.source_gs_question_id` 역참조(멱등성 키, 부분 유니크). 운영자 GS 회차 편집 화면의 "주관식 문제은행 등록" 패널. 2차 모의고사 흐름 ⑥ 완성 + 빈 주관식 문제은행 충전. 상세: `docs/features/feat-10-001-gs-question-promotion.md`. | P1 | ✅ |
| feat-10-002 | **Phase B1 — 1차 모의고사 출제·운영.** `mcq_packs` 모의고사 팩 문제 picker(검색·다중선택) + `problems.released_at` mock 가시성 게이트(미공개 mock 문제는 학습과목 비노출) + 팩 단위 "학습과목 공개"(흐름 ⑥). 상세: `docs/features/feat-10-002-mock-exam-authoring.md`. | P1 | ✅ |
| feat-10-003 | **Phase C — 모의고사 IA 정리.** 상단 네비 "모의고사" 메뉴 신설(1차 종합·진도별 + 2차 온라인 GS), GS 를 커뮤니티→모의고사 이동, 학습정보 객관식·주관식 → "기출문제" 개명. 라우트·DB 변경 없음. 상세: `docs/features/feat-10-003-mock-exam-ia.md`. | P2 | ✅ |
| feat-10-004 | **Phase B2 — 1차 모의고사 채점·합격선·등수.** `mcq_packs.pass_score`(합격선) + `mcq_pack_attempt_stats` 등수 RPC. 팩 응시 결과에 점수·합격 판정·등수(백분위·z-score). 종합·진도별 모의고사 공통(둘 다 팩 단위). 상세: `docs/features/feat-10-004-mock-exam-scoring.md`. | P1 | ✅ |
| feat-10-005 | **다과목 통합 1차 모의고사.** `mcq_exams`(시험=팩 묶음) + 다중 세션 응시 + 과목별 과락 + 전 과목 평균 합격 판정. 산업재산권법+민법+자연과학 3교시 통합. | P2 | 🔲 |

---

## 6. 마일스톤

### M1 — Foundation ✅
- 5.0 인프라 P0 전부 (`feat-000-001~014`) ✅
- 5.1 대시보드 셸 ✅
- 5.4.A.1 조문 데이터 모델 ✅
- 운영자 placeholder ✅
- 메뉴별 placeholder 화면 ✅

### M2 — 핵심 학습 (특허법 우선) ✅
- 5.4.A 전체 P0 (조문 뷰어 · 판례 상세 · 문제 풀이) ✅
- 5.7 운영자 콘텐츠 등록 P0 (`feat-7-004~006`) ✅
- 5.3 최신 정보 P0 (법 개정/최근 판례) ✅
- 5.1 대시보드 P0 보강 ✅

### M3 — 5과목 확장 + 대시보드 완성 🟡 (진행 중)
- 5.4.A 전체 5과목 시드 데이터 🟡 — **다음 작업 포커스**. 특허법은 풀빌드, 상표/디자인/민법/민사소송법 콘텐츠 양 부족
- 5.1 대시보드 P0 전부 + 자연과학 카드(P1) ✅
- 5.2 학습목표 메뉴 P1 ✅
- 5.3 최신 정보 P1 (객관식/주관식/논문) ✅

### M4 — 자연과학 + 운영 고도화 ✅ (P1 항목 완료)
- 5.4.B 자연과학 P1 전부 ✅ (Runner KaTeX 포함)
- 5.7 운영자 P1 (반 관리·학생 진도·공지·연관관계 bulk·감사 로그·인박스 알림) ✅

### M5+ — 확장
- 5.5 온라인 GS 본격 ✅ (학생 응시·peer/AI/강사 채점·통계·우수답안·포인트 P1 항목 다 완료. 추가 폴리시는 운영 피드백 기반)
- 5.6 커뮤니티 본격 🔲 (placeholder 만)
- 5.9 AI 학습 Q&A (RAG) 🔲 — `feat-9-*`, 계획 문서 `docs/features/feat-9-ai-qna.md` 작성 완료. 착수 전 §14 결정 6건 필요
- P2 잔여 항목: `feat-3-504` 논문 PDF Storage · `feat-7-014` 수강권/결제 · `feat-4-A-320` 주관식 색인(과목 hub)

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
| 법령 원문 저장 (조문 본문) | (a) 마크다운 (b) 구조화 JSON (c) HTML | ✅ (b) 구조화 JSON — `article-body.ts` Zod schema (text/underline/subtitle/annotation/ref_article inline + block list) |
| 조문 트리 path 저장 | (a) ltree (b) materialized path 문자열 | ✅ (a) ltree — `docs/article-tree.md` |
| 판례 전문 검색 | (a) Postgres tsvector + pg_trgm (b) pgvector | ✅ (a) pg_trgm GIN + ilike 다중 컬럼 OR (feat-4-A-208). tsvector(simple) 는 generated 컬럼으로 유지(향후 ranking 도입 시) |
| 주관식 채점 | (a) 강사 수동 (b) 자기 채점 + 강사 리뷰 (c) 키워드 매칭 보조 | ✅ (b) 자기채점 + 강사 첨삭 요청 (feat-4-A-305 + feat-3-402). GS 는 강사/peer/AI 채점 트리오(feat-5-201~203) |
| 서버 ↔ Postgres 접근 | (a) postgres-js TCP (b) Supabase Data API | ✅ (b) Supabase Data API — @supabase/supabase-js (supa-client / supa-admin-client), ORM 미사용 |
| 결제/수강권 v1 필수? | 외부(계좌이체)로 충분할 수 있음 | ✅ v1 외부 처리 (수강권 관리 화면은 feat-7-014 P2 로 후속) |
| 자연과학 문제의 도식/수식 | (a) MathJax/KaTeX (b) 이미지 (c) 둘 다 | ✅ (c) 둘 다 — KaTeX (`$...$` / `$$...$$` / `\(...\)`) + markdown 이미지 (feat-4-B-006) |
| 논문 PDF 저장 위치 | (a) Supabase Storage (b) 외부 링크만 | 🟡 v1: 외부 링크 위주. Supabase Storage 첨부는 feat-3-504 P2 |

---

## 부록 A — 화면별 라우트 매핑

| 메뉴 경로 | 라우트 | 주요 feature |
|----------|--------|-------------|
| 대시보드 | `/dashboard` | feat-1-* |
| 학습목표 및 진도 | `/goals` | feat-2-* |
| 통합 학습 통계 | `/study/stats` | feat-2-008 |
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
| 커뮤니티 허브 | `/community` | feat-6-002 |
| 커뮤니티 게시판 | `/community/:board` · `/:board/new` · `/:board/:postId` | feat-6-002 |
| 운영자 진입 | `/admin` | feat-7-001 |
| 콘텐츠 관리 허브 | `/admin/content` | feat-7-002 |
| 법 개정 워크스페이스 | `/admin/content/laws/:lawCode/revisions/:id` | feat-7-004 |
| 판례 등록/수정 | `/admin/content/cases/:id?` | feat-7-005 |
| 문제 출제 | `/admin/content/problems/:id?` | feat-7-006 |
| 반 관리 | `/admin/cohorts/:id?` | feat-7-009 |
| 반 통계 모니터링 | `/admin/cohorts/:id/stats` | feat-7-019 |
| 커리큘럼 목록·편집 | `/admin/curricula`, `/admin/curricula/:id` | feat-7-020 |
| 과제 배포·진척 | `/admin/cohorts/:id/assignments`, `/admin/cohorts/:id/assignments/:aid` | feat-7-021 |
| 학생 과제함 | `/assignments` | feat-7-021 |
| 운영자 콘텐츠 검색 API | `/api/admin/search-content` | feat-7-020 |
| 자동 주간 cron | `/api/cron/curriculum-weekly` | feat-7-021 |
| 주간 리포트 cron | `/api/cron/weekly-reports` | feat-7-022 |
| 비활성 알림 cron | `/api/cron/inactive-alert` | feat-7-023 |
| 1:1 상담 코멘트 API | `/api/admin/student-note` | feat-7-025 |
| 합격 진단 snapshot cron | `/api/cron/pass-predict-snapshot` | feat-7-027 |
| 강의 진행 update API | `/api/student/lecture-progress` | feat-7-029 |
| 학생 강의 viewer | `/lectures/:itemId` | feat-7-029 |
| 내 시험 결과 | `/me/exam-results` | feat-8-002 |
| 합격 결과 운영 | `/admin/exam-results` | feat-8-003 |
| 분석 활용 동의 약관 | `/legal/analytics-consent` | feat-8-004 |
| 가입 후 Onboarding | `/onboarding/welcome` | feat-8-017 |
| 요금제 | `/pricing` | feat-8-018 |
| 내 구독 | `/me/subscription` | feat-8-018 |
| 결제 주문 생성 API | `/api/payments/create-order` | feat-8-018 |
| 결제 확인 콜백 | `/api/payments/toss/confirm` | feat-8-018 |
| 시험 결과 알림 cron | `/api/cron/exam-result-reminder` | feat-8-005 |
| 합격자 케이스 분석 | `/admin/analytics/passers` | feat-8-006 |
| 합격자 학습 후기 | `/study/passer-summaries` | feat-8-009 |
| 합격자 학습 곡선 비교 | `/study/passer-trend` | feat-8-012 |
| 합격 vs 비합격 패턴 | `/admin/analytics/failure-patterns` | feat-8-015 |
| 사용자 관리 | `/admin/users` | feat-7-012 |
| 공지사항 발송 | `/admin/announcements` | feat-7-011 |
| 공지사항 수신함 | `/announcements` | feat-7-011 |

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
