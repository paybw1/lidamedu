# Phase 1 Stage 1 — 설계 확정 및 dry-run

> 작성일: 2026-08-13 · **본 단계 코드·스키마·데이터 변경 0건** (dry-run 문서)
> 선행: `docs/plans/phase1-stage0-recheck.md` · 보완 지시(§2 S1 개정) 반영
> ※ B3 선행 조치는 완료됨(운영 데이터 조치 — 본 문서 §0에 결과 기록). 그 외 변경 없음.

## 0. B3 선행 조치 결과 (지시 §1)

**선행 확인 (읽기 전용)**

| # | 확인 | 결과 |
|---|---|---|
| B3-1 | 살아있는 3건 대상 학생 온라인 응시 세션 | **0건.** `offline_test_online`/`offline_test` 세션 전수 6건은 모두 manager("리담관리자") 본인, 전부 미완료, 대상도 이미 삭제된 다른 시험지 — 3건을 가리키는 세션은 0 |
| B3-2 | 연결된 attempt | **0건** (세션 자체가 없음) → 중단 사유 없음, 삭제 대상도 없음 |
| B3-3 | 부모 과제 "종합반 문제 제작 테스트"(749caf9e) 구성 | 오프라인 테스트 전용이 **아님** — `article_read` 항목 1개 보유, 제출 19건(완료 7·대기 12), 역대 33개 시험지 전부의 부모. → 지시 분기 "다른 내용이 있다면 → 과제 유지" |

**조치 (기존 경로 시맨틱만 사용, 코드·스키마 무변경)**

1. 시험지 3건("123"·"123123"·"1414") soft-delete 완료 — `softDeleteOfflineTest`(queries.server.ts:151-161)와 동일한 `update deleted_at = now() where deleted_at is null` (스크립트 `tmp/audit-phase0b/b3-softdelete.mjs`, 2026-08-13 08:19 KST).
2. 과제는 유지 (항목·제출 이력 보존 확인: items 1 · submissions 19 그대로).
3. **노출 소멸 실증**: 학생 상세 화면 쿼리(`listMyOfflineTestsForAssignment`와 동일 필터) 재현 → 해당 과제의 visible_tests **0건**. 전체 살아있는 시험지 0건. RLS `offline_tests_select_member`의 qual에 `deleted_at IS NULL`이 포함되어 있어 학생 클라이언트에서도 행 자체가 차단됨(정책 원문 재조회로 확인). 브라우저 수준 학생 계정 실증은 Stage 2 V3 검증(테스트 학생 하네스 필요)과 함께 수행 예정.

> 참고: 과제 카드 자체("종합반 문제 제작 테스트", 마감 경과)는 여전히 학생 목록에 남는다(조문 정독 항목 1개짜리 과제로서). 테스트 성격의 과제이므로 운영자가 수동 삭제할지는 별도 판단 사항 — 지시 분기에 따라 이번 조치에서는 건드리지 않았다.

---

## 1. T1 — 저장 구조 A/B 비교표 (실측) ★ 사람 결정 필요

전제(실측): `offline_test_results` **0행** → 어느 안이든 데이터 마이그레이션·백필 없음. 두 안 모두 "정오 스냅샷의 키 = `question_id`(불변 uuid)"로 동일하며, 차이는 **저장 형태**(배열 컬럼 vs 자식 테이블)뿐이다.

공통 수정 지점(두 안 동일 — ord 키를 question_id 키로 바꾸는 데 필요한 곳, 실측 15지점):

