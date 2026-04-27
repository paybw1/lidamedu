# CLAUDE.md — 리담에듀 (변리사 학습 플랫폼, 가칭)

## 프로젝트 한 줄 요약
대한민국 변리사 시험(1차 객관식, 2차 주관식) 수험생을 위한 법령·판례·문제 통합 학습 및 진도 관리 SaaS. 학원 원장(admin) / 강사(instructor) / 수험생(student) 3자 역할 기반, 조문–판례–문제 3자 연관관계 그래프를 핵심 자산으로 한다.

## 기술 스택
- **Framework**: React Router 7 (SSR, file-based routing) + Vite
- **DB/Auth**: Supabase (Auth + PostgreSQL + RLS) + Drizzle ORM
- **UI**: shadcn/ui (New York style) + Radix UI + Tailwind CSS v4
- **Schema/Validation**: Zod (폼/서버 액션 경계에서 사용)
- **Email**: Resend + React Email
- **Monitoring**: Sentry
- **Deploy**: Cloudflare (Workers SSR + Pages 정적 자산)
- **Testing**: Playwright (E2E), Vitest (unit, 필요 시)
- **언어**: 한국어 단일 (i18n 미사용 — 모든 사용자 facing 문자열은 기본 한국어, 하드코딩 허용)

## 도메인 한 눈에 보기
- **과목**: 특허법 · 상표법 · 디자인보호법 · 민법 · 민사소송법 (총 5과목)
- **시험 구조**: 1차(객관식) · 2차(주관식/논술)
- **콘텐츠 엔티티**:
  - `law` → `article` (조–항–호–목 4단계 계층 트리)
  - `case` (대법원 판례, 연도 기반)
  - `problem` (객관식 / OX / 빈칸 / 주관식)
- **연관관계**: `article ↔ article`, `article ↔ case`, `case ↔ case`, `problem ↔ article`, `problem ↔ case` (모두 다대다)
- **개정 추적**: `law_revision` + `article_revision` 스냅샷으로 조문별 시점 추적
- **사용자 학습 데이터**: 메모 / 즐겨찾기 / 하이라이트 / 진도 / 문제풀이 시도 이력

## Cloudflare 배포 관련 주의
- React Router 7 SSR은 Cloudflare Workers 어댑터로 배포. Node 전용 API 사용 금지(`fs`, `net`, `crypto.randomBytes` 등) — 필요 시 Web Crypto / Workers 호환 라이브러리로 대체
- Drizzle은 Supabase pg에 `postgres-js`(Workers `connect()` TCP) 또는 Supabase의 `pg`-over-HTTP 중 **하나로 통일**. 결정 전까지 DB 커넥션 레이어 추상화 (`app/core/db/drizzle-client.server.ts`) 유지
- Resend 호출은 전부 서버 action/loader에서만. 환경변수는 Cloudflare Secrets로 관리

## 작업 시작 전 필수 확인 (Progressive Disclosure)

> **IMPORTANT**: 작업 시작 전 반드시 관련 문서를 먼저 읽고 맥락을 확보하세요. **전부 읽지 말고 관련 있는 것만** 읽으세요.

| 필요한 정보 | 열람 문서 |
|-------------|-----------|
| 현재 구현 상태 + 로드맵 + 기능 ID | `SPEC.md` |
| 전체 화면 구성, 라우트 | `docs/screens.md` |
| 전체 아키텍처, 데이터 흐름 | `docs/architecture.md` |
| DB 테이블·RLS·관계도 | `docs/db-schema.md` |
| 법령 계층 트리 설계 (조/항/호/목 저장 방식) | `docs/article-tree.md` |
| 연관관계 그래프 설계 | `docs/relations.md` |
| 기능별 상세 명세 | `docs/features/feat-XXX-*.md` |

- 관련 문서가 **존재하지 않으면 문서를 먼저 작성** 후 코드를 짜기 시작하세요. 추측으로 진행하지 마세요.
- **대규모 탐색**(여러 파일을 훑어야 하는 조사)이 필요할 때는 subagent를 사용하세요: `"use a subagent to investigate ..."`

