# feat-8-031 — 강사 정산현황 (원천 확장 · 수수료/세금 · 본인 조회 팝업)

> 상태: ✅ (2026-09-12) · 권한: 강사 이상(본인) / manager+ (운영) · feat-8-029 의 후속

## 배경
feat-8-029 의 강사 정산은 **학습 플랫폼 구독 결제(`payments`)만** 원천으로 삼았고, 금액은 결제액 총액 기준(gross)이었다. 강의 플랫폼 주문(`orders`/`order_items`)은 정산에 잡히지 않았고, PG 수수료·세금 개념이 DB 어디에도 없었으며, 강사가 자기 정산을 볼 화면이 없었다(feat-8-029 문서의 "강사 본인 열람 화면은 후속").

원장 지시(2026-09-12): **상단 계정 아이콘 → 팝업**으로 기간별 결제된 강의 리스트와 강사료(결제·환불·수수료·매출·정산비율·정산금액·세율·세금액·정산 지급액)를 본다. 정산 기준액은 **매출 − 환불 − 수수료**로 확정.

## 산식 (SSOT = `settlement-engine.ts`)
```
수수료      = (결제 − 환불) × 수수료율
매출        = 결제 − 환불 − 수수료          ← 정산 기준 총금액
정산금액    = 매출 × 정산비율(배분 규칙)
세금액      = 정산금액 × 세율
정산 지급액 = 정산금액 − 세금액
```
항목(item) 단위로 계산해 저장하고(배분=양수 / 환불차감=음수), 정산서의 모든 합계는 **항목 합으로만** 만든다. 항목별 반올림 때문에 `매출 × 비율` 과 정산금액이 몇 원 다를 수 있으나, 화면·CSV 가 모두 항목 합을 쓰므로 내부적으로는 항상 일치한다.

## 정산 원천 (`settlement-sources.server.ts`)
| 원천 | 범위 | 월 귀속 | 제외 |
|---|---|---|---|
| `payments` | 구독 직접 결제 | `created_at` | **`order_id IS NOT NULL` 은 제외** — 같은 매출이 `order_items` 로도 잡혀 이중 계상된다 |
| `order_items` | `item_type ∈ (plan, course_extension)` + 주문 상태 paid/partially_refunded/refunded | `orders.paid_at` | `book` 은 도서정산(`book_settlements`, payee=저자/출판사) 소관 |

- **결제액 = 단가×수량 − 주문 쿠폰할인 안분분.** `order_items.unit_price_krw` 는 할인 전 값이고 할인은 주문 단위(`orders.coupon_discount_krw`)라 항목별로 나눠 붙인다(주문의 모든 항목 정가 비율, 마지막 항목이 잔액 흡수 — 장바구니 세트 안분과 같은 방식). **배송비는 정산 대상이 아니다**(택배사 통과금).
- **환불액도 같은 비율로 축소**한다. `order_items.refund_amount_krw` 는 할인 전 금액으로 기록되므로, 축소하지 않으면 전액 환불이 결제액을 상쇄하지 못하고 음수 잔재가 남는다.

### ★ 새로 막은 구멍 두 개
1. **`orders.paid_at` 신설.** 종전엔 주문에 결제 시각이 없어 `created_at` 으로 월을 잡을 수밖에 없었다. 월말 주문·익월 입금 확인(무통장)이면 **이미 확정된 달**에 묻혀 영영 정산에서 빠진다. `markOrderPaidAndFulfill` 이 첫 전이에 기록하고, 기존 5건은 `payments.created_at` → `bank_transfers.deposited_at` → `orders.updated_at` 순으로 백필했다.
2. **전체 환불이 항목에 기록되지 않던 것.** `markOrderRefundedAndRevoke` 는 주문 상태만 바꾸고 `order_items.refunded_at` 을 남기지 않아, order_items 기준으로 집계하는 강사 정산·**도서 정산 모두에서 전체 환불이 통째로 안 보였다**(부분 환불 `refundOrderItem` 만 기록). 함수를 고치고 기존 1건을 소급 기록했다(`scripts/sql/20260912_refund_item_backfill.sql`).

