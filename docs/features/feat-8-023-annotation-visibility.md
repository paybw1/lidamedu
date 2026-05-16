# feat-8-023 — 주석 3종 통합 · 작성자 역할 기반 가시성

## 배경

조문·판례·문제에 달리는 주석은 그동안 두 갈래로 나뉘어 있었다.

- **수험생 주석** — `user_highlights`(하이라이트) / `user_memos`(메모). RLS 본인 전용.
- **강사 코멘트** — `content_comments`(feat-8-021). staff 작성, 전체 학생 read.

feat-8-022 는 "강사 하이라이트를 학생에게 보이려면" `content_comments` 에 앵커
컬럼을 붙여 **하이라이트형 코멘트**를 따로 만들었다 — 강사 개인 하이라이트
(`user_highlights`)가 학생에게 보이지 않았기 때문이다.

이 구조는 같은 행위(본문에 하이라이트/메모를 단다)를 작성자가 강사냐 학생이냐에
따라 다른 테이블·다른 UI 로 처리해 중복이 컸다.

## 목표

주석을 **3종으로 정리**하고, 가시성을 **작성자 역할** 하나로 통일한다.

| 표시 이름 | 테이블 | 형태 |
|---|---|---|
| 하이라이트 | `user_highlights` | 본문 구간 색칠 |
| 포스트잇 | `user_memos` | 본문 단어/위치에 붙는 쪽지 |
| 메모 | `content_comments` | 우측 패널 자유 텍스트 |

**가시성 규칙 (3종 공통)**

- 강사·원장(`instructor`/`admin`)이 작성한 주석 → **모든 수험생에게 보인다.**
- 수험생(`student`)이 작성한 주석 → **그 수험생 본인에게만 보인다.**

강사는 학생과 똑같은 도구로 주석을 달고, 가시성은 RLS 가 작성자 역할로 자동
판정한다. 따라서 feat-8-022 의 하이라이트형 코멘트(앵커 코멘트)는 존재 이유가
사라져 **제거한다**.

## 용어 변경

- `user_memos` 기반 "메모" → 화면 표시 **"포스트잇"**.
- `content_comments` 기반 "코멘트" → 화면 표시 **"메모"**.
- 내부 식별자(테이블명·라우트·파일·컴포넌트명)는 바꾸지 않는다. 화면 문자열만.
- 별개 기능인 `student_notes`(강사 1:1 상담 코멘트), GS 주관식 답안 첨삭
  코멘트는 이 변경 대상이 아니다.

## 데이터 모델

### `private.is_staff(uuid) → boolean`

작성자 역할 판정 헬퍼. `SECURITY DEFINER`·`STABLE`. 인자 사용자의 `profiles.role`
이 `instructor`/`admin` 이면 true, NULL 입력 시 false. 기존 `private.get_role()`
(호출자 역할)과 달리 **임의 사용자**의 역할을 본다 — RLS 가 행 작성자를 검사할 때
profiles RLS 우회가 필요하므로 `SECURITY DEFINER`.

### `content_comments` (= 메모)

feat-8-022 앵커 컬럼을 되돌리고 학습 데이터로서의 soft delete 를 추가한다.

| 변경 | 내용 |
|---|---|
| DROP | `field_path`, `start_offset`, `end_offset`, `content_hash`, `color`, `label` |
| ADD | `deleted_at timestamptz NULL` |
| ALTER | `body_md` → `NOT NULL` |

- 앵커형 코멘트 데이터는 0건(확인 완료) — 무손실.
- 학생도 메모를 작성하므로 메모는 사용자 학습 데이터다. 삭제는 soft delete
  (`deleted_at`), CLAUDE.md #9.
- `content_comments.target_type` 은 `article`/`case`/`problem` 3종 (종전 그대로).

### RLS

3종 테이블 모두 SELECT 정책을 "본인 OR 작성자가 staff" 로 통일한다.

**`content_comments`**

- SELECT: `author_id = auth.uid() OR private.is_staff(author_id)`
- INSERT: `author_id = auth.uid()` — 역할 게이트 제거(학생 작성 허용)
- UPDATE/DELETE: `author_id = auth.uid() OR <admin>` (종전 유지)

**`user_highlights` · `user_memos`**

기존 단일 `ALL` 정책을 분리:

- SELECT: `user_id = auth.uid() OR private.is_staff(user_id)`
- INSERT/UPDATE/DELETE: `user_id = auth.uid()` (본인만 — 종전과 동일)

## 동작

### 작성

- **하이라이트/포스트잇** — 본문 텍스트 선택 → 떠오르는 툴바에서 색 선택(하이
  라이트) 또는 포스트잇 버튼. 강사·학생 동일 툴바. (feat-8-022 의 staff 전용
  "코멘트" 버튼은 제거.)
- **메모** — 우측 패널 "메모" 탭의 입력창. 강사·학생 모두 작성 가능. 서식
  버튼(`<mark>` 하이라이트 / `<u>` 밑줄)은 제거 — 메모는 순수 텍스트.

### 표시

- 강사 작성 주석은 모든 수험생에게 보인다. 수험생 본인 작성 주석은 본인만.
- 강사 하이라이트와 학생 하이라이트는 시각적으로 구분한다 — 강사는 배경 틴트
  + 아래 실선 밑줄(`lidam-hl-staff-*`), 학생은 배경 틴트만(`lidam-hl-*`).
- 강사가 작성한 포스트잇·메모는 목록에서 "강사" 배지를 달고 수험생에겐
  read-only. 수험생 본인 작성물엔 "나만 보기" 배지 + 편집/삭제 가능.
- 강사·원장 본인은 자기 작성물을 편집/삭제할 수 있다.

### 모아보기

- `/study/highlights`, `/study/notes`(포스트잇) 모아보기와 조문 트리의 주석
  카운트 배지는 **본인 작성물만** 집계한다 — "내 학습 활동" 지표. 강사 주석은
  뷰어 안에서만 노출된다.

## 범위 밖

- 강사 주석에 대한 수험생의 답글/반응.
- 강사가 수험생 주석을 열람·코멘트하는 기능 (학생 주석은 작성자 본인 전용).
  강사–학생 1:1 소통은 `student_notes`(상담 코멘트)가 담당한다.
- 메모(`content_comments`)의 모아보기 페이지 — 뷰어 패널 안에서만 소비.
- `content_comments` 를 `problem_choice`/`problem_box_item` 까지 확장 — 종전대로 3종.

## 관련 파일

- DB: `content_comments`, `user_highlights`, `user_memos`, `private.is_staff`
  (Supabase 마이그레이션 `annotation_visibility_unify`)
- `app/features/comments/queries.server.ts` · `api/comment.tsx` · `components/comments-panel.tsx`
- `app/features/comments/components/comment-highlight-overlay.tsx` — **삭제**
- `app/features/annotations/queries.server.ts` · `labels.ts`
- `app/features/annotations/components/highlight-toolbar.tsx` · `highlight-overlay.tsx`
  · `highlight-list.tsx` · `memo-list.tsx`
- `app/features/subjects/screens/{article,case,problem}-viewer.tsx`
- `app/features/laws/components/article-right-panel.tsx`
- `app/features/study/components/study-aids-shell.tsx` · `screens/notes.tsx`
- `app/app.css` (`lidam-cmt-*` → `lidam-hl-staff-*`)

## feat-8-022 와의 관계

feat-8-022(하이라이트형 코멘트)는 이 기능으로 **대체(superseded)**된다. 앵커
코멘트의 목적(강사 하이라이트의 학생 노출)을 가시성 규칙이 직접 달성한다.
