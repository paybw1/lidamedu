# feat-11-013 — 강의상품 과정유형 · 환불관리 (260914 요청서)

요청서 원문: `source/학습플랫폼/보완요청4_강의유형+환불.html`
텍스트 사본: `docs/features/requests/보완요청4_강의유형+환불_260914.txt` (1,431줄)
상위 문서: [[feat-11-012]] `feat-11-012-lecture-open-readiness-260913.md` · [[feat-11-011]] · [[feat-11-008]] · `lidamedu-이전-M1-설계.md`

> **이 문서의 지위** — feat-11-008·011 과 같은 형식(현황 감사 → 설계 결정 → Phase → 게이트)이다.
> 구현은 이 문서만 보고 진행할 수 있어야 한다. **원장 승인(D 항목) 전에는 코드에 손대지 않는다.**

---

## 0. 요약 — 두 PART 의 실제 성격

| PART | 요청 내용 | 실제 성격 |
|---|---|---|
| **A** | 과정 유형 6종 선택 + 유형별 조건부 입력 | **절반은 이미 있다.** 강의↔판매상품 분리(M:N)와 수강정책 20여 칸(`plan_policies`)은 이미 있다. 없는 것은 **①유형이라는 축 ②현장강의 ③패키지의 강의별 정책** |
| **B** | 관리자 수동 환불 + 토스 수동취소 + 환불규정 자동계산 | **계산기는 새로 만들 수 있으나 넣을 값이 저장돼 있지 않다.** 스냅샷 부재가 이 PART 의 본체다 |

### ★이 요청서를 읽으며 발견한, 요청서와 **무관하게 지금 틀린 것 4건**

감사 과정에서 나왔다. 요청서가 없었어도 오픈 전에 고쳐야 한다. **P0 으로 따로 뺀다.**

| | 증상 | 근거 |
|---|---|---|
| ★1 | **쿠폰 쓴 주문은 환불이 안 되거나 과환불된다** | `refundOrderItem` 이 환불액을 `unit_price_krw × quantity`(= **할인 전** 금액)로 잡아 토스 `cancelAmount` 로 보낸다. 단건이면 취소가능잔액 초과로 **토스가 거절**, 다건이면 앞 항목이 **실제 돈을 과환불**한다 — `orders.server.ts:564,589` |
| ★2 | **토스에서 부분취소하면 수강권이 살아남는다** | 웹훅 `PARTIAL_CANCELED` 가 `payments` 만 갱신하고 `order_items`·`enrollments` 를 건드리지 않는다 — `webhook.server.ts:285-302`. ★요청서가 **바로 이 운영(관리자 수동 부분취소)** 을 기본으로 삼으므로, 고치지 않으면 새 운영이 조용히 깨진다 |
| ★3 | **화면의 「N일 수강」과 실제 수강권 기간이 다를 수 있다** | 표기는 `subscription_plans.duration_days`(폼 "이용 기간", 기본 30), 실제 만료일 계산은 `plan_policies.duration_days`(폼 "수강기간", 기본 180). **동기화 코드가 없다** — `queries.server.ts:1130` vs `orders.server.ts:361-372` |
| ★4 | **재구매 시 만료일 연장 대신 수강권이 하나 더 생긴다** | 기존 수강권 조회가 오작동해 `existing` 이 항상 null — `orders.server.ts:392-394` (코드 주석에 이미 기록돼 있음) |

### ★요청서 전체의 진짜 난이도 — 「결제 당시 스냅샷」

요청서 11-1 이 못 박는다: *「환불 계산은 현재 상품정보가 아니라 반드시 **결제 당시 저장된** 가격·기간·예정 회차·쿠폰/포인트 배분값·환불규정을 기준으로 한다」*.

그런데 지금 `order_items` 가 남기는 스냅샷은 **표시명과 단가 둘뿐**이다. 수강정책은 `plan_policies` 를 **실시간으로** 읽는다 — 즉 **상품 정책을 고치면 기존 수강생의 판정이 즉시 바뀐다.** 요청서와 정면으로 충돌한다.

→ **스냅샷 칸을 먼저 만들고 주문 생성 경로가 그것을 채우게 한 다음**에야 계산기가 의미를 갖는다. 순서를 뒤집으면 계산기는 만들었는데 넣을 값이 없다.

---

## 1. 현황 감사 (2026-09-14, 운영 DB `mcgdoplo` 실측 + 코드 전수)

### 1.1 이미 있는 것 — 요청서가 「만들어 달라」고 하지만 있는 것

