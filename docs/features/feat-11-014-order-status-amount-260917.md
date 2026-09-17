# feat-11-014 — 주문관리 상태 변경 셀렉트 · 결제금액 관리자 정정 (260917 요청서)

> 요청서: `source/학습플랫폼/주문관리 상태변경 셀렉트 기능 요청서.html` (2026-09-17). 조사: 읽기 전용 리더 2갈래(주문 상태 / 결제금액) + 운영 `mcgdoplo` 실측(2026-09-17). **원장 결정 2026-09-17 12:13 반영(§5): PART 1 상태 셀렉트 착수(Q1~Q3), PART 2 결제금액 정정은 하지 않음(기록만).**

## 0. 한 줄

요청서는 「상태 항목을 셀렉트로」라고 적었지만, **주문 상태는 값이 아니라 돈·수강권·정산이 매달린 전이**다. `orders` 에는 상태 전이 트리거가 없고(운영 실측 트리거 = `updated_at` 1개), 지급·회수·포인트·쿠폰·정산 귀속은 전부 TS 함수(`markOrderPaidAndFulfill` / `markOrderRefundedAndRevoke` / `refundOrderItem`)와 `commit_refund` RPC 가 **특정 전이에 묶어** 수행한다. 값만 바꾸는 셀렉트를 만들면 다음이 그대로 일어난다.

| 값만 바꾸면 | 결과 |
|---|---|
| `paid` → `refunded` (환불완료 정리) | 정산·매출통계는 그 주문을 **계속 총매출**로 세고(`refunded ∈ PAID_STATUSES`) 환불액은 0, **수강권은 active 로 살아 있음** |
| `pending_deposit` → `paid` (결제완료) | `paid_at` null → 정산 월 귀속에서 빠지고, 수강권·배송·재고·쿠폰 훅 **미실행** |
| `paid` → `cancelled` (취소) | 포인트 반환 크론(`release_points_for_order`·고아 스윕)이 「결제 안 된 주문」으로 보고 **돈 받은 주문의 포인트를 돌려줌** |
| 아무 값이나 손으로 지정 | 다음 항목 단위 액션(환불 확정·웹훅 CANCELED)이 항목 상태에서 status 를 **다시 계산해 조용히 덮음** |

그래서 설계는 **「셀렉트 5값 → 5개의 보호된 경로 + 사유 필수 + 이력 원장」**이다. 새 뮤테이션 경로를 만들지 않고(Layer 2 규칙 8) 기존 경로에 셀렉트를 얹는다.

## 1. 현황 (실측)

| 항목 | 값 |
|---|---|
| 화면 | `/admin/orders`(`orders/screens/admin-orders.tsx`). 상태 열은 읽기 전용 Chip + `paid/partially_refunded` 에 「환불신청」 링크. 상태를 바꾸는 intent 3종: `confirm_transfer`(무통장 입금확인 → paid + 지급) · `resolve_refund`(레거시 학생 환불요청 승인/반려) · 기본(항목 환불, 토스 주문은 거부) |
| `orders.status` | text + CHECK 10값 `draft/attempted/pending_payment/pending_deposit/paid/partially_refunded/refunded/cancelled/failed/expired`. 코드 SSOT `orders/lib/order-status.ts`(typed). ★`admin-orders.tsx:39` 는 자체 untyped 라벨표를 따로 가짐 |
| 요청서 5값 대응 | 결제완료=`paid` · 취소=`cancelled` · 환불완료=`refunded` 는 1:1. **「주문접수」는 후보 3값**(`attempted/pending_payment/pending_deposit`) 중 불명. **「삭제」는 대응 개념 자체가 없음**(`deleted_at` 없음, delete 경로 0곳, FK 6종이 참조) |
| 이력 인프라 | `audit_logs`(`logAuditEvent`, 주문 행 0건) · `refund_status_logs`(트리거 + GUC `app.refund_actor` — service_role 쓰기에서 actor 가 비는 함정) · `cs_actions`. 주문용 상태 이력 테이블 없음 |
| 권한 | 주문관리 = manager 이상 + 직무 `lms_orders_admin`. 환불 **확정·되돌리기만 admin(원장)** — `refund-gate.server.ts` |
| 소유 판정 | PDF 다운로드·수강평 자격·도서 상세 3곳이 `status === 'paid'` **정확 일치** — 값이 바뀌면 자격이 즉시 사라짐 |
| 운영 분포 | 63건 — toss cancelled 24 · expired 32 · paid 3 · refunded 2, bank_transfer paid 2. `paid` 인데 `paid_at` null 0건. `refunds` 1건(`d9222fb9`, `amount_fixed`, this_refund null, pg_cancel 100,000 — **테스트인지 실건인지 확인 필요**, 실건이면 환불 미종결) |