| 구역 | 지점 (파일:라인) |
|---|---|
| 타입 3 | `offline-tests/results.server.ts` :25(`OfflineTestResultRow.wrongOrds`) :201-206(`OnlinePrefillEntry`) :290-297(`OfflineResultEntry`) |
| 읽기 2 | :36-47(`listOfflineTestResults` select·map) — 그리드 초기값 공급 |
| 프리필 2 | :233-246(ord↔problem 매핑 → question_id↔problem 매핑) :265-286(오답 목록 조립) |
| 저장 5 | :316(`validOrds`→유효 question_id 집합) :418(`wrongSet`) :518(`correct` 판정 키) + 결과 upsert 3곳 :427-441 / :457-471 / :591-605 |
| API 1 | `admin/api/offline-test.tsx` :273(zod — `z.array(z.number())` → `z.array(z.string().uuid()).max(500)`) |
| 그리드 2 | `admin/screens/admin-offline-test-results.tsx` :161-168(`RowState.wrong: Set<number>`→`Set<string>`) + :195-206(초기화) :238(프리필 적용) :255(저장 페이로드) — 문항 토글·통계(:88-159, :418-441)는 키만 교체(표시 라벨은 기존대로 ord+1 사용, `question_id→ord` 매핑은 loader의 `test.questions`에 이미 있음) |

| 항목 | A안 — 배열 유지, 키만 교체 (`wrong_question_ids uuid[]`) | B안 — 정규화 테이블 신설 (`offline_test_answers`) |
|---|---|---|
| 수정 대상 코드 지점 수 | **15지점** (위 공통뿐) | **15지점 + 4** (결과 upsert 3곳이 배열 대신 자식 행 delete+insert로 형태 변경, listOfflineTestResults에 answers 조회 1회 추가) |
| 저장 함수 변경 규모 | wrongSet 타입 교체 + upsert 필드명 교체 — 구조 불변 | upsert에서 배열 제거 + 결과 행 확보 후 `offline_test_answers` delete→bulk insert (result_id FK 필요 → upsert `.select("result_id")` 체인 추가). 온라인 프리필 행(:427)·absent(:457)·taken(:591) 3분기 모두 |
| 문항별 정답률 통계 쿼리 변경 | 없음 — 그리드가 클라이언트에서 집계(:106-110), 키만 교체 | 서버는 listOfflineTestResults에 answers 1쿼리 추가(rows→user별 Set 재조립), 클라이언트 집계는 동일 |
| 온라인 프리필 변경 | 공통 2지점뿐 (반환 키 교체) | 동일 (프리필은 저장 전 메모리 값이라 저장 형태 무관) |
| 결과 그리드 화면 변경 | 공통 2지점뿐 | 동일 (그리드는 `Set<question_id>`만 다루므로 저장 형태 무관) |
| 인쇄·월간리포트 영향 | **없음** — 인쇄(`getOfflineTestPrintData`)는 정오 미사용, 월간리포트(:157-167)·시리즈 추이는 `score/max_score/status`만 읽음(실측) | 동일하게 없음 |
| RLS 정책 추가 | **불필요** (기존 `offline_test_results` 행 정책 그대로) | **필요** — 신설 테이블에 `staff_all` 필수. 학생 select_own은 현행 비노출(학생에게 문항별 정오 안 내려감, results.server.ts:156 select 확인)이므로 **미부여가 현상 유지** — 부여 여부는 정책 선택 |
| N2(부분점수·선택 답안 보존) 도입 시 | **추가 마이그레이션 필요** — uuid[]는 값-당 메타(선택답·점수)를 못 담아 결국 B형 테이블 신설 + 배열 폐기 2차 전환 | **컬럼 추가로 수용** — `selected_no int`·`earned_points numeric` 등 additive |
| 롤백 난이도 | 낮음 — `drop column wrong_question_ids` + 코드 revert (0행이라 데이터 손실 없음) | 낮음 — `drop table offline_test_answers` + 코드 revert (동일하게 0행) |

