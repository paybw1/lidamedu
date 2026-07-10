# 동영상(DRM) 서비스 개발요청 — 구현 현황 감사

> 스펙 148개 기능을 코드베이스와 대조. **구현완료 86 · 일부만 40 · 미구현 22**. (자동 감사, 2026-07-11 기준)
> 판정: **미구현**=코드 없음 / **일부만**=인프라(DB·엔진)는 있으나 설정·조회 UI 또는 소비 경로 없음.

## 영상 관리

✅ 전부 구현 (8건)

## 강의 상품(단과/패키지/T-PASS)

**미구현**

- ★★★★ **다운로드 허용 여부** — plan_policies.allow_download 컬럼만 존재. 상품 admin-plans 폼에 토글 없고 playback/플레이어가 읽지 않음(벤더 미연동)
- ✅ **강의별 사용 도서 연결** — [해결 2026-07-10] plan_books 링크 테이블 신설. admin-plans PlanForm(course/tpass) '연결 교재' 멀티셀렉트(getPlanBookLinks/syncPlanBooks) + 수강신청 카탈로그 카드에 교재 목록·담기(addBook) 크로스셀. 판매중(listed) 도서만 노출.
- ★★★★ **도서 재고 및 판매상태 연동** — plan_book_links 테이블 미사용·수강생 강의화면에 교재 상태 표시 없음(도서몰 v_book_stock/sale_status는 별개 존재)

**일부만(추가 개발 필요)**

- ★★★★★ **단과 강의 생성** — product_kind 'course'(admin-plans)+plan_courses+fulfillCourseEnrollments+카탈로그 판매 지원. 단, 단과(course)상품↔강의 연결 UI 없음 — publish 연결제안은 tpass 전용(queries listTpassLinkSuggestions).
- ✅ **수강기간 설정** — [해결 2026-07-10] admin-plans PlanForm '강의 수강 정책' 섹션에서 배수/고정일수/고정종료일 3방식 편집(plan_policies upsert). orders.server 소비 기존 완비.
- ✅ **수강기간 일시정지 정책 설정** — [해결 2026-07-10] PlanForm 정책 섹션에서 pause_allowed + max_count/min·max_days/total_days 편집. 학생측 강제 기존 완비.
- ✅ **수강 배수 설정** — [해결 2026-07-10] PlanForm 정책 섹션 배수(N) 입력 → plan_policies.multiplier. playback/orders/enrollments 강제 기존 완비.
- ✅ **PC / 모바일 수강 가능 여부** — [해결 2026-07-10] PlanForm 정책 섹션에서 allow_pc/allow_mobile + max_devices_pc/mobile 편집. (단 playback 실제 슬롯강제는 ENFORCE_DEVICE off·벤더 fingerprint 대기 — 별개 gap)
- ✅ **수강 연장 가능 여부** — [해결 2026-07-10] ① 학생 셀프연장: my-courses '수강 연장' CTA(정책 허용+판매중 extension_plan_ids 상품→장바구니). 지급 시 fulfillCourseEnrollments 가 같은 강의 기존 수강권을 **중복 없이 만료일 연장**(재구매=만료일 연장+배수 모수 갱신). ② 관리자: 수강권 목록에 '셀프연장 허용/불가' advisory 배지. ★설정 전제: 연장 상품(plan)이 plan_courses 로 같은 강의에 연결돼 있어야 함(A-2 연결 UI).
- ✅ **판매중 / 판매중지 설정** — [해결 2026-07-10] admin-plans PlanForm '판매 상태' 5단계(판매예정/판매중/일시중지/판매종료/숨김) select. sale_status 단일 소유자, is_active=on_sale 자동 미러(기존 storefront 무변경). ★기존 plan 중 patent_basic_2026 만 active=true+scheduled 로 불일치(다음 저장 시 정렬) — storefront 노출 유지 위해 자동 backfill 안 함.
- ★★★★★ **강의 자료 업로드** — lesson_materials 테이블 존재·queries.server CourseDetail에서 조회만. 업로드 action/UI 없고 course-detail 화면에 렌더도 안 됨.

<sub>구현완료 3건: 패키지 강의 생성, 강의별 회차 연결, 도서몰 등록 도서 불러오기</sub>

## 회원 수강권 관리(운영자)

**일부만(추가 개발 필요)**

- ✅ **수강기간 수정** — [해결 2026-07-10] admin-lms-enrollments 행 '수정' 패널에서 시작일/종료일 date 직접 편집(set_dates, KST 경계, 종료일 미래면 만료→active 복구, 감사로그).
- ✅ **특정 강의 재생 차단** — [해결 2026-07-10] 같은 '수정' 패널의 회차 체크박스로 blocked_lesson_ids 설정(set_blocked, 감사로그). playback.server lesson_blocked 판정 기존 완비.