## 디렉토리 맵 (탐색 가이드)
```
app/
├── core/
│   ├── components/          # 공용 UI (navigation-bar, footer, command-palette, article-tree, tag-chip 등)
│   ├── db/                  # drizzle-client.server.ts, supa-client.server.ts, supa-admin-client.server.ts
│   ├── hooks/               # useHighlight, useStudyTimer, useShortcut 등
│   ├── layouts/             # public.layout, student.layout, staff.layout(강사+원장 공용), admin.layout
│   ├── lib/                 # 날짜/법령번호 포매터, 진도 계산기, 권한 가드
│   └── screens/             # robots.txt, sitemap.xml, error
├── features/
│   ├── auth/                # 로그인/회원가입/OTP/매직링크/비밀번호
│   ├── laws/                # ★ 법령 + 조문 트리 + 개정 이력
│   │   ├── schema.ts        # laws, articles, law_revisions, article_revisions
│   │   ├── screens/         # law-index, article-viewer
│   │   ├── components/      # article-tree, article-breadcrumb, revision-diff
│   │   └── lib/             # tree-builder, path-resolver
│   ├── cases/               # ★ 판례
│   │   ├── schema.ts        # cases, case_tags
│   │   ├── screens/         # case-index, case-viewer
│   │   └── components/      # case-summary, case-citation-list
│   ├── problems/            # ★ 문제 (객관식/OX/빈칸/주관식)
│   │   ├── schema.ts        # problems, problem_choices, problem_answers
│   │   ├── screens/         # problem-runner, quiz-config, wrong-note
│   │   └── components/      # mcq-card, ox-card, blank-card, subjective-card
│   ├── relations/           # ★ 조문↔판례↔문제 연관관계 관리 (관리자/강사 화면 포함)
│   │   └── schema.ts        # article_article_links, article_case_links, case_case_links, problem_links
│   ├── study/               # ★ 학습 진도/통계 (수험생 대시보드 핵심 데이터)
│   │   ├── schema.ts        # user_progress, user_problem_attempts, study_sessions, daily_study_stats
│   │   └── lib/             # aggregator, streak calculator
│   ├── annotations/         # 메모 · 즐겨찾기 · 하이라이트 (모든 엔티티 polymorphic)
│   │   └── schema.ts        # user_memos, user_bookmarks, user_highlights
│   ├── users/               # profiles, 역할 전환, 내 프로필
│   │   └── schema.ts        # profiles (role enum: student | instructor | admin)
│   ├── cohorts/             # 반/기수 관리 (강사·원장용)
│   │   └── schema.ts        # cohorts, cohort_members
│   ├── dashboard/           # 수험생 대시보드 집계 쿼리 + 카드 컴포넌트
│   ├── staff/               # 강사·원장 공용 — 콘텐츠 등록, 개정 반영, 문제 출제
│   ├── admin/               # 원장 전용 — 사용자/강사/결제/수강권 관리
│   ├── contact/             # 문의
│   ├── cron/                # 크론 (마감 알림, 신규 판례 알림 이메일)
│   ├── home/                # 랜딩
│   └── legal/               # 이용약관/개인정보처리방침
├── routes.ts
├── root.tsx
└── app.css
sql/migrations/              # Drizzle 마이그레이션
transactional-emails/        # Resend 템플릿 (가입/리셋/알림)
```

## Non-negotiable (절대 위반 금지)

> 아래 규칙은 다른 모든 지시보다 우선합니다. **위반 시 작업을 중단하고 사용자에게 먼저 알리세요.**

1. Supabase `service_role` 키는 **클라이언트 번들에 절대 포함 금지**
2. `supa-admin-client` (RLS 우회)는 명시적으로 필요한 관리 작업에만 사용. 불확실하면 질문
3. `any`, `@ts-ignore`, `@ts-expect-error` 금지 (strict 모드 유지)
4. 매직 넘버 금지 (constants SSOT에서만 정의) — 특히 과목 코드, 조문 레벨(조/항/호/목)은 enum
5. `console.log` 잔존 금지 (디버깅 후 제거)
6. 코드 변경 후 `npm run typecheck` 통과 확인 필수
7. `app/core/db/*.server.ts` 파일을 클라이언트 컴포넌트에서 import 금지
8. **법령·판례 원문은 읽기 전용 불변 객체로 취급** — 수정은 반드시 개정(new revision) 흐름으로만. 기존 조문 `content` 필드를 in-place 수정 금지
9. **사용자 학습 데이터(메모/하이라이트/진도)는 삭제 시 soft delete** — 실수로 한 학기치 메모가 날아가면 복구 불가. `deleted_at` 컬럼 사용
10. Cloudflare Workers 런타임 비호환 API(`fs`, Node `crypto.randomBytes`, `setImmediate` 등) 사용 금지

