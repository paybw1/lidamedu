# feat-7-031 — 4단계 회원 권한 (원장·관리자·강사·수험생)

> **구현 완료 (2026-05-19).** 역할 3단계 → 4단계 확장. SPEC.md `5.7 운영자 / feat-7-031` 매핑.
> 설계는 대화로 확정(2026-05-19): 등급 모델 · 관리자/원장 경계 · 결제 권한 분할.

## 1. 배경

현재 `user_role` enum = `student | instructor | admin` 3단계. `admin`은 이미 화면에 **"원장"**으로 표시. 학원 운영상 **원장과 일반 운영 관리자를 분리**해야 함 → 강사 위·원장 아래 `manager`(관리자) 신규.

권한 체크가 중앙화돼 있지 않음 — `requireRole` 헬퍼 없이 ~87파일이 `getStaffRole()` 후 ad-hoc 검사. 이참에 등급(rank) 기반 SSOT 로 정리한다.

## 2. 역할 모델

| rank | enum | 표시 | 성격 |
|:-:|---|---|---|
| 3 | `admin` (유지) | **원장** | 최고 권한 |
| 2 | `manager` (신규) | **관리자** | 운영 전반 |
| 1 | `instructor` (유지) | **강사** | 콘텐츠 + 자기 반 |
| 0 | `student` (유지) | **수험생** | 학습 |

`admin` enum 값은 그대로 둔다(이미 "원장" 표시 + 정책·코드가 `admin`=최고권한 전제 → churn 최소). `manager`만 사이에 신규 삽입. 등급 비교가 모든 권한 판정의 기준.

## 3. 권한 매트릭스

| 권한 | 수험생 | 강사 | 관리자 | 원장 |
|---|:-:|:-:|:-:|:-:|
| 학습(조문·판례·문제·진도·메모) | ✅ | ✅ | ✅ | ✅ |
| 콘텐츠 CRUD(개정·판례·문제·빈칸·연관관계·논문) | — | ✅ | ✅ | ✅ |
| 반·커리큘럼·과제·학생 진도 | — | 자기 반 | 전체 | 전체 |
| 온라인 GS 운영·채점 | — | ✅ | ✅ | ✅ |
| 사용자 목록·공지·감사 로그·합격데이터 운영·인증 | — | — | ✅ | ✅ |
| 결제·수강 내역 **조회** | — | — | ✅ | ✅ |
| 수강권 부여·연장 / 환불 처리 | — | — | ✅ *(감사 로그)* | ✅ |
| **요금제·가격·PG 설정** | — | — | — | ✅ |
| **역할 변경·강사 임명** | — | — | — | ✅ |

원칙: 관리자 = 강사 + 전체 운영. 원장 = 관리자 + "사람과 돈의 정의"(역할 변경, 요금제·가격). 돈을 건드리는 행위(수강권 부여·환불)는 관리자도 가능하되 **감사 로그 필수** — 차단이 아니라 추적으로 통제.

## 4. ⚠️ 보안 발견 — 역할 자가 상승(self-escalation) 취약점

조사 중 발견. **현행 시스템에 권한 상승 구멍이 있다:**

- `profiles` 의 `update-own-profile` RLS 정책은 `auth.uid() = profile_id` 만 검사 — **컬럼 제한 없음** (RLS 는 행 단위라 컬럼을 못 막는다). 트리거도 `set_updated_at` 뿐.
- → 현재 **임의 인증 사용자가 `update profiles set role='admin' where profile_id=<본인>` 으로 스스로 원장이 될 수 있다.** 수험생 self-escalation.
- 운영자 API(`user-role.tsx`)의 `role !== "admin"` 가드는 그 API 경로만 막을 뿐, 클라이언트가 DB 를 직접 때리면 우회된다.

**feat-7-031 은 이 구멍을 반드시 닫는다** (역할 기능의 전제):
- `profiles` BEFORE UPDATE 트리거 — `NEW.role` 이 `OLD.role` 과 다른데 `auth.uid()` 가 NULL 이 아니면(= service_role 이 아닌 일반 연결) 예외 발생.
- 정당한 역할 변경은 `updateUserRole()`(admin client = service_role, `auth.uid()` NULL)만 통과 → 역할 변경이 **감사 로그 남기는 운영자 API 한 경로로 강제**된다.