| 요청 항목 | 실제 |
|---|---|
| **강의 원본 ↔ 판매상품 분리** | **이미 되어 있다.** `course_series → courses(에디션) → course_lessons → lesson_videos` 원본 축과 `subscription_plans` 판매 축을 `plan_courses(plan_id, course_id)` 복합 PK 가 M:N 으로 잇는다. 하나의 강의를 여러 상품에 연결하는 것도 지금 가능하고, `courses` 는 `on delete restrict` 라 **상품을 지워도 원본이 보호**된다 |
| 수강일수 · **정규과정 고정 종료일** | `plan_policies.duration_days` · `fixed_end_date` — ②온라인 정규의 뼈대가 이미 있다 |
| 일시정지 정책 5종 | `pause_allowed / pause_max_count / pause_min_days / pause_max_days / pause_total_days` + 서버 검증 + 자동 재개 |
| 유료 연장 | `extension_allowed / _price_krw / _max_count / _days / extension_plan_ids` + `enrollment_extensions` + 화면·서버 동일 함수 |
| 교재 포함 여부 | `plan_book_links(requirement, book_role)` |
| 상시 패키지(T-PASS) 자리 | `product_kind` CHECK 에 `tpass` **이미 포함**(현재 데이터 0건) |
| 이용일수에서 일시정지 제외 | `enrollment_pauses(starts_on, ends_on, days)` 로 계산 가능 |
| **유료 영상 이용이력** | `watch_ledger`(권위 원장) · `watch_events` · `playback_grants` · `v_enrollment_watch_balance`. ★`enrollments.order_item_id` 로 **「주문항목 → 수강권 → 시청초」 경로가 이미 성립**하고, 회차 중복 제거는 `DISTINCT lesson_id` 로 바로 된다(요청서 11-4) |
| 항목 단위 부분환불의 **회수 쪽** | `revokeItemFulfillment` 가 수강권 revoke · 연장 원복 · 도서 반품 · 재고 복원까지 이미 한다 |
| 환불의 정산·매출 반영 | `settlement-sources.server.ts` · `sales-stats.server.ts` · `business-kpis.server.ts`(환불율). 환불은 `refunded_at` 월에 귀속 |
| **수동 장부 패턴** | `orders.server.ts:566-567`(`payment_method !== "toss"` 면 토스를 건너뛰고 장부만 기록) · `refund-admin.server.ts:87-92`(`manual = !toss_payment_key`). ★**요청서가 원하는 모양이 무통장용으로 이미 구현돼 있다** |

### 1.2 ★없는 것 — PART A

| 요청 항목 | 실태 |
|---|---|
| **과정 유형이라는 축** | 없다. `product_kind`(subject/bundle/membership/course/tpass)는 **다른 축**이다 — 「무엇을 주는가」(학습 구독 vs 수강권)이고, 요청서의 유형은 「어떻게 운영하는가」다. 게다가 `["course","tpass"]` 하드코딩 분기가 **10곳 이상**(이행·웹훅·무통장·장바구니·매출통계·강사귀속·회원등급)이라 값을 늘리면 그 전부가 흔들린다 |
| `courses.course_type` | 값이 `theory`/null 뿐 — **강의 성격이지 과정 유형이 아니다.** 이름이 비슷하니 재사용하지 않는다 |
| **패키지의 강의별 정책** | `plan_policies` 는 plan 당 **1행(1:1)**, `plan_courses` 는 **두 컬럼짜리 순수 조인**이다. 요청서 ⑤⑥이 요구하는 강의별 수강기간·공개일·정상가·환불 배분 기준을 **붙일 칸이 한 개도 없다** |
| **전체 예정 회차(T)** | 어디에도 없다. 요청서 11-8 이 **필수 입력**으로 요구하고 단과 계산식의 분모다. 「종강/미종강」 개념도 없다(`courses.status` 는 draft/published/archived 3값) |
| 수강 시작 기준 · 배속 제한 · 중간신청 정책 · 강의 공개 일정 · 판매 종료일 | 없다(배속은 랜딩 **마케팅 문구**로만 존재) |
| **현장강의** | 「현장」이 **서로 무관한 세 곳**에 흩어져 있고 셋 다 판매·수강 로직과 끊겨 있다 — 아래 1.3 |
| 유형 변경 제한 · 상품 복사 | 없다 |
| 강의 수정이 판매상품에 미치는 영향 표시 | 없다(역방향 조회 화면 0곳) |

### 1.3 ★현장강의 — 「현장」이 세 곳에 흩어져 있다

| | 위치 | 실태 |
|---|---|---|
| (a) | `lecture_schedules` (랜딩 안내) | `start_date · day_label · time_label · format · capacity · enrolled · status · **plan_code**` 를 갖는다. ★그러나 **정원이 순수 표시값**이다 — `capacity`·`enrolled` 둘 다 관리자가 손으로 타이핑하고, 구매 버튼은 잔여석을 **전혀 보지 않는다**(「마감」 배지가 떠 있어도 결제된다). 역참조 0곳 |
| (b) | `subscription_plans.lecture_category = 'onsite'` | **쓰기가 동결**된 라벨(카탈로그 탭은 `course_categories` 로 이관 완료). `onsite` 가 붙어도 판매·이행은 온라인과 100% 동일 |
| (c) | `cohorts` + `cohort_class_sessions` + `cohort_attendance` | 출결 엔진이 **완성돼 실제 운영 중**(출석부·출석률·at-risk). 그러나 FK 가 `cohort_id`·`profile_id` 뿐이라 `enrollments`·`subscription_plans` 어느 쪽과도 **연결이 없고**, `cohorts` 에는 정원 컬럼조차 없다(가입이 결제가 아니라 운영자 승인이므로) |

요청서 「현장 강의」의 설정 9개 중 **DB 에 자리가 있는 것은 개강일·요일·시간·정원(표시용)뿐**이다. 강의실·접수기간·대기신청·명단 연동은 전무하고, 검수항목 ⑥ 「현장 정원 초과 신청이 차단됨」은 **결제 시점 좌석 차감(동시성 포함)을 새로 만들어야** 충족된다.

### 1.4 ★없는 것 — PART B (환불 계산의 입력값)

요청서 11-1 기준값 표를 실제 스키마와 대조한 결과다.