## 개발 원칙 (3 Layer)

판단 → 구조 → 코드 순서로 적용. 상위 레이어에서 거부되면 하위로 진행하지 않는다.

```
Layer 1. Judgment — "이걸 만들어야 하는가?"
       |  Yes → 만든다
       v
Layer 2. Structure — "어디에 어떻게 배치하는가?"
       |  배치 결정
       v
Layer 3. Code — "어떻게 작성하는가?"
```

### Layer 1. Judgment — 무엇을 할 것인가

기능 추가·설계 변경의 게이트. 모든 작업에 적용.

```
[] spec/버그/보안/운영상 필수인가?              → Yes: YAGNI 체크만 생략. 나머지 체크는 적용
--- 위에 해당하지 않는 새 기능/설계 변경 ---
[] 이것 없이도 시스템이 동작하는가?             → 만들지 않는다 (YAGNI)
[] 더 단순한 대안이 있는가?                     → 단순한 쪽을 선택 (KISS)
[] 같은 의미, 같은 소유자, 같은 변경 축인가?    → 셋 다 true일 때만 합친다 (DRY)
[] 기존 메커니즘과 상호작용하는가?              → 통합 우선 (엣지 케이스 감소)
[] 클라이언트에서만 보장되는가?                 → 서버로 이동 (서버 권위)
    예외: 인터랙션 상태(드래그/선택/프리뷰/하이라이트 선택 중)는 FE 소유
```

### Layer 2. Structure — 어디에 어떻게 배치하는가

Layer 1을 통과한 기능의 코드 구조·상태 설계.

1. **상태 경계**: persisted(DB 필드) / interaction(UI 상태) / derived(계산값: 진도율, 오답률, 연속 학습 일수)를 혼합하지 않는다. derived는 projection 또는 materialized view
2. **소유자 우선**: 구현 전에 소유자 결정 (서버 action / 클라이언트 상태 / Supabase RLS / Drizzle 스키마)
3. **작은 코어**: 거대한 컴포넌트/훅 대신 core + feature 분리
4. **의미적 일관성**: 같은 필드는 서버/클라이언트/DB 어디서든 같은 의미. 특히 조문 식별자(`law_code + article_number + clause_number + item_number + sub_item_number`) 표기 통일
5. **단일 진입점**: 폼 검증·데이터 정규화는 한 곳(action)에서 한 번만 수행
6. **반쪽 열림 금지**: 의미가 불일치하는 상태로 사용자에게 노출하지 않는다
7. **금지 패턴**: 거대 switch 분기, raw payload 직접 주입, 서버 권위를 FE가 대체, 역할 체크를 FE에서만 수행
8. **뮤테이션 경로 동결**: 같은 관심사에 대해 임시 뮤테이션 경로를 추가하지 않는다. 새 경로가 필요하면 별도 리팩토링 태스크로 먼저 설계
9. **연관관계는 대칭 저장 지양, 쿼리에서 대칭 조회**: `article_article_links`는 한 방향만 저장하고 조회 시 양방향 union 처리 (중복 저장 시 정합성 지옥)

### Layer 3. Code — 어떻게 작성하는가

Layer 2에서 배치가 결정된 코드의 작성 규칙.

#### 파일 구조
- Feature 모듈: `app/features/{feature}/` 아래 schema, screens, api, components, lib
- 공통: `app/core/` — components, db, hooks, layouts, lib, screens
- `.server.ts`는 서버 전용, `.client.ts`는 브라우저 전용

#### 타입 안전성
- `any` 타입 금지 (`unknown` 또는 구체적 타입 사용)
- `@ts-ignore` / `@ts-expect-error` 금지
- `Route.LoaderArgs`, `Route.ActionArgs` 사용. strict 모드
- 폼은 Zod 스키마 → `zodResolver` 또는 action 내부 `schema.parse()`

#### 코드 품질
- 파일당 300줄 목표 (초과 시 분할 검토). 테스트/생성 파일 제외
- `console.log` 잔류 금지
- 상수는 한 곳에서 정의 — 과목 코드, 문제 유형, 역할, 조문 레벨은 `app/core/lib/constants.ts`
- 컴포넌트는 표시 + 이벤트 연결만. 비즈니스/계산 로직은 lib/에 분리

