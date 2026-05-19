# feat-6-002 — 커뮤니티 게시판 3종 (자유게시판 · 스터디 모집 · 합격 후기)

> SPEC.md 매핑: feat-6-002 — SPEC 5.6 의 `feat-6-XXX 게시판/Q&A/합격수기` 중 **게시판** 부분을 구체화. Q&A 는 feat-4-A-116 으로 이미 구현됨.

## 1. 목표

수험생(student)이 자유롭게 글을 쓰고 댓글로 상호작용하는 **커뮤니티 게시판**. `/community` 플레이스홀더를 실제 허브로 교체하고, 게시판 3종을 연다. 누구나(인증 회원) 읽고 쓰며, 운영자(manager 이상)가 모더레이션(고정·삭제)한다.

## 2. 게시판 3종

게시판은 성격이 다르지만 필드가 거의 동일 → **단일 테이블 `community_posts` + `board` enum** 으로 통합한다.

| board | slug | 라벨 | 성격 | 아이콘 |
|-------|------|------|------|--------|
| `free` | `/community/free` | 자유게시판 | 수험 정보·일상 공유 | `MessageSquareTextIcon` |
| `study` | `/community/study` | 스터디 모집 | 함께 공부할 스터디원 모집. `closed_at` 으로 "모집 중/마감" | `UsersIcon` |
| `review` | `/community/review` | 합격 후기 | 합격자의 학습 전략·경험담 (자유 작성) | `GraduationCapIcon` |

> **합격 후기 ↔ `/study/passer-summaries`(feat-8-009) 구분**: feat-8-009 는 *분석 동의한 인증 합격자의 익명 학습 후기 모음*(검증·익명·집계용). 이 게시판의 합격 후기는 *인증 회원 누구나 자유롭게 쓰는 후기 게시판* 으로 성격이 다르며 공존한다.

## 3. 사용자 흐름

### 3.1 글 읽기
1. 네비 "커뮤니티" 드롭다운 → 게시판 선택, 또는 `/community` 허브에서 진입
2. `/community/:board` 목록 — 고정글 상단 + 최신순. 검색 가능
3. `/community/:board/:postId` 상세 — 본문 + 댓글 목록

### 3.2 글 쓰기 (인증 회원 누구나)
1. 목록/허브의 "글쓰기" → `/community/:board/new`
2. 제목 + 본문(markdown 평문) 입력 → 등록 → 상세로 이동
3. 본인 글은 상세에서 수정(`/community/:board/:postId/edit`)·삭제(soft)

### 3.3 댓글
- 상세 화면 하단 댓글 폼 — 인증 회원 누구나 작성. 본인 댓글 삭제(soft)

### 3.4 운영자 모더레이션 (manager 이상)
- 글 고정(`is_pinned`) / 임의 글·댓글 삭제(soft)

### 3.5 스터디 모집 마감
- `study` 게시판 글 작성자는 상세에서 "모집 마감/재개" 토글 (`closed_at`)

## 4. 데이터 모델

### 4.1 enum `community_board`
```
'free' | 'study' | 'review'
```

### 4.2 `community_posts`
```
post_id      uuid PK         default gen_random_uuid()
board        community_board NOT NULL
author_id    uuid            FK profiles(profile_id) ON DELETE SET NULL  -- nullable
title        text NOT NULL   CHECK char_length 1..200
body_md      text NOT NULL   CHECK char_length 1..20000
is_pinned    boolean NOT NULL default false   -- 운영자만 변경 (트리거로 강제)
closed_at    timestamptz NULL                 -- study 게시판 모집 마감 시각
created_at   timestamptz NOT NULL default now()
updated_at   timestamptz NOT NULL default now()  -- set_updated_at 트리거
deleted_at   timestamptz NULL                 -- soft delete (CLAUDE.md #9)
```

### 4.3 `community_post_comments`
```
comment_id   uuid PK         default gen_random_uuid()
post_id      uuid NOT NULL   FK community_posts(post_id) ON DELETE CASCADE
author_id    uuid            FK profiles(profile_id) ON DELETE SET NULL  -- nullable
body_md      text NOT NULL   CHECK char_length 1..5000
created_at   timestamptz NOT NULL default now()
updated_at   timestamptz NOT NULL default now()  -- set_updated_at 트리거
deleted_at   timestamptz NULL                 -- soft delete
```

### 4.4 `public_profiles` 뷰 — 작성자 표시

`profiles` RLS 는 "본인 행만 조회" 라 게시판에서 남의 글 작성자 이름이 보이지 않는다. 안전 컬럼만 노출하는 뷰로 해결한다(`profiles` 테이블 보안 모델은 그대로 유지).

```sql
create view public.public_profiles
  with (security_invoker = false) as
  select profile_id, name, avatar_url, role from public.profiles;
revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;
```

- `security_invoker = false` → 뷰 소유자(postgres) 권한으로 실행 = `profiles` RLS 우회. 단 노출 컬럼은 4종뿐(전화·동의·시험계획 등 비공개 컬럼 미노출).
- 게시판 쿼리는 글/댓글을 먼저 fetch → `author_id` 모아 `public_profiles` 2차 조회 → JS 에서 join (PostgREST 임베드 대신 batch 조회).
- 기존 Q&A·content_comments 의 작성자명 표시에도 같은 한계가 있으나 이번 범위 밖(별도 태스크).

### 4.5 RLS — 새 하이브리드 패턴

