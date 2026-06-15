# feat-6-010 — 반별 게시판 (cohort 스코프 커뮤니티)

> SPEC.md 매핑: SPEC 5.6 커뮤니티. 기존 전체공개 게시판(feat-6-002)과 달리 **반(cohort) 단위로 접근이 제한되는** 게시판. 접근 통제는 **RLS 가 DB 에서 강제**(화면 가드 비의존)가 핵심 요구.
> 상태: ✅ 구현·배포·RLS 합성 검증·라이브 통합검증 완료(2026-06-15). 커밋 `a412429`(①②)·`5275bfe`(③)·`b198efd`(③b).

## 1. 목표

특정 반(기수)에만 열리는 게시판. 강사가 자기 반에 **공지형**(강사만 글) 또는 **소통형**(학생도 글) 게시판을 만들고, 그 반 학생·담당 강사만 읽고 쓴다. 비소속 학생·다른 반·다른 강사에게는 **목록에도 안 보이고 URL 직접 접근도 RLS 가 차단**한다.

기존 `community`(전체 공개) 의 글/댓글/첨부 UI·패턴을 재사용하되, 접근 단위가 cohort 라는 점이 다르다.

## 2. 게시판 모델

- 게시판은 동적 row(`cohort_boards`) — community 처럼 enum slug 가 아니라 UUID.
- 게시판 ↔ 반: **M:N** (`cohort_board_cohorts`). 한 게시판을 여러 반에 동시에 열 수 있다.
- `write_scope` (enum `cohort_board_write_scope`):

| write_scope | 라벨 | 읽기 | 글·댓글 작성 |
|-------------|------|------|------|
| `staff` | 공지형 | 소속 학생 + 담당 강사 | **강사(담당)·manager 만** |
| `members` | 소통형 | 소속 학생 + 담당 강사 | 소속 학생 + 담당 강사 + manager |

## 3. 사용자 흐름

### 3.1 운영자 (instructor / manager) — `/admin/cohort-boards`
1. "새 게시판" → 제목·설명·**공지형/소통형**·**접근 반 다중선택** → 생성
2. 목록에서 수정·삭제(soft). instructor 는 **본인 담당 반만** 선택지에 노출 / manager 는 전체
3. 표시(반 이름·글 수)는 cross-RLS 라 adminClient(loader 가 staff 가드 선행), **변이는 RLS client**

### 3.2 학생·강사 — `/cohort-boards`
1. `/cohort-boards` — **소속/담당 반에 연결된 게시판 합집합** (RLS 가 자동 필터)
2. `/cohort-boards/:boardId` — 글 목록(고정 우선·페이지네이션). 작성 권한 있으면 "글쓰기", 없으면 "강사만 작성" 칩
3. `/cohort-boards/:boardId/:postId` — 본문 + 첨부 + 댓글. 수정=작성자, 삭제=작성자·관리자, 고정=관리자
4. `/cohort-boards/:boardId/new`·`/:postId/edit` — 작성/수정 폼

## 4. 데이터 모델

마이그레이션: `scripts/sql/20260615_cohort_boards.sql`(①), `scripts/sql/20260615_cohort_board_attachments_pin.sql`(③b). 롤백 파일 동반.

