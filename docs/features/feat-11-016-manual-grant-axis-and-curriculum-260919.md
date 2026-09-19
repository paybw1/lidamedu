# feat-11-016 — 수동 수강권 축 혼선 · 강의 상세 목차 미노출 (보완요청5, 2026-09-19)

요청 원문 = `source/학습플랫폼/보완요청5.html` (수정 요청 2건).

## 1. 조사 결론

### 1-A. 「수동 수강권 부여」가 엉뚱한 테이블에 썼다 — ★확정

수강권은 **두 개의 축**이다.

| | 테이블 | 의미 | 지급 화면 |
|---|---|---|---|
| A축 | `user_subscriptions` | 학습 플랫폼 **구독**(기간제 멤버십) | 회원 상세 → 활동 탭 패널 |
| B축 | `enrollments` | **영상 수강권**(강의 단위) | `/admin/lms/enrollments` |

학생 「내 강의실」(`my-courses.tsx`)은 **B축만** 읽는다. 그런데 원장이 쓴 회원 상세 패널(`admin-subscription-panel.tsx:346-454`, 라벨 「수동 수강권 부여」)은 **A축에만** insert 한다(`grantManualSubscription` → `admin-queries.server.ts:311`). 그 패널의 상품 드롭다운에 **강의 상품(`course`/`tpass`)을 거르는 필터가 없었다** — 같은 기능의 `/admin/subscriptions` 는 `subject|bundle` 로 이미 막아 놨는데 **한쪽만 막혀 있었다.**

운영 로그가 그대로 남아 있다(`subscription_admin_logs`):

```
09-18 02:06  grant  planCode=provision_patent (조문강의, course)  → user_subscriptions
09-18 02:07  auto_cancel  「새 상품 부여로 기존 활성 구독 자동 취소」
09-18 02:07  grant  planCode=pt_tpass (패키지, tpass)             → user_subscriptions
```

- **"처리되었습니다"는 거짓이 아니었다** — insert 는 실제로 성공했고 에러를 삼킨 구조도 아니다. **테이블이 틀렸을 뿐이다.**
- ★**파생 문제**: A축은 「한 사람 한 구독」이라 새 부여가 기존 활성 구독을 `auto_cancel` 한다. **조문강의를 준 1분 뒤 패키지를 주자 조문강의가 취소됐다.** 강의 상품이 A축에 들어가는 한 강의를 여러 개 주면 서로를 지운다.

### 1-B. 「결제 실패 ₩180,000」은 이 부여가 만든 것이 아니다 — ★확정

- 관리자 수동 부여 경로 3곳 중 **어디도 `orders`·`payments` 를 만들지 않는다.**
- 「결제 취소(결제창 종료 또는 재시도)」 문구의 유일한 writer 는 `cancelPendingCheckout`(`subscriptions/queries.server.ts:690-704`)이고 **호출자가 전부 학생 결제 경로**다.
- 문제의 주문은 `09-18 02:02 · toss · cancelled · provision_patent ₩180,000` 로 **부여(02:06)보다 4분 앞선다.**

→ 같은 화면이 부여 폼 바로 아래에 결제 이력을 렌더해(`admin-subscription-panel.tsx:146-176`) 부여가 만든 것으로 보인 것. **「결제 경로와 분리해 달라」는 요청은 이미 분리돼 있다.**

### 1-C. 강의 상세 목차 — 렌더 코드가 없다 + 그 강의는 붙여도 안 보인다 — ★확정

- `/lecture/catalog/:productCode`(`lecture-product-detail.tsx`)의 loader 는 회차를 **개수만** 센다 — `listSellableLectureProducts`(`lms/queries.server.ts:1052-1063`)가 `lesson_id, course_id` 두 컬럼만 읽어 `lessonCount` 로 접는다. **회차명·영상시간·맛보기를 그리는 JSX 가 파일 466줄에 없다.**
- 관리자는 `getCourseDetail`(`queries.server.ts:234-246`)로 6컬럼 + `lesson_videos.duration_seconds` 까지 읽는다. **두 경로가 완전히 별개.**
- 지금 학생에게 목차가 보이는 유일한 길은 운영자가 상품 폼의 **「커리큘럼 안내」 HTML 섹션**(`detail-sections.ts:10`)에 직접 써넣는 것 — 요청서가 지적한 바로 그 방식.
- **데이터도 막혀 있다**(운영 DB 실측):

| 상품 | 강의 status | 회차 | 공개 회차 |
|---|---|---|---|
| **provision_patent(조문강의)** | **draft** | 2 | **0** |
| patent_basic_2026 | published | 5 | 5 |
| pt_tpass(패키지) | published 3 + draft 1 | 12 | 11 |

회차 insert 가 `is_published` 를 넘기지 않아 DDL 기본값 `false` 로 들어가고(`admin-lms-course-detail.tsx:171-176`), **staff 는 RLS 로 전량 보이므로 관리자 화면엔 멀쩡해 보인다.** 「등록했는데 학생에겐 안 보인다」가 여기서 난다.
- ★제약: `lesson_videos` 는 **staff 전용 SELECT RLS**(`20260708_lms_m2_tables.sql:246-247`) — 영상시간은 학생 세션 client 로 못 읽는다. `adminClient` 필요(선례 `getCourseTotalDuration`).

