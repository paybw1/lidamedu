# feat-8-027 — 회원 등급 (체험 / 무료회원 / 자기학습 / 종합반)

## 목적
가입 회원의 **등급**에 따라 열람 범위를 차등한다. 기존 구독·결제 인프라(`user_subscriptions` 상태머신, `subscription_plans.features[]`, Toss, `requireFeature`)에 얹어, 등급은 **profiles 컬럼으로 저장하지 않고 단일 리졸버로 파생**한다.

## 등급 모델

| 등급 | 판정(자동) | 열람 범위 | 승격/전환 |
|---|---|---|---|
| **체험**(가입 직후) | 가입 후 **15일 이내** & 유료구독·cohort 없음 | 자기학습 수준 기능 + **학습과목=특허법만** | 가입 시 사전공지, 만료 전 인박스/팝업 공지 → 자동 강등 |
| **무료회원** | 체험 만료 후 기본(**운영자 확인 없이 자동**) | 커뮤니티(반별 게시판 제외) + 학습정보. **학습과목 제외** | 자동 |
| **자기학습**(유료) | `self_study`(=pro_monthly) 구독 active | 상담·과제·모의고사·반별 뺀 대부분. **과목별 활성화**(결제분 + 자연과학 기본) | 결제 시 자동 |
| **종합반**(유료) | 활성 `cohort_members` | 전체 (단 `cohorts.access_scope`=`self_study`면 자기학습 수준으로 축소) | 신청 → **운영자 확인** |

- **학습정보**(무료회원 열람) = 공지·공부방법 Q&A·합격수기 등 커뮤니티성 정보(라우트/RLS로 개방, feature 게이트 없음). **학습과목**(조문·판례·문제, `area_subjects`)과 구분.
- staff(instructor/manager/admin)는 전 구간 게이팅 면제.

## SSOT 리졸버 — `app/features/subscriptions/membership.server.ts`
`getMembershipAccess(client, userId)` → `{ grade, planCode, features[], subjects: 'all'|slug[], trialEndsAt }`. 우선순위: **staff > 활성 cohort(종류별 범위) > 활성 자기학습 구독(과목별) > 체험(15일) > 무료회원**. 권한 게이트라 RLS 공백 회피 위해 adminClient 로 권위 조회(요청자 id 필터).
- `requireFeature(client, userId, feature)` — 영역 게이트(subjects/study/mock 레이아웃). 리졸버 features 기준으로 재구현(getActiveSubscription 대체).
- `requireSubject(client, userId, subjectSlug)` — 학습과목 과목별 게이트. 체험=특허법만, 자기학습=결제 과목(+자연과학), 종합반/staff=전체, 무료회원=차단.
- `hasFeature` 도 리졸버 기준으로 위임.

## DB (Stage 1, 20260701_membership_grade.sql — 적용 완료)
- `profiles.trial_ends_at`(가입 15일) + `trial_expiry_notified_at`(만료 공지 1회). 기존 사용자 backfill = `created_at + 15d`. `handle_new_user` 트리거가 신규 가입 시 `now()+15d` 세팅.
- `user_subscriptions.subject_code text null` — 자기학습 과목별(null=전체/레거시).
- `cohorts.access_scope text not null default 'full' check in ('full','self_study')`.
- `subscription_plans` `pro_monthly` → name '자기학습', features 보강(area_study_mgmt·passer_* 포함, 상담·과제·모의·반별 제외).

## 단계 계획
1. **DB + 리졸버** ✅ (7d06c1a) — 스키마, `getMembershipAccess`/`requireSubject`, requireFeature 위임.
2. **게이팅 배선** ✅ (7d06c1a) — `subjects.layout` 단일 지점에서 URL 과목 슬러그로 `requireSubject`
   (체험=특허법만, 자기학습=결제 과목+자연과학, 종합반/staff=전체, 무료회원=차단). pricing
   `?locked=subject:<slug>` 배너에 과목명 표시. 개별 뷰어 로더 무수정.