- 부기 1: 두 안 모두 `wrong_ords` 컬럼은 전환 기간 동안 유지(default '{}')하고 코드가 더 이상 읽고 쓰지 않게 한 뒤, 검증 후 별도 마이그레이션으로 제거한다(§4 배포 순서).
- 부기 2: zod `.max(500)`(오답 수 상한)은 두 안 공통 유지. B안의 자식 행 수는 문항 수 이하로 자연 상한.
- 부기 3: `admin-offline-test-edit.tsx`(빌더)·인쇄 화면은 두 안 모두 무변경(정오 스냅샷 미접촉 — Stage 0 0-5 전수와 일치).

**결론 없음 — 선택은 사람이 한다.**

## 2. T2 — 배포 게이트 설계

### 2.1 스키마

```sql
alter table public.offline_tests
  add column status text not null default 'draft'
    check (status in ('draft', 'published', 'closed')),
  add column published_at timestamptz,
  add column closed_at timestamptz;
```

- 기존 33건 전부 `draft`가 된다 — **의도된 결과이며 안전 확인 완료**: 33건 모두 soft-delete 상태(B3 조치 후 살아있는 시험지 0건)이고 `offline_test_results` 0행이라, 상태 전환으로 달라지는 학생 화면·성적이 존재하지 않는다.

### 2.2 상태 전이와 편집 정책 (T1 연동)

```
draft ──publish──▶ published ──close──▶ closed
  ▲                   │
  └──revert(결과 0건일 때만)──┘
```

| 상태 | 학생 노출 | 문항 편집(add/remove/move/set_points) | 결과 입력(save_results) | 온라인 응시 |
|---|---|---|---|---|
| draft | ✗ (RLS 차단) | ✓ | ✗ (서버 거부) | ✗ (RLS로 자동 차단) |
| published | ✓ | **✗ (서버 거부)** — max_score 불변 보장 | ✓ | ✓ |
| closed | ✓ (결과 열람 유지) | ✗ | ✗ (마감) | ✗ (서버 거부) |

- **편집 잠금을 서버(API)에서 강제**한다: `admin/api/offline-test.tsx`의 `add_questions`·`auto_pick`·`remove_question`·`move_question`·`set_points` intent 처리부에 `status='draft'` 게이트 1곳(공통 헬퍼) 추가. T1이 ord 의존을 없애더라도 `max_score` 스냅샷 stale 문제(감사 §7.1-(b)-⑤)가 남으므로 published 이후 문항 편집은 금지가 원칙.
- `revert`(published→draft)는 `offline_test_results`가 0건일 때만 허용 — 잘못 배포한 시험지 회수 경로.
- `update_test`(제목·시간·안내문)는 전 상태 허용(문항·배점 불변).

### 2.3 API·화면 변경

- **API intent 3종 추가**: `publish_test`(→published, `published_at=now()`), `close_test`(→closed, `closed_at=now()`), `revert_test`(→draft, 결과 0건 게이트, published_at/closed_at NULL 초기화). 기존 게이트(스태프→반 소유권) 재사용.
- **빌더**(`admin-offline-test-edit.tsx`): 헤더에 상태 뱃지 + 상태별 액션 버튼(배포/마감/회수). `status !== 'draft'`이면 문항 편집 UI disable(서버 게이트의 미러).
- **과제 편집 목록**(`admin-assignment-edit.tsx`의 `listOfflineTests` 카드): 상태 뱃지 표시(`listOfflineTests` select에 status 추가).
- **결과 입력 화면**: `status='published'`가 아니면 저장 버튼 비활성 + 안내(서버는 save_results에서 재거부).
- **학생 화면·온라인 응시 API는 코드 무변경**: `listMyOfflineTestsForAssignment`(:142-147)와 `offline-test-online.tsx`의 `getOfflineTestWithQuestions`는 요청 컨텍스트(RLS) 클라이언트를 사용함을 확인(`makeServerClient(request)` :23, RLS 클라이언트로 조회 :42 — 주석도 "접근 증명 = RLS" 명시)하므로 아래 RLS만으로 draft가 자동 차단된다. (closed의 온라인 응시 차단만 API에 status 확인 1곳 추가 — RLS는 closed를 계속 노출하기 때문.)