#### React 규칙
- useEffect 의존성 배열 누락 금지
- useMemo/useCallback 남용 금지 (실제 성능 이슈가 있을 때만)
- 역방향 import 금지: lib/utils/constants → components/screens OK, 반대 금지

#### React 상태별 렌더링 순서 (필수)
```tsx
if (error) return <ErrorState error={error} onRetry={refetch} />;
if (loading && !data) return <LoadingSkeleton />;
if (!data?.items.length) return <EmptyState />;
return <ItemList items={data.items} />;
```

#### 피드백 심각도
- **Critical** (반드시 수정): 보안 취약점, RLS 누락, 브레이킹 체인지, 로직 오류, 역방향 import
- **Warning** (수정 권장): 컨벤션 위반, 불필요한 리렌더링, 3곳 이상 코드 중복, useEffect 의존성 누락
- **Suggestion** (고려): 네이밍 개선, 최적화 기회, 테스트 커버리지 확장

---

## 핵심 규칙

### 역할 & 권한
- 역할: `student` / `instructor` / `admin`
- 역할 체크는 **서버 loader/action에서 반드시** (`requireRole(client, ['instructor','admin'])`)
- `instructor`는 콘텐츠(조문 개정 반영, 판례 등록, 문제 출제, 연관관계 지정) CRUD + 자기 반 학생 진도 열람
- `admin`은 전부 + 사용자/결제/강사 관리

### DB 접근
- Drizzle ORM 우선. RLS가 필요 없는 관리 작업만 `supa-admin-client` 사용
- 폼 처리: Zod 검증 → action 함수 → `data()` 응답 → 토스트/인라인 피드백
- 인증 가드: `requireAuthentication(client)` — private 라우트의 loader에서 호출

### 조문 트리 (중요)
- 4단계 계층: 조 → 항 → 호 → 목 (`level` enum)
- `parent_id` + `path` (ltree 또는 문자열 materialized path) 병용. 단일 조문 조회는 path로, 트리 렌더는 parent_id 재귀 쿼리로
- 식별자 규칙: `특허법 제29조 제1항 제2호 가목` ↔ `{law_code:"patent", article:29, clause:1, item:2, sub_item:"가"}` — 양방향 변환 헬퍼는 `app/features/laws/lib/identifier.ts`에 단일 소유

### 개정 추적
- `law_revision`(법 단위) + `article_revision`(조문 단위) 이벤트 소싱에 가까운 스냅샷
- 현재 시행 중 조문: `articles.current_revision_id`가 가리키는 스냅샷
- 시점 조회: `WHERE effective_date <= @at AND (expired_date IS NULL OR expired_date > @at)`

### 연관관계 (relations)
- 5종 테이블: `article_article_links`, `article_case_links`, `case_case_links`, `problem_article_links`, `problem_case_links`
- 모두 `relation_type` enum + `note` + `created_by` + `created_at`
- 방향성이 없는 관계는 `(smaller_id, larger_id)` 정규화 저장

### 사용자 학습 데이터 (annotations)
- Polymorphic: `target_type` ('article' | 'case' | 'problem') + `target_id`
- RLS: 본인만 R/W. 강사는 자기 반 학생 메모 열람 옵션 (기본 off, 학생이 공유 허용 시만)
- 하이라이트는 `start_offset` / `end_offset` + 콘텐츠 스냅샷 해시 저장 (조문 개정 시 range 유실 감지용)

### 스타일 규칙
- shadcn/ui 컴포넌트 우선. 새 UI는 기존 디자인과 통일성 유지
- Tailwind CSS 유틸리티. CSS 변수 기반 테마 (light/dark)
- 아이콘: Lucide React
- 반응형 필수. 조문 뷰어는 모바일에서 사이드바가 시트(Sheet)로 변환

### 데이터베이스
- 스키마 변경 시: `schema.ts` 수정 → `npm run db:generate` → `npm run db:migrate`
- RLS 정책: 사용자는 자기 데이터만. 콘텐츠(조문/판례/문제)는 전체 공개 읽기 + 역할 기반 쓰기
- JSONB 필드로 유연한 확장 (metadata, tags, legacy_fields 등)

## 표준 워크플로우

