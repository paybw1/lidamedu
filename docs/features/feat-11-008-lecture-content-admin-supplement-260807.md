# feat-11-008 — 강의관리·콘텐츠관리 기능 보완 (260807 요청서)

- 요청서: `source/강의관리·콘텐츠관리 기능 보완 요청_0807.html`
- 상태: 설계 확정(2026-08-07) → **2026-08-08 00:00 KST 구현 착수** (원장 지시)
- 선행: feat-11-006(콘텐츠 라이브러리·강의그룹·HTML 에디터), feat-11-007(17항목 보완), feat-13(장바구니 쿠폰)
- ★ 이 문서가 실행 SSOT다. 야간 자율 구현은 이 문서만 보고 Phase 순서대로 진행한다.

## 0. 실행 공통 게이트 (매 Phase 필수)

1. DDL은 `node scripts/run-prod-sql.mjs <sql파일>` 로만 실행 (★CLAUDE.md의 Supabase MCP apply_migration 지침은 이 프로젝트에서 무효 — MCP는 구 프로젝트 nctokynz를 가리킴. 운영=mcgdoplo, `.env` supabase-js). DDL 후 `npm run db:typegen`.
2. 각 Phase 완료 시: `npm run typecheck` + **`npm run build`**(react-router build — .server 모듈 클라 번들 유입은 typecheck가 못 잡음) → 해당 파일만 선별 `git add` → 커밋 → 푸시(=Vercel 배포).
3. 삭제류는 전부 최고관리자(admin=원장) 전용 + 연결 데이터 가드 + 확인 절차. 일반관리자(manager)는 비노출·중지·해제까지만. 판정은 `roleAtLeast(role,"admin")` (`app/core/lib/roles.ts`).
4. 회원 검색 등 타 사용자 profiles 조회는 **adminClient 필수** (profiles RLS는 staff도 본인만).
5. HtmlEditor 원칙 유지: 저장값=원본 HTML 무손실(정규화·sanitize 없음), 운영자 전용 신뢰 콘텐츠. 학생 작성물에는 절대 사용 금지.
6. 중간 사용자 지시가 오면 그 시점 Phase 완료 후 반영. 애매한 정책(특히 P6 재생횟수 차감 단위)은 구현 보류하고 질문 남김.

## 1. 현황 감사 요약 (2026-08-07 조사)