### 2.4 RLS before/after

지시서는 학생 SELECT에 `status = 'published'` 조건을 지정했으나, **closed 시험지가 학생에게 숨으면 자기 결과 카드가 깨진다** — `listMyOfflineTestsForAssignment`가 `offline_tests`를 못 읽으면 결과 행이 있어도 카드가 사라진다. 따라서 **`status <> 'draft'`**(= published·closed 노출)로 설계한다. ★지시서 자구와 다른 지점 — 승인 시 확인 요망.

**offline_tests** — `offline_tests_select_member`:

```sql
-- before (현행)
using (
  deleted_at is null
  and exists (select 1 from public.cohort_members cm
              where cm.cohort_id = offline_tests.cohort_id and cm.profile_id = auth.uid())
);
-- after
using (
  deleted_at is null
  and status <> 'draft'                             -- ★ 추가
  and exists (select 1 from public.cohort_members cm
              where cm.cohort_id = offline_tests.cohort_id and cm.profile_id = auth.uid())
);
```

**offline_test_questions** — `offline_test_questions_select_member`:

```sql
-- before (현행)
using (exists (
  select 1 from offline_tests t
  join cohort_members cm on cm.cohort_id = t.cohort_id
  where t.test_id = offline_test_questions.test_id
    and t.deleted_at is null and cm.profile_id = auth.uid()));
-- after — 부모 상태 조건 추가
using (exists (
  select 1 from offline_tests t
  join cohort_members cm on cm.cohort_id = t.cohort_id
  where t.test_id = offline_test_questions.test_id
    and t.deleted_at is null
    and t.status <> 'draft'                         -- ★ 추가
    and cm.profile_id = auth.uid()));
```

- **staff 정책 2종(`*_staff_all`)은 무변경.**
- **`offline_test_results_select_own`은 상태 조건 불필요 — 확인 완료**: draft 시험지는 결과 행이 생길 수 없고(save_results가 published 게이트), 이미 존재하는 결과는 closed 후에도 본인이 계속 봐야 하므로 `user_id = auth.uid()` 그대로가 옳다.
- B안 채택 시 `offline_test_answers`에는 `staff_all`만 신설(§1 표의 RLS 행 참조).

## 3. S1 — SRS 합류 설계 (보완 지시 §2 반영)

### 3.1 배치 함수와 계산 로직 공유 구조

SM-2 계산은 이미 순수 함수 `computeNextSrsState`(`app/features/study/lib/srs.ts:58-109`, 클라/서버 공용)로 분리되어 있고, 단건 함수 2종(`applyProblemSrsUpdate`·`applyOxRefSrsUpdate`)이 이를 호출한다. 배치도 **같은 순수 함수를 호출**하며, 로직 복제가 생기지 않도록 **단건 함수를 배치 함수의 단일 원소 호출로 재작성**한다(쓰기 경로 일원화).

```ts
// app/features/study/srs.server.ts — 신설
export interface ProblemSrsOutcome { userId: string; problemId: string; isCorrect: boolean }

/** 여러 (user, problem) 의 SRS 를 일괄 갱신. 계산은 computeNextSrsState 공유.
 *  쿼리 수 = ceil(대상/150) select + ceil(대상/500) upsert — 문항·학생 수에 비선형. */
export async function applyProblemSrsBulk(
  client: SupabaseClient<Database>,
  outcomes: ProblemSrsOutcome[],
): Promise<void>
// 구현 골자:
// 1) (userId, problemId) 로 dedup — 동일 키 복수 시 "하나라도 오답이면 오답" 집계(§3.3 규칙 공유)
// 2) 기존 행 일괄 조회: .in("user_id", users).in("problem_id", problems) — 150개 단위 배치
//    (교차곱 과조회는 메모리에서 키 필터. ★대량 .in() URL 초과 방지 — 150 배치 규칙 준수)
// 3) 각 키에 computeNextSrsState({prev, isCorrect}) 적용
// 4) upsert 일괄 (onConflict: "user_id,problem_id", 500행 단위)

// 기존 단건 — 배치에 위임하도록 재작성 (시그니처·동작 불변, best-effort try/catch 유지)
export async function applyProblemSrsUpdate(client, userId, problemId, isCorrect) {
  try { await applyProblemSrsBulk(client, [{ userId, problemId, isCorrect }]); }
  catch (err) { /* 기존과 동일 best-effort 로깅 */ }
}
```

