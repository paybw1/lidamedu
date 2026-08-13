# Phase 3 사전 조사 — 어드민 편집기 이중 버튼 부착 지점 (코드 읽기 전용)

> 실행일: 2026-08-13 · 코드 수정 없음
> 목적: [내부 수정으로 저장] / [저장 + 추록·정오표 발행] 이중 버튼 + 발행 모달을 붙일 자리 확정

**요약 판정: 편집 화면 4종은 전부 개별 구현이고 저장 경로는 3갈래다(객·주관식이 한 화면을 공유해 실질 부착 지점은 3곳). 저장 후 동작이 화면마다 달라(인라인 revalidate / redirect / 조건부 redirect) — 발행 판단 UI는 "저장 후 배너"가 아니라 "저장 시점 분기(버튼 2개)"로 넣는 것이 세 화면 모두에 성립하는 유일한 공통 패턴이다.**

---

## 1. 편집 화면 목록 — 판정: **전부 개별 구현** (공통 컴포넌트 없음)

| 콘텐츠 | 라우트 | 화면 파일 | 규모 |
|---|---|---|---|
| 조문 (퀵에딧) | 조문 뷰어 내 인라인 에디터 | `app/features/laws/components/article-editor.tsx` | 347줄 |
| 조문 (법 개정) | `/admin/laws/:lawCode/revisions/:revisionId` | `app/features/admin/screens/admin-law-revision-workspace.tsx` | 1,656줄 |
| 판례 | `/admin/cases/edit(/:caseId)` | `app/features/admin/screens/admin-case-edit.tsx` | 2,854줄 |
| 객관식+주관식 | `/admin/problems/:problemId` (routes.ts:1628) | `app/features/problems/screens/admin-problem-edit.tsx` | 1,964줄 |

- **객관식과 주관식은 같은 화면**이다 — `admin-problem-edit.tsx`가 format 분기로 주관식 필드까지 처리한다(569~586행: `model_answer_md`·`grading_rubric_md`·`subjective_kind`…). 4종처럼 보이지만 부착 지점은 3곳.
- ★**조문 편집은 두 경로다.** ① 퀵에딧(article-editor): 뷰어에서 바로 고치는 UI인데 **겉보기와 달리 in-place 수정이 아니라 새 리비전 INSERT**다. 화면에도 명시돼 있다:
  ```tsx
  // article-editor.tsx:174
  <p className="font-semibold">편집 모드 — 새 개정으로 저장됩니다</p>
  "저장하면 기존 본문은 보존되고 새로운 article_revision 이 생성됩니다"
  ```
  `effective_date`는 **입력받지 않고 오늘로 고정**된다(`saveArticleQuickEdit`, laws/queries.server.ts:796~805: `effective_date: today`, `change_kind: "amended"`, `law_revision_id: null`). ② 법 개정 워크스페이스: draft 상태에서 신구조문대비표 작성 → 공포일/시행일 확정 → 발행(스냅샷 반영, 1287행) — 미래 시행 개정은 이쪽이 이미 담당한다. **Phase 3의 시행일 예약 UI는 새로 만들 게 아니라 이 워크스페이스와 접속하면 된다.**

## 2. 저장 경로 — 판정: **3갈래, 수렴 없음. 전부 서버 액션 경유(PostgREST 직접 호출 없음)**

| 콘텐츠 | 경로 | 방식 | DB 클라이언트 |
|---|---|---|---|
| 조문 퀵에딧 | `POST /admin-edit-article` → `features/laws/api/admin-edit-article.tsx` | fetcher → API route action → `saveArticleQuickEdit` | adminClient (article_revisions INSERT) |
| 판례 | `POST /api/admin/case` (intent create/update) → `features/admin/api/case.tsx` | `saveFetcher.Form` → API route action | adminClient + **`logAuditEvent`**(audit_logs 이중 기록 — 원장과 병존 확인됨) |
| 문제 | 라우트 자체 action (`admin-problem-edit.tsx:327`) | navigation `<Form>` → screen action | **RLS 클라이언트**(problems/problem_choices/problem_box_items update) + 강사 과목 게이트 `assertSubjectWritable`(339행) |

세 경로 모두 Phase 1 트리거가 걸린 테이블에 닿으므로 **저장 즉시 원장(content_revisions)에 revision이 생긴다** — 발행 모달의 데이터 원천은 이미 확보돼 있다.

## 3. 저장 시점에 클라이언트가 쥐고 있는 것 — 판정: **3곳 모두 원본 보유 (diff 프리필 성립)**

- 조문: 에디터가 loader의 initial body를 상태로 들고 dirty 판정까지 한다(article-editor.tsx:74~131).
- 판례·문제: uncontrolled `defaultValue` 폼 — loader가 준 원본 객체(`kase`, `problem`)가 컴포넌트 prop으로 살아 있고, 수정값은 DOM에 있다.
- ★단, **클라이언트 diff 는 참고용으로만** 쓰는 게 맞다. 서버 권위 diff는 저장이 만든 원장 행(`before_snapshot`/`after_snapshot`/`changed_fields`)이 SSOT다. 조문 API는 이미 `revisionId`(article_revisions의 것)를 응답으로 돌려주고(admin-edit-article.tsx:82), 판례·문제 액션은 아무것도 안 돌려준다 → **Phase 3에서 저장 응답에 원장 revision_id를 실어주는 소수정이 필요**(또는 발행 모달이 content_id 최신 원장 행을 조회).