| 기준값 | 지금 | 판정 |
|---|---|---|
| 결제기준금액 **B** | `order_items.unit_price_krw` | 있음 |
| **실제 PG 결제금액(항목별)** | **어디에도 없다.** 단일 권위는 `payments.amount_krw`(주문 전체) | ✗ ★위 P0-★1 의 근본 |
| 정상가 **N** | `subscription_plans.list_price_krw` 는 있으나 **주문에 스냅샷되지 않는다.** ★게다가 **세트 도서는 `unit_price_krw` 자체가 이미 안분된 할인가**라(`cart-resolve.server.ts:235-246`) **역산도 불가능** | ✗ |
| 쿠폰 사용금액 **C**(항목별) | 쿠폰은 **주문 단위**뿐. 항목 배분은 정산이 읽을 때마다 `allocateDiscount` 로 **재계산하고 저장하지 않는다** | ✗ |
| 사용 포인트 **Q** | ★**포인트로 결제하는 기능 자체가 없다** — 아래 1.5 | ✗ |
| 정가 수강기간 **D** | `plan_policies.duration_days` 는 있으나 스냅샷 안 됨 | ✗ |
| 실제 이용일수 **d** | `enrollments.starts_at` + `enrollment_pauses` 로 계산 가능 | 있음 |
| 전체 예정 회차 **T** | 없다 | ✗ |
| 이용 회차 **t** | 영상은 `watch_events` 로 가능. ★**자료 이용이력이 없다** — 아래 1.5 | 일부 |
| 환불 계산유형 · 상품별 별도 환불규정 | 없다 | ✗ |

**공제·안분 로직은 전 코드베이스에 0건**이다. 현재 환불액은 한 줄이다 — `const refundKrw = item.unit_price_krw * item.quantity;`

### 1.5 ★요청서가 전제하지만 **기능 자체가 없는 것**

- **포인트로 결제하기.** 요청서 11-11 은 「포인트 반환액 = MIN(사용 포인트, 환불 대상금액)」을 요구하지만 **주문에 포인트를 쓰는 경로가 없다.** 실측: `orders` 에 포인트 칸 없음 · `point_transactions.order_id` 가 붙은 행 **0건** · 코드의 `spend` 는 **관리자 수동 차감 화면 한 곳**뿐. 포인트는 **쿠폰 교환**(`point_coupon_offers`)으로만 소비된다. → **Q 는 당분간 항상 0.** 자리는 만들되 「포인트 결제」를 여는 것은 **별건**이다(D15).
- **강의자료 이용이력.** `material-download.tsx:44-51` 은 권한 판정 후 signed URL 로 보낼 뿐 **기록을 남기지 않는다.** 요청서 11-4 의 4가지 판정 중 **3가지를 지금은 판정할 수 없고**, ★**지금 로깅을 넣어도 과거 건은 영원히 계산할 수 없다**(도서 PDF 만 `book_downloads` 로 예외).
- **쿠폰 복원 가능 플래그.** `coupons` 에 없다. 요청서 11-10 의 「[환불 시 복원 가능]으로 설정된 쿠폰만 복원」을 표현할 칸이 없다.

### 1.6 ★현행 환불 코드의 나머지 결함

- **포인트 회수 함수가 있는데 아무도 부르지 않는다** — `revokePoints`(`points.server.ts:199-231`) 호출자 **0건**. 환불해도 적립 포인트가 남는다.
- **쿠폰은 환불해도 영구 소진** — 사용 기록만 있고 **해제 코드 0건**. 1인 1회 쿠폰이면 환불받은 학생은 다시 못 쓴다.
- **★`refund_amount_krw` 의미를 바꾸면 정산이 이중 할인된다** — `settlement-sources.server.ts:138-140` 은 이 값이 **할인 전**이라는 전제로 `scaleRefund` 를 건다. 새 설계가 실결제액을 넣기 시작하면 환불이 두 번 할인된다. **동반 수정 필수**: `settlement-sources.server.ts:138-140` · `sales-stats.server.ts:137` · `book-settlements-admin.server.ts:312`.
- **감사 원장이 2갈래** — `cs_actions`(항목 환불) vs `subscription_admin_logs`(결제 환불). **학생 알림 수단 없음**(`notifications/kinds.ts` 에 환불 kind 부재).

### 1.7 ★학생 셀프 환불은 **2경로**이고, 하나는 공개 정책문서에 묶여 있다

| | 경로 | 묶여 있는 것 |
|---|---|---|
| ① | `my-orders.tsx:251-307` + `api/refund-request.tsx` + `refund_requests` + 워크큐 배지 + 관리자 승인 패널 | ★feat-11-012 P7 에서 브라우저 `prompt()` 를 확인 다이얼로그로 바꾼 **바로 그 자리**다 |
| ② | `subscriptions/queries.server.ts:1003-1112` `cancelSubscription` — **3일 이내면 학생이 직접 전액환불을 실행**(토스 자동취소 포함) | ★**공개 정책문서 `app/features/legal/docs/refund-policy.mdx` 제3조·제5조 1항**에 그 권리가 적혀 있다 |

★**②는 코드만 지우면 게시된 규정과 어긋난다.** 정책문서 개정이 반드시 동반되고, 이건 **법무 성격의 결정**이다(D10).

### 1.8 토스 자동취소는 **3곳**

`orders.server.ts:581-591`(항목 부분취소) · `subscriptions/refund-admin.server.ts:36-43`(결제 전액취소) · `subscriptions/queries.server.ts:1050-1073`(**학생** 셀프해지 전액취소). 요청서는 셋 다 금지한다.
★**착지점은 이미 있다**(1.1 의 수동 장부 패턴). 요청서가 원하는 것은 새 구조가 아니라 **토스 주문도 그 분기로 보내고 앞에 「PG 취소 확인」 단계를 끼우는 것**이다.