## 2. 설계 — PART 1 상태 셀렉트

### D1. 5값 → 보호된 경로 매핑 **[설계]**

| 셀렉트 값 | 허용 출발 상태 | 실제로 실행되는 것 | 권한 |
|---|---|---|---|
| **결제완료** (무통장) | `pending_deposit` | 기존 `confirmBankTransfer`(`bank-transfer.server.ts`) → `markOrderPaidAndFulfill`(paid_at·포인트·수강권·배송·쿠폰) | manager + 직무 |
| 결제완료 (토스) | — | **A5 「진행하지 말 것」(2026-09-17)** — 토스 주문은 셀렉트에서 결제완료 불가(읽기 전용). 승인은 됐는데 결제 대기에 멈춘 건은 토스 개발자센터 웹훅 재전송으로 운영(기존 `syncPaymentFromToss` DONE 경로가 멱등 처리). 손으로 paid 를 찍는 경로는 없다 | — |
| **취소** | `pending_deposit / pending_payment / attempted` | **[단건 intent 신설, 처리는 기존 함수와 동일]** 관리자용 단건 취소가 아직 없다(학생용 `cancelPendingCheckout` 은 본인 소유·구독 payments 전용). 크론 만료 함수 `expireStaleCheckoutOrders`(→ `expired` + `releasePointsForOrders`) · `expireOverdueBankTransfers`(→ `cancelled`) 의 처리를 단건·사유 버전으로 추출해 `cancelled` + 포인트 반환 + 무통장 기한 종료. **`paid` → 취소 불허** — 돈 받은 주문은 환불 경로로만 | manager + 직무 |
| **환불완료** | `paid / partially_refunded` | **환불관리 수동 종결 단축**: 접수(`createRefundIntake`) + 전액 + `refund_method = bank/etc`(계좌환불·기타 — `REFUND_METHOD_LABELS` 라벨) + `pg_cancel_kind = null`(PG 취소 없음 — CHECK 는 null/full/partial) + `commitRefund`(수강권 회수·재고·쿠폰·포인트·정산 반영, 멱등). **PG 호출 0** — 요청서 조건 그대로. 「이미 밖에서 돌려준 돈」의 장부 정리이므로 실환급액 입력(기본 = 결제귀속액)·사유 필수 | **admin(원장)** — 환불 확정 게이트와 동일 |
| **주문접수** | 무통장 `cancelled / expired` → `pending_deposit` | **[신설]** intent `reopen_deposit`: 상태 복귀 + `bank_transfers` 입금 기한 재설정 + 이력. 토스 주문·`paid` 계열은 불가 | manager + 직무 |
| **삭제** | `draft / attempted / pending_payment / expired / cancelled / failed` (비결제 상태만) | **status 가 아니다** — `orders.archived_at` 보관 플래그로 목록에서 숨김(필터 「보관함」으로 열람). `paid/partially_refunded/refunded` 불가. 행 삭제는 FK 6종(order_items·payments·bank_transfers·refunds·point_transactions·coupon_redemptions)으로 불가 | manager + 직무 |