| 요청 영역 | 현재 상태 | 핵심 파일 |
|---|---|---|
| 강의개설(시리즈·에디션) | `/admin/lms/courses`(콘텐츠 2계층: course_series→courses→course_lessons) + `/admin/pricing`(판매 subscription_plans). 두 목록 모두 검색·필터·정렬·페이징 **없음** | `features/lms/screens/admin-lms-courses.tsx`, `admin-lms-course-detail.tsx`, `subscriptions/screens/admin-plans.tsx` |
| 강의 카테고리 | **이원화**: 카탈로그 탭=하드코딩 `LECTURE_CATEGORIES`(round1/round2/package/onsite, `subscription_plans.lecture_category` text) / 콘텐츠 분류=`course_categories` 테이블(계층·sort_order, courses.category_id) | `lms/lib/lecture-category.ts`, `admin-lms-courses.tsx:390-431`, `lecture-catalog.tsx:95-143` |
| 콘텐츠 라이브러리·강의그룹 | `content_groups` 존재하나 1:N(`video_contents.group_id`)이고 **라이브러리 행 내 select로 그룹 직접 지정**(요청서가 제거 요구). 회차·순서·강의 연결 개념 없음. 동기화 기준=media_content_key **이미 전환 완료**(문서 stale) | `admin-lms-contents.tsx`(:770 행내 지정, :994 그룹 시트), `lms/lib/kollus-sync.server.ts` |
| 강의 기본정보 에디터 | 에디션(courses)에는 상세설명 필드 자체가 없음. 상품(`subscription_plans.detail_html`)에만 HtmlEditor 적용 | `lms/components/html-editor.tsx`, `admin-plans.tsx:602` |
| 수강신청 강의카드 | 카탈로그 카드에 교재명·가격·담기 버튼 노출(요청서가 제거 요구). 상세페이지엔 주/부교재 배지 이미 있음 | `lecture-catalog.tsx:291-330`, `lecture-product-detail.tsx:175-230` |
| 교재 링크 | **`plan_book_links`가 현행**(book_role/requirement/sort_order — 20260727 SQL). feat-11-007 문서 결정6(plan_books 일원화)은 코드와 반대(stale). plan_books는 dead | `subscriptions/components/book-links-editor.tsx`, `lms/queries.server.ts:902-959` |
| 쿠폰 | 정액 산술은 `redeem.server.ts:101` 깨끗. 29,999 후보=①:103 `min(discount, eligibleKrw)` clamp(상품가 29,999원) ②정률 floor ③discounts 계통 별개. **확정 버그 2건**: `api/admin-coupon.tsx:70` max_discount 항상 null 하드코딩 / `grants.server.ts:22` listUsers 1000명 캡. 개별 발급 UI=이메일 정확일치 입력 1개뿐 | `coupons/redeem.server.ts`, `grants.server.ts`, `admin-coupon-edit.tsx:341-360` |
| 관리자 사이드바 | `admin-shell.tsx:431` `useState(isActiveCluster)` — 라우트마다 AdminShell 재마운트라 활성 클러스터 외 전부 접힘(=하위 메뉴가 "사라진다"). active 판정 `:493` 정확일치라 상세경로에서 미표시. minRole 필터(:411)는 요청서 "권한 없는 메뉴만 숨김"과 일치 → 유지 | `admin/components/admin-shell.tsx` |
| 페이지관리 | 범용 페이지 CMS 없음(`/page/:code` 라우트·테이블 없음). 최근접 자산=landing_banners.body_html + HtmlEditor + guide_articles 패턴 | `routes.ts`, `features/landing/*` |
| 내강의실 | `/lecture/room/:enrollmentId`에 "재생 N/M회·남은 K회"(:138-144) + "하루 1회 차감" 문구(:96-97). 차감=grant 발급 시 KST 달력일 dedupe(`playback.server.ts:141-160`). 재생횟수는 회차단위 `course_lessons.max_plays`(기본 2)만, 강의(plan/course) 레벨 설정 없음 | `lecture-room.tsx`, `lms/playback.server.ts` |
| 권한 | admin(원장)=최고관리자 / manager=일반관리자 구분 이미 존재(`roles.ts` 4단계 + duty 13종) | `core/lib/roles.ts`, `admin/lib/duties.ts` |

## 2. 설계 결정 (기본안 — 자정 전 정정 없으면 이대로 구현)