---

## 2. 설계 결정

### D1. 과정 유형은 `subscription_plans.course_format` 신설 — `product_kind` 는 건드리지 않는다 **[설계]**

```
course_format: online_always | online_term | offline | blended | package_term | package_always
                   ①상시        ②정규        ③현장     ④혼합      ⑤정규패키지      ⑥상시패키지
```

`product_kind` 에 4값을 더하면 `["course","tpass"]` 하드코딩 10곳 이상(이행·웹훅·무통장·장바구니·매출통계·강사귀속·회원등급)을 전부 훑어야 하고, **학습 플랫폼 상품(subject/bundle/membership)이 같은 테이블을 쓰므로** 사고 반경이 강의 밖으로 나간다. 두 축은 직교한다 — `product_kind` 는 「무엇을 주는가」, `course_format` 은 「어떻게 운영하는가」.

백필: `course → online_always`, `tpass → package_always`. `course_format IS NULL` 은 **강의상품이 아님**(학습 플랫폼 구독)을 뜻하게 한다.

★유형별 **이행 분기**를 함께 정해야 한다 — 지금은 `plan_courses` 에 행이 있으면 무조건 온라인 수강권이 나간다. 현장(③)은 수강권 없이 좌석만, 혼합(④)은 **하나의 신청으로 좌석 + 수강권**(요청서 명시: 중복 생성·이중 차감 금지).

### D2. 수강기간 두 컬럼 정리 — `plan_policies.duration_days` 를 권위로 **[설계 · P0]**

`subscription_plans.duration_days` 는 학습 플랫폼 구독 지급에만 쓰고, **강의상품의 표시도 `plan_policies` 에서 읽게** 바꾼다. 지금은 화면에 「30일」이라 적혀 있어도 180일 수강권이 나갈 수 있다(★P0-3).

### D3. 강의별 정책은 `plan_courses` 를 넓혀 담는다 **[설계]**

`plan_courses` 에 추가: `duration_days`, `opens_at`, `list_price_krw`, `multiplier`, `refund_weight`.
**전부 NULL 허용**이고 NULL 이면 상품 단위 값을 상속한다 — 그래야 기존 상품이 안 깨지고 단과(①②)는 지금 모양 그대로다.
★`fulfillCourseEnrollments` 가 **강의 단위 루프**로 재작성된다(현재는 상품 단위 단일 값).

### D4. 현장강의는 `lecture_schedules` 를 정식화해 쓴다 — 새 테이블을 만들지 않는다 **[설계]**

이미 `plan_code`·`capacity`·`day_label`·`time_label`·`format` 이 있다. 필요한 것은 **연결의 정식화와 정원의 승격**이다.

1. `plan_code(text)` → `plan_id(uuid FK)` 로 정식화
2. 없는 칸 추가: `end_date`, `room`, `apply_starts_on`, `apply_ends_on`, `waitlist_allowed`, `attendance_enabled`
3. ★**정원을 표시값에서 판매 제한으로 승격** — `enrolled` 수기 입력을 버리고 **주문에서 파생**시키고, **`resolveCartItems` 에 좌석 검증을 붙인다**(도서 재고 검증이 이미 그 자리에 있다 — 같은 자리·같은 짜임). 동시성은 재고 원장 선례를 따른다
4. 출결은 **`cohort_attendance` 를 재사용하지 않는다.** 그건 학습 플랫폼 종합반(반 배정·과제·상담)에 묶여 있고, 상품에 묶으면 종합반 운영이 강의 판매에 끌려간다. 별도 `offline_attendance(schedule_id, user_id, session_no, status)` 를 두되 **상태값 5종은 SSOT 를 공유**한다

### D5. 스냅샷은 **평면 컬럼 6 + jsonb 1** 로 `order_items` 에 **[설계]**

```
paid_amount_krw            ★실제 PG 결제 귀속액 — P0-★1 의 근본 해결
list_price_snapshot_krw    정상가 N
duration_days_snapshot     정가 수강기간 D
planned_sessions_snapshot  전체 예정 회차 T
coupon_alloc_krw           항목별 쿠폰 배분액 C
point_alloc_krw            항목별 포인트 배분액 Q (당분간 0)
refund_calc_type           기간제 | 단과 | 단과묶음 | 별도규정
refund_policy_snapshot     jsonb — 상품별 별도 환불규정 원문
```

jsonb 한 칸에 몰지 않는 이유: 요청서 §10 「최초 결제금액 초과 누적 차단」과 §11-15 「화면 표시값 = DB 저장값」은 **SQL 합계·비교로 지켜야 하는 무결성**이다. jsonb 는 인덱싱도 집계도 불편하다. 자유 서술인 **환불규정 원문만** jsonb.

### D6. 전체 예정 회차(T) 는 `subscription_plans.planned_sessions` **[설계]**

등록 시 단과·패키지는 **필수 입력**(요청서 11-8). 판매 시작 후 변경하면 **변경이력·사유·처리자**를 남기고, **기존 주문은 스냅샷 값을 계속 쓴다**.

### D7. 환불 모델은 새 테이블 3종 — `refund_requests` 는 유물로 남긴다 **[설계]**

```
refunds            헤더 — 회원·주문·접수경로·접수일시·상담내용·첨부·담당자·상태·토스 취소정보·금액 5종
refund_items       대상 — ★order_item_id 만 참조한다 (course_id 아님)
refund_status_logs 이력 — 변경일시·담당자·전/후 상태·메모 (요청서 §8)
```

