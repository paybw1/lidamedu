# feat-7-046 — 회원 CRM (통합 회원 상세)

## 목표
`/admin/users`(회원관리)에서 **회원명 클릭 → 회원 CRM**으로 진입. 한 회원의 모든 정보를
탭으로 통합: 수강정보·학습현황·회원정보·회원이력·주문·쿠폰·포인트·Q&A·발송.

## 현황 (2026-07 조사)
회원 CRM의 상당 부분이 이미 `/admin/students/:profileId`
(`app/features/admin/screens/admin-student-detail.tsx`, 단일 세로 스크롤)에 존재.
CRM 작업 = **탭 재편 + 회원명 진입 배선 + 빠진 탭 채우기**.

| 요청 탭 | 데이터 상태 | 근거 |
|---|---|---|
| 학습현황 | ✅ 있음 | 마스터리·성장·추세·모의·SRS·과제·OX진단 (이미 렌더) |
| Q&A | ✅ 있음 | `getStudentActivity`(asker_id) — 활동 내역 |
| 주문 | ✅ 재사용 | `orders`/`order_items`(강의+도서), `my-orders` 로더 → adminClient |
| 쿠폰 | ✅/🟡 | 구독쿠폰 `user_coupons` + 강의쿠폰 `coupon_grants`/`coupon_redemptions` |
| 회원정보 | 🟡 | profiles 필드 있음(미노출). 비번=카카오 단일 로그인이라 대부분 없음 |
| 회원이력 | 🟡 | 접속(`user_access_logs`)·시청(`watch_events`)·다운로드(`book_downloads`/`lecture_note_views`)·학습(`study_sessions`) — 회원별 조회 함수만 신설 |
| 수강정보 | 🟡 | 진도율 계산 있음(`getUserWatchHistory`/`getLessonProgressForUser`). **개별완료처리 = 완료 모델 없음** → 신규 |
| 포인트 | 🟠 | `point_transactions` 테이블만 있고 **적립/사용 write 코드 전무**(미가동 스텁) |
| 발송 | ❌ | 메일(Resend)·알림톡(Solapi) **전송 로그 없음**(fire-and-forget). 신규 테이블 필요 |

## 단계 (각 단계 하드스톱, 승인 후 다음)

- **Stage 0 — CRM 골격** (진행 중): 회원명 클릭 진입 배선 + 회원 헤더(사진·회원번호·연락처·소속·가입/최근접속) + 기존 긴 스크롤을 탭으로 재편(`학습현황 / 상담·메모 / 활동·결제`). 신규 데이터 0.
- **Stage 1 — 회원정보 + 회원이력** 탭: profiles 확인/안전편집 + 접속/시청/다운로드/학습 회원별 조회 함수 신설. **id/pw 로그인은 기능만 배선하고 스위치는 꺼둠(2026-07-22)** — `/admin/auth` 이메일·비밀번호 로그인 토글(기본 off)에 게이트. 토글 off면 회원정보 탭은 '카카오 로그인 계정 · 이메일 로그인 비활성'만 표기 + 비밀번호 UI 숨김. 토글 on 시 같은 자리에 비밀번호 재설정(메일) 버튼 자동 활성화.
- **Stage 2 — 주문 + 쿠폰** 탭: `my-orders`/`lecture-coupons` 로더 재사용(adminClient 스코프) + 강의쿠폰 회원별 select 신설.
- **Stage 3 — 수강정보 + 개별완료처리**: 회원별 수강목록+진도율 + **완료 override 테이블(`lesson_completions`) 신설** → 관리자 수동 완료.
- **Stage 4 — 포인트** 탭: 원장 수동 +/- 적립 조정(staff-only INSERT) + 잔액/이력.
- **Stage 5 — 발송** 탭 ✅: (A) 인앱 알림 이력(user_notifications) + (B) 전송 로그 인프라(message_send_logs) 모두 완료(2026-07-22). sendLoggedEmail 래퍼로 이메일 7곳 이관 + sendKakaoAlimtalk 계측, recipientId 귀속. 로깅은 발송을 안 깸(fire-and-forget).

**전 단계(0~5) 완료·배포.** 최종 탭: 학습현황·수강정보·회원정보·회원이력·주문·쿠폰·포인트·발송·상담·메모·활동·결제.

## 결정 (승인됨 2026-07-21)
1. 발송: 우선 인앱 알림 이력(A), 실제 전송 로그(B)는 별도 승인.
2. 개별완료처리: 완료 override 테이블 신설.
3. 비밀번호: **id/pw 로그인 기능은 배선하되 지금은 막아둠(2026-07-22)** — `/admin/auth` 이메일·비밀번호 로그인 토글(기본 off)에 게이트. 지금은 카카오 단일 유지, 원장이 토글 on 하는 시점에 비밀번호 재설정 UI 활성화.

## 관련 파일
- 화면: `app/features/admin/screens/admin-student-detail.tsx` (CRM 본체), `admin-users.tsx`(진입)
- 로더/쿼리: `admin/queries/student-progress.server`, `lms/watch.server`, `orders/*`, `student-notes/*`, `orders/cs.server`
- 라우트: `/admin/students/:profileId`