- **D1 강의개설 = 통합 표면, DB 2계층 유지.** 요청서도 "내부 구조 유지 무관" 명시. courses/plans를 합치지 않고, 새 화면 `/admin/lectures`(메뉴명 "강의개설")가 **판매 상품(subscription_plans, product_kind course·bundle 등 강의류) 기준 목록**에 연결 에디션·강사·카테고리를 병합해 보여준다. "강의등록"=상품+에디션 연결을 한 흐름으로 생성, "강의수정"=기존 admin-plans 편집 + 에디션 바로가기. 기존 `/admin/lms/courses`는 "강의 콘텐츠(회차·영상)" 심화 화면으로 존치하되 사이드바 라벨에서 시리즈·에디션 용어 제거("강의개설"/"강의 콘텐츠"). 관리자 노출 문구에서 시리즈·에디션 금지.
- **D2 카테고리 = `course_categories` 승격 단일화.** 신규 테이블 대신 기존 계층 테이블에 `is_active boolean default true` 추가하고 "강의 카테고리" 메뉴의 SSOT로 승격. `subscription_plans.category_id uuid FK` 추가. 하드코딩 `LECTURE_CATEGORIES` 4종은 카테고리 행으로 시드→plans.lecture_category 값 기준 category_id 백필→카탈로그 탭·필터를 테이블 파생(상위 카테고리, is_active, sort_order)으로 교체. `lecture_category` 컬럼은 당분간 보존(드랍 안 함)하되 쓰기 중단. "강의 구분"(온라인/현장/패키지)은 별도 축으로 존치(`LECTURE_TYPES`) — 요청서도 카테고리와 구분을 분리해 명시. 삭제=연결 강의 있으면 차단+이동 안내, 미사용=선택 불가+기존 연결 유지.
- **D3 강의그룹 = M:N 저작 템플릿, 회차 운영 SSOT는 course_lessons 유지.** 신규 `content_group_items(group_id, content_id, seq, lesson_no, title, is_preview, is_public)` 정션으로 "하나의 콘텐츠 여러 그룹" 충족. 라이브러리 행 내 그룹 지정 select 제거(요청 명시), 그룹 화면에서 콘텐츠 선택창(라이브러리 검색·복수선택·일괄추가·미리보기)으로 불러오기. 그룹→개설 강의 연결 시 course_lessons로 **가져오기(1회성 생성/추가)** 하고, 이후 회차 운영 편집(공개·max_plays·영상교체)은 기존 에디션 목차관리 단일 경로 유지 — 뮤테이션 경로 이원화 금지. 기존 `video_contents.group_id`는 items로 백필 후 읽기 경로 전환(컬럼 보존, 쓰기 중단).
- **D4 에디터 섹션 = plans.detail_sections jsonb.** 9개 입력영역(기본설명/상세설명/소개/수강대상/특징/커리큘럼/교재안내/유의사항/환불안내)을 컬럼 9개가 아니라 `subscription_plans.detail_sections jsonb`({key: html})로. 섹션 키 SSOT 상수 파일(비-server lib). 관리자=탭형 HtmlEditor, 상세페이지=값 있는 섹션만 순서 렌더. 기존 detail_html은 '상세설명' 섹션으로 읽기 폴백(마이그레이션 없이 호환).
- **D5 페이지관리 = 신규 `custom_pages`.** page_id, title, **code(unique, 영문·숫자·하이픈)**, body_html, status(use/stopped), admin_memo, created_by, deleted_at + `custom_page_revisions`(수정 전후 스냅샷·수정자). 공개 라우트 `/page/:code` — stopped는 404가 아닌 "준비 중" 안내+noindex, 사용 상태만 렌더(.lecture-detail-html 재사용). 관리자 `/admin/pages`(운영·시스템 하위): 목록(검색·상태·기간·정렬)+등록(코드 중복확인 버튼)+HtmlEditor(PC/모바일 미리보기·전체화면)+복사(코드 재입력)+미리보기(중지 상태도 staff 열람)+삭제(admin 전용). RLS: 공개 읽기=status 'use' AND deleted_at null, 쓰기=staff.
- **D6 쿠폰 = 진단 먼저.** 운영 DB에서 해당 30,000원 쿠폰 row(discount_type·discount_value)와 영향 주문의 coupon_discount_krw를 **읽기 전용으로 먼저 확인**한 뒤 원인별 수정(값이 29999로 저장→데이터 정정+입력 검증 / percent 오등록→쿠폰 정정 / eligible clamp→표시·정책 문제로 보고). 동시 수정: max_discount 하드코딩 null(admin-coupon.tsx:70) 배선, grants.server의 listUsers 1000명 캡 제거(회원 검색은 adminClient profiles/이메일 질의로 재작성). 개별 발급 UI=회원 검색(이름·이메일·전화)→체크박스 복수 선택→쿠폰 확인→일괄 발급+중복 발급 경고, 발급 이력(발급자·사유 메모) 저장.
- **D7 내강의실 = 표시 변경 + 시간 비례 차감 (★원장 확정 2026-08-07 저녁 — 게이트 해제).** 표시: 회차 행을 `강의(초)·학습(초)·진도율`로 교체(강의초=lesson_videos→video_contents duration, 학습초=watch_ledger 회차 누적, 진도율=학습/강의 캡 100%), 재생·남은·최대 횟수 전부 비노출, "하루 1회" 문구 삭제. **차감 정책(확정)**: ①"하루 1회 차감"(KST 달력일 dedupe) 폐지 ②관리자가 **강의(에디션) 단위** 최대 재생횟수 설정(선택지 1회/2회/3회/무제한, 기본 2회 유지) — 신설 `courses.max_plays`(int, null=무제한, default 2), 설정값은 소속 **각 회차에 동일 적용**(예: 기본강의 2회 → 1강 2회·2강 2회…) ③차감 단위=grant/세션이 아니라 **실제 학습시간 비례**: 회차별 허용량 = max_plays × 해당 회차 전체 재생시간(초), 소비량 = watch_ledger 누적 학습시간(초), `학습초 ≥ max_plays × 강의초` 이면 재생 차단(무제한이면 항상 허용). "재생 시작 1회=1차감"·"30분 재진입 무차감" 기본안은 **적용 안 함**(원장 명시). 구현: `playback.server.ts` 의 KST-일 dedupe·counts_as_play 판정 로직을 시간 비례 판정으로 교체(하트비트 누적 조회 기준), 기존 회차별 `course_lessons.max_plays` 는 쓰기 중단(에디션 설정이 권위 — 회차별 설정 UI `set_lesson_max_plays` 제거·컬럼 보존), duration 미확인 회차는 차단하지 않음(fail-open). 관리자 CS: 에디션 상세(또는 수강생 관리)에서 **회차별 사용 시간·환산 사용 횟수(학습초/강의초)·설정 최대횟수** 조회 유지.