기존 `refund_requests` 는 **소유자가 학생, 상태가 3값**이다. 새 모델은 **소유자가 관리자, 상태가 12값**이다. 같은 테이블에 얹으면 두 모델이 섞인다 → 신규 생성 중단, UI 0곳, 기존 행은 읽기 전용.

★`refund_items` 가 **`order_item_id` 만** 참조하는 것이 요청서 11-9(「패키지 구성강좌 일부만 환불 불가」)를 **구조적으로** 보장한다 — 패키지는 order_item 1행이므로 쪼갤 수 없다. 반면 요청서 §2 의 「여러 상품 중 일부 환불」은 **장바구니 안의 다른 order_item**(강의 + 교재)을 뜻하므로 충돌하지 않는다.

학생에게는 요청서 §1 대로 **결과만** 보인다 — 환불상태·환불금액·처리일·대상상품.

### D8. 후속처리는 **Postgres 함수(RPC) 한 번**으로 **[설계]**

요청서 §10 은 「하나라도 실패하면 일부만 변경된 상태가 남지 않도록」을 요구한다. 그런데 supabase-js 에는 **다중 문 트랜잭션이 없다.** 기존 패턴(멱등 단일 쓰기 + `firstTransition` 플래그)으로는 부족하다 — 수강권 중복은 **중복일 뿐**이지만 **수강권은 회수됐는데 정산은 미차감**은 **돈이 틀린 상태**다.

→ 확정 커밋 단계(수강권 회수 · 재고 복원 · 쿠폰 복원 · 포인트 회수 · 상태 전이)를 **RPC 한 번**으로 묶는다. 선례: 메모 `soft-delete-rls-rpc`.

### D9. 토스 자동취소 제거 — 기존 manual 분기로 합류 **[설계]**

★**단, 웹훅 `PARTIAL_CANCELED` 를 먼저 고친다.** 안 고치고 「관리자 수동 부분취소」 운영을 시작하면 **돈은 돌려줬는데 수강권이 살아 있고 정산에도 안 잡힌다**(P0-★2). 순서를 지킨다.

### D10. 학생 셀프 환불 제거 — ★**정책문서 개정 동반** **[원장 결정 필요]**

경로 ①은 코드만 지우면 된다. 경로 ②(3일 이내 셀프 전액환불)는 **공개 정책문서 `refund-policy.mdx` 제3조·제5조 1항**에 권리로 적혀 있다. **코드만 지우면 게시된 규정과 어긋난다.**

- **권고**: 요청서대로 ①②를 모두 닫되, **정책문서 개정을 같은 배포에 묶는다.** 개정 문구는 원장·법무 확인이 필요하다.

### D11. 계산 엔진은 **순수 함수 + 테스트** **[설계]**

`app/features/refunds/lib/refund-calc.ts` — DB 접근 0, 입력은 스냅샷 값 묶음, 출력은 요청서 11-13 의 표시항목 전부(산출근거 포함). 선례: `lms/lib/play-limit.ts`.
★**요청서 §12 의 예시 A·B 를 그대로 단위 테스트로 못 박는다**(A: 150,000원 / B: 100,000원). 이 요청서에서 **유일하게 정답이 주어진 부분**이라 회귀 방지 가치가 가장 높다.
반올림은 요청서 11-15 대로 **최종 공제액에서 원 단위 미만 절사**, 최종 금액은 1원 단위, 계산은 정수 원 단위로만.

### D12. 배속 제한 · 기기 등록 제한 — ★**이전 결정과 충돌** **[원장 결정 필요]**

요청서 ①이 둘 다 「선택 시 필요한 설정」으로 요구한다. 그런데:

- **기기 수 입력란은 feat-11-011 P7 에서 원장 결정으로 삭제**했다(코드 주석: *「기기 허용은 콜러스 정책이 단독으로 정한다」*). 요청서는 **그 결정을 뒤집는 것**이다.
- **배속 제한은 컬럼·검증이 0곳**이다(랜딩 마케팅 문구 「배속·구간반복」만 존재). 새로 만들어야 하고, **콜러스 플레이어가 배속을 제어할 수 있는지**가 선행 확인 사항이다.

- **권고**: 기기는 **이전 결정 유지**(콜러스 단독), 배속은 **벤더 확인 후 별건**. 둘 다 이번 범위에서 뺀다.

### D13. 수강배수의 권위 — `plan_policies.multiplier` vs `courses.max_plays` **[원장 결정 필요]**

지금 **두 축이 병존**하는데 실제로 작동하는 것은 후자뿐이다 — `ENFORCE_MULTIPLIER = false` 가 하드코딩돼 있고(`playback.server.ts:14`), 재생 제한은 `courses.max_plays × 회차길이` vs `watch_ledger` 로 판정된다.

요청서는 **상품 유형별 수강배수**를 요구하므로 상품 축(`plan_policies`)이 맞다. 그러나 지금 화면에서 배수를 고르면 **아무 일도 일어나지 않는다**(저장만 된다).

- **권고**: 상품 축을 권위로 삼고 `ENFORCE_MULTIPLIER` 를 켜되, **켜기 전에 feat-11-012 P6 에서 했던 것과 같은 운영 dry-run**(지금 수강생 중 몇 명이 새로 잠기는지)을 반드시 먼저 돌린다.

### D14. 7단계 위저드 — **채택 여부** **[원장 결정 필요]**