## 2. 설계 방향

**원칙 = 지급 로직의 단일 진입점 + 화면은 종류에 따라 올바른 축으로.** `enrollments` insert 지점이 관리자 화면·주문 이행 2곳으로 흩어져 중복 가드까지 복제돼 있다(각자 select-then-insert). 서버 함수 `grantEnrollment()` 하나로 모으면 「경로가 하나 더 있는데 틀린 쪽」 사고가 구조적으로 막힌다(CLAUDE.md 「단일 진입점」·「뮤테이션 경로 동결」).

## 3. 단계

| | 내용 | 상태 |
|---|---|---|
| **P0-1** | 회원 CRM 패널에서 강의 상품 차단 + **서버 거부** | ✅ 2026-09-19 |
| **P0-2** | 09-18 잘못 들어간 구독 행 정리 | ✅ 2026-09-19 |
| P1-1 | 상세페이지 목차 렌더(`course_lessons` 직접 조회) + 「커리큘럼 안내」 HTML 재입력 폐지 | 🔲 |
| P1-2 | 조문강의 강의 발행 + 회차 공개 처리(운영) | 🔲 |
| P1-3 | `grantEnrollment()` 단일 진입점 + 성공 메시지를 실제 생성물에 묶기 | 🔲 |
| P2-1 | `enrollments` 부분 unique 인덱스 `(user_id, course_id) where status <> 'revoked'` | 🔲 |
| P2-2 | 주문 이행 수강권 실패를 운영자에게 드러내기(`orders.server.ts:610` 조용한 console.error) | 🔲 |
| P2-3 | 운영 화면 「학생에게 안 보임」 경고 배지(draft 강의·비공개 회차) | 🔲 |

### 「공개예정」 — 원장 결정 2026-09-19: **(가) `publish_at` 타임스탬프 추가**

현재 스키마는 `is_published` 불리언뿐이라 「공개예정」을 표현할 수단이 없다. `course_lessons.publish_at`(nullable) 을 추가해 미래면 「공개예정 (10/5)」, 지나면 자동 공개로 판정한다. 회차별 오픈 일정은 강의 운영에서 계속 쓰는 정보이고 컬럼 하나로 끝난다. → P1-1 과 함께 DDL.

## 4. P0 반영 내역(2026-09-19)

**P0-1 코드** — 판정 규칙을 `labels.ts` SSOT 에 두고 화면·서버 양쪽에 걸었다.
- `subscriptions/labels.ts` — `MANUAL_GRANT_PRODUCT_KINDS`(`subject`·`bundle`) + `isManualGrantableProductKind()` 신설. 기존 `isLectureProductKind()` 와 같은 자리.
- `admin-subscriptions.tsx` — 하드코딩 `productKind === "subject" || "bundle"` 를 SSOT 호출로 교체(규칙이 두 곳에 복제되지 않게).
- `admin-student-detail.tsx` — loader 가 패널에 넘길 `plans` 를 `isManualGrantableProductKind` 로 제한.
- `admin-queries.server.ts` `grantManualSubscription()` — `product_kind` 를 함께 조회해 **강의 상품이면 400**(「영상 수강권 화면에서 지급하세요」), 수동 부여 대상이 아닌 종류도 거부. **화면 필터가 뚫려도 서버가 막는다.**
- `npm run typecheck` exit 0.

**P0-2 데이터** — `scripts/sql/20260919_fix_wrong_axis_subscription.sql`(운영 적용 완료).
- 대상 = `pt_tpass` 구독 1건(`0ad20e9d…`, CHO·manager·member_no 6) → `cancelled`. `subscription_admin_logs` 에 `via=ops_fix_wrong_axis` 로 사유 기록.
- ★**수강권 재지급은 하지 않았다** — 대상이 실수강생이 아니라 **운영 스태프(manager) 계정**이고, staff 는 `requestPlaybackGrant` 에서 수강권 게이트가 면제되므로(2026-07-20 개방) 재지급 실익이 없다.
- ★**권한 영향 없었음 확인**: `getMembershipAccess`(`membership.server.ts:187`)가 `SELF_STUDY_PRODUCT_KINDS` 로 이미 거르고 있어 잘못된 tpass 구독이 등급을 주지는 않았다. 정리 사유는 `auto_cancel` 이 정상 구독을 취소시킬 위험 + 화면·통계 오염.
- 적용 후 확인: 강의 상품의 **활성** `user_subscriptions` **0건**.

## 5. 조사 중 함께 발견(별건, 미처리)

- **중복 수강권 실재** — CHO 계정에 `f7c83aab` 강의의 enrollment 가 `source=order` active + `source=manual` active **2건** 공존. `enrollments` 에 DB unique 제약이 없고 앱 레벨 select-then-insert 가드만 있어(비트랜잭션) 생긴 것. 코드 주석에 2026-09-02·09-14 중복 사고 이력이 이미 있다. → P2-1 이 근본 대책.
- `admin-subscription-panel.tsx:378` — `setTimeout(onSuccess, 200)` 으로 **서버 응답과 무관하게** 화면을 새로고침하고 성공 문구를 띄운다. → P1-3.
