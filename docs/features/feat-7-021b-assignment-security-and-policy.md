# feat-7-021b — 과제 보안(권한 구멍)·항목별 완료·마감 정책

> 상태: 🟡 승인됨·구현 중(2026-06-18) · 점검 근거 `docs/survey/과제-점검.md`
> 결정 확정: ①=(나)+(가) 동반 / ⑥=학생 상세만 / ④=3유형(recommended·late_allowed·strict)·마감 D-N 양쪽. 순서 ①단독→⑥→④.
> 구현 순서: **① 보안(단독 커밋·검증 먼저)** → ⑥ 항목별 완료(거의 공짜) → ④ 마감 정책(새 필드·UI·마이그·차분히). 각 단계 typecheck·커밋 격리, 푸시 조율.

---

## ① 권한 구멍 (Critical — 최우선)

### 현황 확정 (`api/admin/assignment.tsx` 정독)
action 게이트는 `getStaffRole`(staff 여부)만(`:61-62`). **6개 intent 전부 소유권 검사 0.** 서버쿼리는 전부 `adminClient`(RLS 우회) → 코드 게이트가 유일 방어인데 그게 없음.

| intent | 받는 키 | 현재 검사 | cohort 도달 경로 |
|---|---|---|---|
| create | `cohortId`(폼) | staff only | cohortId 직접 |
| update | `assignmentId` | staff only | assignmentId → assignments.cohort_id |
| delete | `assignmentId` | staff only | assignmentId → cohort_id |
| upsert_item | `assignmentId`(+itemId) | staff only | assignmentId → cohort_id |
| **delete_item** | **`itemId`만** | staff only | itemId → assignment_items.assignment_id → assignments.cohort_id |
| convert_week | `weekId`+`cohortId` | staff only | cohortId 직접 |

→ 강사 A가 `/api/admin/assignment`에 다른 반 id로 직접 POST 시 생성·수정·삭제·항목편집·주차변환 가능(화면 loader 게이트 우회). **강사↔강사 수평 권한 상승.**

### service-role 사용 이유 + (나) 가능성 (RLS 운영 조회로 확인)
- 쓰기 경로가 닿는 테이블 RLS 전부 **요청 클라이언트(강사)로 동작 가능** 확인:
  - `assignments`/`assignment_items` `*_owner_all` = `user_owns_cohort(cohort_id) OR is_manager` → **소유권 자동 강제**. ★`assignment_items` 정책이 `assignments`로 EXISTS-join → **delete_item의 itemId도 RLS가 자동 역추적**(수동 traceback 불필요).
  - `announcements`/`announcement_audiences` `*_author_all` = `author_id=self AND is_staff` → createAssignment 알림 팬아웃(author=본인) RLS 통과.
  - `curriculum_weeks`/`curriculum_items` `*_staff_all` = `is_staff` → convert_week 읽기 통과.
- ⇒ service-role을 쓸 **필연적 이유 없음**(편의로 admin 사용 추정). `listAssignmentProgress`만 `auth.admin.listUsers`(이메일) 때문에 service-role 필수지만 그건 **읽기(loader)**라 ① 범위 밖.

### 해법 — 권고: **(나) RLS 전환을 근본**으로, (가) 명시 게이트는 선택적 방어막
- **(나) RLS 클라이언트 전환(권고·근본)**: 6개 write 함수(`createAssignment`/`updateAssignment`/`deleteAssignment`/`upsertAssignmentItem`/`deleteAssignmentItem`/`convertWeekToAssignment`) + `postAssignmentAnnouncement`를 **요청 클라이언트 인자**로 받게 바꾸고 action에서 전달. RLS가 6개 intent 전부(itemId 포함) 소유권 강제 → **코드 게이트 실수와 무관**한 DB 레벨 방어.
  - ★검출 보강: RLS-차단된 UPDATE/DELETE는 **0행(에러 아님)** → 함수가 영향행수(`.select()` 후 length)를 확인해 0이면 `{ok:false, error:"not found or forbidden"}` 반환(silent-ok 방지). INSERT(create/convert)는 RLS check 위반 → 에러 → `{ok:false}`.
  - 호출처 확인(구현 시): 6개 write 함수가 action 외 다른 곳(cron/seed 등)에서 adminClient로 불리는지 grep — 있으면 그쪽은 별도 처리.