요청서 §A-2 는 7단계 위저드를 요구한다. 현재는 `/admin/pricing` 의 **인라인 단일 폼**이고, 등록 화면이 **3개로 쪼개져 있다**(`/admin/lectures` 목록 → `/admin/pricing` 등록 → `/admin/lms/courses/:id` 회차·영상).

- **권고**: 이번에는 **기존 폼에 「유형 선택 + 유형별 조건부 노출」만** 넣는다. 위저드는 **가장 큰 UI 공사이면서 가장 덜 중요하다**(정확성에 기여하지 않는다). 별건으로 분리.

### D15. 포인트 결제 — **구현한다** **[원장 지시 2026-09-14 · 방식은 승인 대기]**

요청서 11-11 이 전제하지만 **기능 자체가 없었다**(1.5). 원장 지시로 **연다**
(제 당초 권고는 「이번 범위에서 뺀다」였으나 원장이 구현으로 결정 — 지시를 따른다).

#### D15-a. 규칙 — ★현행 정책에 **없어서 새로 정하는** 부분

현행 포인트 정책 문서는 **적립만** 정의하고, 사용은 「[쿠폰 전환 관리]에서 등록한 쿠폰과
교환」뿐이다. **직접 결제의 단위·한도·전액결제 허용 여부는 어디에도 없다.** 아래는 제안이다.

| 항목 | 안 | 근거 |
|---|---|---|
| 환산 | 1P = 1원 | 쿠폰 교환(`point_coupon_offers.point_cost`)이 이미 원 단위 환산이다 |
| 사용 단위 | 100P | 1P 단위는 잔돈이 남아 배분·환불 반환이 지저분해진다 |
| 최소 보유 | 1,000P 이상일 때만 사용 가능 | 가입 5,000P 를 받은 회원이 바로 쓸 수 있는 수준 |
| 쿠폰과 병용 | 허용. **쿠폰 먼저, 포인트 나중** | `allocateOrderDiscounts` 가 이미 이 순서다(P1) |
| 사용 상한 | **결제금액 − 1,000원** (전액 포인트 결제 불가) | ★아래 참조 |
| 환불 | **포인트 우선 반환**, 나머지를 토스 취소 (요청서 11-11) | 요청서 공식 그대로 |

★**전액 포인트 결제를 막는 이유**는 정책 취향이 아니라 **경로가 없어서**다. 결제금액이
0원이면 토스 주문이 성립하지 않고, 무료 지급 경로는 feat-11-012 에서 **별도 과제로 남겨** 둔
상태다(`create-cart-order.tsx` 의 「결제 금액이 0원입니다」 400 이 지금도 그 자리를 막고 있다).
무료 지급 경로가 생기면 **이 상한만 풀면 된다** — 그렇게 풀리도록 상수 하나로 둔다.

#### D15-b. 차감 시점 — **주문 생성 시 예약**(확정 시 차감이 아니다)

토스는 `confirm` 에서 **돈을 가져간다.** 그 순간 잔액이 모자라면 되돌릴 방법이 없다
— 돈은 나갔는데 포인트는 다른 데 쓰인 상태가 된다. 확정 시 차감은 **가용성을 보장할 수
없으므로** 주문 생성 시 예약(차감)하고, 결제가 죽으면 되돌린다.

★그래서 **되돌리는 길을 전부 세는 것이 이 작업의 실제 범위**다.

| 죽는 경로 | 되돌릴 자리 | 상태 |
|---|---|---|
| 결제창 닫기 | `subscriptions/api/cancel-pending.tsx` | 있음 |
| 웹훅 `ABORTED`/`EXPIRED` | `webhook.server.ts` (해당 case) | 있음 |
| ★탭을 죽여 **웹훅이 영영 안 오는** 경우 | `expireStaleCheckoutOrders()` (30분 스윕) | **있음 — 여기 붙인다** |
| 무통장 72시간 잔류 | 종료 훅이 없다 | ★**v1 에서 무통장은 제외**(토스 전용) |

반환은 **멱등**이어야 한다 — 웹훅과 결제창 닫기가 둘 다 올 수 있다. 같은 `order_id` 의
반환 행이 이미 있으면 넣지 않는다.

#### D15-c. 운영 DDL 4건 (적용 전 승인 필요)

1. `orders.point_amount_krw integer NOT NULL default 0` — 주문 단위 포인트 사용액
2. `point_transactions.kind` CHECK 에 **`'restore'` 추가** — 현재 `earn/spend/expire/revoke/manual`
   뿐이라 **되돌리는 양(+) 을 표현할 칸이 없다**(`revokePoints` 는 음수 전용이다)
3. RPC `spend_points_for_order` 신설 — `exchange_points_for_coupon` 과 같은 짜임
   (`SECURITY DEFINER` · `auth.uid()` · jsonb `{ok,error}`), 단 **`pg_advisory_xact_lock` 을 건다**
4. RPC `exchange_points_for_coupon` **교체** — ★현행은 사용자 단위 잠금이 없어
   동시 요청 둘이 같은 잔액을 보고 **둘 다 통과**할 수 있다. 같은 잠금을 걸지 않으면
   쿠폰 교환이 주문 예약과 경합한다

#### D15-d. ★기존 환불 경로 동반 수정 — **빠뜨리면 학생 포인트가 사라진다**

`refundOrderItem` 에는 지금 `pointAmountKrw: 0` 자리표가 박혀 있다(P0-① 에서 남긴 것).
포인트 결제를 열면서 이걸 안 고치면, 포인트로 결제한 주문을 **오늘의 환불 경로로 환불할 때**
학생의 포인트가 **영구히 사라진다.** 선택이 아니라 돈 문제다.