## 4. 저장 후 화면 동작 — 판정: **제각각 ★Phase 3 설계 최대 변수**

| 화면 | 저장 성공 시 | 저장 직후 배너/모달 자리 |
|---|---|---|
| 조문 퀵에딧 | 머무름 — `revalidator.revalidate()` + 에디터 닫힘(article-editor.tsx:111~117) | ✅ 있음 (인라인) |
| 판례 | **`redirect(returnTo)`** — 편집 화면을 떠난다(api/case.tsx:1070, 실패 시에만 잔류+toast) | ❌ 없음 — 떠나기 전에 물어야 함 |
| 문제 | returnTo 있으면 `redirect`, 없으면 잔류+toast(admin-problem-edit.tsx:743~747) | 조건부 |

→ 설계서 §4.1의 "저장 직후 배너: 이 변경을 수험생에게 고지할까요?"는 판례 화면에서 성립하지 않는다. **세 화면 모두에서 성립하는 공통 패턴은 저장 버튼 자체를 이중화**([내부 수정으로 저장]=기존 동작 그대로 / [저장+발행]=저장 후 redirect 대신 발행 모달 → 발행 완료 후 원래 동작)하는 것이며, 이는 설계서 §6.1의 이중 버튼안과 일치한다.

## 5. 기존 UI 자산

- **모달**: shadcn `dialog.tsx`·`alert-dialog.tsx`·`sheet.tsx` (`app/core/components/ui/`) — 발행 모달 재사용 가능.
- **diff**: 전용 공용 컴포넌트는 없으나 ★**LCS 기반 line diff 렌더러가 이미 있다** — `admin-law-revision-workspace.tsx:678~» diffLines()` (+ added/removed 카운트·행 렌더, 723~765행). 화면 로컬 함수라 **공용으로 추출하면 발행 모달 diff 프리필에 그대로 쓸 수 있다**. `features/laws/components/revision-history.tsx`(리비전 이력 나열)도 참고 자산.

## 6. 어드민 접근 제어 — 판정: **레이아웃 가드 없음, 화면·API마다 자체 게이트 (일관 패턴)**

- 공통 패턴: `client.auth.getUser()` → `getStaffRole(client, user.id)`(laws/queries.server.ts:755 — 본인 profiles 행의 role이 instructor/manager/admin인지) → null이면 403. `private.is_staff()`는 **DB RLS 계층**에서 병행 방어(문제 편집처럼 RLS 클라이언트로 쓰는 경로의 실질 방어선).
- 문제 편집만 추가 게이트: 강사는 담당 과목만(`assertSubjectWritable`, feat-7-041).
- Phase 3 발행 액션도 같은 패턴(getStaffRole + 원장 테이블 RLS is_staff)을 따르면 된다. 발행 권한을 강사에게 줄지 원장(admin/manager) 전용으로 할지는 정책 결정 필요.

---

## Phase 3 설계에 영향이 큰 발견 (별도 표시)

1. ★**부착 지점은 4곳이 아니라 3곳** — 객·주관식 공용 화면. 공통 편집 컴포넌트가 없으므로 이중 버튼은 3곳에 각각 붙이되, **발행 모달 자체는 공용 컴포넌트 1개**로 만들어 3곳에서 호출.
2. ★**판례 저장이 redirect라 "저장 후 배너" 설계가 성립 안 함** — 이중 버튼(저장 시점 분기)으로 통일해야 함. [저장+발행] 경로만 redirect를 보류하고 모달을 띄운 뒤 완료 시 이동.
3. ★**diff SSOT는 원장** — 저장이 만든 content_revisions 행을 발행 모달이 읽으면 프리필 완성. 판례·문제 저장 응답에 원장 revision_id 반환 소수정 필요(조문은 이미 반환).
4. ★**조문 이원화 유지** — 퀵에딧(오탈자성, effective_date=오늘 고정)은 이중 버튼 대상, 미래 시행 법령개정은 기존 개정 워크스페이스(draft→발행, 시행일 확정 UI 보유)에 발행 연동을 붙이는 게 자연스럽다. 새 예약 폼을 만들 필요 없음.
5. ★**diff 렌더러 재사용 가능** — 워크스페이스 로컬 `diffLines()`를 공용 추출.
6. 판례 저장은 `logAuditEvent`(audit_logs)와 원장 기록이 병존 — Phase 0 결정(병존)대로 정상. 발행 시 추가 audit 이벤트를 남길지만 결정하면 됨.

*조사 종료 — 지시대로 코드 수정 없이 여기서 정지한다.*