- 5값 밖의 현재 상태(`partially_refunded / failed / draft / attempted`)는 셀렉트를 **읽기 전용**으로 보인다(현재값 표시, 변경 불가).
- 셀렉트의 각 option 은 **현재 상태에서 허용되는 것만 활성**(전이 표는 `orders/lib/order-status.ts` 에 `ADMIN_TRANSITIONS` **[신설]** 로 SSOT, 서버가 같은 표로 재검증).
- 표의 함수명 중 실재하는 것: `confirmBankTransfer` · `syncPaymentFromToss` · `expireStaleCheckoutOrders` · `expireOverdueBankTransfers` · `releasePointsForOrders` · `createRefundIntake` · `commitRefund` · `takeOverPgCancelIfOpenRefund`(2026-09-17 grep 확인). **[신설]** 표시만 새로 만든다.
- `admin-orders.tsx` 의 untyped 라벨표는 제거하고 `order-status.ts` 의 typed SSOT 에 **운영자 라벨**을 병기한다(값 추가 시 컴파일 오류로 누락 차단).

### D2. 확인 절차 · 이력 **[설계]**

- 선택 → **사유 필수 다이얼로그**(zod min 2) → 확인 → intent. 저장 전에는 DB 무변경.
- **`order_status_logs`** 신설: `log_id, order_id, from_status, to_status, actor_id, reason, created_at`. **서버 액션이 `adminClient` 로 직접 insert**(트리거 방식은 `refund_status_logs` 의 GUC 함정을 반복하므로 쓰지 않는다). `audit_logs` 에 `logAuditEvent('order.status_change')` 미러. 목록 행 펼침에 「변경일시 · 처리관리자 · 전/후 · 사유」 표시(요청서 이력 요구).
- 환불완료 단축이 만드는 `refunds` 건은 환불관리 화면에 그대로 보이고 `refund_status_logs` 도 남는다(경로 단일).

### D3. 함께 정리할 것 **[설계]**

- 레거시 학생 환불요청 경로(`/api/refund-request` · `resolve_refund` intent · `refund-requests.server.ts`) — P6-e1 이후에도 배선 잔존. 이 개편에서 **제거**(토스 주문은 이미 거부되고 무통장·수동만 실효 → 환불관리로 통합).
- `docs/db-schema.md` orders 상태 7값 표기 → CHECK 10값으로 정정.
- 웹훅 경합(구현 2026-09-17 로 정정): 관리자가 환불완료(단축)로 종결한 뒤 토스 CANCELED 웹훅이 오면 열린 환불건이 없어 `markOrderRefundedAndRevoke` 로 떨어진다 — **CANCELED 는 코드로 멱등 확인**(commit_refund 가 전 항목 `refunded_at` 을 찍어 두므로 항목 루프·수강권 회수·포인트가 전부 건너뜀, 주석만) · **PARTIAL_CANCELED 는 `orders.status='refunded'` 이면 대조 생략(ignored)** — 배송비 평면 차이로 재전송마다 `cs_actions(refund_assist)` 가 쌓이던 결함을 막는다. 「열린 건」 판정에 종결 건을 포함하는 방식은 채택하지 않음(계좌환불로 종결한 건의 `pg_cancel_*` 를 뒤늦은 취소가 덮어쓴다).

## 3. 설계 — PART 2 결제금액 관리자 정정

### D4. 「결제금액」= `orders.total_krw` 로 정의 **[설계 · 원장 확인]**

금액 컬럼이 여럿이고 **어느 컬럼이냐에 따라 따라 바뀌는 곳이 완전히 갈린다.** 요청서의 「주문목록·주문상세에 반영」은 `orders.total_krw`(주문 헤더 총액 = 실청구액)를 뜻하므로 그것을 정정 대상으로 한다.