## 3. Phase 계획 (자정 착수, 안전한 것부터)

### P0 — 표시·즉효 수정 (스키마 무변경)
1. **관리자 사이드바**: `admin-shell.tsx` — 클러스터 펼침을 localStorage(`adminNavOpen`) 유지 + activeCluster 자동 펼침(`useEffect` pathname 동기화), active 판정 `pathname===to || pathname.startsWith(to+"/")`. 전 클러스터 목록은 항상 렌더 유지.
2. **수강신청 카드 간소화**: `lecture-catalog.tsx` 카드에서 교재 블록(교재명·가격·담기) 제거, 카드=강의명·강사명·수강기간(예 "180일 수강")·정상가(취소선)·할인가(강조)·상세보기/수강신청, 동일 높이 정렬. 상세페이지 교재 섹션은 현행 유지+"강의와 함께 구매" 동선 확인(장바구니 담기 연결).
3. **내강의실 표시**: `lecture-room.tsx` — 횟수 표기·"하루 1회" 문구 제거, 강의(초)·학습(초)·진도율 표시(D7 표시부만).
4. 관리자 노출 용어: 사이드바·화면 제목의 "시리즈·에디션"→"강의개설"/"강의 콘텐츠", 버튼 "강의등록"·"강의수정" (라벨만, 라우트 유지).

### P1 — 쿠폰 (D6)
진단 스크립트(tmp/, 읽기 전용) → 원인 수정 + max_discount 배선 + 회원 검색·복수 선택 발급 UI(`admin-coupon-edit.tsx` 개편, adminClient 검색 API) + 발급 이력·사유. 기존 쿠폰 데이터 전수 점검(정액인데 …999 값 스캔) 결과를 보고에 포함.

### P2 — 페이지관리 (D5, greenfield)
DDL(custom_pages·revisions·RLS) → `/admin/pages` 목록·등록·수정·복사 → `/page/:code` 공개 라우트 → routes.ts 등록. 회귀 표면 0.