### 새 기능 추가 시
1. `SPEC.md`에서 기능 ID(`feat-XXX`) 확인 (없으면 부여하고 SPEC.md에 등록)
2. `docs/features/feat-XXX-*.md` 읽기 (없으면 계획 문서부터 작성 → 사용자 검토 → 코드 착수)
3. DB 변경 필요하면 `docs/db-schema.md` 먼저 확인
4. 3계층 게이트(Judgment → Structure → Code) 통과 확인 후 구현
5. 구현 후 `SPEC.md` 상태 업데이트 (🔲 → 🟡 → ✅) 및 `docs/features/feat-XXX-*.md` 갱신

### DB 스키마 변경 시
> **IMPORTANT**: 이 개발 환경은 Supabase 로그인이 완료된 상태이므로, Claude 가 `npm run db:migrate` 와 `npm run db:typegen` 을 **직접 실행**한다. 사용자에게 실행을 요청하지 말 것.

1. 해당 feature의 `app/features/{feature}/schema.ts` 수정
2. `npm run db:generate` → 생성된 마이그레이션(`sql/migrations/`) 검토 (필요 시 수동 편집, 특히 ltree/트리거)
3. **Claude 가 실행**: `npm run db:migrate` — 실패 시 출력 분석 후 수정·재시도
4. **Claude 가 실행**: `npm run db:typegen`
5. `docs/db-schema.md` 업데이트

### 콘텐츠 개정(법 개정) 반영 시
1. `/staff/laws/{law}/revisions` 에서 개정안 초안 작성
2. 변경된 조문들을 diff UI에서 검토 (원본 vs 신규)
3. `effective_date` 지정 후 발행(publish) — 트랜잭션으로 `article_revisions` 일괄 insert + `articles.current_revision_id` 업데이트
4. 알림 큐: 해당 조문을 즐겨찾기/메모한 사용자에게 Resend 이메일 + 대시보드 알림
5. 절대 기존 `article_revision` row를 수정하지 않는다 (불변)

### 버그 수정 시
1. 재현 경로 확인
2. 관련 feature의 `docs/features/feat-XXX-*.md` 읽어 맥락 파악
3. 최소 수정 원칙 — 리팩토링과 버그 수정을 섞지 않는다
4. `npm run typecheck` 및 관련 `npm run test:e2e` 실행

### 커밋 & 푸시 시 (필수 절차)
> **IMPORTANT**: 파일을 개별 지정(`git add file1 file2`)하면 신규(untracked) 파일이 누락된다. 반드시 아래 절차를 따를 것.

1. `git add -A`
2. `git status` — untracked 남아있지 않은지 확인
3. `git commit -m "메시지"`
4. `git push`
5. 푸시 후 `git status`로 `working tree clean` 확인

## 상세 참고 문서 (필요 시 열람)
- `SPEC.md` — 기능 로드맵, 상태, 우선순위
- `docs/screens.md` — 전체 화면 구성, 네비게이션, 대시보드 레이아웃
- `docs/architecture.md` — 아키텍처, 데이터 흐름
- `docs/db-schema.md` — 테이블 상세, RLS, 관계도
- `docs/article-tree.md` — 조문 트리 저장/조회 전략
- `docs/relations.md` — 연관관계 그래프 모델
- `docs/features/` — 기능별 상세 명세

## 자주 쓰는 명령어
```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm run typecheck    # 타입 체크
npm run db:generate  # 마이그레이션 생성
npm run db:migrate   # 마이그레이션 적용
npm run db:typegen   # Supabase 타입 재생성
npm run test:e2e     # Playwright E2E
npm run format       # Prettier
npm run deploy       # Cloudflare 배포 (wrangler deploy)
```

## 컨텍스트 압축 시 보존 규칙

대화 압축(`/compact`) 시 다음 항목은 **반드시 요약에 보존**:

1. 현재 작업 중인 **feature ID** 및 진행 단계
2. **수정된 파일 전체 목록** (경로 포함)
3. 통과하지 못한 **typecheck / test 결과**
4. 사용자에게 던진 질문 중 **답을 아직 못 받은 것**
5. 3계층 게이트에서 사용자가 내린 판단 (YAGNI로 제외한 기능, 선택한 설계 대안 등)
6. **도메인 결정 사항**: 조문 식별자 표기 규칙, 연관관계 방향성 규칙, 개정 반영 정책 등 한 번 정한 규칙