## 5. DB 변경

### 5.1 enum (마이그레이션 1 — 독립)
`ALTER TYPE public.user_role ADD VALUE 'manager' BEFORE 'admin';`
— `ADD VALUE` 후 같은 트랜잭션에서 사용 제약이 있어 **별도 마이그레이션**으로 먼저 적용 후 `npm run db:typegen`.

### 5.2 함수 (마이그레이션 2)
- `private.is_staff(uuid)` — `instructor|admin` → **`instructor|manager|admin`**.
- `private.is_manager(uuid)` **신규** — `manager|admin`.
- `private.get_role()` — 유지(원장 전용 판정은 `get_role() = 'admin'`).

### 5.3 RLS 정책 재분류 (~70개, 마이그레이션 2)

조사 결과 역할 참조 정책 ~70개. 재분류 규칙:

- **"staff write/read" ~55개** (현행 `instructor`+`admin`) → manager 포함. 콘텐츠(articles·cases·problems·laws·revisions·systematic·blank_sets·연관관계 5종)·GS 전체·논문·book_updates·mcq_packs·science_sections·qna_threads staff·user_*_attempts staff read 등.
- **"운영(admin)" ~13개** → **manager+**(`is_manager`): announcements·announcement_audiences·announcement_reads, audit_logs, cohorts·cohort_members·assignments·assignment_items·cohort_curricula, exam_results(read·검증 update), content_comments 모더레이션, student_notes, lecture_views·pass_prediction staff read, **payments 조회·user_subscriptions 조회**.
- **원장 전용 유지** — `subscription_plans` write(요금제·가격·PG). `get_role() = 'admin'`.
- 역할 변경 — 별도 RLS 정책 없음(admin client 경유) → §4 트리거 + API 가드로 보호.

> 정책은 가능한 한 `private.is_staff()` / `is_manager()` 함수 호출로 통일 → 향후 역할 조정 시 함수만 고치면 됨.

### 5.4 profiles 역할 보호 트리거 (§4)
`private.guard_profile_role_change()` + `BEFORE UPDATE ON profiles`.

## 6. 앱 변경

- **신규 `app/core/lib/roles.ts`** — 역할 SSOT: 4역할, `ROLE_RANK`, `ROLE_LABEL`(수험생/강사/관리자/원장), badge tone, `roleAtLeast(role, min)` 헬퍼.
- **`guards.server.ts`** — `requireMinRole(client, minRole)` 추가 (등급 미만이면 403).
- **`getStaffRole`** (`laws/queries.server.ts`) — `StaffRole` 타입에 `manager` 추가, 반환. 기존 `if(!role)`(=스태프) / `if(role!=="admin")`(=원장) 검사는 의미 보존돼 그대로 동작.
- **`user-role.tsx`** API — Zod enum 에 `manager` 추가(원장이 관리자 임명 가능), 가드 `role !== "admin"` 유지.
- **`AdminShell`** `role` prop 타입에 `manager` 추가, 사이드바 역할 badge 4종.
- **`admin-users.tsx`** — 역할 변경 드롭다운 4개 옵션.
- **SPEC.md** §4 권한 매트릭스 4열, feat-7-031 등록.

## 7. 단계

1. enum 마이그레이션 → `npm run db:typegen`.
2. 함수·정책·트리거 마이그레이션.
3. `roles.ts` SSOT + `requireMinRole` + `getStaffRole` 확장.
4. UI — `AdminShell`·`admin-users`·badge.
5. `npm run typecheck`, SPEC·db-schema.md 갱신.

## 8. 위반 가드

- 역할 변경 = 원장 전용 + DB 트리거(self-escalation 차단) + 감사 로그(`logAuditEvent` 기존).
- `service_role` 키 클라이언트 노출 금지 — 역할 변경 트리거 우회 경로(admin client)는 서버 전용 유지.
- 마이그레이션 후 `npm run db:typegen` + `docs/db-schema.md` 갱신.
- `any`/`@ts-ignore` 금지, `npm run typecheck` 통과.

— 끝.
