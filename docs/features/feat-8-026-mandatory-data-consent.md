# feat-8-026 — 학습 데이터 활용 필수 동의 (가입 전제 조건)

## 1. 배경 / 요구

플랫폼의 핵심 가치는 **합격자 학습 데이터 기반 컨설팅**이다. 따라서 개별 수험생이
"플랫폼에서 학습한 패턴과 결과를 시스템이 활용하는 것"에 **동의하는 것을 서비스
이용의 전제 조건**으로 삼아야 한다. (합격 결과 인증은 별개로 **선택** 유지.)

### 현황 점검 결과 (기준 불합치)

| 지점 | 현재 | 문제 |
|---|---|---|
| 가입 화면 `join.tsx` | 동의 절차 없음, "동의하게 됩니다" 수동 문구만 | 명시 동의 미수집 |
| 온보딩 Step 2 `welcome.tsx` | 분석 동의 있으나 "동의 안 함" + 전체 "건너뛰기" 가능 | 우회 가능 |
| `analytics-consent.mdx` §5 | "본 동의는 **선택 사항**… 이용 제한 없음" | 요구와 정반대 명문화 |
| `terms-of-service.mdx` | 학습 데이터 처리 언급 0 | 계약상 근거 부재 |
| `privacy-policy.mdx` | 영문 stub | 미작성 |

→ 전체가 **opt-in(선택)** 전제. 요구 기준 **미충족**.

## 2. 법적 프레이밍 (중요)

단순히 "선택 동의 체크박스를 필수 체크박스로" 바꾸면 **개인정보 보호법 위반 소지**:
PIPA 제22조 — 정보주체가 *선택적* 동의를 거부한다는 이유로 **서비스 제공 거부 금지**.

**적법 경로**: 학습 데이터 처리는 본 서비스(데이터 기반 진단·컨설팅)의 **본질적
구성요소**이므로 PIPA 제15조①4호(**계약의 이행에 필요한 처리**)에 해당. 이를
**이용약관·개인정보처리방침에 "서비스 제공에 필요한 처리"로 명문화**하면 별도
"선택 동의"가 아니라 **이용 조건 그 자체**가 되어 적법하게 필수화된다.

→ 구현 방향: "선택 동의 강제"(위험) ❌ → "서비스 본질로 약관 편입 + 가입 시 명시
동의 + 미동의 시 학생 서비스 이용 차단"(적법) ✅.

## 3. 동의 개념 분리 (핵심 설계)

기존 단일 `analytics_consent_at` 이 "학습로그 + 시험결과"를 묶고 있었다. 두 층위로
명확히 분리한다.

| 구분 | 컬럼 | 성격 | 범위 |
|---|---|---|---|
| **학습 데이터 활용** | `service_data_consent_at` (신규) | **필수** (계약 이행) | 학습 활동 데이터의 서비스 제공·진단·(가명처리) 분석 활용. 미동의 학생은 서비스 이용 불가 |
| **합격자 표본/후기 공개** | `analytics_consent_at` (기존 유지) | **선택** | 합격자 집계 표본 포함·후기 익명 공개. 거부해도 이용 제한 없음 (현행 그대로) |

- 기존 `analytics.server.ts` 의 합격자 집계 게이팅 로직(`analytics_consent_at !== null`)은
  **변경하지 않는다** — blast radius 최소화. 이 선택 동의는 합격자의 시험결과·후기
  같은 더 민감한 항목과 결합되므로 선택 유지가 적절하고 PIPA 와도 합치.
- 신규 `service_data_consent_at` 은 플랫폼이 이미 수행 중인 학습 데이터 처리(진도·진단·
  추천)의 **법적 근거 + 이용 게이트** 역할.

## 4. DB 변경

```sql
alter table public.profiles
  add column if not exists service_data_consent_at timestamptz;
comment on column public.profiles.service_data_consent_at is
  '학습 데이터 활용(서비스 제공·진단·분석) 필수 동의 시점. NULL=미동의 → 학생 서비스 이용 차단(게이트). PIPA 15①4(계약 이행) 근거, 이용약관 편입.';
```

- RLS 변경 불필요: 기존 `update-own-profile` 로 본인이 set 가능. `profiles_guard_role_change`
  는 `role` 만 막으므로 이 컬럼 영향 없음.
