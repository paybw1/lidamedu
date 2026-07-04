# feat-8-029 — 주문결제·강사 정산 관리

> 상태: ✅ (2026-07-04) · 권한: manager+ · admin 내비 "매출·정산" 클러스터

## 목적
운영자가 (1) 기간별 결제·환불 내역과 매출 통계를 보고, (2) 항목(상품/과목)별 강사 배분 기준을 정의해, (3) 월 단위 정산을 생성·확정·지급 관리한다.

## 화면
| 경로 | 내용 |
|---|---|
| `/admin/payments` | 기간(이번달/30일/90일/올해/전체)·상품·상태 필터, 요약 카드(결제액/환불액/순매출/평균), 일·주·월 집계표(KST), 결제내역/환불내역 탭 |
| `/admin/settlements/rules` | 배분 규칙 등록·목록·활성 토글 |
| `/admin/settlements` | 월 선택 → 정산 생성(초안 재생성), 강사별 목록, 확정/지급완료/확정취소 |
| `/admin/settlements/:settlementId` | 항목별 내역(배분/환불차감), 합계 카드 |
| API | `/api/admin/share-rule` (create/toggle) · `/api/admin/settlement` (generate/confirm/mark_paid/revert_draft) |

이관: 상품·요금 관리(`/admin/pricing`)·할인 관리(`/admin/discounts`) 메뉴를 수강생 → 매출·정산 클러스터로 이동.

## 데이터 모델
- `instructor_share_rules` — 강사 × 대상(target_kind: `plan`>`subject`>`all`) × 방식(share_kind: `percent` 1~100 / `fixed` 원·건) + `effective_from`·`is_active`. **값 수정 금지 원칙**: 새 규칙 등록 + 기존 비활성(세대 교체) — 정산 항목이 rule_id 스냅샷을 참조하므로 지급 근거 보존.
- `instructor_settlements` — 강사 × 월(`period_start`=KST 월 1일, unique). `status: draft → confirmed → paid`(paid 비가역, confirmed→draft 취소 가능). `total_share_krw`.
- `instructor_settlement_items` — 결제 1건 × 적용 규칙 **스냅샷**(share_kind·value·base·amount). `kind: share | refund_adjustment`(음수).
- RLS: 세 테이블 모두 enable + 정책 없음 = 일반 클라이언트 전면 차단, adminClient(service_role) 경유만.

## 정산 규칙 (settlements-admin.server.ts)
1. **규칙 선택**: 결제 1건에 강사별로 가장 구체적인 활성 규칙 1개 — plan(3) > subject(2) > all(1), 동급이면 `effective_from` 최신 → `created_at` 최신. 과목 매칭 = `payments.subject_code` ∪ plan.`subject_codes`. `effective_from` > 결제일(KST)이면 미적용.
2. **배분액**: percent = round(기준액×%), fixed = 결제 전액이면 정액, 부분(환불)이면 비례.
3. **월 정산 생성**(`generateSettlements`): 해당 월 completed·refunded 결제 → share 항목 / 해당 월 환불 → refund_adjustment 음수 항목(원 share 가 과거 정산에 있거나 당월 결제인 경우만). **이중계상 방지** — 전 기간 기존 항목(instructor×payment×kind)을 대조해 제외(당월 draft 는 재생성 대상이라 예외). draft 는 삭제 후 재생성, confirmed/paid 는 스킵.
4. **확정 후 환불**: 익월 정산 생성 시 `refund_adjustment`("확정 정산분 환불 차감")로 차감.

## 검증 (2026-07-04, 운영 DB 스모크 후 롤백)
30% 정률 규칙으로 6월 정산 생성 → 계산 일치 · 재생성 멱등 · 확정 후 재생성 시 중복 0 · 상태 전이 제한(paid 비가역) 확인.

## 남은 것 / 정책 메모
- 결제 상태 값: `pending/completed/failed/refunded`(전액 환불만 존재 — 부분 환불 도입 시 refund_amount_krw 비례 차감 로직은 이미 대응).
- 번들 상품 × 과목 규칙: 정률은 결제 **전액** 기준(번들 배분율 조정은 plan 대상 규칙이 우선하므로 그걸로 통제).
- 정산서 내보내기(CSV)·강사 본인 열람 화면은 후속.