## 강사 귀속
상품(plan)에 강의가 묶여 있으면(`plan_courses` → `courses` → `course_series.instructor_id`) **그 담당 강사에게만** 귀속하고, 비율은 그 강사의 배분 규칙(상품 > 과목 > 전체)에서 가져온다.
- 여러 강사가 묶인 상품은 **강의 수 비율로 안분**한다(`courses` 에 정가 컬럼이 없어 정가 비율은 불가).
- 분모는 상품에 묶인 강의 **전체**(담당자 미지정 강의 포함) — 미지정분까지 나눠 가지면 과다 지급이 된다.
- 담당 강의는 있는데 배분 규칙이 없는 강사는 정산하지 않고 `missingRule` 로 보고한다(생성 결과 안내에 표시).
- 강의가 묶이지 않은 상품(학습 플랫폼 구독 등)은 종전대로 "규칙이 맞는 모든 강사"에게 결제 전액 기준.

## 정산 파라미터
| 테이블 | 내용 |
|---|---|
| `settlement_settings` (단일 행 id=1) | `pg_fee_rate_bp` — 결제 수수료율(bp, 330 = 3.30%). **기본 0 = 미설정**, 화면에 경고 표시 |
| `instructor_settlement_profiles` | 강사별 `tax_type`(withholding/invoice/none) + `tax_rate_bp`. 행이 없으면 **개인 원천징수 3.3%** |

둘 다 RLS enable + 정책 없음(adminClient 전용). 정산 생성 시 정산서에 **스냅샷으로 복사**되므로 나중에 값을 바꿔도 확정분의 지급 근거는 불변. `/admin/settlements/rules` 하단에서 수정한다.

> 수수료율 기본값을 0으로 둔 것은 의도다 — 토스 계약 요율을 모르는 상태에서 임의 값을 넣으면 지급액이 거짓이 된다. 원장이 실제 요율을 넣기 전까지 수수료 0원으로 계산하고 그 사실을 화면에 명시한다.

## 스키마 변경
- `orders` + `paid_at timestamptz` (+ 부분 인덱스)
- `instructor_settlement_items`: `payment_id` NOT NULL 해제, `+ order_item_id`, `CHECK num_nonnulls(payment_id, order_item_id) = 1`, `+ fee_krw`, `+ settle_base_krw`
- `instructor_settlements`: `+ gross_krw, refund_krw, fee_krw, net_sales_krw, fee_rate_bp, tax_type, tax_rate_bp, tax_krw, payout_krw`
- `staff_notification_kind` enum: `+ settlement_confirmed, settlement_paid`
- DDL: `scripts/sql/20260912_settlement_sources.sql`, `20260912_settlement_params.sql`, `20260912_settlement_notification_kinds.sql`, `20260912_refund_item_backfill.sql`

## 화면
| 경로 | 내용 |
|---|---|
| 상단 계정 아이콘 → 「정산현황」 | 팝업(데스크톱 Dialog / 모바일 Sheet). 강사·원장에게만 보인다. 열 때 한 번만 로드. ★**두 플랫폼 모두**(강의 `lecture.layout` · 학습 `navigation-bar`·`student-sidebar`) — 계정 메뉴 컴포넌트는 공용이지만 항목은 레이아웃이 주입하므로 한 곳만 넣으면 다른 쪽에서 안 보인다(2026-09-12 원장 보고) |
| 강의 플랫폼 마이페이지 | 상단 드롭다운·서브내비에도 「정산현황」(staff 한정, `lectureMypageLinks`) |
| `/lecture/settlements` | 같은 패널의 전체 화면. 확정·지급 알림의 링크 목적지 |
| `/api/lecture/settlement` | 팝업이 월을 바꿀 때 부르는 JSON + `?export=csv`. ★최상위 `/api` 블록에 둔다(`lecture.layout` 아래에 두면 학습 플랫폼에서 못 부른다). `prefix("/api")` 안이라 경로는 `/lecture/settlement` 로 쓴다 — `/api/...` 로 쓰면 `/api/api/...` 가 되어 404 |
| `/admin/settlements` | 목록에 결제·환불·수수료·매출·정산금액·세금액·지급액 열 추가, CSV 15열 |
| `/admin/settlements/:id` | 요약 카드 9칸 + 항목표에 원천(강의주문/구독결제)·수수료 열 추가 |
| `/admin/settlements/rules` | 하단에 정산 파라미터(수수료율·강사별 세금 유형) |