- **(가) 명시 소유권 게이트(선택·방어막+명확한 403)**: action에서 intent별 cohortId 도달(create/convert=직접, update/delete/upsert_item=assignmentId→cohort, delete_item=itemId→cohort) → `getCohortById` + loader와 동일 규칙 `roleAtLeast(role,'manager') || cohort.ownerId===user.id` 아니면 **403**. loader 패턴과 일치, 명시적 거부 메시지.
- **최종 권고**: **(나) + (가) 동반, ① 단독 커밋.** (나)가 DB 백스톱(근본), (가)가 명시적 403 + silent-ok 공백 보완. 사용자가 "최속 단독"을 원하면 (가)만으로도 데이터는 안전(loader와 동일 코드 게이트)하나, (나) 미적용 시 adminClient 잔존 = 미래 신규 intent에서 재발 위험.

### intent별 검증 표 (구현 후 목표)
| intent | (나) RLS 강제 | (가) 명시 게이트 | 구현 후 강사A 타반 POST |
|---|---|---|---|
| create | assignments owner_all (with_check) | getCohortById(cohortId)+소유 | **차단**(INSERT check 위반) |
| update | assignments owner_all (using) | assignmentId→cohort+소유 | **차단**(0행→forbidden) |
| delete | assignments owner_all (using) | assignmentId→cohort+소유 | **차단**(0행→forbidden) |
| upsert_item | assignment_items owner_all(join) | assignmentId→cohort+소유 | **차단** |
| delete_item | assignment_items owner_all(join, itemId 자동 역추적) | itemId→assignment→cohort+소유 | **차단** |
| convert_week | assignments owner_all + curriculum staff_all | cohortId+소유 | **차단** |

**구현 후 검증**: 강사A 계정으로 타 반 cohortId/assignmentId/itemId 직접 POST → 전부 403/forbidden 확인.

---

## ⑥ 항목별 완료 표시 (거의 공짜)

- 현황: `recomputeSubmission`(`queries.server.ts:539-553`)이 **각 항목 done 을 이미 계산**하나 카운트(`completed_items`)만 저장하고 per-item done은 버림. 학생 상세는 모든 항목을 **빈 원(CircleIcon)** 으로만 표시(`student-assignment-detail.tsx:184`).
- 설계(새 쿼리·재계산·저장 0 — 노출 경로만):
  1. `recomputeSubmission`의 items 쿼리(`:435`)에 **`item_id` 추가**, 매칭 루프에서 **`doneByItem: Map<itemId, boolean>` 수집** 후 반환(현재 반환에 동봉).
  2. `getStudentAssignment`가 recompute의 doneByItem 을 받아 `detail.items[].done` 으로 머지. `AssignmentItem` 타입(`labels.ts`)에 `done: boolean` 추가.
  3. 학생 상세 `ItemCard`: 빈 원 → `item.done ? CheckCircle2Icon(emerald) : CircleIcon`. (CheckCircle2Icon 은 이미 import됨.)
- 저장/마이그 없음 — getStudentAssignment 가 어차피 recompute 를 돌리므로 done 을 같이 반환만. **운영자 진척표는 현행 카운트 유지**(선택적으로 동일 노출 가능, 이번 범위는 학생 상세).

---

## ④ 마감 정책 (과제별 권장형/엄격형)

### 새 필드 (★3유형으로 확장)
- enum `deadline_policy` = **`('recommended','late_allowed','strict')`**. 컬럼 `assignments.deadline_policy` **NOT NULL DEFAULT 'recommended'**.
- 마이그레이션(추가형·무해): `CREATE TYPE` + `ALTER TABLE assignments ADD COLUMN deadline_policy ... DEFAULT 'recommended' NOT NULL` → 기존 행 전부 'recommended' 자동 백필(= 현행 동작과 동일, 무해) → `db:typegen`. 주차변환(convert_week) 기본도 'recommended'.