| 소비처 | 읽는 컬럼 | `total_krw` 정정 시 | 판단 |
|---|---|---|---|
| 주문관리 목록·상세, 학생 주문내역·강의 결제내역, 회원 CRM 주문탭 | `orders.total_krw` | **반영** | 요청서 요구 |
| 주문관리 상단 매출카드 `v_sales_daily` | `orders.total_krw` | 반영 | — |
| **매출통계 `/admin/sales/stats` · 강사정산 · 도서정산** | `order_items.unit_price_krw × qty`(정가 평면) | **안 따라옴** | ★설계상 정상 — 정산·통계는 항목 정가 기반이고 확정 정산(confirmed/paid)은 불변 스냅샷. 정산 반영이 필요하면 **별건**(정산 조정 kind 신설) |
| 환불 상한·항목 캡·토스 부분취소 대조 | `order_items.paid_amount_krw`(없으면 즉석 배분) | 안 따라옴 | ★토스 취소가능잔액과 어긋나면 안 되므로 **원본 유지가 옳음** |
| 토스 confirm·웹훅 DONE 검증 | `payments.amount_krw` | 무관 | **절대 불변**(요청서 「토스 승인금액 불변」) |
| 결제완료 포인트 적립 | `orders.total_krw`(첫 paid 전이 1회) | 사후 재계산 없음 | 정정 시 재계산하지 않는다(적립분은 그대로) |
| 기접수 환불건 `refunds.original_paid_krw` | 접수 시점 스냅샷 | 안 따라옴 | 정정 이후 접수분만 새 금액 |

### D5. 원본 보존 · 이력 **[설계]**

- `orders.original_total_krw int`(불변) 신설, DDL 시 `total_krw` 로 **백필**. 첫 정정 이후 목록·상세에 「원본 471,500 → 정정 450,000」 병기(요청서 「원본과 구분」).
- **`order_amount_adjustments`** 신설: `adjustment_id, order_id, before_krw, after_krw, reason, actor_id, created_at`. 서버 액션이 직접 insert + `logAuditEvent('order.amount_adjust')` 미러(선례 P7-d `refund.amount_adjust`). 상세에 이력 표.
- 검증: 0 이상 정수, 변경 없음 거부, 사유 필수, `refunded` 주문은 정정 불가(환불 캡 기준이 바뀌면 안 됨).
- **권한: admin(원장) 전용** — 환불 감액 선례. manager 에게 열지 않는다.
- 학생 화면(`my-orders`·`lecture-payments`)은 RLS 로 `total_krw` 를 직접 읽어 정정이 **즉시 노출**된다 → 정정된 주문에 「금액 정정됨」 표기(영수증과 다를 수 있음). 원본은 학생에게 보이지 않는다.

### D6. 실제 사용 사례 확인 **[원장 결정]**

운영 `paid` 5건 중 무통장 2건. 동기가 **「무통장 실입금액 ≠ 청구액」**이라면 정정 기능보다 **입금확인 시 실입금액 입력**(`bank_transfers.deposited_amount_krw` 신설, 차액이 있으면 조정 이력 자동 생성)이 맞다. 토스 결제 후 사후 할인/추가 청구를 장부로만 반영하려는 것이라면 D4·D5 그대로.

## 4. Phase

| Phase | 내용 | 공수 | 선행 |
|---|---|---|---|
| **Q0** | 원장 결정 §5 + `refunds d9222fb9` 실건 여부 확인 | — | — |
| **Q1** ✅ | 상태 이력 원장 `order_status_logs` + `orders.archived_at`(DDL 운영 적용 2026-09-17) + 라벨 SSOT 통합(`order-status.ts` 운영자 라벨) + `db-schema.md` 정정 | S | Q0 |
| **Q2** ✅ | 셀렉트 + 사유 다이얼로그 + 경로 배선(결제완료 무통장·취소 단건·입금대기(재접수)·보관 — A5 토스 재조회는 안 함) + 전이 표 서버 재검증 | M | Q1 |
| **Q3** ✅ | 환불완료 단축(환불관리 수동 종결) + 웹훅 재전송 멱등 + 레거시 환불요청 경로·「항목 환불」 제거 | M | Q2 |
| ~~Q4~~ | ~~결제금액 정정~~ — **A3 결정으로 삭제(2026-09-17)** | — | — |