### 실시간(예상) vs 스냅샷
정산 생성은 운영자가 월 단위로 **수동 실행**한다(크론 없음). 그래서 강사 화면은
- **확정·지급된 달** → 저장된 정산서(지급 근거, 다시 계산하지 않음)
- **그 밖의 달**(초안 포함·미생성) → 지금 값으로 계산한 **「집계 중 · 예상」**

이렇게 해야 원장이 요청한 "실시간으로 정산금액을 본다"가 성립한다.

## 보안
- `instructor_settlements`·`items`·파라미터 테이블은 RLS 정책이 없어 일반 클라이언트로는 0행이다. 강사 본인 조회는 **adminClient + 서버 소유자 강제**로만 가능하다.
- `getSettlementDetail(id, { instructorId })` — 소유자 불일치면 `null`(IDOR 차단). 강사 화면 경로는 반드시 이 옵션을 넘긴다.
- `instructorId` 쿼리 파라미터로 남의 정산을 지정하는 것은 `roleAtLeast(role, "manager")` 일 때만 허용.
- 강사 화면의 수강생 이름은 언제나 마스킹(`홍*동`). 운영자 화면은 전체 표기.

## 알림
확정·지급 시 해당 강사에게 인앱 알림(`settlement_confirmed` / `settlement_paid`, href `/lecture/settlements`). enum 추가 → `npm run db:typegen` → `kinds.ts` 의 `STAFF_KINDS` 등록까지 해야 인박스·배지에 보인다.

## 검증
- 단위 테스트 `settlement-engine.test.ts` 14케이스 — 산식(수수료 0/3.3%), 세금(개인·사업자), 당월 결제·환불 상쇄, 확정분 익월 차감, 이중계상 방지(원천 종류 구분), 규칙 우선순위·적용 시작일, 강의 안분·규칙 없음 보고, 비율 표기.
- 운영 DB 드라이런(2026-07·08·09) — 원천 수집 정상, payments/order_items 중복 없음.
- Playwright `e2e/admin/settlement-popup.spec.ts` 3케이스 — 강의 플랫폼 팝업(요약 7칸·미설정 안내·월 12개·월 변경 시 팝업 유지·닫은 뒤 `body` pointer-events 복구), 학습 플랫폼 계정 메뉴, 전체 화면.
- 운영 DB 스모크(2026-09, 임시 규칙 30% + 수수료 3.3% + 원천징수 3.3%) 후 **전량 롤백**: 항목 14건(payment 10 / order_item 4, 배분 11 / 환불차감 3), 결제 495,000 · 환불 135,000 · 수수료 11,880 · 매출 348,120 · 정산 104,440 · 세금 3,447 · 지급 100,993. 항목합 = 정산서값 일치, 재생성 멱등(항목 14 유지), 확정 후 재생성 0건, 소유자 불일치 조회 null, 알림 1건 생성.

## 남은 것 / 운영 준비
1. **배분 규칙 0건** — 등록 전까지 모든 강사의 정산금액은 0이다. `/admin/settlements/rules`.
2. **수수료율 미설정(0)** — 실제 토스 요율 입력 필요.
3. **`plan_courses` 1건** — 상품↔강의 연결이 거의 없어 강의 담당 강사 귀속이 대부분 동작하지 않고 규칙 기반으로만 잡힌다.
4. 후속 후보(미착수): 정산서 PDF, 지급 계좌 관리, 이의신청, 토스 실제 정산 대사, 월별 추이 그래프·누적 지급액.

## ★도서 정산과 기준이 다른 것은 결정 사항이다 (통일 금지)

| | 기준액 |
|---|---|
| 강사 정산 (feat-8-031) | 단가×수량 **− 주문 쿠폰할인 안분분** (실제 입금액) |
| 도서 정산 (`book-settlements-admin.server.ts`) | 단가×수량 **정가 그대로** (할인 미반영) |

**원장 결정(2026-09-12): 서로 다른 것이 맞다.** 나중에 이 차이를 "불일치"로 보고 도서 쪽에 할인 안분을 넣으면 이미 지급한 도서 정산액의 근거가 바뀐다. 두 파일 모두 상단 주석에 같은 문구를 박아 두었다.