게시판은 기존 "콘텐츠(전체 읽기)" 도 "사용자 데이터(본인만)" 도 아닌 **인증 사용자 전체 읽기 + 본인 쓰기 + 운영자 모더레이션** 하이브리드다.

`community_posts` (RLS enable):
| 정책 | cmd | 식 |
|------|-----|-----|
| `community_posts_select` | SELECT | `deleted_at IS NULL` (TO authenticated) |
| `community_posts_insert` | INSERT | `with_check`: `author_id = (select auth.uid())` |
| `community_posts_update` | UPDATE | `using`: `deleted_at IS NULL AND (author_id = (select auth.uid()) OR private.is_manager((select auth.uid())))` / `with_check`: 동일(deleted_at 제외) |

`community_post_comments`: 동일 3정책 (`post_id` 기준 아닌 `author_id`/`is_manager`). DELETE 정책 없음 — soft delete 만.

### 4.6 트리거·인덱스
- `set_updated_at` BEFORE UPDATE 트리거 (기존 공용 함수) — 두 테이블
- `community_posts_guard_pin` BEFORE UPDATE — `is_pinned` 변경 시 `private.is_manager` 아니면 예외 (운영자 전용 강제, RLS 로는 컬럼 단위 불가)
- `idx_community_posts_board_feed` ON `(board, is_pinned DESC, created_at DESC) WHERE deleted_at IS NULL`
- `idx_community_posts_author` ON `(author_id) WHERE deleted_at IS NULL`
- `idx_community_post_comments_post` ON `(post_id, created_at) WHERE deleted_at IS NULL`

## 5. 라우트·화면

| 경로 | 화면 | 비고 |
|------|------|------|
| `/community` | `community.tsx` (개편) | 허브 — 게시판 3종 카드 + 각 최신글 |
| `/community/:board` | `community-board.tsx` | 목록 + 검색. `:board` zod 검증, 무효 시 404 |
| `/community/:board/new` | `community-post-new.tsx` | 글 작성 |
| `/community/:board/:postId/edit` | `community-post-new.tsx` (재사용, route id) | 글 수정 (작성자 본인) |
| `/community/:board/:postId` | `community-post-detail.tsx` | 상세 + 댓글 |
| `/api/community/post` | `api/post.tsx` | intent: create/update/delete/pin/close |
| `/api/community/comment` | `api/comment.tsx` | intent: create/delete |

- 기존 `CommunityShell category="community"` 유지. 게시판 3종 전환은 `children` 안의 `BoardTabs`(2차 세그먼트 컨트롤)로 처리 — `CommunityCategory` 4종은 건드리지 않는다.
- 화면은 `community-ui` 프리미티브(Chip·EmptyState·relativeKo 등) 재사용. 게시판은 디자인 키트(community-redesign-brief) 범위 밖이라 기존 톤을 따른다.
- 네비 드롭다운(`navigation-bar.tsx`)의 자유게시판/스터디 모집/합격 후기 → `/community/free|study|review` 로 갱신.

## 6. 권한 요약

| 동작 | student | instructor | manager / admin |
|------|:-------:|:----------:|:---------------:|
| 글·댓글 읽기 | ✅ | ✅ | ✅ |
| 글·댓글 작성 | ✅ | ✅ | ✅ |
| 본인 글·댓글 수정·삭제 | ✅ | ✅ | ✅ |
| 타인 글·댓글 삭제 | ❌ | ❌ | ✅ |
| 글 고정(pin) | ❌ | ❌ | ✅ |

> instructor 는 콘텐츠 담당이며 커뮤니티 모더레이션은 manager 이상 — `content_comments` 와 동일(`private.is_manager`).

## 7. 구현 단계
1. **DB 마이그레이션** — enum + 2 테이블 + `public_profiles` 뷰 + RLS + 트리거 + 인덱스 (1개 마이그레이션) → `npm run db:typegen`
2. **labels.ts / queries.server.ts** — board enum·zod·메타, 글·댓글·작성자 조회·CUD
3. **API** — `api/post.tsx`, `api/comment.tsx` (zod discriminatedUnion)
4. **화면** — 허브 개편, 목록, 작성/수정, 상세+댓글, `BoardTabs`
5. **라우트·네비** — `routes.ts` 5+2, `navigation-bar.tsx` 드롭다운
6. **typecheck + 문서** — `db-schema.md`, SPEC 상태

## 8. 위반 가드 / 결정 사항
- `service_role` 미사용 — 사용자 클라이언트 + RLS 로만 동작
- soft delete (`deleted_at`) — 모든 글·댓글 삭제는 soft (CLAUDE.md #9)
- `is_pinned` 은 RLS(컬럼 단위 불가) 가 아니라 트리거로 운영자 전용 강제 — 서버 권위
- markdown 본문은 v1 `whitespace-pre-line` 평문 표시 (Q&A 와 동일, XSS 회피). 추후 `react-markdown`
- 작성자 표시는 `public_profiles` 뷰 경유 — `profiles` 직접 노출 금지

## 9. 범위 밖 (v2)
- 좋아요/추천, 조회수, 이미지·파일 첨부
- 페이지네이션(현재 limit 고정), tsvector 검색
- 새 글·댓글 알림(이메일/대시보드), 신고 기능
- 댓글 수정, 대댓글(1-depth 만)
- 합격 후기 "인증 합격자만 작성" (exam_results 연동) — 필요 시 별도 feature