3. **체험 공지·강등** ✅ — 대시보드 배너(`TrialNoticeBanner`, 체험 시작일부터 상시=사전공지, D-3 이내 경고 톤) + 만료 임박 인박스 알림 1회(`trial_expiry_warning` kind, `notifyTrialExpiryIfDue` 지연 트리거·`runAfterResponse`·`trial_expiry_notified_at` 플래그, 크론 비의존). 자동 강등=리졸버 파생(별도 작업 없음).
4. **자기학습 과목별 결제** ✅ — `payments.subject_code` + createPendingPayment/confirmPayment 과목 배선(구독 매칭·연장을 subject_code 단위로). create-order 에 subjectCode(법률과목 슬러그만). pricing 자기학습 카드=과목별 구독 목록(`SubjectSubscribeList`, 5개 법률과목 개별 결제·보유 과목 "보유 중"·자연과학 "기본 무료"). /me/subscription 활성 학습과목 칩. ※라이브 결제 검증은 Toss env 세팅 후.
5. **종합반 종류별 범위 + 승인** ✅ — `cohorts.access_scope`(full/self_study) 운영 UI(admin-cohorts CohortForm "열람 범위" 선택 + 카드 배지). createCohort/updateCohort·cohort API·CohortListItem 배선. 리졸버가 cohort 멤버의 access_scope 로 full/자기학습 범위 부여. **승인=기존 종합반 멤버 추가(add_member) 그대로**(운영자 확인 후 등업). **신청 채널=기존 상담(/contact)** — 별도 인앱 신청 큐는 미구축(YAGNI, 필요 시 후속).

## 권한 없는 항목 = 비활성(disabled) 표시 ✅
- 영역 잠금(무료회원 등) = `LOCKED_DIM_CLASS`에 `pointer-events-none` → 상단바·사이드바·하단탭에서 클릭 불가·회색(단일 소스).
- 과목별(체험=특허법만 등) = 등급 리졸버 `subjects`를 nav 로 배선(`getMembershipAccess`), `isSubjectLocked` 로 판정. 상단 학습과목 드롭다운·사이드바 과목·학습과목 탭(`SectionTabs` disabled)에서 미허용 과목 비활성. `subjectSlugFromHref` SSOT.

## 3계층 게이트
- **Judgment**: 스펙상 필수(수익화·차등 접근). 기존 구독 인프라 재사용이라 중복 최소.
- **Structure**: 등급은 파생값(저장 안 함), 승인은 기존 status 상태머신, 과목은 subject_code, 종류는 cohorts 컬럼. 게이트는 서버(리졸버) 권위.
- **Code**: 등급 SSOT = membership.server.ts. features = subscription_plans DB SSOT.

## Stage 3 마무리 — 체험 종료(강등) 통지 (2026-07-06)

만료 임박(D-3 배너+인박스 1회)은 기존 구현. 빠져 있던 "종료 시점" 조각 추가:

- `notifyTrialEndedIfDue` (trial.server.ts) — trial_ends_at 경과 + 미통지 시 인박스
  `trial_ended` 알림 1회(`profiles.trial_ended_notified_at` 플래그). 대시보드 로더가
  grade==free_member 확정 후 runAfterResponse 트리거 — 구독·종합반 전환자 미발송
- 대시보드 배너: 종료 후 7일간(TRIAL_ENDED_BANNER_DAYS) "체험 종료 · 학습 기록 보관
  중 · 구독하면 이어서" 전환 넛지(TrialNoticeBanner ended 변형)
- enum staff_notification_kind 에 'trial_ended' 추가 + STUDENT_KINDS·인박스 라벨 등록
- 잔여로 지목됐던 ②과목별 결제(상품 방식으로 완결)·③종합반 승인(등업 신청→반 배정
  완결)은 조사 결과 이미 구현 — 추가 작업 없음