- `orders.point_amount_krw` 를 읽어 넘기고,
- 항목의 `point_alloc_krw`(P1 스냅샷 — 이미 채워진다)만큼 **먼저 포인트로 반환**한 뒤,
- 남은 `paid_amount_krw` 를 토스 취소한다.

#### D15-f. 2026-09-14 구현 완료 — 무엇이 어디에

| 자리 | 한 일 |
|---|---|
| `points/lib/point-spend.ts` | 규칙 SSOT(1P=1원·100P 단위·보유 1,000P·상한 = 결제금액−1,000). 화면도 이걸 부른다 — 순수 모듈이라 build 가 안 깨진다. 테스트 15건 |
| `points/points-order.server.ts` | 해제·환불반환·**자가치유** 세 유틸. 전부 adminClient 전용 |
| `cart-quote.tsx` | `pointBalance`·`pointMaxUsableKrw` 를 견적에 실어 보냄(비로그인 null) |
| `create-cart-order.tsx` | 검증→거절(조용히 안 깎음) · **무통장 거부** · 주문 뒤 예약 RPC · 실패 시 **그 자리에서 주문 취소** |
| `createCartOrder` | 총액에서 포인트 차감 + `point_amount_krw` 저장 |
| `checkout-sheet.tsx` | 입력·적용·최대 버튼, 금액 행·버튼 라벨·토스 금액 **셋이 같은 수** |
| 해제 4경로 | 결제창 닫기 / 웹훅 ABORTED·EXPIRED / 30분 스윕 / **크론 자가치유** |
| 환불 | `refundOrderItem`(항목) + `markOrderRefundedAndRevoke`(주문 전체, 미환불 항목만) |

★**구현하며 바로잡은 것** — `cancelPendingCheckout` 의 `orderIds` 는 payments 에서 뽑은
목록이라 orders update 의 status 필터에 걸러진 것까지 들어 있었다. `.select()` 없이 그
목록으로 반환을 돌리면 **이미 결제된 주문의 포인트까지 되살아난다**(돈은 받고 포인트도
돌려주는 상태). 실제 전이분만 받아 쓰도록 고쳤다. 웹훅 쪽도 같은 이유로 `.select()` 를 걸었다.

★**원장 확인 필요(지금은 무해)** — `awardPoints("payment_complete")` 가 `total_krw` 를
적립 기준으로 쓴다. 총액이 포인트 차감 **후** 금액이 되었으므로, 이 정책을 켜면
**포인트로 낸 몫은 적립되지 않는다.** 아무도 고르지 않은 정책 변화다. 현재
`is_active=false`(중지)라 당장 영향은 없다 — 켜기 전에 정할 것.

★**아직 안 한 것** — 단건 결제 경로(`/api/payments/create-order` → `createSinglePlanOrder`)는
포인트를 받지 않는다. 장바구니·바로구매 4경로만 열렸다. 구독 요금제 화면에서 포인트가
안 보이는 것은 **의도**이며, 열려면 별도 작업이다.

#### D15-e. 이미 갖춰져 있어 **만들지 않는 것**

- `point_transactions.order_id` → `orders(order_id)` FK **있다**(이 용도로 만들어져 있었다)
- `kind='spend'` **있다**, `balance_after` 유지 방식 **있다**
- 항목별 포인트 배분(`point_alloc_krw`)과 배분 함수 **있다**(P1 에서 넣었고 테스트도 있다)
- `createCartOrder` 의 `pointAmountKrw` 인자 **있다**(P1 에서 미리 뚫어 뒀다)

---

## 3. Phase

> 원칙: **P0(지금 틀린 것) → P1(스냅샷) → 나머지.** 스냅샷 없이 계산기를 먼저 만들면 넣을 값이 없다.

| Phase | 내용 | 공수 | 선행 | 상태 |
|---|---|---|---|---|
| **P0** | ★**지금 틀린 것 4건** — ①환불액을 실결제액 기준으로(`paid_amount_krw`) ②웹훅 `PARTIAL_CANCELED` 가 항목·수강권까지 처리 ③수강기간 두 컬럼 정리(D2) ④재구매 수강권 중복 버그 | M | — | ✅ |
| **P1** | **스냅샷 기반** — `order_items` 7칸(D5) + 주문 생성 경로가 채우기 + `planned_sessions`(D6) + 쿠폰 항목 배분 **저장**(현재는 매번 재계산) | M | P0 | ✅ |
| **P2** | **과정 유형 축** — `course_format`(D1) + 백필 + 목록 배지·검색(요청서 §6) + 유형 변경 제한·상품 복사(§5) | M | — | 🔲 |
| **P3** | **유형별 조건부 등록** — 기존 폼에 유형 선택 + 필요한 항목만 노출(§3). 위저드는 D14 결정에 따름 | M | P2 | 🔲 |
| **P4** | **패키지 강의별 정책** — `plan_courses` 확장(D3) + `fulfillCourseEnrollments` 강의 단위 루프 재작성 | L | P2 | 🔲 |
| **P5** | **현장강의** — `lecture_schedules` 정식화 + **정원 서버 권위화**(D4) + 출결 + 혼합(④) 단일 신청 | L | P2 | 🔲 |
| **P6** | **환불 모델** — `refunds`/`refund_items`/`refund_status_logs`(D7) + 관리자 접수 화면 + 상태머신 12종 + **학생 셀프 2경로 제거 + 정책문서 개정**(D10) + 토스 자동취소 제거(D9) | L | P0·P1 | 🔲 |
| **P7** | **환불규정 자동계산** — 순수 함수 + §12 예시 A·B 테스트(D11) + 산출근거 표시 + 관리자 금액 조정(§11-14) | M | P1·P6 | 🔲 |
| **P8** | **후속처리** — 확정 커밋 RPC(D8) + 포인트 회수·쿠폰 복원 + ★**정산 3파일 동반 수정**(1.6) + 환불 알림 kind | M | P6·P7 | 🔲 |
| **P9** | **강의자료 이용이력 로깅** — `material_access_logs` 신설(1.5). ★지금 넣어도 과거는 소급 불가 | S | — | ✅ |

