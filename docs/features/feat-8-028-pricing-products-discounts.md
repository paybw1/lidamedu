# feat-8-028 — 요금·상품·할인 운영관리

## 목적
과목별 결제 금액·번들·할인을 운영관리에서 체계적으로 관리한다. 과목마다 다른 금액, 산업재산권법 통합/전체 통합 번들, 기간·조건 할인(쿠폰 포함)을 운영자가 직접 정의.

## 핵심 모델 — "구매 상품 = 플랜(가격 + 부여 과목 + 기능)"
과목·번들·회원제를 모두 `subscription_plans` 한 테이블의 **상품**으로 통일. 상품이 부여 과목(`subject_codes`)과 가격을 선언 → 결제 시 그 과목이 열린다. (Stage 4 "한 플랜 + subject_code 태깅" → "상품별 부여 과목" 으로 승격.)

### subscription_plans 확장
- `subject_codes jsonb` — 부여 학습과목 slug 배열.
- `product_kind text` — `subject`(개별) | `bundle`(번들) | `membership`(free/cohort).

### 상품 카탈로그 (시드, 가격은 운영자 조정 placeholder)
| code | 이름 | subject_codes | 가격 | kind |
|---|---|---|---|---|
| subj_patent | 특허법 | [patent] | 99,000 | subject |
| subj_trademark | 상표법 | [trademark] | 99,000 | subject |
| subj_design | 디자인보호법 | [design] | 99,000 | subject |
| subj_civil | 민법 | [civil] | 99,000 | subject |
| bundle_ip | 산업재산권법 통합 | [patent,trademark,design] | 249,000 | bundle |
| bundle_all | 전체 통합 | [patent,trademark,design,civil] | 299,000 | bundle |
- 자연과학 = 기본 무료(상품 없음). 민사소송법 = 데이터 적재 후 bundle_all 편입.
- 레거시 `pro_monthly`(자기학습) 은퇴(is_active=false) — 오픈 전이라 마이그 없이 무시.

### discounts 테이블 (기간·조건·쿠폰)
`kind`(percent|fixed)·`value`·`target_kind`(all|subject|bundle|plan)+`target_plan_codes`·`starts_at`/`ends_at`(기간)·`min_amount_krw`/`max_uses`/`per_user_limit`(조건)·`code`(null=자동 프로모션)·`is_active`. 활성 할인 공개 읽기(RLS), 쓰기는 service_role. `payments.discount_id` 로 적용 할인 기록.

## 권한 산출 (등급 리졸버)
`getMembershipAccess` self_study 단계: 활성 구독 중 `product_kind ∈ (subject,bundle)` 인 것들의 **plan.subject_codes 합집합**(+ 자연과학)으로 열람 과목 결정. features 는 상품 features 합집합(폴백 `SELF_STUDY_FEATURES`). 레거시 subject_code 폴백 유지. cohort self_study 범위·체험도 `SELF_STUDY_FEATURES` 상수 사용.

## 결제·할인 흐름
- create-order: 상품 code(+쿠폰) → 서버가 유효 할인 계산 → 할인가로 pending payment(할인 id 기록). 클라 금액 불신(서버 권위) 유지.
- confirmPayment: 기존 금액 일치 검증 그대로. 구독은 상품(plan) 참조 → 리졸버가 부여 과목 파생.

## 단계
- **A. 모델·시드·리졸버** ✅ — plans.subject_codes/product_kind + discounts + payments.discount_id 마이그, 상품 시드(개별4+번들2, pro_monthly 은퇴), 리졸버 plan.subject_codes 기반 전환. (마이그 20260701_pricing_products_discounts.sql)
- **B. 상품 관리 admin** ✅ — `/admin/pricing`(수강생 클러스터, manager+) 상품 목록 + 생성/수정 폼(코드·이름·종류·가격·기간·정렬·설명·부여 과목 체크·부여 기능 체크·활성). `listAllPlans`/`upsertPlan`(queries.server) + `/api/admin/plan`(zod+logAuditEvent). SubscriptionPlan 타입에 subjectCodes/productKind 배선.
- **C. pricing 화면 개편** ✅ — 상품 종류별 섹션(번들/개별 과목/회원제) 카드. 각 카드=가격·열리는 학습과목 칩·보유 시 "보유 중" 배지·구독 시작(상품 단위 startSubscriptionCheckout, planCode만). Stage 4 SubjectSubscribeList/SubjectRow 제거.
- **D. 할인 엔진** — create-order 할인 계산 + 할인 admin(기간·조건·쿠폰) + pricing 할인 표시(원가 취소선).

## 3계층 게이트
- Judgment: 수익화 운영 필수(과목별 금액·번들·할인). 기존 구독/결제 인프라 재사용.
- Structure: 상품=플랜 SSOT, 할인=별도 테이블, 금액=서버 권위(할인 서버 계산). 권한=plan.subject_codes 파생.
- Code: 리졸버 SSOT membership.server.ts. 상품/할인 관리 = admin + adminClient.
