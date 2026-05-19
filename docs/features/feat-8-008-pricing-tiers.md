# feat-8-008 — 3-tier 가격 정책 + 영역 게이팅

> 무료(회원1)·정회원(회원2)·종합반(회원3) 3단계 회원. 메뉴 영역 단위로 접근을 제어한다.
> feat-8-018(결제 인프라 ✅) 위에 게이팅을 얹는다. **선행: feat-3-205(학습정보 자체 뷰어).**
> 검토용 설계문서 — 승인 후 SPEC 갱신 → 마이그레이션 → 구현.

## 1. 목표 / 배경

결제 인프라(feat-8-018 ✅ — `subscription_plans`·`payments`·`user_subscriptions`, 토스 연동, `getActiveSubscription`/`hasFeature`)는 있으나 **티어별 접근 제어가 없다**. 이 문서는 3개 티어를 확정하고 메뉴 영역 단위 게이팅을 도입한다.

## 2. 티어

| 티어 | 이름 | code | 가격 | 결제 |
|------|------|------|------|------|
| 회원1 | 무료 | `free` | ₩0 | — |
| 회원2 | 정회원 | `pro_monthly` | ₩99,000 / 월 | 토스페이먼츠 자가결제 (feat-8-018 흐름) |
| 회원3 | 종합반 | `cohort` | 별도 상담 | 상담 → cohort 배정 (§6) |

기존 3개 플랜 row 재사용 — 회원2 가격 ₩29,900→₩99,000, 플랜별 `features` 재정의(§4).

## 3. 접근 권한 매트릭스

| 영역 | 라우트 | 회원1 | 회원2 | 회원3 |
|------|--------|:--:|:--:|:--:|
| 학습정보 | `/latest/*` (자체 뷰어 포함 — feat-3-205) | ✓ | ✓ | ✓ |
| 커뮤니티 | `/community/*` · `/announcements` · `/inbox` | ✓ | ✓ | ✓ |
| 학습과목 | `/subjects/*` | 🔒 | ✓ | ✓ |
| 학습보조 | `/study/wrong-note·highlights·bookmarks·notes·comments` · `/study/blanks` | 🔒 | ✓ | ✓ |
| 학습관리 | `/dashboard`(전체판) · `/goals` · `/study/stats` · `/assignments` | 축소판 | 축소판 | ✓ |
| 모의고사 | `/latest/mcq/*`(모의) · `/latest/mcq?kind=mock_*` · `/gs*` | 🔒 | 🔒 | ✓ |

- 티어는 포함 관계(회원3 ⊃ 회원2 ⊃ 회원1) — 단순 등급.
- 알림(`/inbox`)은 커뮤니티 묶음 — 전 티어(공지·커뮤니티 알림 수신).
- `/dashboard` 는 전 티어 진입, 내용이 티어별(§5.2).
- `/study/` 와 `/latest/mcq` 는 영역이 갈리므로 URL prefix 가 아닌 **라우트별 매핑**.

## 4. 데이터 모델 — 영역 플래그

신규 테이블 없음. `subscription_plans.features`(jsonb string[]) 에 **영역 플래그** 추가:
`area_subjects` · `area_study_aids` · `area_study_mgmt` · `area_mock_exams`.
(학습정보·커뮤니티는 전원 → 플래그 불요)

| 플랜 | features |
|------|----------|
| `free` | `[]` |
| `pro_monthly` | `[area_subjects, area_study_aids]` |
| `cohort` | `[area_subjects, area_study_aids, area_study_mgmt, area_mock_exams]` + 기존 세부 기능 |

재시드 — `subscription_plans` 의 name/price/features UPDATE(데이터 마이그레이션). `FEATURE_LABEL`(`subscriptions/labels.ts`) 에 4개 영역 라벨 추가.

## 5. 게이팅

### 5.1 서버 가드
`requireFeature(client, userId, area)` — `core/lib` 신설, `requireRole` 와 동형. 미보유 시 `/pricing?locked={area}` 로 redirect. 게이트 영역의 라우트 그룹 loader 에서 호출:
- **학습과목** — `/subjects/*` 공통 진입(`subjects/lib/loader.server.ts` 또는 각 화면 loader).
- **학습보조** — 학습보조 화면 loader (`/study/wrong-note` 등).
- **학습관리** — `/goals`·`/study/stats`·`/assignments`. 대시보드는 차단 대신 §5.2.
- **모의고사** — 모의 팩·`mcq-exam-*`·`/gs*` loader.

### 5.2 대시보드 — 티어별 축소
`/dashboard` 는 회원1·2 도 진입 허용 — 접근 가능 영역 카드 + 상위 티어 안내(업그레이드 CTA). 합격 진단·추천 액션·합격자 비교 등 전체 분석 카드는 `hasFeature("area_study_mgmt")` 인 회원3 만.