### P3 — 강의 카테고리 (D2)
DDL(is_active·plans.category_id·시드·백필) → `/admin/lecture-categories` 메뉴(등록·수정·계층·사용여부·순서·연결 강의 수·삭제 가드) → 카탈로그 탭·필터 테이블 파생 전환 → 강의 등록·수정에서 카테고리 선택.

### P4 — 강의개설 목록·등록 (D1)
`/admin/lectures` 신설: 상단 강의등록 버튼+검색 영역(카테고리/구분/신청기간/판매·상태·노출·종료/키워드 — 복수 조건 AND, 초기화, 결과 건수, **수정 후 복귀 시 검색조건 유지**=searchParams 왕복), 목록(체크박스·UID·썸네일·강의명·카테고리·강사·구분·신청기간·가격·판매·상태·노출·종료·등록/수정일·관리버튼 5종), 정렬 6종·페이지 20/50/100·페이지 표시. 삭제 가드(수강생·주문 이력 존재 시 불가, admin 전용, 2단 확인). 강의 수정 시 목차·콘텐츠·수강생·기록·교재·주문 연결 보존(기존 편집 경로 재사용이므로 자동 충족 — 회귀 테스트만).

### P5 — 콘텐츠관리 분리 + 강의그룹 (D3) + 에디터 섹션 (D4)
1. 사이드바: 콘텐츠관리 > 라이브러리 / 강의그룹 분리. 라이브러리=`admin-lms-contents.tsx`에서 그룹 지정 UI 제거+검색 확장(콘텐츠키·콜러스 카테고리·인코딩·그룹연결여부)+연결 그룹 수 표시.
2. DDL(content_group_items) + 기존 group_id 백필 → `/admin/lms/groups`: 그룹 목록(검색·리스트·관리버튼), 그룹 상세=콘텐츠 선택창(라이브러리 검색·복수선택·일괄추가·중복 경고·미리보기)+회차 번호/제목/공개/미리보기 편집+순서(순서값 입력, DnD는 여력 시)+개설 강의 연결(course_lessons 가져오기)+운영정보(콘텐츠 수·총 재생시간). 삭제 가드(연결 강의·수강기록 시 불가, admin 전용, 원본 콘텐츠 보존).
3. DDL(plans.detail_sections) + admin-plans 탭형 섹션 에디터 + 상세페이지 섹션 렌더(detail_html 폴백).

### P6 — 내강의실 차감 정책 (D7 나머지 — ★게이트 해제, 확정안대로 진행)
- P6a: `courses.max_plays`(int null=무제한, default 2) DDL + 강의 등록·수정 화면 설정(1/2/3/무제한 선택) + 회차별 설정 UI 제거(쓰기 중단).
- P6b: `playback.server.ts` 차감 판정을 시간 비례로 교체 — 학습초(watch_ledger 회차 누적) ≥ max_plays × 강의초(duration) 이면 `play_limit_exhausted`, 무제한·duration 미확인은 허용. KST-일 dedupe·counts_as_play 로직 제거(grant 기록 자체는 이력용 유지).
- P6c: 관리자 CS 조회 — 회차별 사용 시간·환산 사용 횟수·설정 최대횟수 표시(수강생 화면에는 계속 비노출).

### 검증 (매 Phase)
- typecheck+build, 핵심 화면 수동 스모크(비로그인 카탈로그 / staff 관리자 / 학생 내강의실), P1은 운영 데이터 재확인 쿼리로 30,000원 표시 검증.

## 4. 문서 정정 (착수 시 함께)
- feat-11-007 문서 §0 현황표에 "착수 전 감사 스냅샷, 코드 우선" 주석 + 결정6(plan_books 일원화)은 **미채택 — plan_book_links 확장이 현행** 명기.
- SPEC.md: feat-11-007 행 등록(✅), feat-11-008 행 등록(🟡→진행), 완료 시 상태 갱신.
