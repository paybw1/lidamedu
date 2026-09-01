# feat-11-010 — 온라인 단과 수강기간 연장

> 근거: `source/학습플랫폼/강의개발추가요청서_0901.html` §3 (★★★ 필수)
> 원장 결정 2026-09-01: **기본값을 두되 강의별로 개별 설정할 수 있게.**

## 1. 이미 있는 것과 새로 만드는 것

**이미 있다 — 다시 만들지 않는다.**

| 있는 것 | 무엇 |
|---|---|
| `plan_policies.extension_allowed` | 이 수강권의 연장 허용 ON/OFF. 관리자 폼·마이페이지가 이미 읽는다 |
| `plan_policies.extension_plan_ids` | 연장용 **별도 상품**을 사서 늘리는 기존 경로 |
| `enrollments.expires_at` 연장 로직 | `grantEnrollmentsForItem` — 같은 강의를 재구매하면 만료일을 늘린다 |
| `enrollment_admin_logs` | 만료일 변경 감사 로그(`action='extend'`) |

**새로 만든다.**

요청서가 원하는 건 "별도 신청 절차 없이 [수강연장] → 바로 PG 결제" 다. 기존
`extension_plan_ids` 경로는 강의마다 연장용 상품을 따로 만들어야 해서 그 조건을 못 맞춘다.
그래서 **상품 없이 정책만으로 결제되는 연장**을 추가한다. 다만 **만료일을 바꾸는 코드는
한 곳뿐**이어야 하므로(Layer 2 §8), 새 경로도 결제 성공 시 같은 지급 단계에서 처리한다.

## 2. 설정 — 기본값 + 강의별 override

기본값은 `app_settings`, 강의별 값은 `plan_policies`. **`plan_policies` 값이 NULL 이면
기본값을 따른다.**

| 항목 | 기본값 키(app_settings) | 강의별(plan_policies) |
|---|---|---|
| 기간연장 허용 | `course_ext_enabled_default` | `extension_allowed` (NULL 가능으로 변경) |
| 연장비용(1회) | `course_ext_price_krw_default` | `extension_price_krw` |
| 최대연장횟수 | `course_ext_max_count_default` | `extension_max_count` |
| 연장일수(1회) | `course_ext_days_default` | `extension_days` |

- **최대연장횟수 `0` = 무제한** (요청서 문구 그대로)
- **연장일수 `0` = 강의 기본 학습일수**(`plan_policies.duration_days`)
- ★`extension_allowed` 는 지금 `NOT NULL DEFAULT false` 다. **NOT NULL·기본값을 떼어
  NULL 을 허용**한다. 기존 2행은 명시값이라 동작이 그대로고, 앞으로 만드는 행은 NULL →
  기본값을 따른다. 컬럼을 새로 만들지 않는 이유: 같은 뜻의 플래그가 둘이 되면 어느 쪽이
  이기는지 아무도 모르게 된다.
- **대상은 온라인 단과뿐** — `subscription_plans.product_kind = 'course'`. 현장강의·패키지
  (`tpass`)는 해석 단계에서 제외한다.

해석은 `app/features/lms/lib/extension-policy.ts` 하나가 소유한다(client-safe — 버튼
노출 판정과 서버 재검증이 **같은 함수**를 써야 어긋나지 않는다).

## 3. 버튼 활성화 기준

경로: 마이페이지 › 수강중인 강의

| 상태 | 버튼 | 기준 |
|---|---|---|
| 수강 중 | 활성 | 연장 허용 + 횟수 여유 |
| 종료 후 30일 이내 | 활성 | 기존 종료일로부터 30일 이내 |
| 종료 후 30일 초과 | 미노출 | 연장 불가 |

★**서버에서도 검증한다.** 버튼 표시만 막으면 URL 직접 접근·결제 우회가 뚫린다.
주문 생성 액션이 같은 `resolveExtensionOffer()` 로 다시 판정하고, 실패하면 주문 자체를
만들지 않는다.

## 4. 종료일 계산 (KST)

- **수강 중 연장** — 현재 종료일 뒤에 누적: `expires_at + N일`
- **종료 후 연장** — 결제 당일 즉시 열되 **당일은 연장일수에 넣지 않는다**:
  `KST 내일 0시 + N일`
  (요청서 예시: 오늘 5일 연장 결제 → 오늘 즉시 수강 → 내일부터 5일)

## 5. 결제·이력·환불

```
[수강연장] → 주문 생성(order_items.item_type='course_extension', enrollment_id)
          → 기존 PG 결제화면 → 결제 성공
          → markOrderPaidAndFulfill 이 항목 순회 중 연장 적용
```

- **PG 결제 성공 전에는 수강기간을 건드리지 않는다.** 주문만 만든다.
- **이중 연장 방지는 제약이 한다** — `enrollment_extensions.order_item_id UNIQUE`.
  웹훅·confirm 이중 호출은 흔하다. 애플리케이션 카운트 체크로 막지 않는다.
- **연장횟수는 컬럼이 아니라 `count(status='applied')`** 로 센다. 카운터를 따로 두면
  환불 때 어긋난다.
- 이력에 남기는 것: 회원·강의·기존 종료일·연장일수·변경 종료일·금액·결제일·결제번호·
  횟수·결제상태·환불상태(요청서 목록 그대로).
- **환불** — 전체 취소 시 그 결제로 더한 일수만 되돌린다(수강권 회수가 아니다).
  이미 연장기간을 써 버린 경우는 되돌리면 과거가 되므로 **관리자 수동 처리**로 남기고
  사유를 기록한다.

## 6. 스키마

```sql
alter table plan_policies
  alter column extension_allowed drop not null,
  alter column extension_allowed drop default,
  add column extension_price_krw integer,
  add column extension_max_count integer,
  add column extension_days      integer;

alter table order_items add column enrollment_id uuid references enrollments(enrollment_id);

create table enrollment_extensions (
  extension_id    uuid primary key default gen_random_uuid(),
  enrollment_id   uuid not null references enrollments(enrollment_id),
  user_id         uuid not null references profiles(profile_id),
  plan_id         uuid references subscription_plans(plan_id),
  order_item_id   uuid unique references order_items(order_item_id),  -- ★이중 연장 방지
  days_added      integer not null,
  prev_expires_at timestamptz not null,
  next_expires_at timestamptz not null,
  amount_krw      integer not null default 0,
  status          text not null default 'applied',   -- applied | reverted
  reverted_at     timestamptz,
  revert_reason   text,
  granted_by      uuid references profiles(profile_id),  -- 관리자 수동 처리
  note            text,
  created_at      timestamptz not null default now()
);
```

## 7. 단계

- **A** DDL + typegen + 정책 해석 SSOT + 관리자 설정 UI(기본값 화면 + 상품별 폼)
- **B** 마이페이지 [수강연장] + 주문 생성(서버 재검증) + 결제 성공 시 적용
- **C** 환불 원복 + 연장 이력 화면 + 관리자 수동 예외

## 8. 하지 않는 것

- `extension_plan_ids`(연장용 별도 상품) 경로는 **그대로 둔다.** 쓰고 있는 상품이 있고,
  결국 같은 `expires_at` 로 수렴한다. 새 경로가 자리 잡은 뒤 정리 여부를 따로 판단한다.
- 패키지·현장강의 연장 — 요청서가 "불필요" 로 명시했다.