### 3.1 2026-09-14 실행 기록 — P0 · P1 · P9 완료

원장 지시: 「P0(틀린 것 4건) + P9(자료 이용이력 로깅) + P1(스냅샷) 먼저 진행」.

| 항목 | 무엇을 했나 | 파일 |
|---|---|---|
| P0-① | 환불액을 `단가×수량`(할인 **전**) 대신 **실결제 귀속액**으로. 스냅샷 없으면 정산과 같은 규칙으로 즉석 배분 | `orders.server.ts` · `lib/order-snapshot.ts` |
| P0-② | 웹훅 `PARTIAL_CANCELED` 가 토스 취소액과 항목 환불액 합을 대조, 어긋나면 `cs_actions(refund_assist)` 로 남김 | `subscriptions/webhook.server.ts` |
| P0-③ | 「N일 수강」 표시가 **실제 수강권을 만드는 값**(`plan_policies`)을 읽게. 고정 종료일 상품은 「YYYY-MM-DD 까지」 | `lms/queries.server.ts` · 카탈로그 · 상세 |
| P0-④ | 수동 부여가 이미 있는 수강권을 중복 생성하던 구멍 막음(409) | `admin-lms-enrollments.tsx` |
| P1 | `order_items` 스냅샷 8칸 + `subscription_plans.planned_sessions` 적용, 주문 생성 2경로가 채움 | `20260914_p1_order_snapshots.sql` · `orders.server.ts` |
| P9 | `material_access_logs` 신설 + 자료 다운로드가 기록 | `20260914_p9_material_access_logs.sql` · `material-download.tsx` |

★**이 묶음에 들어 있지 않은 것** — 오해를 막기 위해 적는다.

- **토스 자동취소 제거(D9)는 안 했다.** P0-① 은 보내는 **금액을 고쳤을 뿐**이고, 자동 호출 3곳은 그대로다. 제거는 **P6**.
- 환불 계산 엔진(P7)·환불 모델(P6)은 시작하지 않았다. P1 은 **그 입력값을 쌓기 시작**하는 데까지다.
- 스냅샷은 **이 시점 이후 주문부터** 찬다. 이전 주문은 `paid_amount_krw` 가 비어 있고, 읽는 쪽이 즉석 배분으로 메운다(`itemPaidAmountKrw`).

---

★**P9 를 먼저 넣는 편이 낫다.** 로깅은 작고, **넣지 않으면 그 사이의 이용이력이 영구히 사라진다.** P0 과 함께 가도 된다.

---

## 4. 게이트 (Phase 마다)

1. `npm run typecheck` · `npm run build` · 전체 테스트 통과
2. **운영 dry-run** — 스키마·금액을 바꾸는 Phase(P0·P1·P4·D13)는 **적용 전에** 「지금 데이터로 무엇이 달라지는지」를 실측한다(feat-11-012 P6 선례)
3. **DDL 은 `scripts/run-prod-sql.mjs` 경유**(★MCP supabase 툴 금지) + 롤백 SQL 짝 + `npm run db:typegen`
4. P7 은 **요청서 §12 예시 A·B 가 테스트로 통과**해야 완료로 친다
5. P6·P8 은 **부분 실패 시 일부만 바뀌지 않는지**를 실제로 깨뜨려 확인한다(요청서 §10)
6. 문서(`SPEC.md` feat-11-013, 이 문서) 갱신

---

## 5. ★원장 결정 대기 — 이것부터 답이 필요하다

| | 결정 | 권고 |
|---|---|---|
| **D10** | 학생 셀프 환불 2경로를 닫는다. 그 중 하나는 **공개 환불정책 제3조·제5조**에 적힌 권리다 — **정책문서 개정 동반** | 요청서대로 닫되 **정책 개정을 같은 배포에** |
| **D12** | 배속 제한·기기 등록 제한 — **feat-11-011 P7 결정(기기란 삭제, 콜러스 단독)을 뒤집는가** | 기기는 **유지**, 배속은 **벤더 확인 후 별건** |
| **D13** | 수강배수 권위를 상품(`plan_policies`)으로 옮기고 `ENFORCE_MULTIPLIER` 를 켜는가 | 켜되 **dry-run 먼저** |
| **D14** | 7단계 위저드를 이번에 만드는가 | **아니오** — 조건부 노출만, 위저드는 별건 |
| **D15** | 포인트 결제를 여는가 | **아니오** — 별건 |

그 밖에 **범위 결정**: 위 Phase 는 P0~P9 로 **전체 공수가 크다**. 요청서 두 PART 를 **동시에** 갈지, **PART B(환불)를 먼저** 갈지 정해 주시면 순서를 그에 맞춘다.
**권고: P0 + P9 + P1 을 먼저** — 지금 틀린 것을 고치고 스냅샷을 남기기 시작하는 것이 가장 급하다(스냅샷은 **늦을수록 과거가 사라진다**).