```ts
// app/features/study/ox-srs.server.ts — 동일 패턴
export interface OxRefSrsOutcome { userId: string; refType: OxRefType; refId: string; isCorrect: boolean }
export async function applyOxRefSrsBulk(client, outcomes: OxRefSrsOutcome[]): Promise<void>
// onConflict: "user_id,ref_type,ref_id" — 기존 writer(applyOxRefSrsUpdate:45-60)와 동일 키.
// applyOxRefSrsUpdate 는 applyOxRefSrsBulk([단일]) 위임으로 재작성.
```

- `user_ox_ref_srs`의 기존 writer는 `applyOxRefSrsUpdate`(ox-srs.server.ts:17-64) **단 1개**(호출처 = recordProblemAttempt OX 분기)임을 확인 — 배치 신설 + 단건 위임으로 쓰기 경로가 계속 1개로 유지된다.
- 신규 mutation 경로가 아니라 기존 경로의 배치화 — 뮤테이션 경로 동결 원칙과 충돌 없음.

### 3.2 saveOfflineTestResults 통합과 멱등성 (`srs_applied_at`)

```sql
alter table public.offline_test_results
  add column srs_applied_at timestamptz;  -- SRS 1회 적용 마커 (두 축 공통)
```

저장 흐름(taken·비온라인 행 기준):

1. 기존 결과 로드 시 `srs_applied_at` 포함 select(현행 :387-390 확장).
2. 엔트리 처리 루프에서 attempt insert 준비와 동시에 SRS outcome 수집 —
   - mcq → `{userId, problemId: q.problem_id, isCorrect}`
   - ox → `{userId, refType: q.ox_ref_type('choice'→'choice', 'box'→'box_item'), refId: q.ox_ref_id, isCorrect}` ※ 컬럼 값 'box'와 SRS refType 'box_item' 매핑 주의(현행 attempt insert :543-544와 동일 대응)
   - blank → **수집 안 함(E3)**
   - 단, 해당 학생의 기존 결과에 `srs_applied_at`이 이미 있으면 **outcome 수집 자체를 건너뜀**(스킵).
3. **온라인 응시 불러오기 행(:422-445)**: SRS는 응시 시점에 정규 경로(`recordProblemAttempt`)로 이미 갱신되었으므로 적용하지 않되, `srs_applied_at`을 함께 기록한다(의미: "이 결과의 SRS 반영은 완료됨"). 이후 이 행을 일반 재입력으로 덮어써도 이중 적용이 차단된다.
4. **absent 행**: SRS 미적용·마커 미기록(적용된 것이 없으므로). 이전에 taken으로 적용됐던 행을 absent로 철회하는 경우 → attempt는 현행대로 delete, **SRS는 되돌리지 않고 `srs_applied_at`도 유지**(아래 정책).
5. 루프 종료 후: 수집된 outcome을 `applyProblemSrsBulk` + `applyOxRefSrsBulk` 각 1회 호출 → 성공 시 대상 학생들의 결과 행에 `update ... set srs_applied_at = now() where test_id = ? and user_id in (...) and srs_applied_at is null` 1회.

**정책 (코드 주석 + 문서에 명시할 문안)**