게이트: DDL 은 `run-prod-sql.mjs` 하드스톱(+rollback) → `db:typegen` / 돈 경로는 **운영 dry-run**(운영 주문 63건에 대해 전이 표를 적용했을 때 허용·불허 집계) / typecheck·build·vitest / 운영 리허설 — 무통장 테스트 주문으로 결제완료·취소·주문접수·삭제·정정 각 1회(정리 포함), 환불완료 단축은 리허설 상품 결제 없이 dry-run 으로 대체(수강권 행 생성 회피).

## 5. ★원장 결정 — **2026-09-17 12:13 확정** (`source/학습플랫폼/권고사항 9건 최종 결정 및 개발 반영 요청.html`)

| | 질문 | 권고 | **결정** |
|---|---|---|---|
| **A1** | 「주문접수」의 뜻 | 무통장 재접수(`cancelled/expired` → `pending_deposit`, 기한 재설정) | **채택.** 단 「주문접수」 명칭은 혼동되므로 **화면 라벨은 「입금대기」** — 기존 `pending_deposit` 라벨 문자열을 그대로 쓴다(새 동의어 금지) |
| **A2** | 「삭제」의 뜻 | 보관(archive) — 비결제 상태만 숨김 | **채택.** 옵션 라벨 「보관」 |
| **A3** | 결제금액 정정을 정산·매출통계에도 반영하는가 | 아니오 | **결제금액 정정 자체를 진행하지 않음.** PART 2(D4~D6)는 기록으로만 남기고 Q4 는 삭제 |
| A4 | 사용 사례(D6) — 무통장 실입금액 차이인가 | 입금확인 시 실입금액 입력 | **진행하지 않음** — ★PG 가상계좌 또는 실시간 계좌이체 이용 예정(프로젝트 메모: 수동 무통장 경로는 대체 예정) |
| A5 | 토스 주문의 「결제완료」 — 승인 재조회 트리거 | 만든다 | **진행하지 않음** — 토스 주문은 셀렉트 읽기 전용, 운영은 웹훅 재전송 |

셀렉트 최종 옵션: **입금대기(재접수) · 결제완료(무통장 입금확인) · 취소 · 환불완료(원장) · 보관**.

## 7. 구현 기록 — Q1~Q3 (2026-09-17, 원장 「진행 OK」)