<sub>구현완료 6건: 회원별 수강 강의 조회, 수강권 수동 지급, 수강기간 연장, 회원별 일시정지 관리, 수강권 회수, 결제 없이 관리자 지급</sub>

## 재생 권한 확인 / DRM 호출

**미구현**

- ★★★ **IP 제한 옵션** — 재생 판정에 해외IP/VPN/IP변경 제한 옵션 없음. client_ip 캡처만·사이트 KR 게이트는 별개
- ★★★ **캡처 / 녹화 차단 설정 확인** — DRM 벤더 미확정(drm_provider 필드만). 캡처차단/녹화감지/워터마크 설정 확인 UI·데이터 없음

**일부만(추가 개발 필요)**

- ★★★★ **기기 등록 제한** — devices.server ensureDeviceForPlayback + plan_policies max_devices_pc/mobile 로직 완비하나 ENFORCE_DEVICE 기본 off, playback-grant API가 fingerprint 미전달(벤더 확정 대기)

<sub>구현완료 5건: 로그인 회원만 재생 가능, 결제 / 수강권 보유 여부 확인, 수강기간 만료 시 재생 차단, 배수 초과 시 재생 차단, 중복 로그인 제한</sub>

## 시청 기록·진도

**일부만(추가 개발 필요)**

- ✅ **회원별 영상 시청 기록** — [해결 2026-07-10] admin-student-detail '영상 시청 기록' 섹션(manager+): getUserWatchHistory 가 강의별·회차별 시청시간(구간 union)·진도·최초/마지막 재생일 표로 표시.
- ★★★★★ **마지막 재생 위치 저장** — watch.server 하트비트가 watch_positions upsert(저장)하나 이를 읽어 이어보기 제공하는 플레이어/소비 코드 없음(벤더 플레이어 미연동)
- ✅ **최초 재생일 / 마지막 재생일 확인** — [해결 2026-07-10] getUserWatchHistory 가 watch_events reported_at min/max 로 회차별 최초·마지막 재생일 파생, 회원 상세 시청기록 표에 표시.

<sub>구현완료 5건: 영상별 누적 재생시간, 진도율 확인, 수강기간 일시정지 신청, 배수 사용량 확인, 강의별 완강 여부 확인</sub>

## 수강 배수

**일부만(추가 개발 필요)**

- ★★ **특정 회차만 배수 조정** — insertLedgerAdjustment lessonId 파라미터 지원하나 admin UI credit/reset은 enrollment 단위, 회차 선택기 없음

<sub>구현완료 5건: 강의 총 재생시간 기준 배수 계산, 회원별 사용 배수 조회, 관리자 배수 초기화, 오류 발생 시 배수 복구, 배수 차감 예외 처리</sub>

## 기기 관리

**일부만(추가 개발 필요)**

- ★★ **비정상 접속 기록 확인** — playback_grants client_ip/user_agent·device_reset_logs 캡처는 있으나 다지역/VPN/반복변경 이상탐지·조회 화면 없음

<sub>구현완료 4건: 회원별 등록 기기 조회, 등록 기기 초기화, 기기 변경 횟수 제한, 관리자 강제 초기화</sub>

## 재생 오류·장애 로그

**미구현**

- ★★★ **영상 재생 오류 로그 확인** — 재생 실패/오류 로그 테이블·조회 화면 없음(코드 미구현, 설계 문서에만 존재)
- ★★ **재생 실패 시간 확인** — playback_failures 테이블·재생실패 로깅 코드 없음(access-log만 존재, DRM 재생 오류코드/실패시각 기록 미구현)
- ★★ **DRM 플레이어 오류코드 저장** — playback_errors 등 DRM 오류코드 테이블·저장 경로 없음. watch-heartbeat도 error code 미수집

**일부만(추가 개발 필요)**

- ★★ **회원별 접속 환경 확인** — admin-access-logs가 회원별 client(PC/모바일)/browser/device(OS)/ip 표시(parseUserAgent). 단 '오류 발생 당시' 연계·앱 버전 정보는 없음(로그인 시점 환경만).
- ✅ **관리자 메모 등록** — [해결 2026-07-10] admin-student-detail CS 처리 이력 섹션의 상담 메모 입력(cs_actions memo). recordCsAction 이 기기초기화 외 memo 경로로도 호출됨.

