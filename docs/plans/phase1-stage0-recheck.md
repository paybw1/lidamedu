# Phase 1 Stage 0 — 사전 재확인 결과

> 실측일: 2026-08-12 · **읽기 전용** (코드·DB 변경 0건 — DB 접근은 전부 SELECT, 스크립트 `tmp/audit-phase0b/stage0-recheck*.mjs` 보존)
> 근거 감사: `docs/audits/offline-integration-phase0b-delta.md` (같은 날 작성)
> ※ 지시서가 선행 문서로 지정한 `오프라인학습_통합설계서_v0.2.md`는 리포 내에서 발견되지 않음(전체 glob 무결과). 확정 결정 E1~E6은 지시서 본문 기재값을 그대로 따랐다.

## ⚠️ 최상단 표기 — B3: 테스트용 시험지가 실제 학생 9명에게 노출 중

살아있는 시험지 3건("123"·"123123"·"1414")은 전부 실운영 반 **"27년대비 1차 종합반"(학생 9명 + manager 1명)** 의 살아있는 과제 **"종합반 문제 제작 테스트"**(마감 2026-07-12 경과, target_profile_id NULL=반 전체 대상)에 붙어 있고, 노출을 막는 조건이 코드·RLS 어디에도 없다. 상세는 §0-4.

## 판정 요약

| # | 확인 | 실측 | 판정 |
|---|---|---|---|
| 0-1 | offline_test_results 행 수 | **0행** | ✅ **게이트 통과** — T1 무료 수정 창 유효 |
| 0-2 | offline_tests | 총 33 / soft-delete 30 / 살아있음 3 (최근 쓰기 2026-08-06) | 참고 — 감사 시점과 동일 |
| 0-3 | offline_test_questions | 646행 (최근 30일 410, 최근 2026-08-06) | 참고 — 동일 |
| 0-4 | B3 살아있는 시험지 학생 노출 | **노출 중** (아래 실증) | ⚠️ T2의 시급성 근거 |
| 0-5 | wrong_ords·ord 참조 지점 | 감사 §7.1 목록과 일치, **신규 지점 없음** | ✅ T1 설계 전제 유효 |
| 0-6 | SRS 함수 시그니처 | 확인 완료 + **설계 유의점 1건 발견**(OX는 별도 SRS 축) | ✅ S1 설계 가능 — §0-6 필독 |

## 0-1. offline_test_results = 0행 [실측]

`select count(*) from offline_test_results` → **0**. 지시서 게이트 조건 충족 — T1(ord 의존 해소)은 기존 결과 데이터 마이그레이션 없이 진행 가능한 상태가 유지되고 있다.

## 0-2 / 0-3. 시험지·문항 규모 [실측]

- offline_tests: 33건(soft-delete 30, 살아있음 3). 최근 갱신 2026-08-06 — 감사 시점 이후 신규 생성 없음.
- offline_test_questions: 646행, 최근 30일 쓰기 410건 — 스태프 편성 실험이 계속 활발함. **창이 열려 있을 때 T1을 끝내야 한다는 시한부 전제 유효.**

## 0-4. B3 — 살아있는 시험지의 학생 노출 [실증: 노출 중]

**데이터 측 (SELECT 실측)**: 살아있는 3건 모두 —

| 시험지 | 과목 | 문항 | 반 | 과제 | 반 학생 수 |
|---|---|---|---|---|---|
| "123" | civil | OX 10 | 27년대비 1차 종합반 (미삭제·미보관) | "종합반 문제 제작 테스트" (미삭제, 마감 2026-07-12 경과, 반 전체 대상) | **9명** |
| "123123" | patent | 빈칸 50 | 〃 | 〃 | 9명 |
| "1414" | chemistry | **객관식 30 (전-객관식)** | 〃 | 〃 | 9명 |

**코드 경로 측 (추적 실증)** — 노출을 막는 조건이 어느 단계에도 없다:

1. 과제 목록 `/assignments`: `listStudentAssignments`(`app/features/assignments/queries.server.ts:821-842`)는 반 멤버십 + `deleted_at IS NULL` + 개인과제 필터만 — **마감 경과·상태 필터 없음**. 마감이 지난 이 과제는 미완료 상태라 "진행 중" 섹션(`student-assignments.tsx:57-59`의 `pending` 필터)에 그대로 뜬다.
2. 과제 상세 `getStudentAssignment`(:890-907): 멤버십 검증뿐.
3. 상세 화면 loader(`student-assignment-detail.tsx:43-47`)가 `listMyOfflineTestsForAssignment`(`offline-tests/results.server.ts:137-196`)를 호출 — 필터는 `assignment_id` + `deleted_at IS NULL`뿐. 시험지 3건의 카드(제목 "123"·"123123"·"1414")가 렌더된다.
4. RLS `offline_tests_select_member` / `offline_test_questions_select_member`: 반 멤버 + `deleted_at IS NULL` — **배포 상태 개념 자체가 없음**(감사 §4.6).
5. "1414"는 전-객관식(`allMcq=true`)이고 결과 행이 없으므로 **온라인 응시 버튼까지 활성**(`student-assignment-detail.tsx:196-203` — 감사 §3 R17) — 학생이 실제로 응시를 시작하면 quiz_session + attempt가 생성되어 학습 신호(약점·마스터리)에 합류한다.

