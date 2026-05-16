# feat-8-022 — 하이라이트형 코멘트 (조문·판례·문제)

## 배경

조문·판례·문제에는 두 종류의 주석이 있다.

- **수험생 주석** — `user_highlights` / `user_memos`. 사용자별 RLS 비공개. 본인에게만 보임.
- **강사 코멘트** — `content_comments` (feat-8-021). staff 작성, 전체 학생 read.

기존 코멘트(feat-8-021)는 **자유 텍스트 평석**만 가능했다. 본문 특정 구간에
앵커되지 않는다. 강사가 본문을 하이라이트해도 그 하이라이트는 `user_highlights`
(강사 본인 전용)에 저장돼 학생에게 보이지 않았다.

## 목표

강사가 조문·판례·문제 본문의 **특정 구간을 하이라이트**하면, 그 하이라이트가
**전체 학생에게 코멘트로 노출**된다. 하이라이트에 메모(설명 문장)를 덧붙일 수
있다. 즉 코멘트는 두 형태를 가진다.

1. **텍스트형 코멘트** — 본문 어디에도 앵커되지 않는 자유 평석 (기존 그대로).
2. **하이라이트형 코멘트** — 본문 구간에 앵커된 강사 하이라이트 + (선택) 메모.

## 데이터 모델

`content_comments` 테이블을 확장 (마이그레이션 `comment_highlight_anchor`).

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `field_path` | text NULL | 앵커 본문 필드. NULL = 텍스트형 코멘트 |
| `start_offset` / `end_offset` | int NULL | 하이라이트 구간 |
| `content_hash` | text NULL | 스냅샷 해시 — 본문 개정 시 range 유실 감지 |
| `color` | text NULL | `green` / `yellow` / `red` / `blue` |
| `label` | text NULL | 하이라이트된 발췌 텍스트 캐시 |
| `body_md` | text **NULL 허용** | 메모 본문. 하이라이트형은 없을 수 있음 |

- 앵커 구조는 `user_highlights` 와 동일 — 표시 오버레이·offset 계산 로직 재사용.
- CHECK `content_comments_nonempty`: `body_md` 또는 `field_path` 중 하나는 필수.
- **RLS 불변** — 기존 정책 그대로(public read / staff insert / author·admin update·delete). 추가 컬럼은 같은 정책이 적용된다.
- `content_comments` 는 staff 콘텐츠이므로 hard delete 유지 (사용자 학습
  데이터가 아님 — CLAUDE.md #9 의 soft-delete 대상 아님).

## 동작

- **작성** — 강사·원장이 뷰어에서 본문 텍스트를 선택 → 하이라이트 툴바의
  "코멘트로 게시" → 색 선택 + (선택) 메모 → `/api/comments/comment` `intent=create`
  에 앵커 필드와 함께 POST. 학생은 작성 불가(역할 게이트 + RLS).
- **표시** — 하이라이트형 코멘트는 **모든 독자**에게 본문 위 오버레이로 렌더.
  학생 개인 하이라이트와 시각적으로 구분(강사 코멘트임을 표시). 클릭 시 메모를
  코멘트 패널/팝오버로 노출. `CommentsPanel` 은 텍스트형·하이라이트형 코멘트를
  함께 목록화 — 하이라이트형은 발췌 + 메모를 보여준다.
- 강사 본인의 **개인** 하이라이트·메모(`user_highlights`/`user_memos`)는 그대로
  유지된다 — 코멘트와 별개.

## 범위 밖

- 강사 개인 메모를 코멘트로 "승격"하는 별도 흐름은 만들지 않는다 — 강사가
  학생에게 보일 주석은 코멘트 시스템으로 직접 작성한다.
- 하이라이트형 코멘트의 색 외 스타일 편집은 후속 과제.

## 관련 파일

- DB: `content_comments` (Supabase, 마이그레이션 `comment_highlight_anchor`)
- `app/features/comments/queries.server.ts` · `api/comment.tsx`
- `app/features/comments/components/comments-panel.tsx`
- `app/features/annotations/components/` (highlight-toolbar·overlay — 재사용 기반)
- `app/features/subjects/screens/{article,case,problem}-viewer.tsx`
- `app/features/laws/components/article-right-panel.tsx`
