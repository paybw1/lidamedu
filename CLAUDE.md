# CLAUDE.md — 리담변리사학원 (변리사 학습 플랫폼, 가칭)

## 프로젝트 한 줄 요약
대한민국 변리사 시험(1차 객관식, 2차 주관식) 수험생을 위한 법령·판례·문제 통합 학습 및 진도 관리 SaaS. 학원 원장(admin) / 강사(instructor) / 수험생(student) 3자 역할 기반, 조문–판례–문제 3자 연관관계 그래프를 핵심 자산으로 한다.

## 기술 스택
- **Framework**: React Router 7 (SSR, file-based routing) + Vite
- **DB/Auth**: Supabase (Auth + PostgreSQL + RLS). ORM 미사용 — 스키마는 Supabase 마이그레이션으로 직접 관리, 타입은 생성물 `database.types.ts` 사용
- **UI**: shadcn/ui (New York style) + Radix UI + Tailwind CSS v4
- **Schema/Validation**: Zod (폼/서버 액션 경계에서 사용)
- **Email**: Resend + React Email
- **Monitoring**: Sentry
- **Deploy**: Vercel (React Router SSR — Node 런타임 서버리스 함수)
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

## Vercel 배포 관련 주의
- React Router 7 SSR은 **Node 런타임**으로 동작하며 Vercel 서버리스 함수로 배포(`@vercel/react-router` preset). 로컬·자체호스팅은 `react-router-serve`(상시 Node 서버). Node API 사용 가능하나 아래 서버리스 제약을 따른다
- **서버리스 제약**: 함수는 응답 반환 후 freeze/종료된다 — 응답 후에도 끝나야 하는 백그라운드 작업(알림·로깅 등)은 `app/core/lib/wait-until.server.ts` 의 `runAfterResponse()` 로 감싼다. 파일시스템은 `/tmp` 외 읽기 전용, 인스턴스는 임시(전역 상태·메모리 캐시에 의존 금지)
- DB 접근은 `@supabase/supabase-js` 클라이언트로 통일 (`app/core/lib/supa-client.server.ts` = 요청 컨텍스트·RLS 적용 / `supa-admin-client.server.ts` = service_role). 별도 ORM·커넥션 풀 없음
- Resend·외부 API 호출은 전부 서버 action/loader에서만. 환경변수는 Vercel 환경변수(대시보드 또는 `vercel env`)로 관리, 로컬 개발은 `.env`

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
│   ├── hooks/               # useHighlight, useStudyTimer, useShortcut 등
│   ├── layouts/             # public.layout, student.layout, staff.layout(강사+원장 공용), admin.layout
│   ├── lib/                 # supa-client / supa-admin-client (Supabase 클라이언트), 날짜·법령번호 포매터, 진도 계산기, 권한 가드
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
transactional-emails/        # Resend 템플릿 (가입/리셋/알림)
```

> 위 맵의 feature 별 `schema.ts` 표기는 **실파일이 아니라** 그 feature 가 소유한 DB 테이블 목록을 뜻한다. 스키마 정의는 Supabase 에 있고, 사람이 읽는 SSOT 는 `docs/db-schema.md` · 생성 타입은 `database.types.ts`.

## Non-negotiable (절대 위반 금지)

> 아래 규칙은 다른 모든 지시보다 우선합니다. **위반 시 작업을 중단하고 사용자에게 먼저 알리세요.**

1. Supabase `service_role` 키는 **클라이언트 번들에 절대 포함 금지**
2. `supa-admin-client` (RLS 우회)는 명시적으로 필요한 관리 작업에만 사용. 불확실하면 질문
3. `any`, `@ts-ignore`, `@ts-expect-error` 금지 (strict 모드 유지)
4. 매직 넘버 금지 (constants SSOT에서만 정의) — 특히 과목 코드, 조문 레벨(조/항/호/목)은 enum
5. `console.log` 잔존 금지 (디버깅 후 제거)
6. 코드 변경 후 `npm run typecheck` 통과 확인 필수
7. `*.server.ts` 파일(Supabase 클라이언트·서버 쿼리 등)을 클라이언트 컴포넌트에서 import 금지
8. **법령 원문(조문)은 읽기 전용 불변** — 조문(`articles`) 수정은 개정 흐름(`law_revision`/`article_revision`)으로만, 기존 `content` 필드 in-place 수정 금지. **판례(`cases`)는 편집 가능 콘텐츠** — 요지·이유·평석은 교재 기반 편집물이고 개정 인프라가 없으므로 staff 전용 `admin-case-edit` 화면에서 in-place 수정한다. 단 식별 필드(`case_number`·`court`·`decided_at`)는 보존하고, 다건 일괄 수정(시드 재import·정정 스크립트)은 dry-run 검증 + 사용자 승인 후 수행
9. **사용자 학습 데이터(메모/하이라이트/진도)는 삭제 시 soft delete** — 실수로 한 학기치 메모가 날아가면 복구 불가. `deleted_at` 컬럼 사용
10. 응답 후에도 완료돼야 하는 백그라운드 작업(알림·로깅 등)은 `runAfterResponse()` (`app/core/lib/wait-until.server.ts`) 로 감쌀 것 — Vercel 서버리스는 응답 반환 후 함수가 종료되어 `await` 없는 fire-and-forget 작업이 잘린다
11. **수험생에게 노출되는 법리 서술은 교재 근거를 확인한 범위에서만 작성** — 모범답안·채점기준·해설의 요건 목록, 학설 대립, 판례의 태도를 쓸 때는 반드시 해당 교재 절을 순서대로 통독하고 그 체계·항목 구분을 따른다. 검색으로 얻은 조각만 보고 나머지를 일반 지식으로 메우지 않는다. 근거를 확인하지 못한 단정형 서술("종전 판례는 ~였다", "통설은 ~이다")과 DB 미수록 판례의 사건번호 인용은 금지. 상세 절차는 [2차 모범답안·채점기준 작성 시](#2차-모범답안채점기준-작성-시-필수) 참조

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
2. **소유자 우선**: 구현 전에 소유자 결정 (서버 action / 클라이언트 상태 / Supabase RLS / DB 스키마)
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
- Feature 모듈: `app/features/{feature}/` 아래 screens, api, components, lib, `queries.server.ts` (스키마 파일 없음 — DB 는 Supabase 관리)
- 공통: `app/core/` — components, hooks, layouts, lib, screens
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
- `supa-client`(요청 컨텍스트, RLS 적용) 우선. RLS 우회가 꼭 필요한 관리 작업만 `supa-admin-client`(service_role) 사용
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
- 스키마 변경: Supabase 마이그레이션으로 직접 적용 (Supabase MCP `apply_migration`, 또는 `supabase` CLI) → `npm run db:typegen` 으로 `database.types.ts` 재생성
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
> **IMPORTANT**: 이 개발 환경은 Supabase 프로젝트에 연결돼 있으므로, Claude 가 마이그레이션 적용과 `npm run db:typegen` 을 **직접 실행**한다. 사용자에게 실행을 요청하지 말 것. 마이그레이션은 연결된 Supabase 프로젝트에 즉시 반영된다(로컬/원격 분리 없음) — 적용 전 현재 스키마를 반드시 확인한다.

1. 적용 전 `list_tables` / `execute_sql`(Supabase MCP)로 현재 테이블·컬럼·제약·RLS 확인
2. DDL 작성 — 컬럼/테이블 + RLS 정책 + 트리거 + 인덱스를 한 마이그레이션에 포함
3. **Claude 가 실행**: Supabase MCP `apply_migration`(snake_case 이름)으로 적용. 실패 시 출력 분석 후 수정·재시도
4. **Claude 가 실행**: `npm run db:typegen` — `database.types.ts` 재생성
5. `docs/db-schema.md` 업데이트 (스키마의 사람이 읽는 SSOT)

### 콘텐츠 개정(법 개정) 반영 시
1. `/staff/laws/{law}/revisions` 에서 개정안 초안 작성
2. 변경된 조문들을 diff UI에서 검토 (원본 vs 신규)
3. `effective_date` 지정 후 발행(publish) — 트랜잭션으로 `article_revisions` 일괄 insert + `articles.current_revision_id` 업데이트
4. 알림 큐: 해당 조문을 즐겨찾기/메모한 사용자에게 Resend 이메일 + 대시보드 알림
5. 절대 기존 `article_revision` row를 수정하지 않는다 (불변)

### 2차 모범답안·채점기준 작성 시 (필수)

> **IMPORTANT**: 수험생이 그대로 학습하는 콘텐츠다. "그럴듯한 서술"이 검증 없이 남으면 잘못된 법리를 가르치게 된다. 아래 절차를 건너뛰지 말 것.

**근거 확보 — 조각이 아니라 절 단위로 읽는다**
1. 답안에 쓸 논점을 정한 뒤, 교재에서 그 논점이 속한 **절 전체를 chunk_index 순서대로 통독**한다. 키워드 검색으로 나온 조각만 보고 목록을 구성하지 않는다. (특허 기본서 통독·검색: `node scripts/jagwa/book-read.mjs <from> <to>` / `--find <키워드>`)
2. **요건·학설·판례의 태도는 교재의 항목 구분과 순서를 그대로 따른다.** 예: 침해의 성립요건은 교재 제2관 Ⅰ~Ⅴ(존속 중 실시 / 정당한 권원 없는 자의 실시 / 업으로서 / 보호범위 / 고의·과실 불요) 체계를 쓴다. 교재가 서로 다른 층위로 나눈 것(정당한 권원 = 실시권·권리소진 등 주관적 사유 vs 법률에 의한 제한 §96 = 보호범위 불속)을 임의로 합치지 않는다.
3. 강의노트에 별도 정리(학설 대비표 등)가 있으면 함께 반영한다. PPTX 는 `scripts/lecture-notes/find-in-pptx.mjs` 로 검색하고, 배포용 PDF 는 이미지라 `scripts/lecture-notes/read-note-page.mjs` 로 렌더해 확인한다(★인쇄 페이지 번호 ≠ PDF 페이지 번호 — 한 장 렌더해 오프셋 보정).

**적용 법령 — 기출문제라도 현행법으로 푼다**
- 기출은 **출제 당시의 법이 아니라 현행법을 적용**해 풀이한다. 수험생이 대비하는 시험은 현행법으로 출제되기 때문이다.
- 따라서 **부칙(시행일·적용례·경과조치)은 답안에서 다루지 않는다.** 개정 전후로 결론이 갈리는 문항도 현행 규정만으로 포섭한다(예: 공지예외적용기간은 개정 경과를 논하지 말고 현행 12개월로 판단).
- 발문이 구법 조문·용어를 인용하는 경우에만 현행 조문과의 대응관계를 밝힌다(아래 금지 항목 참조). 그 밖에 구법을 끌어들이지 않는다.

**금지**
- 근거를 확인하지 못한 단정형 서술 — "종전 판례는 ~였다", "통설은 ~이다", "판례는 ~라고 한다". 교재에서 해당 문장을 찾지 못하면 쓰지 않는다.
- 세 곳(① `cases` DB ② 교재 ③ 국가법령정보센터) 어디에서도 확인되지 않는 사건번호 인용. 하나라도 확인되면 번호를 그대로 살리고, 모두 없으면 동일 취지의 DB 수록 판례로 대체하거나 사건번호 없이 법리만 서술한다.
  - 법령정보센터 확인: `https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=prec&type=JSON&search=1&query=<사건번호>` (★`search=1` 필수. 검색화면 precSc.do 는 JS 렌더라 0건으로 나오니 쓰지 말 것)
- 발문이 구법 조문을 인용하는 문항에서 현행 조문 대응관계를 밝히지 않는 것.
- **강학상 분류용어를 답안 서술에 쓰는 것** — 법령·판례가 쓰지 않는 학설상 명칭(예: 주합발명·조합발명)은 채점자에게 통용되지 않으므로, 그 분류가 의미하는 바를 요건·효과로 풀어 쓴다("단순한 집합인 주합발명으로서 진보성이 부정된다" → "진보성이 부정된다"). 교재가 학설 소개로 그 명칭을 들고 있더라도 답안 본문에는 쓰지 않는다. 검출은 `audit-essay-answers.mjs` 의 `ACADEMIC_TERMS`.

**검증 — 반영 전후로 반드시 실행**
```bash
node scripts/jagwa/audit-essay-answers.mjs <problem_id 접두어…>   # 문항 지정
node scripts/jagwa/audit-essay-answers.mjs --year 2015            # 연도 단위
node scripts/jagwa/audit-essay-answers.mjs --all                  # 전수
```
판례 사건번호 DB 대조, 조문 번호 현행 여부, 표기 규칙, 배점당 자수(200자/점 상한)를 검사한다. `[WARN] 근거 사건번호 없는 판례 서술`은 자동 판정이 불가능한 항목이므로 **사람이 교재와 대조**한다.

**반영 절차**: 앵커 유일성 검증 → 백업 JSON 저장 → dry-run → `--apply`. 답안을 고치면 채점기준(`grading_rubric_md`·`rubric_items`)도 같은 취지로 갱신하고 배점 합계를 확인한다.

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
npm run db:typegen   # Supabase 스키마 → database.types.ts 재생성 (스키마 변경은 Supabase MCP apply_migration 으로)
npm run test:e2e     # Playwright E2E
npm run format       # Prettier
npm run start        # 프로덕션 빌드 로컬 구동 (배포는 Vercel git 연동 자동)
```

## 컨텍스트 압축 시 보존 규칙

대화 압축(`/compact`) 시 다음 항목은 **반드시 요약에 보존**:

1. 현재 작업 중인 **feature ID** 및 진행 단계
2. **수정된 파일 전체 목록** (경로 포함)
3. 통과하지 못한 **typecheck / test 결과**
4. 사용자에게 던진 질문 중 **답을 아직 못 받은 것**
5. 3계층 게이트에서 사용자가 내린 판단 (YAGNI로 제외한 기능, 선택한 설계 대안 등)
6. **도메인 결정 사항**: 조문 식별자 표기 규칙, 연관관계 방향성 규칙, 개정 반영 정책 등 한 번 정한 규칙