> **함의**: T2(배포 게이트)는 예방이 아니라 **현재 진행형 노출의 해소**다. 다만 본 Stage는 읽기 전용이므로 조치(예: 해당 시험지 soft-delete 또는 과제 분리)는 하지 않았다 — Stage 1 승인 전에 **운영자가 수동으로 임시 정리할지**는 사람 결정 사항으로 남긴다.

## 0-5. wrong_ords·ord 참조 지점 전수 재확인 [일치 — 신규 없음]

`wrong_ords|wrongOrds` 전수 grep(app/) 결과를 감사 §7.1-(b)①과 대조:

| 구역 | 지점 | 감사 대비 |
|---|---|---|
| 저장·산출 | `offline-tests/results.server.ts` :25(타입) :38·:47(목록 select) :204·:283(온라인 프리필) :293(입력 타입) :418(wrongSet) :434·:464·:598(upsert) | 일치 (감사의 L466은 현재 L464 — 라인 드리프트뿐) |
| 화면 | `admin/screens/admin-offline-test-results.tsx` :98 :108(문항별 통계) :202 :238 :255(그리드 상태·저장 페이로드) | 일치 |
| API 검증 | `admin/api/offline-test.tsx` :273(zod `wrongOrds: int 0..998, max 500`) | 일치 |

- `ord`를 재부여·스왑하는 함수(`compactOrds`·`moveTestQuestion`, `offline-tests/queries.server.ts:373-431`)는 여전히 결과 스냅샷을 갱신하지 않으며, `offline_test_results`에 쓰는 코드는 results.server.ts 3개 upsert 외에 없음(전수 grep — 그 외 참조는 monthly-report·series·queries의 읽기 4건). **T1 설계 전제(수정 지점 지도) 그대로 유효.**
- 감사 이후 신규 참조 지점 없음 (최근 커밋에도 offline-tests 변경 없음).

## 0-6. SRS 함수 시그니처 [확인 + 설계 유의점 1건]

**`applyProblemSrsUpdate`** (`app/features/study/srs.server.ts:18-64`):

```ts
export async function applyProblemSrsUpdate(
  client: SupabaseClient<Database>,
  userId: string,
  problemId: string,
  isCorrect: boolean,
): Promise<void>
```

- **단건 전용** — 건당 SELECT(maybeSingle) 1회 + upsert 1회 = 2쿼리. 배치 API 없음. → 지시서 S1-1의 우려(1,200회 = 2,400쿼리) 실재. Stage 1에서 배치 경로 설계 필요.
- best-effort try/catch (실패해도 attempt는 성공) + `console.error` 로깅.
- **멱등성 없음**: `computeNextSrsState({prev, isCorrect})`로 reps/interval을 매 호출 누적 — 동일 성적 재저장 시 이중 적용됨(지시서 S1-3의 우려 실재).

**`recordProblemAttempt`** (`app/features/study/queries.server.ts:438-488`):

```ts
export async function recordProblemAttempt(
  client, userId,
  input: { problemId; selectedChoiceId; selectedChoiceIndex;
           selectedBoxItemId?; oxAnswer?; isCorrect; mode?; timeSpentMs?; sessionId?; },
): Promise<void>
```

- attempt insert 후 SRS 훅이 **두 갈래로 분기**한다(:468-487):
  - `oxAnswer == null`(객관식) → `applyProblemSrsUpdate` — **problem 단위, `user_problem_srs`**
  - `oxAnswer != null`(OX) → `applyOxRefSrsUpdate`(`app/features/study/ox-srs.server.ts:17`) — **ref(choice/box_item) 단위, `user_ox_ref_srs` 별도 테이블**

> ★**S1 설계 유의점 (지시서가 명시하지 않은 사실)**: 지시서 S1-4 "적용 범위 mcq·ox"에서 **ox의 SRS는 `user_problem_srs`가 아니라 `user_ox_ref_srs`(ref 단위) 축**이고, 복습 큐도 다르다 — V1의 판정 함수 `getDueProblems`(srs.server.ts:82-95)는 `user_problem_srs`만 읽으며 OX 복습은 별도 화면(`/study/srs/ox`, srs-ox-review)이 소비한다. 오프라인 attempt는 ox_ref_id(choice/box)를 이미 보존하므로(감사 §5.3 스니펫) ref 단위 갱신에 필요한 입력은 갖춰져 있다. **Stage 1에서 "ox 합류"의 목표 축(problem SRS vs ox-ref SRS)과 V1 검증 방법(mcq=getDueProblems / ox=OX 복습 큐)을 분리 정의해야 한다.**

## 게이트 판정

**0-1 = 0행 → Stage 1 진행 가능.** 사람 승인을 기다린다.

승인 시 Stage 1에서 결정이 필요한 사항 미리보기: ① T1 A/B안 선택(비교표 제출 예정) ② B3 노출 중 시험지 3건의 임시 처리 여부(수동 정리 vs T2 배포 게이트로 일괄 해소) ③ S1의 ox 합류 목표 축 정의(§0-6 유의점).