### 동작 (3유형 — 셋 다 **접근 무차단**, recompute 완료 판정에서만 분기)
- **recommended(권장형)**: 마감 후에도 완료 인정, 표시 없음(현행 동작과 동일).
- **late_allowed(지각인정형)**: 마감 후에도 완료 인정 + **"지각 완료" 배지**(완료가 마감 이후면). 인정은 함.
- **strict(마감형)**: **마감 후 완료는 불인정 — 미완 유지**. 단 학습(문항 풀이·열람)은 막지 않음(공부 가능, status만 completed 로 안 넘어감).
- 분기는 오직 `recomputeSubmission`의 status 산정에서:
  - 완료 시각(아래 completed_at, 활동 기반)이 `due_at` 이내면 셋 다 'completed'.
  - 완료가 `due_at` 이후일 때: recommended/late_allowed = 'completed'(late_allowed는 late 파생플래그 true), **strict = 'partial' 유지(completed 안 됨)**.
- **late 파생값**(새 컬럼 불필요): `status='completed' && completed_at > due_at`. late_allowed 에서만 "지각 완료" 배지. strict 는 애초 late 완료가 'completed'가 안 되므로 "마감 후 미완"으로 보임.

### ★ completed_at 표류 수정 (전제 — 이게 돼야 지각 판정 정확)
- 현황: `recomputeSubmission`(`:557`)이 **매 recompute마다 `completed_at=now()`** 로 덮어씀 → "완료 시각"이 마지막 조회 시각으로 표류 → 지각 판정 불가.
- 수정: 완료 전환 시점만 기록·이후 보존. recompute 가 **직전 submission 의 completed_at/status 를 읽어**:
  `newCompletedAt = (status==='completed') ? (priorCompletedAt ?? now()) : null`
  (이미 완료였고 시각이 있으면 그대로 보존, 미완→완료 첫 전환에만 now()). 기존 완료 데이터 삭제 아님 — **표류만 멈춤**(학습데이터 비파괴).

### 마감 안내 (비차단·공통)
- 학생/강사 화면에 마감 D-N, 지났으면 "마감 지남". 막지 않고 정보만. (학생 화면엔 이미 절대시각+"(지남)" 있음 — D-N 보강 선택.)

### 강사 UI
- `admin-assignment-edit.tsx` 생성/수정 폼에 **정책 선택(권장형/엄격형)** 추가. action `createSchema`/`updateSchema` 에 `deadlinePolicy` 추가, `createAssignment`/`updateAssignment` 가 컬럼에 반영.
- `convertWeekToAssignment` 기본값 = **'recommended'**(안전·명시).
- 학생 화면엔 정책 자체보다 결과("지각 완료", strict일 때만)만.

### 영향 파일
- 마이그 1건(enum+컬럼+백필) + `db:typegen`.
- `assignments/queries.server.ts`(create/update/convert 에 정책, recompute completed_at 고정 + late 파생), `assignments/labels.ts`(타입), `admin-assignment-edit.tsx`(폼·UI), `admin/api/assignment.tsx`(스키마), `admin-cohort-assignments.tsx`+`student-assignment-detail.tsx`(지각 배지·마감 안내).

---

## 절차
- 코드 0(설계). 승인 후 **①(나+가, 단독 커밋, 강사A 타반 POST 403 검증) → ⑥(항목 done 노출) → ④(마이그·정책·지각·completed_at 고정·UI)**.
- 각 단계 typecheck, 커밋 격리, 푸시는 조율(지시 시).
- 학습데이터(submission) 비파괴: completed_at 은 표류 정지(기존값 보존), ④ 마이그는 컬럼 추가+기본값 백필.

## 결정 질문
1. **① 방식**: (나)+(가) 동반〔권고〕 / (나)만(근본·최소 silent-ok 보완) / (가)만(최속·코드게이트).
2. **⑥ 운영자 진척표에도 항목별 done** 노출? (이번엔 학생 상세만 권고, 강사 표는 카운트 유지.)
3. **④ 마감 안내 D-N** 추가 범위(학생만/양쪽).