### 4.1 테이블
```
cohort_boards            (board_id PK, title, description, write_scope, created_by, created_at, updated_at, deleted_at)
cohort_board_cohorts     (board_id, cohort_id, added_by, added_at) PK(board_id, cohort_id)   -- 게시판↔반 M:N
cohort_board_posts       (post_id PK, board_id, author_id, title, body_md, is_pinned, created_at, updated_at, deleted_at)
cohort_board_comments    (comment_id PK, post_id, author_id, body_md, created_at, updated_at, deleted_at)
cohort_board_post_attachments (attachment_id PK, post_id, kind, path, original_filename, size_bytes, mime, sort_order, uploaded_by, created_at)
```
- enum `cohort_board_write_scope` = `staff`|`members`, `cohort_board_attachment_kind` = `image`|`pdf`|`file`
- 글·댓글·게시판: **soft delete**(`deleted_at`, CLAUDE.md #9). 첨부: hard delete + 블롭 제거(community 패턴)
- 스토리지 버킷 `cohort-board-attachments` (private, 10MB). 모든 storage 접근은 adminClient(service_role)

### 4.2 작성자 표시 — `public_profiles` 뷰
`profiles` RLS 는 본인 행만 → 글/댓글 작성자명은 `public_profiles` 뷰로 batch 조회(feat-6-002 와 동일 패턴). storage path 는 클라이언트에 노출하지 않음(첨부는 attachmentId 로만 signed-url 발급).

## 5. 접근 통제 (RLS) — 이 기능의 핵심

> **원칙: 화면 가드를 믿지 않는다. 조회·쓰기 모두 DB(RLS)가 막는다.** 학생·강사 화면/액션은 전부 **RLS client**(`makeServerClient`)로 동작. `adminClient` 는 ⑴ 운영자 관리 목록의 반 이름·글 수 cross-RLS 표시, ⑵ storage 블롭 업/다운로드 에만.

### 5.1 SECURITY DEFINER 헬퍼 (assignments 정책 복제)
| 함수 | 의미 |
|------|------|
| `user_can_read_cohort_board(board, uid)` | manager OR 연결 cohort 의 소속 학생/담당 강사 |
| `user_manages_cohort_board(board, uid)` | manager OR 연결 cohort 의 owner(담당 강사) |
| `user_can_write_cohort_board(board, uid)` | 관리권 OR (members 형 + 소속 학생) |
| `user_can_read/write/manages_cohort_post(post, uid)` | post→board 위임 |
| `user_can_attach_cohort_post(post, uid)` | 글 작성자(쓰기권) OR 게시판 관리자 |

### 5.2 RLS 정책 (per-command)
- `cohort_boards`: read=`can_read OR created_by` / insert=`is_staff AND created_by=uid` / update=`manager OR created_by OR manages` (hard delete 없음 — soft RPC)
- `cohort_board_cohorts`: read=`can_read` / write(all)=`manager OR (owns_cohort AND (manages OR created_by))` — 비담당 강사의 반 연결 탈취 차단
- `cohort_board_posts`: read=`can_read` / insert=`author_id=uid AND can_write` / update=`(author_id=uid AND can_write) OR manages`
- `cohort_board_comments`: post 헬퍼로 위임 (read/insert/update)
- `cohort_board_post_attachments`: read=`can_read_cohort_post` / insert=`uploaded_by=uid AND can_attach` / delete=`can_attach`

### 5.3 soft delete / pin
- soft delete RPC (SECURITY DEFINER, SELECT 정책 `deleted_at IS NULL` 우회): `soft_delete_cohort_board_post`(`p_post_id`)·`_comment`(`p_comment_id`)·`soft_delete_cohort_board`(`p_board_id`)
- **pin**: `set_cohort_board_post_pinned(p_post_id, p_pinned)` manager 전용 RPC + **가드 트리거** `guard_cohort_board_post_pin` — RPC 경유든 직접 UPDATE 든 `is_pinned` 변경 시 `user_manages_cohort_board` 확인(비관리자 자기글 self-pin 까지 차단). 일반 글 수정(제목/본문)은 `is_pinned` 불변 → 트리거 no-op
- 버튼 노출은 `user_can_write_*`/`user_manages_*`/`user_can_attach_*` 를 **RPC 로 호출(= RLS 와 동일 함수, 단일 진실원)**. 실제 차단은 RLS/RPC

### 5.4 signed-url 게이트
첨부 signed-url 라우트는 **RLS client 로 첨부 row 를 읽어**(cbpa_read = 글 읽기권) 접근권을 DB 에서 확인한 뒤 adminClient 로 서명 — community 의 "인증되면 누구나"보다 강화. 비소속이 attachmentId 를 알아도 404.

## 6. 라우트·화면

| 경로 | 파일 | 비고 |
|------|------|------|
| `/admin/cohort-boards` | `features/admin/screens/admin-cohort-boards.tsx` | 운영자 게시판 생성/수정/삭제 + 접근 반 지정 |
| `/api/admin/cohort-board` | `features/admin/api/cohort-board.tsx` | create/update/delete (staff) |
| `/cohort-boards` | `features/cohort-boards/screens/cohort-board-list.tsx` | 소속 반 게시판 합집합 |
| `/cohort-boards/:boardId` | `cohort-board-detail.tsx` | 글 목록 |
| `/cohort-boards/:boardId/new`·`/:postId/edit` | `cohort-board-post-new.tsx` (route id 재사용) | 작성/수정 |
| `/cohort-boards/:boardId/:postId` | `cohort-board-post-detail.tsx` | 상세 + 댓글 + 첨부 |
| `/api/cohort-board/post`·`/comment` | `features/cohort-boards/api/{post,comment}.tsx` | 글(create/update/delete/pin)·댓글(create/delete) |
| `/api/cohort-board/attachment`·`/attachment/signed-url` | `features/cohort-boards/api/{attachment,attachment-signed-url}.tsx` | 첨부 업로드/삭제·서명 URL |

- 쿼리: `features/cohort-boards/queries.server.ts`, 타입/라벨/zod: `labels.ts`, 셸: `components/cohort-board-shell.tsx`
- UI 프리미티브는 community 의 `Chip`·`EmptyState`·`relativeKo` 재사용. 본문은 `whitespace-pre-line` 평문(콘텐츠 인용 marker 는 범위 밖)
- 네비 "반별 게시판" → 커뮤니티 그룹 (`navigation-bar.tsx` communityItems · `nav-groups.ts` community)

## 7. 권한 요약

| 동작 | 비소속 | 소속 학생 (소통형) | 소속 학생 (공지형) | 담당 강사 | manager |
|------|:---:|:---:|:---:|:---:|:---:|
| 게시판/글 읽기 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 글·댓글 작성 | ❌ | ✅ | ❌ | ✅ | ✅ |
| 본인 글 수정 | ❌ | ✅ | — | ✅ | ✅ |
| 타인 글 삭제 | ❌ | ❌ | ❌ | ✅(담당) | ✅ |
| 첨부 업로드/삭제 | ❌ | 본인 글 | ❌ | ✅(담당) | ✅ |
| 글 고정(pin) | ❌ | ❌ | ❌ | ✅(담당) | ✅ |
| 게시판 생성·접근반 지정 | ❌ | ❌ | ❌ | ✅(본인 반) | ✅(전체) |

## 8. 구현 단계 / 검증

1. **① 마이그+RLS** — 4 테이블·헬퍼·soft RPC·RLS. 합성 RLS 검증 **13/13 PASS**(비소속 조회·권한 없는 쓰기·남의 글 수정·비담당 강사 반 연결 탈취 차단, manager 전체, net-zero 정리)
2. **② 운영자 관리 화면** — `/admin/cohort-boards`
3. **③ 학생·강사 화면** — 목록→글→상세+댓글, 전부 RLS client
4. **③b 첨부 + pin** — `cohort_board_post_attachments`+버킷+RLS, pin RPC+가드 트리거. 합성 RLS 검증 **14/14 PASS**(첨부 작성자/관리자만, 비작성자·비소속·공지형 학생 차단, 조회 소속만, 비관리자 pin 직접·RPC 차단, 정상 글수정 통과)
5. **④ 통합 검증(라이브)** — 게시판 생성·격리·작성권한·첨부·pin ✅ (라이브 확인 2026-06-15)

검증 SQL: `tmp/cohort-board/rls-verify.sql`(①), `tmp/cohort-board/attach-pin-verify.sql`(③b) — 합성 데이터 생성 → 역할별 `auth.uid()` 시뮬(`set local role authenticated` + jwt claims) → net-zero 정리.

## 9. 위반 가드 / 결정 사항
- `service_role` 미사용(학생 경로) — 조회·쓰기 모두 RLS client. adminClient 는 운영 목록 표시·storage 블롭만
- 접근 통제는 RLS 가 DB 에서 강제 — 화면 가드는 UX 보조일 뿐
- 글·댓글·게시판 삭제는 soft(`deleted_at`) — RLS `deleted_at IS NULL` 우회 위해 SECURITY DEFINER RPC
- `is_pinned` 은 RLS(컬럼 단위 불가)가 아니라 manager 전용 RPC + 가드 트리거로 강제
- storage path 클라이언트 비노출, signed-url 은 RLS read 게이트 후 발급
- 연관관계(게시판↔반)는 M:N, 비담당 강사의 반 연결 탈취 RLS 차단

## 10. 범위 밖 / 후속
- 댓글 첨부(현재 글 첨부만), 대댓글, 멘션·알림(community feat-6-004 류 연동 시 별도)
- 콘텐츠 인용 marker(`[law:...]`)·tsvector 검색
- 게시판별 읽음 표시·새 글 배지