### 5.3 네비게이션 잠금 UI
접근 불가 메뉴는 숨기지 않고 🔒 표시 + 클릭 시 `/pricing`(전환 유도). `navigation-bar.tsx` 가 `getActiveSubscription` features 로 분기.

### 5.4 `/pricing`
3-tier 카드 — 무료 / 정회원(₩99,000, 토스 결제) / 종합반(상담 → `/contact`). 영역별 포함 내역 표시. `?locked={area}` 진입 시 해당 영역 강조 배너.

## 6. 회원3 자격 — cohort 연동

종합반은 자가결제가 없다. **회원3 = 활성 cohort 멤버**(`cohort_members`) 로 본다:
- `getActiveSubscription` 확장 — 활성 구독이 없어도 `cohort_members` 소속이면 `cohort` 플랜 features 부여.
- 상담 → 운영자가 cohort 배정 → 회원3 권한 자동 발생. 별도 구독 row 불요.
- 대안(운영자 수동 구독 부여)은 채택하지 않음.

## 7. 구현 단계

1. **마이그레이션** — `subscription_plans` 재시드(name/price/features) → `npm run db:typegen`.
2. `FEATURE_LABEL` 4개 영역 라벨 + `requireFeature` 가드(`core/lib`).
3. `getActiveSubscription` — cohort 멤버십 → `cohort` features 부여(§6).
4. 라우트 그룹 loader 게이트 적용(§5.1).
5. 대시보드 티어별 축소(§5.2).
6. 네비 잠금 UI(§5.3).
7. `/pricing` 3-tier 갱신(§5.4) + `?locked=` 배너.
8. typecheck + `SPEC.md` feat-8-008 + `docs/db-schema.md`.

## 8. 위반 가드 / 결정사항

- 게이팅은 **서버 loader 가드**가 권위 — 네비 잠금 UI 는 보조.
- 영역↔라우트는 prefix 가 아닌 명시 매핑(`/study/`·`/latest/mcq` 가 영역 분리).
- 회원3 = 활성 cohort 멤버 — 자가결제 없음.
- **feat-3-205(학습정보 자체 뷰어)가 선행** — 없으면 회원1 학습정보가 막다른 길.
- 결제·구독 write 는 service_role(server action)만 — feat-8-018 패턴 유지.

## 9. 범위 밖 (YAGNI)

- 무료 체험 기간, 연간 결제, 자동 환불.
- 영역보다 세분화된 기능별 과금.
- 회원2 의 모의고사 부분 개방(현재 회원3 전용).
- 다운그레이드 시 데이터 처리 정책 — 별도.

## 10. 구현 현황 (2026-05-20)

**완료**
- 마이그레이션 — `subscription_plans` 재시드(무료 / 정회원 ₩99,000 / 종합반 + 영역 플래그). `FEATURE_LABEL` 영역 4종 추가.
- `requireFeature` 가드 + `getActiveSubscription` cohort 연동(활성 cohort 멤버 → `cohort` features). `ActiveSubscriptionInfo.planCode` 추가. staff 는 게이팅 면제.
- 영역 게이트 레이아웃 라우트 — `/subjects/*`(`area_subjects`), 학습보조 6개 라우트(`area_study_aids`), 학습관리(`/goals`·`/study/stats`·`/assignments`, `area_study_mgmt`). 각 layout loader 가 `requireFeature` 호출.
- `/pricing` — `?locked=` 안내 배너, `active.planCode` 사용, cohort 카드 isFree 버그 수정.

**완료 (추가)**
- 모의고사 게이트(`area_mock_exams`) — `/latest/mcq/exam/*`(통합 모의)·`/gs/*` 레이아웃 게이트 + `/latest/mcq/:packId/*` pack-kind 조건부(`isMockKind`).
- 네비게이션 잠금 UI — `SimpleDropdown.locked` prop + 학습과목 트리거 🔒. `navigation.layout` 이 features surface. 데스크톱 적용.
- 대시보드 티어별 축소 — `dashboard.tsx` 가 `hasMgmt` 미보유 시 `ReducedDashboard`(요금제 안내 + 접근 가능 영역 CTA) 반환. 회원3·staff 만 전체 분석판.

**남음 (향후 — 본 feature 핵심 흐름은 완성)**
- 모바일 메뉴(`MobileGroup`) 잠금 표시 — 데스크톱과 대칭으로.
- `my-subscription.tsx` cohort 멤버 표시 보정 — 현재 cohort 회원은 `subscription:null` 로 "구독 없음"으로 표시됨(권한·기능 부여는 정상).
