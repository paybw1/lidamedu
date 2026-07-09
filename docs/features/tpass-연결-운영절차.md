# T-PASS ↔ 에디션 연결 운영 절차 (feat-11 M4 오픈 체크리스트 3번)

## 배경 — 왜 연결이 필요한가
T-PASS(기간권)는 **기간 내 여러 강의를 수강**하는 상품이다. 강의는 매년 **에디션(연도판)**으로
새로 발행되는데(course_series → courses, is_current 시리즈당 1), 신판 에디션을 T-PASS 상품에
**연결(plan_courses)하지 않으면 T-PASS 수강생에게 신판이 노출·수강되지 않는다.**

그래서 **에디션을 새로 발행할 때마다 해당 시리즈를 파는 판매중 T-PASS 상품에 연결**해야 한다.

## 이미 구현된 메커니즘 (코드)
- `/admin/lms/courses` 에서 에디션 **발행(publish)** 시, 발행 응답으로 **판매중 T-PASS 연결 제안**이
  반환되어 패널이 **강제 표시**된다(`listTpassLinkSuggestions` → 판매중 tpass 상품 목록).
- 패널에서 연결할 T-PASS를 선택 → `link_tpass` 액션이 `plan_courses`에 upsert(멱등).
- 판매중 T-PASS가 없으면 "연결 제안할 판매중 T-PASS 상품이 없습니다" 토스트.

## 운영 절차 (staff)
1. **시리즈/에디션 발행 전**: 그 시리즈를 포함하는 T-PASS 상품이 `/admin/pricing`에
   **판매중(is_active)**으로 존재하는지 확인(없으면 먼저 T-PASS 상품 생성).
2. **에디션 발행**: `/admin/lms/courses`에서 에디션 발행 → 뜨는 **T-PASS 연결 제안 패널**에서
   해당 T-PASS를 **모두 체크 → 연결**.
3. **구판 처리**: 신판이 `is_current`가 되면 구판은 자동으로 현행에서 내려간다. 구판 수강 중인
   T-PASS 수강생 정책(구판 계속 열람 여부)은 별도 결정 사항 — 필요 시 구판 에디션도 연결 유지.
4. **검증**: `/lecture/catalog`에서 그 T-PASS 상품의 "포함 강의"에 신판 에디션이 뜨는지 확인.

## 정식 판매 개시 전 (M4 체크리스트 3번)
- [ ] 판매할 전체 T-PASS 상품 각각에 **현행 에디션이 빠짐없이 연결**됐는지 점검.
- [ ] 신규 에디션 발행 운영 담당자에게 위 2단계(발행 → 즉시 T-PASS 연결)를 **표준 절차로 공지**.
- [ ] (선택) 발행 후 T-PASS 미연결 에디션을 주기 점검하는 리포트/알림은 후속 개선으로 검토.

## 관련
- 상품 생성: `/admin/pricing`(product_kind=tpass) — [[lms-commerce-m1-design]]
- 크로스셀·카탈로그: `/lecture/catalog`(listSellableLectureProducts 가 plan_courses 로 포함 강의 표시)