- **Q1 DDL 적용**(`20260917_q1_order_status_logs.sql`, run-prod-sql → typegen): `order_status_logs`(표·인덱스·staff select 정책) + `orders.archived_at`(+부분 인덱스). 확인 tbl 1·col 1·pol 1.
- **SSOT** `orders/lib/order-status.ts`: 운영자 라벨·톤을 `Record<OrderStatus,…>` 로 고정(admin-orders 의 untyped 표 제거), `ADMIN_ORDER_ACTIONS`(reopen_deposit·confirm_deposit·cancel·refund_complete·archive·unarchive) + 라벨(입금대기·결제완료·취소·환불완료·보관·보관 해제), `allowedAdminOrderActions` 순수 함수(10상태 × {무통장, 토스} × 보관 40셀 vitest 고정, 60 tests), `ARCHIVE_LOG_STATUS`·`orderStatusLogLabel`.
- **서버** `orders/order-status-admin.server.ts`: `applyAdminOrderAction` — 사유 2자·원장 전용 게이트·서버 재판정 → 실행 → `order_status_logs` 직접 insert + `audit_logs order.status_change`. 실행 시점 추가 가드(표에는 없음): cancel 은 `payments completed` 있으면·무통장 `deposited_at` 찍혔으면·결제창 TTL(30분) 이내면 거부, reopen 은 무통장 행 없음·회원당 입금 대기 1건 불변식, archive 도 TTL 이내 거부. reopen 은 `bank_transfers.expires_at` 먼저 → 상태 나중(실패 시 무이력 재취소 방지). `confirmBankTransfer` 는 `deposited_at` 찍기 전에 `orders.status='pending_deposit'` 확인.
- **환불완료 단축**(원장 전용, PG 호출 0): 접수 전 전액 검증(`total_krw − 기환불 = 청구액`, 항목 결제귀속액 합 + 잔여 배송비 = 전액, 진행 중 환불건 없음) → `createRefundIntake(etc)` → `saveRefundAmounts`(pointReturnKrw 명시) → `savePgCancel(full, now, 처리근거, actor)` → `received→reviewing→amount_fixed→pg_pending→pg_done` 각 hop `checkRefundTransition` → `commitRefund`. 접수 이후 실패는 환불건을 남기고 error 에 refundId. ★설계 순서(전이 → 금액)와 달리 **금액·PG 저장 후 전이** — `amount_fixed→pg_pending` 이 `thisRefundKrw>0` 을 요구. 부분 환불·레거시 「항목 환불」 주문은 단축 거부 → 환불관리.
- **화면** `admin-orders.tsx` + `components/order-status-select.tsx`: 행별 셀렉트(허용 옵션만, 원장 전용은 비원장에게 숨김) → Dialog(사유 필수, 환불완료는 실환급액·처리근거·환불 방법(계좌환불/기타)) → `set_status`(zod 한국어 메시지) → `applyAdminOrderAction`. 이력 `<details>`(일시·처리관리자·전→후·사유, 100건 배치). 기본 목록 `archived_at null`, `?archived=1` 보관함(HIDDEN 제외 안 함). 기존 `confirm_transfer`(입금 대기 목록)도 같은 함수를 경유해 이력이 남는다. **레거시 제거**: `resolve_refund` intent·환불 요청 섹션·행 안의 「항목 환불」 버튼(refundOrderItem — 토스 거부·무통장 payments 행 부재로 실효 0)·`window.prompt/confirm`.
- **레거시 학생 환불요청 경로 제거**(D3): `/api/refund-request` 라우트·`orders/api/refund-request.tsx`·`orders/refund-requests.server.ts` 삭제, my-orders·member-crm·work-queue·ops-dashboard·관리 허브 타일(「환불 처리중」→/admin/refunds, refunds 미종결 건 수) 정리. `refund_requests` 표는 남김(0건, drop 은 후속 DDL).
- **웹훅**: CANCELED 멱등(주석), PARTIAL_CANCELED 는 `orders.status='refunded'` 면 ignored(§2 D3 정정).
- **dry-run(운영 63건, 순수 함수 적용)**: cancelled·expired/toss 56 → 보관만 · paid 5(무통장 2·토스 3) → 환불완료만 · refunded 2 → 없음. 무통장 취소·만료 0건이라 「입금대기」가 열리는 주문은 현재 없음.
- **알려진 한계**: ① 환불완료 단축은 강의 수강권·재고·쿠폰·포인트만 회수 — 학습 플랫폼 구독형(과목·번들·회원제) 수강권은 `revokeItemFulfillment` 가 다루지 않아 수강권 관리에서 별도 종료(안내문·detail 에 표시). ② 토스 가상계좌 도입 시 `pending_deposit + toss` 조합이 생기면 전이 표 재검토(A4 후속). ③ paid + 보관 동시 상태는 규칙상 도달 불가(pending_deposit 은 보관 불가, reopen 은 미보관만).
- 게이트: typecheck·vitest·build → 로컬 커밋 → **푸시 하드스톱**. 운영 리허설(무통장 테스트 주문 생성 → 취소·입금대기·보관·결제완료 각 1회)은 주문·수강권 행을 남기므로 원장과 시점 협의.

## 6. 부록 — 이번 조사에서 드러난 별건 결함

- `refundOrderItem` 비토스 경로가 `payments.status='completed'` 행을 요구(`orders.server.ts:828-835`)하는데 **무통장 주문에는 `payments` 행이 없다** → 무통장 주문의 항목 환불이 「연결된 결제를 찾을 수 없습니다」로 막힐 소지. Q3 에서 환불관리로 통합하면 해소.
- `v_sales_daily` 는 gross 를 `orders.total_krw`(실청구 평면), refund 를 `order_items.refund_amount_krw`(정가 평면)로 섞어 센다 — 정정 시 두 평면 차이가 커진다(표시용 카드라 허용, 기록만).
