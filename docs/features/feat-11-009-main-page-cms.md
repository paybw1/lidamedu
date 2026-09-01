# feat-11-009 — 메인화면 모듈형 CMS (`/lecture/home`)

> 근거: `source/학습플랫폼/강의개발추가요청서_0901.html` §2 (★★★ 미반영 재요청)
> 상태: 설계 확정 (2026-09-01, 원장 "2→3으로 가자")

## 1. 무엇을 만드는가

강의 플랫폼 메인화면(`/lecture/home`)을 **고정 JSX 가 아니라 블록 목록**으로 만든다.
운영자가 모듈을 추가·수정·삭제·복사하고 순서를 바꾸면 개발 요청 없이 메인화면이 바뀐다.

요청서가 명시한 모듈 7종:

| kind | 이름 | 설정 |
|---|---|---|
| `hero_banner` | 메인배너 | 배너 단(tier) 선택 — 이미지·링크·노출기간은 기존 `/admin/banners` 가 소유 |
| `lecture_list` | 강의진열 | 상품 검색·선택 + 순서 |
| `board_recent` | 공지사항 / 게시판 | 소스(리담소식·공지) · 노출 건수 |
| `youtube` | 유튜브 영상 | URL 목록 |
| `book_list` | 도서상품 진열 | 도서 선택(비우면 최신순) |
| `bar_banner` | 바배너 | PC·모바일 이미지 · 링크 |
| `free_html` | 일반페이지 영역 | HtmlEditor(HTML·CSS·JS) |

공통 설정: 노출/숨김 · 시작일/종료일 · PC만/모바일만/전체 · Drag&Drop 순서 · PC·모바일 미리보기.

## 2. ★기존 메인화면을 잃지 않는다 (핵심 결정)

현재 `/lecture/home` 은 손으로 디자인한 페이지다(feat-12, 리담소식·현장강의 일정·수강신청
3단·교재·강사진·후기·합격수기·FAQ·최종 CTA). **"모듈이 있으면 모듈, 없으면 기존 화면"
식의 전환은 쓰지 않는다** — 운영자가 배너 모듈 하나만 추가한 순간 나머지 화면이 통째로
사라지기 때문이다.

대신 **기존 섹션 하나하나를 설정 없는 붙박이 모듈(`builtin_*`)로 만들고, 지금 순서 그대로
시드**한다. 첫날 화면은 픽셀 단위로 동일하고, 그 다음부터 운영자가 순서를 바꾸거나 숨기거나
사이에 새 모듈을 끼울 수 있다.

| kind | 대응 섹션 |
|---|---|
| `builtin_video` | 공부방법 & 맛보기 영상 |
| `builtin_news` | 리담소식 |
| `builtin_schedule` | 현장강의 일정 |
| `builtin_curriculum` | 수강신청 3단 |
| `builtin_books` | 리담 교재 |
| `builtin_instructors` | 전임 강사진 |
| `builtin_reviews` | 수강생 후기 |
| `builtin_passers` | 합격 수기 |
| `builtin_faq` | 자주 묻는 질문 |
| `builtin_final` | 최종 CTA · 오시는 길 |

붙박이 모듈은 **설정이 없다**(순서·노출·기간·기기만 조절). 내용은 각 소유 화면에서
관리한다(소식=`/admin/lecture-news`, 일정=`/admin/lecture-schedules`, …).

시드는 `hero_banner(tier1) → hero_banner(tier2) → hero_banner(tier3) → builtin_video → …`
순으로 현행과 동일하게 넣는다.

## 3. 스키마

```sql
create table main_page_modules (
  module_id   uuid primary key default gen_random_uuid(),
  kind        text not null,           -- 위 표의 kind
  label       text,                    -- 관리 목록에서 구분하는 이름(운영자 메모)
  config      jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  is_visible  boolean not null default true,
  starts_at   timestamptz,             -- null = 제한 없음
  ends_at     timestamptz,             -- null = 제한 없음
  device      text not null default 'all',  -- all | pc | mobile
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz              -- 소프트 삭제(되살릴 수 있게)
);
```

- **기간 종료 자동 비노출은 쿼리 필터**로 한다. 크론 없음 — 상태 컬럼을 두면 크론이
  안 돌 때 노출이 어긋난다.
- **PC/모바일 분기는 CSS** 로 한다(`device` → 래퍼에 `mpm-pc` / `mpm-mobile` 클래스).
  서버에서 User-Agent 로 나누면 CDN 캐시가 두 벌 필요해지고 오판이 생긴다.
- RLS: 공개 읽기는 `is_visible AND 기간 안 AND deleted_at is null`, 쓰기는 staff.
- `sort_order` 인덱스 + 부분 인덱스(살아 있는 행).

## 4. 코드 배치

```
app/features/landing/
├─ lib/main-modules.ts            # ★client-safe SSOT — kind·라벨·config zod·기본값
├─ queries.server.ts              # listMainPageModules(공개) / listAllModules(admin) / CRUD
├─ components/sections/*.tsx      # 기존 landing.tsx 섹션을 컴포넌트로 분리
├─ components/modules/*.tsx       # 신규 7종 렌더러
├─ screens/landing.tsx            # 모듈 목록을 순서대로 렌더(데이터는 기존대로 loader 일괄 조회)
└─ screens/admin-main-page.tsx    # /admin/main-page — 목록·순서·복사·삭제
   screens/admin-main-page-edit.tsx
```

- **`main-modules.ts` 는 `.server` 를 import 하지 않는다** — 화면이 쓰는 SSOT 이고,
  값을 `.server` 에서 가져오면 typecheck 는 통과해도 `npm run build` 가 깨진다
  (메모: build-server-in-client, 이번 세션에서 두 번 겪은 함정).
- 데이터 조회는 **모듈별 지연 조회를 하지 않는다**. 지금처럼 loader 에서 한 번에
  모아 오고 모듈은 그 중 필요한 것만 골라 쓴다(요청 수·워터폴 방지).

## 5. 단계

- **A** 설계 문서 + DDL(운영 SQL 경로) + `db:typegen` + SSOT/쿼리
- **B** landing.tsx 섹션 분리 + 모듈 렌더러 + 시드(화면 동일 확인)
- **C** `/admin/main-page` 관리 화면(순서·복사·기간·기기·미리보기)

## 6. 하지 않는 것

- 배너 이미지·링크·노출기간 CRUD 재구현 — 이미 `/admin/banners` 가 소유한다.
  모듈은 "어느 단을 여기에 놓을지" 만 정한다(단일 소유자 원칙).
- 학습 플랫폼 랜딩(`/`)은 대상이 아니다. 이 요청서는 강의 플랫폼 메인화면이다.