> SRS는 성적이 아니라 복습 스케줄이다. 성적 정정으로 인한 ease·interval 차이는 무시 가능한 수준인 반면, 재적용을 허용하면 되돌릴 수 없는 `reps` 부풀리기 경로가 생긴다. 따라서 result 하나당 1회만 적용한다.
> 같은 이유로, 철회(taken → absent) 시에도 SRS는 되돌리지 않는다. 학생이 그 문제를 접했다는 사실은 유효하다.

**부분 실패 창(설계상 인지)**: bulk 적용(문제 축 성공·OX 축 실패) 후 마커 기록 전에 실패하면, 재시도 시 문제 축이 한 번 더 적용될 수 있다. 트랜잭션이 없는 supabase-js 다중 호출의 한계로, (a) 발생 조건이 좁고(부분 장애 + 즉시 재저장) (b) SRS는 성적이 아니라 스케줄이라 1회 오차가 학생에게 유의미한 손해가 아니므로 수용한다. 실패는 throw로 표면화(성적 저장 자체는 이미 완료된 뒤이므로 운영자 화면에 에러 노출 + Sentry).

### 3.3 OX ref 단위 집계 규칙

> 같은 ref에 속한 문항 중 **하나라도 오답이면 그 ref를 오답으로 처리**한다. (보수적 — 복습 빈도가 다소 높아지는 방향)

- 구현: `applyOxRefSrsBulk` 입구의 dedup 단계에서 `(userId, refType, refId)` 키로 `isCorrect = AND` 집계. 문제 축(`applyProblemSrsBulk`)도 동일 규칙으로 통일(한 시험에 같은 problem이 이중 편성될 수는 없으나 — `addTestQuestions`의 refKey dedup(:302-307) — 방어적으로 동일 규칙 적용).
- 이 규칙은 feat-7-042 문서에 기재한다(§5 문서 갱신 항목에 포함).

**알려진 한계 (이번에 고치지 않음 — 문서화 문안)**

> `getNodeMastery`의 `srsReps` 조건은 `user_problem_srs`만 읽는다. 따라서 **OX 전용 시험지로는 `mastered` 단계에 도달할 수 없다.** mcq 문항이 포함된 시험에서만 마스터리가 진행된다.

### 3.4 V1-b 검증 경로 (Stage 2 대비)

ox 지필 오답 → `user_ox_ref_srs` upsert → `getDueOxRefs`(ox-srs.server.ts:89-195)가 due 판정 — 단 이 함수는 `ox_ineligible=false`·`ox_truth NOT NULL`·문제 미삭제 eligibility 필터가 있으므로, V1-b 검증용 시험지는 **eligibility를 통과하는 OX ref**로 편성해야 한다(편성 후보 쿼리가 이미 같은 필터를 쓰므로 자연 충족 — listOxCandidates 확인).

**V2 검증 전제(승인 시 인지 필요)**: `srs_applied_at` = result당 1회 정책이므로 시험 1건으로는 해당 문제의 `reps`가 최대 1이다. V2(`srsReps >= 2` 오프라인 단독 충족)는 **같은 문제를 공유하는 서로 다른 시험지 2건**을 각각 채점·저장해야 검증 가능하다(문항 dedup은 시험지 내부 단위라 시험지 간 중복 편성은 허용됨 — addTestQuestions refKey 확인). Stage 2 검증 계획은 이 방식으로 수행한다.

## 4. 마이그레이션·롤백 SQL 전문

> 실행하지 않음(dry-run). 적용 시 운영 DDL 규칙에 따라 `scripts/run-prod-sql.mjs` 사용(MCP supabase 금지 — 운영 DB=mcgdoplo).

### 4.1 M1 — T1 저장 구조 (택1)

**A안 채택 시** `scripts/sql/20260813_offline_test_t1_a.sql`:

```sql
-- Phase 1 T1(A안) — 정오 스냅샷 키를 ord → question_id 로 전환.
-- wrong_ords 는 전환 기간 유지(코드 미사용) 후 M4 에서 제거.
alter table public.offline_test_results
  add column if not exists wrong_question_ids uuid[] not null default '{}';
comment on column public.offline_test_results.wrong_question_ids is
  '오답 문항 question_id 스냅샷 (표시용 — 정오 원본은 세션 attempts). ord 키(wrong_ords) 대체';
```