- 트리거 변경 없음: 가입 action / 동의 페이지 action 에서 post-signup 으로 set.
- **기존 사용자**: 동의 시점이 없으므로 NULL. 다음 방문 시 게이트로 1회 동의 수집
  (위조 backfill 하지 않음 — 동의는 적극적 의사표시여야 함). staff 는 게이트 면제.

## 5. 적용 지점 (코드)

### 5.1 게이트 (백본)
`app/core/lib/require-consent.server.ts` — `requireServiceDataConsent(client, request, headers)`:
- 미인증 → 무시(상위 auth 가드가 처리)
- pathname 이 allow-list(`/consent`, `/logout`, `/api`) → 통과
- profile.role !== 'student' → 통과 (staff 면제)
- `service_data_consent_at` 존재 → 통과
- 그 외 → `throw redirect('/consent', { headers })`

호출처: `private.layout.tsx`(주 학습 앱) + `dashboard.layout.tsx`(대시보드) loader.
두 layout 이 학생 인증 라우트 전부를 감싸므로 이메일·소셜 **모든 가입 경로**를 커버.

### 5.2 동의 페이지 `/consent` (신규, private.layout 밖)
- 라우트는 `navigation.layout` 직속(= private.layout 게이트 루프 회피), 자체 auth 가드.
- loader: 미인증 → `/login`. 이미 동의했거나 staff → `/dashboard`.
- 화면: 필수 동의 안내(활용 데이터·가명처리·약관 링크) + 단일 "동의하고 시작하기"
  버튼 (**건너뛰기 없음**). 거부 의사는 "이용약관 보기"·"로그아웃"만 제공.
- action: `service_data_consent_at = now()` set → `/onboarding/welcome` 로 이어 진행.

### 5.3 가입 화면 `join.tsx` (이메일·비밀번호)
- 필수 체크박스 2종: ① 이용약관·개인정보처리방침 동의 ② 학습 데이터 활용 동의.
- Zod 로 둘 다 검증, 미체크 시 action 거부.
- signUp 성공 후 best-effort 로 `service_data_consent_at` set (게이트 우회 → UX).
  실패해도 게이트가 최종 강제.

### 5.4 소셜(OAuth)
- 코드 변경 없음. 가입 후 첫 진입에서 게이트가 `/consent` 로 유도 → 동의 → 진행.

### 5.5 온보딩 `welcome.tsx`
- Step 2 의 분석 동의는 **선택**(`analytics_consent_at`) 그대로 유지(합격자 표본 포함).
- 문구만 "선택" 임을 명확화해 필수 동의(가입 시 처리)와 구분.

## 6. 법령 문서

- `terms-of-service.mdx`: 「학습 데이터 처리 및 서비스 제공」 조 추가 — 본질적 처리·
  계약 이행 근거·이용 조건 명시.
- `analytics-consent.mdx`: 상단에 "본 동의(=합격자 표본/후기 공개)는 **선택**이며,
  서비스 제공에 필요한 학습 데이터 처리(필수)는 이용약관·처리방침에 따른다"는 구분
  주석 추가. §5 선택 유지(범위를 집계 표본으로 한정).
- `privacy-policy.mdx`: 한국어로 학습 데이터 수집·이용(필수, 계약 이행) 항목 신설.
  전체 방침은 법률 검토 필요 — TODO 주석.

## 7. 결정 사항 (압축 보존)

1. 필수 동의 = `service_data_consent_at` 신규 컬럼. 선택 동의 = 기존 `analytics_consent_at` 그대로.
2. 적법 근거 = PIPA 15①4(계약 이행) + 약관 편입. "선택 동의 강제" 프레이밍 회피.
3. 게이트는 학생 한정, staff 면제. allow-list = `/consent`·`/logout`·`/api`.
4. 동의 페이지는 private.layout **밖** 배치(루프 회피), 자체 auth.
5. 기존 사용자 backfill 없음 — 다음 방문 시 1회 동의(위조 동의 금지).
6. `analytics.server.ts` 합격자 집계 로직 불변(blast radius 최소).

## 8. 작업 체크리스트

- [ ] DB: `service_data_consent_at` 마이그레이션 + `db:typegen`
- [ ] `setServiceDataConsent` 쿼리 (exam-results/queries.server.ts)
- [ ] 게이트 헬퍼 + private/dashboard layout 적용
- [ ] `/consent` 라우트·화면
- [ ] `join.tsx` 필수 체크박스 + action
- [ ] 법령 문서 3종
- [ ] 온보딩 문구
- [ ] SPEC.md feat-8-026 등록, typecheck