<sub>구현완료 1건: 배수 복구 / 수강기간 보상 처리</sub>

## 결제→수강권 자동 처리

✅ 전부 구현 (5건)

## 보안·권한·접속 로그

**일부만(추가 개발 필요)**

- ★★★★ **비정상 이용자 차단** — 기기변경 제한+단일세션+강의노트 이상열람 알림(abuse.server, 알림만) 있으나 VPN/계정공유 감지·재생/로그인 자동 차단 미구현

<sub>구현완료 6건: 관리자 권한 분리, 관리자별 접근 메뉴 제한, 영상 ID 직접 노출 최소화, 재생 URL 임시 토큰 발급, URL 복사 재생 방지, 접속 로그 저장</sub>

## 강사용

**미구현**

- ★★ **본인 강의 영상 목록 조회** — admin-lms-courses는 lms_video_admin duty staff에게 전체 시리즈 노출. 강사 본인 담당(series.instructor_id) 스코프 목록 화면 없음
- ★★ **회차별 재생 확인** — 강사용 test-play 화면·강사 배수차감 예외 없음(playback에 instructor 예외 무). 플레이어 화면 자체 미구현
- ★★ **강의별 수강생 진도 확인** — getLessonProgressForUser는 학생 본인(my-courses)만 사용. 강사용 강의별 수강생 진도율/완강률/마지막수강일 집계 화면 없음.

**일부만(추가 개발 필요)**

- ★★ **수강생 질문 확인** — qna 기능(강사 답변) 존재하나 과목 기반 — 영상/강의별 스코프 질문함 아님

## CS(고객상담)

**미구현**

- ★★★ **재생 오류 확인** — 재생 실패/오류코드/접속환경 저장 로그 없음. playback-grant는 deny reason을 응답만 하고 미영속

**일부만(추가 개발 필요)**

- ✅ **상담 메모 저장** — [해결 2026-07-10] admin-student-detail 'CS 처리 이력' 섹션(manager+)에 상담 메모 입력(cs_actions kind=memo, /api/admin/cs-memo).
- ✅ **처리 이력 확인** — [해결 2026-07-10] 같은 섹션이 listCsActionsForUser 를 소비해 기기초기화·연장·차단·환불지원·메모 등 CS 원장 통합 표시. enrollment 조치(set_dates/set_blocked_lessons 포함)는 logEnrollmentAdminAction 이 cs_actions 로 미러.

<sub>구현완료 5건: 회원 검색, 수강 중인 강의 확인, 기기 초기화, 배수 복구, 수강기간 연장</sub>

## 주문·결제·배송 관리

**일부만(추가 개발 필요)**

- ★★★★★ **환불관리** — admin-orders 항목별 부분/전체 환불+토스 부분취소 관리 있으나 사용자 환불요청→승인/거절 워크플로 없음(운영자 개시만)
- ✅ **전자결제관리** — [해결 2026-07-10] admin-payments 결제내역에 결제수단(toss_response.method '카드' 등 → 비토스는 order.payment_method 라벨)·승인번호(toss_payment_key, 토스주문번호 병기) 컬럼 추가. 학생 /lecture/payments 결제내역에도 승인번호 노출.
- ★★ **임시주문항목관리** — orders draft/pending 상태 존재·admin-orders status 필터로 조회 가능하나 전용 임시주문항목 관리 화면 없음
- ★★★★ **도서 주문 분리 조회** — order_items.item_type(book) 기록·'(도서)' 라벨·상태/텍스트 검색은 있으나 강의/도서 구분 필터·'교재 포함만' 필터 없음

<sub>구현완료 6건: 주문목록, 정기구독결제내역, 배송관리, 도서배송관리, 배송상태 등록, 택배사 및 송장번호 등록</sub>

## 통계·정산(매출/주문/환불)

**미구현**

- ★★★★ **도서정산 메뉴** — 정산은 강사정산(settlements-admin)만. 도서 저자·출판 기준 정산(도서별 매출/환불/공제/정산액) 화면 없음 [P5 후보]

**일부만(추가 개발 필요)**

- ★★★ **정기구독통계** — admin-payments에 결제실패 건수 있으나 구독 갱신율/해지율 등 구독 전용 통계 대시보드 없음(billing key·구독 인프라는 존재) [P5 후보]

**[해결 2026-07-10 · P2] /admin/sales/stats 매출 통계 신설** — order_items × orders(결제완료) 항목 단위 집계(sales-stats.server getSalesStats). 아래 갭 일괄 해결:

- ✅ **도서별 매출 통계** — 도서 랭킹 표(판매수량·결제액·환불액·순매출). 재고소진은 admin-books 별개.
- ✅ **도서 매출 통계** — 강의 vs 교재 카테고리 분리 집계(CATEGORY_OF).
- ✅ **도서매출관리** — 도서 전용 랭킹(건수/판매권수/매출/환불/순매출). v_sales_books 대체(환불·기간필터 포함).
- ✅ **과정주문통계** — 강의 상품 랭킹(순매출순). 상품별 수량·결제·환불·순매출.
- ✅ **과정매출통계** — 강의 상품 랭킹의 순매출 = 과정별 매출액. 기간필터 지원.
- ✅ **과정별환불통계** — 상품 랭킹에 상품별 환불액 노출(환불률%는 미표시 — 필요 시 추가).
- ✅ **일별주문항목통계** — 기간×카테고리(강의/교재) breakdown 표(일별 granularity).
- ✅ **월별주문항목통계** — 동일 표 월별 granularity + 상품 랭킹.

<sub>구현완료 8건: 일별주문통계, 월별주문통계, 정산관리, 강사별 정산 내역, 일별환불통계, 월별환불통계, 일별매출통계, 월별매출통계</sub>

## 쿠폰(운영자)

**일부만(추가 개발 필요)**

- ★★★★ **자동쿠폰관리** — issueAutoCoupons signup/first_purchase 자동발급 동작(welcome·onOrderPaid). 특정상품/이벤트 트리거·auto_issue 설정 admin UI 없음

<sub>구현완료 1건: 쿠폰관리</sub>

## 마이페이지(수강생)

**미구현**

- ★★★★ **후기작성** — 강의 후기/리뷰 테이블 없음(rating은 pass_prediction_snapshots용). community review=합격수기
- ★★★ **구독 재개** — cancel-subscription(해지)만 존재. 해지된 구독 재활성화/auto_renew 재개 액션 없음(재구독은 /pricing 신규 결제).
- ★★★ **현금영수증 / 영수증 출력** — lecture-payments·my-orders 결제내역 조회만 — 영수증/현금영수증 출력·다운로드 기능 없음(lecture-certificates는 수료증)
- ★★★ **후기 작성** — 강의(course)에 대한 후기/별점 작성 기능·course_reviews 테이블 없음. 커뮤니티 합격 수기(review)는 강의 후기와 별개
- ★★★ **별점 평가** — 강의 별점 rating 테이블·UI 없음(course/lecture review 미구현)
- ★★★ **후기 수정 및 삭제** — 강의 평가/후기(별점) 시스템 미구현. course/lecture reviews 테이블 없음(community 일반글·합격수기만 존재)
- ★★★ **내 후기 조회** — 강의 평가/별점·강의 후기(course_review) 기능 자체가 없음. community는 합격수기 board만. 본인 강의후기 목록 화면 없음.

**일부만(추가 개발 필요)**

- ★★★★★ **결제내역조회** — lecture-payments.tsx·my-orders.tsx: 주문번호·상품·금액·결제일·환불상태 표시하나 영수증 출력 기능 없음
- ★★★★ **최근 수강 강의** — watch_positions 이어보기 인프라·my-courses 진도 표시는 있으나 '최근 수강 바로 이어보기' CTA·재생 플레이어 화면 없음
- ★★★ **다음 결제 예정일 확인** — my-subscription.tsx 만료일 + '매월 자동결제' 배지 표시하나 명시적 '다음 결제 예정일' 필드/날짜 없음
- ✅ **결제내역 조회** — [해결 2026-07-10] lecture-payments.tsx 에 승인번호(payments.toss_payment_key, self-read 조인) 노출 추가.
- ★★★★★ **송장번호 확인 및 배송조회** — my-orders 택배사·송장번호 텍스트 표시하나 택배사 배송조회 페이지 링크 없음
- ★★★★ **쿠폰 적용 가능 상품 확인** — 쿠폰 scope 데이터·couponScopeTokens·redeem 자격판정 존재하나 학생용 '적용 가능 강의/상품 목록' 확인 뷰 없음

<sub>구현완료 18건: 수강현황, 강의 일시정지, 정기구독, 쿠폰관리, 도서 배송조회, 수강 강의 목록 조회, 진도율 확인, 수강기간 확인, 배수 사용량 확인(마이페이지), 구독 상품 확인, 결제 카드 정보 확인, 구독 해지, 주문내역 조회, 환불내역 조회, 도서 배송상태 확인, 보유 쿠폰 조회, 사용 완료 쿠폰 조회, 만료 쿠폰 조회</sub>