**B안 채택 시** `scripts/sql/20260813_offline_test_t1_b.sql`:

```sql
-- Phase 1 T1(B안) — 문항별 정오 정규화 테이블. wrong_ords 는 전환 기간 유지 후 M4 에서 제거.
create table if not exists public.offline_test_answers (
  result_id uuid not null references public.offline_test_results(result_id) on delete cascade,
  question_id uuid not null references public.offline_test_questions(question_id) on delete cascade,
  is_correct boolean not null,
  primary key (result_id, question_id)
);
comment on table public.offline_test_answers is
  '오프라인 시험 문항별 정오 스냅샷 — 정오 원본은 세션 attempts. N2(선택답·부분점수)는 컬럼 추가로 확장';
create index if not exists offline_test_answers_question_idx
  on public.offline_test_answers (question_id);

alter table public.offline_test_answers enable row level security;
drop policy if exists offline_test_answers_staff_all on public.offline_test_answers;
create policy offline_test_answers_staff_all
  on public.offline_test_answers for all
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));
-- 학생 select_own 미부여 — 현행(문항별 정오 학생 비노출) 유지. 노출 결정 시 별도 정책 추가.
```

**롤백**:

```sql
-- A안
alter table public.offline_test_results drop column if exists wrong_question_ids;
-- B안
drop table if exists public.offline_test_answers;
```

### 4.2 M2 — T2 배포 게이트 + S1 마커 (`scripts/sql/20260813_offline_test_status_srs.sql`)

```sql
-- Phase 1 T2 — 시험지 상태 관리 (draft/published/closed). 기존 행은 전부 draft(의도:
--   실사용 데이터 0 — results 0행·살아있는 시험지 0건 확인 후 적용).
alter table public.offline_tests
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'published', 'closed')),
  add column if not exists published_at timestamptz,
  add column if not exists closed_at timestamptz;
comment on column public.offline_tests.status is
  '배포 게이트 — draft(학생 비노출·편집 가능) / published(노출·문항 잠금·결과 입력) / closed(결과 열람만)';

-- Phase 1 S1 — SRS 1회 적용 마커 (문제·OX 두 축 공통).
-- 정책: SRS 는 성적이 아니라 복습 스케줄 — result 당 1회 적용, 정정·철회에도 재적용/되돌림 없음.
alter table public.offline_test_results
  add column if not exists srs_applied_at timestamptz;

-- 학생 SELECT 정책 — draft 차단 (staff 정책 무변경).
-- ★ 'published' 단독이 아니라 <> 'draft' 인 이유: closed 후에도 학생이 자기 결과 카드를
--   보려면 offline_tests 행이 읽혀야 한다.
drop policy if exists offline_tests_select_member on public.offline_tests;
create policy offline_tests_select_member
  on public.offline_tests for select
  to authenticated
  using (
    deleted_at is null
    and status <> 'draft'
    and exists (
      select 1 from public.cohort_members cm
      where cm.cohort_id = offline_tests.cohort_id
        and cm.profile_id = auth.uid()
    )
  );

drop policy if exists offline_test_questions_select_member on public.offline_test_questions;
create policy offline_test_questions_select_member
  on public.offline_test_questions for select
  to authenticated
  using (
    exists (
      select 1 from public.offline_tests t
      join public.cohort_members cm on cm.cohort_id = t.cohort_id
      where t.test_id = offline_test_questions.test_id
        and t.deleted_at is null
        and t.status <> 'draft'
        and cm.profile_id = auth.uid()
    )
  );
```

**롤백**:

```sql
-- 정책 원복 (scripts/sql/20260705_offline_tests_member_read.sql ·
--   20260705_offline_test_questions_member_read.sql 원문 재적용)
drop policy if exists offline_tests_select_member on public.offline_tests;
create policy offline_tests_select_member on public.offline_tests for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.cohort_members cm
    where cm.cohort_id = offline_tests.cohort_id and cm.profile_id = auth.uid()));
drop policy if exists offline_test_questions_select_member on public.offline_test_questions;
create policy offline_test_questions_select_member on public.offline_test_questions for select to authenticated
  using (exists (
    select 1 from public.offline_tests t
    join public.cohort_members cm on cm.cohort_id = t.cohort_id
    where t.test_id = offline_test_questions.test_id
      and t.deleted_at is null and cm.profile_id = auth.uid()));
-- 컬럼 제거
alter table public.offline_tests drop column if exists status,
  drop column if exists published_at, drop column if exists closed_at;
alter table public.offline_test_results drop column if exists srs_applied_at;
```

### 4.3 M4 — 구 컬럼 제거 (검증 통과 + 별도 확인 후)

```sql
alter table public.offline_test_results drop column if exists wrong_ords;
-- 롤백: add column wrong_ords integer[] not null default '{}';  (0행 전제라 무손실)
```

## 5. 배포 순서와 무중단 검증

| 단계 | 내용 | 검증 |
|---|---|---|
| ① M1+M2 적용 | additive 컬럼/테이블 + RLS 교체. `run-prod-sql.mjs`는 파일 전체를 Management API 단일 요청으로 보내며 **명시 트랜잭션 래핑은 없다** — 원자성이 필요한 M2(컬럼+정책 교체)는 파일에 `begin; … commit;`을 명시해 실행한다 | `npm run db:typegen` → `database.types.ts` 재생성 |
| ② 코드 배포 | T1 전환 + T2 API/화면 + S1 배치 | typecheck + `react-router build`(★서버모듈 경계) + V1~V9 |
| ③ M4 적용 | `wrong_ords` 제거 | 사람 확인 후 별도 실행 → typegen 재실행 |

**혼합 상태 안전성**:

| 조합 | 판정 |
|---|---|
| 구 코드 + 신 스키마 (①~② 사이) | **안전** — 구 코드는 `wrong_ords`(잔존)·기존 컬럼만 읽고 쓴다. 신설 컬럼은 default 보유(`status='draft'`, `wrong_question_ids='{}'`), NOT NULL 위반 없음. RLS 강화는 학생 노출을 줄이는 방향인데 현재 살아있는 시험지 0건이라 체감 무영향. 단 이 구간에서 스태프가 새 시험지를 만들면 draft로 태어나 학생에게 안 보임 — **의도와 일치**(배포 버튼은 ②에서 생기므로, 구간을 짧게 가져가고 스태프에게 사전 공지) |
| 신 코드 + 구 스키마 | **불가** — 신설 컬럼/테이블 부재로 select/insert 실패. ①→② 순서 강제 |
| ② 후 + `wrong_ords` 잔존 (③ 전) | **안전** — 신 코드는 wrong_ords를 참조하지 않고, 컬럼은 default '{}'로 조용히 남는다 |
| ③ 후 | 구 코드로 롤백 불가 지점 — 그래서 ③은 검증(V1~V9) 통과 + 사람 확인 후에만 |

**적용 전 최종 재확인(Stage 2 첫 작업)**: `offline_test_results` 0행 재실측 — 0이 아니면 중단·보고(시한부 규약).

---

## 승인 요청 사항 (게이트)

1. **T1 A/B 선택** (§1 비교표)
2. T2 RLS를 지시서 자구(`status='published'`)가 아닌 **`status <> 'draft'`** 로 설계한 것 (§2.4 사유)
3. S1 부분 실패 창 수용 정책 (§3.2)
4. B3에서 과제("종합반 문제 제작 테스트") 잔존 처리 — 유지(현행) / 운영자 수동 삭제
