# Phase 0-B 델타 감사 결과 — offline_tests 갭 감사

> 감사일: 2026-08-12 · 감사자: Claude Code · **읽기 전용 감사** (코드·스키마·데이터 무변경, DB 접근은 전부 SELECT)
> 선행: `docs/audits/offline-integration-phase0-report.md` 항목 A·F·H의 후속 델타
> 조사 방법: 운영 DB(mcgdoplo) SELECT 실측(tmp/audit-phase0b/*.mjs, Management API 경유) + 코드 전수 정독(병렬 조사 4트랙)

---

## 1. 결론 한 줄

**기존 offline_tests 계열은 지필 요구사항 18개 중 완전 구현 8·부분 구현 4·미구현 6이며, ★최우선 항목 R11(약점 합류)은 실증 확인·R12(마스터리)는 정답률 축만 합류(SRS 축 우회로 `mastered` 도달 불가)다. 남은 핵심 갭은 ① 외부 출제 문항 직접 등록 계열(R2·R3·R4) 전무 ② 부분점수·서술형(R16)·시험지 상태 관리(R18) 전무 ③ SRS/mastered 우회(직접 insert가 `recordProblemAttempt` 훅을 건너뜀) ④ 온라인 병행 응시의 클라이언트 채점(H-2 — 단 오염 실적 0건) 네 갈래다.** 아울러 Phase 0의 "실사용 33건" 판정은 정정한다 — 시험지 33건은 전부 manager 계정의 편성 실험(30건 soft-delete)이고 **응시 결과(offline_test_results)는 0행**이므로, 스키마 확장의 데이터 이행 부담은 사실상 없다.

## 2. R11/R12 판정 ★ (노드 신호 합류 — 코드 실증)

두 항목 모두 추정이 아니라 함수 정의·쿼리 전문 확인으로 판정했다.

### R11 getWeakNodes — **합류함 [실증]** (mcq·ox 한정)

- 저장 측: `app/features/offline-tests/results.server.ts:304` `saveOfflineTestResults`가 학생 명의의 `quiz_sessions`(mode `exam`, `scope_payload.source='offline_test'`, results.server.ts:479-500) + `user_problem_attempts`(mcq·ox, results.server.ts:521-547·563-568)를 기록한다. 파일 헤더 주석(1-6행)이 "약점 진단·마스터리·반 통계가 수정 없이 오프라인 결과를 포함하게 한다"는 설계 의도를 명시.
- 읽기 측: `getWeakNodes`(`app/features/subjects/lib/weak-nodes.server.ts:61`)의 attempt 소스는 `fetchUserAttemptTotals`(같은 파일 38-59행) 하나이며 쿼리 필터는 **`.eq("user_id", userId)` 단독** — `session_id`/`mode`/source 조건이 코드상 존재하지 않는다. 오프라인 유래 attempt는 그대로 걸린다.
- 한계: **빈칸(blank) 문항은 `user_blank_attempts`로 저장**(results.server.ts:548-560·569-574)되는데 getWeakNodes는 이 테이블을 읽지 않음 → 빈칸 결과는 약점에 미합류.

### R12 단원 마스터리 — **부분 합류 [실증]**: 정답률·시도는 합류, `mastered` 단계는 구조적으로 도달 불가

- `getNodeMastery`(`app/features/study/mastery.server.ts:63`)의 attempt 소스 `fetchLatestAttempts`(44-51행)도 **`user_id` 단독 필터**(problem_id별 최신 1건 dedup) → 정답률·시도 수에는 오프라인 결과가 합류한다. 지필 결과만으로 `familiar`(시도≥5·정답률≥70%, `app/features/study/lib/mastery.ts:6-9·44) 도달 **가능**.
- 그러나 `mastered`는 `srsReps >= 2`(노드 내 SRS 평균 reps, mastery.server.ts:127-139·177)를 추가로 요구하는데, `user_problem_srs`를 쓰는 유일한 함수 `applyProblemSrsUpdate`(`app/features/study/srs.server.ts:18`)의 유일한 호출처는 `recordProblemAttempt`(`app/features/study/queries.server.ts:470-478`)다. `saveOfflineTestResults`는 이 훅을 **호출하지 않고 `user_problem_attempts`에 직접 insert**하며, attempts→srs DB 트리거도 없다(sql/·scripts/sql/·supabase/ 전수 grep — 참조는 주석 2건뿐). → **오프라인 결과만으로는 `mastered`·게임화 레벨(마스터 단원 수 파생, `gamification.server.ts:54`)이 오르지 않고, 오답이 SRS 복습 큐(`getDueProblems`는 `user_problem_srs`만 읽음, srs.server.ts:87-95)에도 뜨지 않는다.**

### R13 getCohortWeakNodes — **합류함 [실증]**

`app/features/admin/queries/cohort-weakness.server.ts:39`, attempt 소스 `fetchLatestAttemptsForProfiles`(89-115행) 필터는 `.in("user_id", 반 멤버)` 단독. (학생,문제) 최신 1건 dedup 후 합류.

### 가중치 동일성 — 소스별 차등 없음, 단 dedup 정책 차이로 반영 강도가 갈림 [실증]

세 함수 어디에도 source 기반 가중/제외 분기가 없다. 차이는 dedup뿐:

| 함수 | dedup | 오프라인 attempt 기여 |
|---|---|---|
| getWeakNodes | 없음(전 시도 합산) | 온라인 1회와 동일한 +1 |
| getNodeMastery | problem별 최신 1건 | 최신일 때만 반영 |
| getCohortWeakNodes | (user,problem) 최신 1건 | 동일 |

부작용: 오프라인 attempt의 `attempted_at`은 **시험일 정오 KST로 백데이트**(results.server.ts:318)되므로, 학생이 그 뒤 같은 문제를 온라인으로 풀면 latest-dedup 함수(R12·R13)에서는 오프라인 결과가 밀려나고 R11에서는 둘 다 남는다 — 세 신호 간 반영 강도가 서로 다르다.

또한 attempt 행 자체에는 `source` 컬럼이 없어(database.types.ts의 user_problem_attempts Row 전체 확인) 오프라인 유래 여부는 `session_id → quiz_sessions.scope_payload->>'source'` 조인으로만 구분 가능하다.

노드 귀속: attempt에 node_id를 저장하지 않고 읽기 시점에 `problems.primary_node_id`/`primary_article_id`로 파생(SSOT `attributeProblemNodes`, `app/features/subjects/lib/problem-node-attribution.server.ts`). 단 폴백 배수 규칙이 R11/R13은 `"all"`, R12는 `"first"`로 다르다(mastery.server.ts:102).

## 3. 기능 갭 매트릭스 (R1~R18)

전수 판정. 참조 코드는 리포 상대경로(라인은 조사 시점 기준). "구현됨/부분/미구현"은 코드·DDL 실증 기준이며, 문서 서술만으로 판정한 항목은 없다.

| # | 요구사항 | 판정 | 코드 경로 | 비고 |
|---|---|---|---|---|
| R1 | 문제은행에서 문항 선택해 시험지 편성 (D1-a) | **구현됨** | `app/features/offline-tests/queries.server.ts` `addTestQuestions`(L310-356)·후보 탐색 `listMcqCandidates`(L759)/`listOxCandidates`(L852)/`listBlankCandidates`(L943)/자과(L815), API `admin/api/offline-test.tsx` `add_questions`(L178-192)·`auto_pick`(L195-245) | 콘텐츠 복제 없이 FK 참조(mcq=problem_id / ox=ox_ref_type+ox_ref_id+ox_problem_id / blank=blank_set_id). 노드 subtree+중요도 필터·자동 추출 지원. 후보는 `review_status='approved'`만(L784 등) |
| R2 | 외부 출제 문항 직접 등록 (D1-b) | **미구현** | — (차단 근거: DDL `offline_test_questions_ref_check`, `scripts/sql/20260705_offline_tests.sql:42-51`) | CHECK가 3종 FK 참조만 허용, 자유 입력 본문 컬럼 자체가 없음. 유일한 우회=문제은행 신규 출제(`admin/api/problem-create.tsx`)인데 별개 흐름 + 승인 전엔 후보에 안 뜸 |
| R3 | 외부 등록 문항에 노드 태깅 강제 | **미구현** | — | 등록 경로가 없어 강제 지점도 없음. 참고: `problem-create.tsx:104-120`의 문제은행 신규 출제 INSERT에도 `primary_node_id` 없음 — 신규 출제 자체가 노드 태깅 미강제 |
| R4 | 외부 문항의 문제은행 편입 여부 제어 | **미구현** | — | 편입 개념·플래그 부재 (`database.types.ts` offline_test_questions Row 전체 확인) |
| R5 | 시험지 인쇄/PDF 출력 | **구현됨** | `admin/screens/admin-offline-test-print.tsx` — `window.print()`(L305-308)·`@media print`+`@page`(L314-320)·`?answers=1` 정답해설지(L49)·빠른 채점표(L270-298)·성명 기입란(L370-381); 데이터 `getOfflineTestPrintData`(queries.server.ts:490-671) | 브라우저 인쇄 방식. **서버측 PDF 렌더러 없음**(안내문 L324-327) |
| R6 | 학생이 자기 답안 번호를 직접 입력 | **부분 구현** | 온라인 응시만: `assignments/api/offline-test-online.tsx`(mcq 전용 게이트 L46-54 → 일반 러너 redirect L79-82) | **지필 시험의 OMR형 자기 답안 입력 화면은 없음**(학생 접점은 결과 조회 + 전-객관식 온라인 응시뿐). 문서도 OMR/CSV 입력을 범위 밖으로 명시(feat-7-042.md L128) |
| R7 | 상담자/관리자가 답안을 대리 입력 | **구현됨** | `admin/screens/admin-offline-test-results.tsx` — 학생×문항 그리드, 오답 ord 토글(L418-441)·상태 select(L388-408)·일괄 응시 처리(L217-224)·응시일 입력(L288-295) → API `save_results` | 권한: staff + 반 소유권 + 멤버십 재검증(offline-test.tsx:86-102·295-306) |
| R8 | 서버 측 자동 채점 | **부분 구현** | 점수 계산은 서버: `results.server.ts:518-519` `correct = !wrongSet.has(q.ord)` → `score += points`. 클라 점수 미수신(페이로드는 wrongOrds뿐, API zod L269-279) | **정답지 자동 대조는 없음** — 지필 흐름의 정오 원천은 staff가 입력한 오답 ord(사람 판정). 학생 답안이 서버에 없으므로 R6(답안 입력)이 생기기 전엔 자동 채점 자체가 성립 불가. 온라인 응시 경유분은 클라 채점값이 프리필로 역류(§5.2) |
| R9 | **문항별 정오(is_correct) 저장** | **구현됨(이중)** | 스냅샷: `offline_test_results.wrong_ords integer[]`(저장 L434·L466·L598) / 원본: `user_problem_attempts.is_correct`(mcq·ox)·`user_blank_attempts.is_correct`(빈칸, 세트 전 blank_idx 동일값 L551-560) | 오답 ord 배열만 — 선택 답안·문항별 점수는 미보존(오답 시 selected_choice_id=null, L529-530). ord 키의 리매핑 위험은 §7.1-② |
| R10 | **문항별 node_id 귀속 저장** | **미구현(파생 상속으로 실효 충족)** | 문항 행에 노드 컬럼 없음(database.types.ts Row 확인). 노드는 후보 탐색 필터로만 사용(`subtreeNodeIds` L677-699·`problemIdsForNode` L701-730) | 귀속은 읽기 시점에 `user_problem_attempts.problem_id → problems.primary_node_id`(+조문 링크 폴백)로 파생 — 문제은행 문항은 실효 귀속됨. 외부 문항(R2)이 생기면 이 상속이 끊기므로 그때 저장 컬럼 필요 |
| R11 | **★ 결과가 getWeakNodes로 합류** | **구현됨 [실증]** | §2 참조 — `weak-nodes.server.ts:38-59` user_id 단독 필터 | mcq·ox 한정(빈칸 미합류) |
| R12 | **★ 결과가 단원 마스터리 계산에 합류** | **부분 구현 [실증]** | §2 참조 — 정답률·시도 합류 / `mastered`·레벨·SRS 큐 불가(`recordProblemAttempt` 훅 우회) | 합류시키려면(기록만): saveOfflineTestResults가 attempt insert 후 `applyProblemSrsUpdate` 호출 추가, 또는 attempts→srs 트리거 신설 |
| R13 | 결과가 코호트 약점(getCohortWeakNodes)에 합류 | **구현됨 [실증]** | §2 참조 — `cohort-weakness.server.ts:89-115` | (user,problem) 최신 1건 dedup |
| R14 | 회차/코호트 스코핑 | **구현됨** | `offline_tests.cohort_id NOT NULL`(DDL L8) + `offline_test_series`·`series_id/series_round_no`(`20260706_offline_test_series.sql`), 회차 자동 채번 `assignTestToSeries`(series.server.ts:79-88), 교차 반 차단(offline-test.tsx:143-151), 추이 `getSeriesTrend`(L135-258) | 석차·백분위는 조회 시 계산(저장 안 함) |
| R15 | 재응시 처리 | **부분 구현(덮어쓰기)** | `UNIQUE(test_id,user_id)`(DDL L74) + 전 저장이 upsert(onConflict, L440·L470·L604), 세션 재사용·attempt delete 후 재기록(L387-412·L503-508) | 응시 이력·차수 없음 — 재입력=덮어쓰기. taken→absent 철회 시 빈칸 시도는 세션 컬럼이 없어 **철회 불가**(append-only, 주석 L570·문서 명시) |
| R16 | 부분점수 / 서술형 처리 | **미구현** | — (차단 근거: 문항 all-or-nothing `if (correct) score += points` L519, `question_type CHECK ('mcq','ox','blank')` DDL L31) | 문제은행의 subjective format은 후보 쿼리가 배제(L785). 문서도 범위 밖 명시 |
| R17 | 응시 결과의 학생 대시보드 노출 | **구현됨** | `/assignments/:id` `student-assignment-detail.tsx:43-48·163-210`(`listMyOfflineTestsForAssignment` — score/max_score/status/taken_at만 select, **wrong_ords 비노출**) + `/assignments` 회차 추이 카드 `getMySeriesTrend`(series.server.ts:273-306) | RLS `select_own` + 반 평균은 adminClient 집계(개인 비식별) |
| R18 | 시험지 상태 관리 (초안/배포/마감) | **미구현** | — (offline_tests 컬럼 전체에 상태·published_at·closed_at 없음, 생명주기는 deleted_at뿐) | **배포 게이트 부재** — 생성 즉시 RLS 멤버 read로 학생 과제 상세에 노출됨. 상태값은 결과 행(`taken/absent`)에만 존재 |

집계: 구현 8 (R1·R5·R7·R9·R11·R13·R14·R17) / 부분 4 (R6·R8·R12·R15) / 미구현 6 (R2·R3·R4·R10·R16·R18).

### 3.1 문서 서술 vs 코드 실증 차이 (확장 설계 시 문서를 그대로 믿으면 안 되는 지점)

- `docs/features/feat-7-042-offline-test.md` L57의 `UNIQUE(test_id, ord)`는 **실제 DDL에 없다** — 일반 인덱스뿐이고 코드 주석(queries.server.ts:415)도 이를 인지("unique 제약은 없지만 규칙 유지").
- `SPEC.md` L537 "테이블 3종" — 실제는 4종(`offline_test_series`가 미반영).
- 문서의 "✅ 전 단계 구현 완료"는 문서가 정의한 범위(빌더·인쇄·결과입력·통계)에 한해 정확하며, R2/R3/R4/R16/R18은 애초에 그 범위 밖이었다.
- 참조 지형: 4개 테이블에 SQL을 치는 코드는 6파일 집중(`offline-tests/queries.server.ts`·`results.server.ts`·`series.server.ts`, API 2, 월간 리포트 1), **cron 참조 0건·RPC 경유 0건**.

## 4. offline_tests 스키마 전문

운영 DB(mcgdoplo) `information_schema`·`pg_constraint`·`pg_indexes`·`pg_policies` 직조회 결과 전문. RLS는 4개 테이블 모두 enabled.

### 4.1 offline_test_series (1행 · 최근30일 쓰기 0)

| # | 컬럼 | 타입 | NULL | 기본값 |
|---|---|---|---|---|
| 1 | series_id | uuid | NO | gen_random_uuid() |
| 2 | cohort_id | uuid | NO | — |
| 3 | title | text | NO | — |
| 4 | created_by | uuid | YES | — |
| 5 | created_at | timestamptz | NO | now() |
| 6 | deleted_at | timestamptz | YES | — |

- PK(series_id) · FK cohort_id→cohorts ON DELETE CASCADE · FK created_by→profiles ON DELETE SET NULL
- 인덱스: `(cohort_id) WHERE deleted_at IS NULL`

### 4.2 offline_tests (33행 · 최근30일 16 · **soft-delete 30건**)

| # | 컬럼 | 타입 | NULL | 기본값 |
|---|---|---|---|---|
| 1 | test_id | uuid | NO | gen_random_uuid() |
| 2 | assignment_id | uuid | NO | — |
| 3 | cohort_id | uuid | NO | — |
| 4 | title | text | NO | — |
| 5 | law_code | text | YES | — |
| 6 | duration_min | integer | YES | — |
| 7 | instructions_md | text | YES | — |
| 8 | created_by | uuid | YES | — |
| 9 | created_at | timestamptz | NO | now() |
| 10 | updated_at | timestamptz | NO | now() |
| 11 | deleted_at | timestamptz | YES | — |
| 12 | science_subject | text | YES | — |
| 13 | series_id | uuid | YES | — |
| 14 | series_round_no | integer | YES | — |

- CHECK: `law_code IN ('patent','trademark','design','civil','civil-procedure')` · `science_subject IN ('physics','chemistry','biology','earth_science')` · **`subject_xor`: (law_code IS NOT NULL) <> (science_subject IS NOT NULL)**
- FK: assignment_id→assignments CASCADE(★과제에 종속 — 시험지는 항상 과제 1건에 붙는다) · cohort_id→cohorts CASCADE · created_by→profiles SET NULL · series_id→offline_test_series SET NULL
- 인덱스: `(assignment_id)`, `(cohort_id)`, `(series_id, series_round_no)` — 모두 `WHERE deleted_at IS NULL` 부분 인덱스

### 4.3 offline_test_questions (646행 · 최근30일 410 · 유형: mcq 299 / ox 275 / blank 72)

| # | 컬럼 | 타입 | NULL | 기본값 |
|---|---|---|---|---|
| 1 | question_id | uuid | NO | gen_random_uuid() |
| 2 | test_id | uuid | NO | — |
| 3 | ord | integer | NO | — |
| 4 | points | numeric | NO | 1 |
| 5 | question_type | text | NO | — |
| 6 | problem_id | uuid | YES | — |
| 7 | ox_ref_type | text | YES | — |
| 8 | ox_ref_id | uuid | YES | — |
| 9 | ox_problem_id | uuid | YES | — |
| 10 | blank_set_id | uuid | YES | — |
| 11 | created_at | timestamptz | NO | now() |

- CHECK `question_type IN ('mcq','ox','blank')` · `ox_ref_type IN ('choice','box')`
- CHECK `offline_test_questions_ref_check` (문항 유형별 참조 XOR — 전문):
  - mcq → problem_id NOT NULL, 나머지 참조 전부 NULL
  - ox → ox_ref_type·ox_ref_id·ox_problem_id NOT NULL, problem_id·blank_set_id NULL
  - blank → blank_set_id NOT NULL, 나머지 NULL
- FK: test_id→offline_tests CASCADE · problem_id→problems CASCADE · ox_problem_id→problems CASCADE · blank_set_id→article_blank_sets CASCADE
- 인덱스: `offline_test_questions_test_idx (test_id, ord)` — **일반 인덱스**. 문서(feat-7-042.md)의 `UNIQUE(test_id, ord)` 표기와 달리 유일 제약이 아니다(§3.1).
- **모든 문항이 기존 콘텐츠(문제은행/OX/빈칸세트)의 FK 참조다. 자유 입력 문항(지문·선지 직접 보유) 컬럼은 존재하지 않는다** → R2의 스키마 수준 부재 근거.

### 4.4 offline_test_results (**0행**)

| # | 컬럼 | 타입 | NULL | 기본값 |
|---|---|---|---|---|
| 1 | result_id | uuid | NO | gen_random_uuid() |
| 2 | test_id | uuid | NO | — |
| 3 | user_id | uuid | NO | — |
| 4 | status | text | NO | 'taken' |
| 5 | score | numeric | YES | — |
| 6 | max_score | numeric | YES | — |
| 7 | wrong_ords | integer[] | NO | '{}' |
| 8 | session_id | uuid | YES | — |
| 9 | taken_at | date | YES | — |
| 10 | note | text | YES | — |
| 11 | entered_by | uuid | YES | — |
| 12 | entered_at | timestamptz | NO | now() |

- CHECK `status IN ('taken','absent')`
- FK: test_id→offline_tests CASCADE · user_id→profiles CASCADE · **session_id→quiz_sessions SET NULL**(온라인 신호 합류의 연결 고리) · entered_by→profiles SET NULL
- **UNIQUE (test_id, user_id)** — 1시험 1결과. 재응시는 별도 행이 아니라 덮어쓰기 모델(R15 근거). 보조 인덱스 `(user_id)`.

### 4.5 관계도

```
cohorts ──< offline_test_series (회차 묶음, 선택적)
   │              │
   └──< assignments ──1:1──< offline_tests >── series_id (선택)
                                 │
                                 ├──< offline_test_questions ──FK──> problems(mcq)
                                 │                             ├──> problems+choice/box(ox)
                                 │                             └──> article_blank_sets(blank)
                                 │
                                 └──< offline_test_results (UNIQUE test×user)
                                          └── session_id ──> quiz_sessions(scope_payload.source='offline_test')
                                                                  └──< user_problem_attempts (mcq·ox 정오)
                                                                  └──< user_blank_attempts (빈칸 정오)
```

### 4.6 RLS 정책 요약

| 테이블 | 학생(수강생) | staff |
|---|---|---|
| offline_test_series | SELECT: 자기 반(cohort_members) + deleted_at IS NULL | ALL: `private.is_staff()` |
| offline_tests | SELECT: 자기 반 + deleted_at IS NULL | ALL |
| offline_test_questions | SELECT: 해당 시험이 자기 반 소속(+시험 미삭제) | ALL |
| offline_test_results | SELECT: `user_id = auth.uid()` 본인 것만 | ALL |

- 학생 write 정책은 4개 테이블 모두 **없음** — 쓰기는 전부 staff 경로(실제 저장 함수는 adminClient 사용). 강사의 "자기 반" 제한은 RLS가 아니라 애플리케이션 게이트 수준.

### 4.7 실사용 여부 판정 — **Phase 0 "실사용 33건" 정정**

- `offline_test_results` **0행** = 실제 응시(성적 입력) 이력이 한 번도 없음.
- 시험지 33건 표본 전수 확인: 제목이 "123", "1414", "테스트N", "특허법 ox 문제 작성 테스트2" 류이고 살아있는 3건 포함 전부 **manager 역할 계정("리담관리자") 생성**. 30/33건 soft-delete.
- 온라인 병행 세션(`offline_test_online`) 6건도 전부 동일 manager 계정, 전부 미완료(completed_at NULL), attempt 0건.
- **판정: "기능은 배포되어 스태프가 활발히 편성을 실험 중(최근 30일 문항 쓰기 410건)이나, 학생 대상 실사용·성적 데이터는 0건."** 최근 쓰기 수치(Phase 0의 '최근 30일 23건')는 실사용이 아니라 이 실험 활동이었다. → 확장 재설계 시 **데이터 이행·하위호환 부담이 사실상 없다**(스키마 변경 자유도 높음). 단 "정면 중복" 판정 자체(기능 중복)는 유지된다.

## 5. 온라인 병행 응시 오염 범위 (H-2)

### 5.1 경로 존재 여부 — 존재함 [실증]

`app/features/assignments/api/offline-test-online.tsx` — 학생이 과제 화면에서 지필 시험을 웹으로 응시하는 경로가 실제로 있다. **객관식(mcq) 전용**(다른 유형 포함 시 400, :46-54). `quiz_sessions`를 `scope_payload.source='offline_test_online'`(:68)으로 생성 후 **일반 문제 뷰어 러너로 리다이렉트**(:79-82).

### 5.2 채점 무결성 — 법률 과목은 클라이언트 채점 [실증]

- 리다이렉트된 일반 뷰어의 채점은 `/api/problems/attempt`(`app/features/problems/api/attempt.tsx`) 경유인데, 이 API는 `isCorrect`를 폼 필드(:17 `z.union([z.literal("true"), z.literal("false")])` → :40 `form.get("isCorrect")` → :55)에서 **무검증 수용**한다. 파일 전체(66줄)에서 DB 접근은 `auth.getUser()`뿐 — 선지 대조 코드가 없고, `selectedChoiceId`와 `problemId`의 소속 검증도 없다.
- 근본 원인: 정답이 클라이언트 페이로드에 있다. `app/features/subjects/screens/problem-viewer.tsx:795·804`가 로더가 내려준 `choice.isCorrect`를 그대로 전송하며, 시험 모드(`isExam`)에서도 정답 플래그는 마스킹되지 않는다(표시만 억제).
- 이 API를 지나는 5개 클라이언트 경로 **전부** 클라이언트 채점: ① 법률 객관식 뷰어(자습·시험·오프라인 온라인응시, problem-viewer.tsx:804) ② 모의/문제집 OMR 시트(mcq-pack-sheet.tsx:228) ③ OX 정오 패널(ox-questions-panel.tsx:451) ④ SRS OX 복습(srs-ox-review.tsx:92) ⑤ OX 시험 study 모드(mcq-pack-ox-exam.tsx:516).
- 대비되는 서버 권위 경로: 자연과학 객관식(science/problem-viewer.tsx:141-152, 스키마에 isCorrect 필드 자체가 없음) · OX 시험 exam 모드(mcq-pack-ox-exam.tsx:130-145 서버 재채점) · 지필 결과 입력(results.server.ts:518 `!wrongSet.has(q.ord)`, 운영자 입력 기반 서버 계산) · 빈칸(blanks/api/attempt 서버 채점). **같은 오프라인 시험이라도 자연과학이면 서버 채점, 법률이면 클라이언트 채점 — 과목에 따라 신뢰 모델이 갈린다.**
- ★부수 발견: **OX 오답노트**(`app/features/latest/screens/my-ox-wrong-note.tsx`)는 팩 OX 시험과 동일 구조인데 서버 재채점 블록만 없다 — `oxTruth`·`isCorrect` 둘 다 클라이언트 JSON(:42-49)에서 오고(:178 그대로 insert), duration 클램프도 없어(:141·169; 팩 시험엔 6h 클램프 존재 :58·176) 정오+시간+시작시각 3중으로 클라이언트를 신뢰하는 유일 경로다.

### 5.3 offline_test_results 저장 방식 — 이중 계상 방지 확인

온라인 응시 결과는 응시 시점에 `offline_test_results`로 들어가지 않는다. 운영자가 결과 입력 화면에서 "온라인 응시 불러오기"를 하면 스냅샷만 upsert되고 attempt는 재기록하지 않는다(results.server.ts:421-445 `entry.onlineSessionId` 분기, :443-444 continue). 반대로 지필 재입력·철회는 `source='offline_test'` 세션만 골라 attempt를 delete(:385-412·:449-455) — 온라인 응시 세션의 학생 기록은 보호된다.

### 5.4 오염 실적 — **0건 [실측]**

- 지필 유래 attempt: `offline_test_results` 0행 → 0건.
- 온라인 병행: `scope_payload->>'source' = 'offline_test_online'` 세션 6건 전부 manager 본인 테스트(미완료, attempt 0건). **학생 데이터 오염 없음.**
- 전체 대비 비율: user_problem_attempts 7,503건 중 오프라인 계열 유래 0건 (0%).

### 5.5 출처 사후 구분 가능성 — **부분 가능**

- 전용 컬럼은 없다. 구분자는 `quiz_sessions.scope_payload->>'source'` 문자열: 지필=`'offline_test'`(results.server.ts:489) / 온라인=`'offline_test_online'`(offline-test-online.tsx:68).
- 따라서 **세션에 연결된 attempt는 조인으로 구분 가능**하다. 단 ① attempt 행 단독으로는 불가(user_problem_attempts에 source 컬럼 없음) ② `session_id IS NULL`인 attempt(실측 6,852건/7,503건 = 91%)는 세션 자체가 없어 이 방식이 닿지 않는다 — 다만 이들은 자습 경로 유래이므로 현재로선 문제가 안 된다. ③ scope_payload는 JSONB 자유 필드라 인덱스·제약이 없다.
- 구분을 견고하게 하려면(기록만): user_problem_attempts에 source(또는 origin) 컬럼 신설, 혹은 quiz_sessions.scope_payload.source를 정식 컬럼으로 승격 + 인덱스. 현행 문자열 마커는 이미 방어 로직(results.server.ts:405)이 의존하는 사실상의 계약이므로 정식화 가치가 있다.

## 6. 학습시간 활동 유형 대조표 (F-2)

### 6.1 time_spent_ms 쓰기 경로 전수

`time_spent_ms` 컬럼은 전 스키마에서 `user_problem_attempts` 유일. 쓰기 경로(프로덕션):

| # | 경로 | 활동 | 값의 출처 |
|---|---|---|---|
| W1-a | `subjects/screens/problem-viewer.tsx:806-809` → `/api/problems/attempt`(:19·42·57) → `recordProblemAttempt`(study/queries.server.ts:453-464) | 법률 객관식(자습·시험 러너) | 클라이언트 `Date.now()-startedAtRef` — 상한 검증 없음(`.nonnegative()`뿐), 탭 방치 시간 포함 |
| W1-b | `latest/screens/mcq-pack-sheet.tsx:230` | 모의고사/문제집 OMR 시트 | 동일. ★버그성: startedAtRef가 시트 진입 시 1회만 세팅(:205) → 선지 클릭마다 "진입 후 누적시간"이 통째로 기록(문항별 아님, 중복 합산) |
| W1-c | `problems/components/ox-questions-panel.tsx:453-456` | OX 정오 패널(자습) | 클라이언트 측정 |
| W3-a | `latest/screens/mcq-pack-ox-exam.tsx:213·225` | OX 시험(exam) | 클라 총시간 `durationMs`를 서버가 문항수로 균등 분배. **6시간 클램프 있음**(:58·176) |
| W3-b | `latest/screens/my-ox-wrong-note.tsx:169·181` | OX 오답노트 재응시 | 동일 균등 분배, **클램프 없음** |

시간을 **기록하지 않는**(NULL) 경로: SRS OX 복습(srs-ox-review.tsx:89-97, 필드 미전송) · OX 시험 study 모드(mcq-pack-ox-exam.tsx:510-520) · **자연과학 객관식**(science/problem-viewer.tsx:146-152, 인자 자체를 안 넘김) · **오프라인 테스트 지필 입력**(results.server.ts:512-547, 필드 부재 — 지필이라 시간 개념 없음이 설계 의도).

비프로덕션 쓰기: 합격자 사례 합성 시드(`exam-results/seed.server.ts:186·192`, 난수 — admin 화면에서 실행 가능한 서버 코드라 완전 비프로덕션은 아님), 테스트 유저 시드, E2E 픽스처.

집계 소비처: `getDailyStudyStats`/`getDashboardKpis`(study/queries.server.ts:1860-1974), 코호트 백분위(cohort-percentile.server.ts), at-risk(exam-results/at-risk.server.ts) — **"학습시간" KPI의 실소스는 위 W1·W3뿐**.

### 6.2 활동 유형 대조표

| 오프라인 activity_type | 대응 온라인 집계 존재? | 소스 | 실데이터 유무 |
|---|---|---|---|
| lecture (강의 수강) | △ 존재하나 **학습시간 KPI 미합산** — 수강 잔여량 판정 전용 | `watch_ledger.seconds` — `lms/watch.server.ts:92-99`, **유일하게 서버 검증**(120s 상한·영상길이·멱등). `lesson_completions`는 시간 컬럼 자체 없음 | 3행·45초 (테스트 수준, 최근 2026-07-15) |
| review (복습) | △ 부분 | SRS OX 복습 = time_spent_ms NULL / SRS 카드 = `srs_review_logs.elapsed_ms`(srs/srs.server.ts:493-507, 클라 측정) — **집계 미사용(CSV 내보내기 전용)** | srs_review_logs 855행(전건 ms 채움) |
| problem (문제풀이) | ✅ **유일한 실집계 축** | `user_problem_attempts.time_spent_ms` (W1·W3) | 7,503행 중 5,000건 채움·최근 30일 5,984건 — 유일한 살아있는 축 |
| memorize (암기) | ❌ 없음 | `user_blank_attempts`(15,983행)·`user_recitation_attempts` 모두 시간 컬럼 부재 | — |
| essay (답안 작성) | △ 타이머 모드 한정·미합산 | `user_subjective_attempts.timed_elapsed_sec`(초 단위, study/queries.server.ts:943-946, 클라 측정) — 화면 표시 전용 | 7행(4건 채움) |
| reading (통독·조문/판례 열람) | ❌ 없음 | `study_sessions.duration_ms` 컬럼은 있으나 실사용자 write 경로 0 — `recordStudySession`(study/queries.server.ts:27-38)은 user_id+scope만 기록. `useStudyTimer`는 CLAUDE.md 문구일 뿐 **미구현**(코드 grep 0건) | **52,846행 전건 duration_ms NULL [실측]** |

### 6.3 판정

**대응 항목이 실질 1개(problem)뿐** — lecture는 축은 있으나 실데이터가 테스트 수준(45초)이고 KPI에 미합산, review·essay는 고립된 별도 단위(ms/초) 컬럼으로 집계에 안 들어가며, memorize·reading은 축 자체가 없다. → **지시서 판정 기준에 따라: 오프라인 로그와의 합산 총합은 상담자(운영자) 화면 전용으로 제한하고, 학생 화면과 모든 경쟁 지표(코호트 브래킷 등)에서 제외해야 한다.** "온라인+오프라인 총 학습시간"을 학생에게 보여주면 온라인 측이 문제풀이 시간만 세는 비대칭 때문에 오프라인 위주 학생과 온라인 위주 학생의 수치가 비교 불가능해진다.

부수 발견(Phase 0 duration_ms 단서의 완결): `study_sessions.duration_ms`를 **쓰는** 실사용자 코드는 0이지만, 합격자 사례 합성 시드(exam-results/seed.server.ts:226)는 값을 넣고, 합격자 분석(exam-results/analytics.server.ts:206·266·634·888·1411)은 그 값을 읽는다 → **실사용자에겐 항상 0, 시드된 합격자 행에선 그럴듯한 값이 나오는 비대칭**이 이미 존재한다.

## 7. 확장 파손 위험 (X-1) / 센티넬 영향 (X-2)

### 7.1 X-1 — offline_tests 계열 참조 코드 전수와 확장 분류

#### 참조 경로 전체 목록 (읽기/쓰기 구분)

**서버 쿼리 3파일 (쓰기 전부 여기+API 집중)**

| 파일 | 읽기 | 쓰기 |
|---|---|---|
| `app/features/offline-tests/queries.server.ts` | listOfflineTests(L46) · getOfflineTestWithQuestions(L165) · getOfflineTestPrintData(L490) · 후보 쿼리(L759-993, offline_test_* 미접촉) | createOfflineTest(insert L106) · updateOfflineTest(L132) · softDeleteOfflineTest(L151) · addTestQuestions(insert L351) · removeTestQuestion(delete L358) · compactOrds(update ord L373) · moveTestQuestion(update ord L396) · setTestQuestionPoints(L433) |
| `app/features/offline-tests/results.server.ts` | listOfflineTestResults(L31) · listCohortOfflineTestStats(L58) · listMyOfflineTestsForAssignment(L137, 학생 RLS) · getOnlineSessionPrefill(L208, adminClient) | saveOfflineTestResults(L304 — quiz_sessions insert·user_problem_attempts insert/delete·user_blank_attempts insert·offline_test_results upsert, §5.3·본 감사 §2 참조) |
| `app/features/offline-tests/series.server.ts` | listSeries(L17) · getSeriesTrend(L135) · getMySeriesTrend(L273) | createSeries(L55) · assignTestToSeries(update L89) |

**API 2 + 화면 7 + 리포트 1**: 쓰기는 전부 `app/features/admin/api/offline-test.tsx` POST 단일 진입(intent 11종: create_test/create_series/set_series/update_test/delete_test/add_questions/auto_pick/remove_question/move_question/save_results/set_points; staff 게이트→반 소유권→save_results 멤버십 재검증). `assignments/api/offline-test-online.tsx`는 읽기+quiz_sessions insert만. 화면: admin-offline-test-edit(빌더)·-print·-results·admin-assignment-edit·admin-cohort-stats·admin-cohort-test-series(운영자) / student-assignment-detail·student-assignments(학생, 읽기만). `admin/lib/monthly-report.server.ts:147-167` 읽기. **cron 0건·RPC 0건·scripts 0건**(SQL 마이그레이션 4개 제외).

#### (a) 컬럼 추가만으로 확장 가능

- **offline_tests에 상태(R18)·대상 범위·공개일 등 추가**: 모든 읽기가 명시적 컬럼 select(`select('*')` 사용처 0건)라 새 컬럼은 기존 코드 무영향. 단 신규 컬럼을 필터로 쓰려면 select 5지점 + RLS 정책 수정.
- **offline_test_questions에 node_id(R10)·유형 확장 대비 메타**: 현 XOR CHECK와 직교. `addTestQuestions`의 Insert 객체(L339-348)와 중복 판정 키 refKey(L302-307)를 함께 수정해야 실효.
- **offline_test_results 확장**: `note` 컬럼이 이미 존재하나 어느 코드도 쓰지 않음(안전한 선례). 부분점수용 병렬 컬럼(예: earned_points jsonb) 추가 자체는 무파손 — 단 아래 (b)-① 정합성 문제 동반.
- **시리즈 메타(가중치 등)**: series.server.ts 전 함수 명시 select.

#### (b) 기존 컬럼 의미 변경 필요 — 동결 원칙(뮤테이션 경로 동결) 위반 위험, 별도 표기

1. **`wrong_ords` (최대 리스크 — 정오의 유일한 편집 가능 표현)**: "오답 ord 배열" 의미에 저장(L434·L466·L598)·정오 산출(L418→L518)·온라인 프리필(L271-283)·그리드 토글(admin-offline-test-results.tsx:203·237·255·425-428)·문항별 정답률 통계(L106-110·138-154)가 전부 묶여 있다. 부분점수·"선택 답 번호 보존"으로 확장하려면 의미 변경 또는 병렬 컬럼 + 이중 소스 정합성 로직이 필요. integer[]라 값-당 메타를 담을 수 없음.
2. **`ord` (스냅샷 키 — 리매핑 가드 없음, 현행 실질 파손 경로)**: wrong_ords는 question_id가 아니라 ord로 문항을 가리키는데, `compactOrds`(문항 삭제 후 0..n-1 재부여)와 `moveTestQuestion`(스왑)이 **기존 결과 스냅샷을 갱신하지 않고**, 빌더에 결과 존재 시 편집 차단 가드도 없다(admin-offline-test-edit.tsx에 resultCount 참조 0건). 결과 입력 후 문항 하나만 지워도 전 학생 스냅샷이 다른 문항을 가리키고 max_score도 stale — attempts 쪽은 problem_id 기준이라 두 저장소가 불일치한다. **현재는 결과 0행이라 실해가 없지만, 확장 설계에서 최우선 해소 대상.**
3. **`points`**: all-or-nothing 전제가 score 계산(L425/L519)·max_score(queries.server.ts:668)·그리드 미리보기·목록 합계 4곳에 박혀 있어 부분점수 도입 시 전부 수정.
4. **`status ('taken'|'absent')`**: DB CHECK + zod enum + TS 타입 + 화면 + 통계 필터 6개 지점 동시 수정 필요(값 추가 시).
5. **`score`/`max_score` 스냅샷**: max_score가 결과 행마다 중복 저장되고 반 통계는 `rs.find(r => r.max_score !== null)`(results.server.ts:94)로 아무 행에서나 집어옴 — 문항 편집 후 일부만 재저장하면 회차 만점이 행마다 갈라질 수 있음.
6. **`session_id` 의미 오버로드**: `source='offline_test'`(대리 세션, 재사용·철회 대상) vs `'offline_test_online'`(학생 실기록, 불가침)을 컬럼이 아니라 scope_payload 문자열 되읽기로 구분(L387-412). 세션 출처 종류를 늘리면 이 판별이 즉시 취약해짐. 또한 온라인 불러오기의 `onlineSessionId`는 uuid 형식 외 무검증(그 학생·그 시험·해당 source인지 확인 안 함, L422-445) — staff 전용 표면이라 위험도 낮으나 무결성 보증 없음.
7. **`question_type` XOR CHECK**: 외부 문항(R2)·서술형(R16) 도입은 CHECK 완화 + "3종만 존재" 전제로 작성된 refKey·라벨 보강·인쇄 QuestionBlock/AnswerKeyTable·saveOfflineTestResults 문항 루프 전부 분기 추가 대상.

### 7.2 X-2 — unclassified 센티넬 도입 영향

전제 실측: `systematic_nodes`를 FK 참조하는 테이블은 10개 — article_systematic_links(CASCADE)·cases.primary_node_id/pending_primary_node_id(SET NULL)·lesson_node_links(CASCADE)·problem_box_items.related_node_id(SET NULL)·problem_choices.related_node_id(SET NULL)·problem_systematic_links(CASCADE)·problems.primary_node_id(SET NULL)·qna_threads.node_id(SET NULL)·자기참조 parent_id(CASCADE).

**핵심 판정: `case_only=true`만으로는 못 막는다.** `getSystematicSkeleton`(laws/queries.server.ts:444-505)은 전체 노드를 반환하고 각 소비처가 각자 `!caseOnly`를 걸며, **판례 탭 트리(cases-tree.tsx:311-328)는 의도적으로 caseOnly를 포함**하는 계약이다. 선례: 과목별 최상위 case_only '최신판례' 노드가 정확히 같은 이음새를 밟고 있다(라벨 3중 조건 `getLatestCaseNodeIds` 오탐은 라벨만 '최신판례'를 피하면 회피 가능).

영향 지점 3분류:

**(a) 무조건 노출 — 개별 수정 필요 (case_only로 못 막음)**
- 판례 탭 트리 cases-tree.tsx:311-328 (전체 순회이 설계 계약)
- 판례 편집 노드 picker admin-case-edit.tsx:1039-1056 (무필터)
- Q&A 대상 picker qna/lib/target-resolve.server.ts:117-134
- 운영자 문제 목록 상위노드 `listSystematicTopNodes`(problems/queries.server.ts:2460-2510) — depth-2 필터라 루트 센티넬이 최상위 항목으로 등장
- 시드 커버리지 RPC `admin_subject_coverage`(admin/queries/subject-coverage.server.ts:23-41) — **집계가 SQL 안에 있고 정의가 리포에 없음(마이그레이션만 존재) → 앱 코드로 해결 불가, SQL 수정 필요**
- 판례 정합성 감사 case-violations.server.ts:68-73 (전 과목 무필터)
- 체계도 export/import lectures/queries.server.ts:897-1019 · 노드 수 표시 admin-systematic-tree.tsx:77-81

**(b) case_only 필터를 이미 타는 곳 — 센티넬에 case_only=true를 달면 자동 해결**: 조문 트리 systematic-tree.tsx:154-159 · 문제/주관식 트리 problem-systematic-tree.tsx:95-97 · problems-tab.tsx:148-151 · mcq-pack-detail.tsx:95-104 · LMS 회차 picker · admin-problem-edit picker · 오프라인 테스트 파트 선택 admin-offline-test-edit.tsx:164-169(유일한 DB 레벨 `.eq("case_only", false)` 선례) · 반 약점 cohort-weakness.server.ts:136.

**(c) 배치되면 집계 유입 — 필터 부재**: ★개인 약점 `getWeakNodes`(weak-nodes.server.ts:61-149)는 **caseOnly조차 거르지 않아** 반 약점과 이미 비대칭(기존 결함) · 마스터리 getNodeMastery · OX 진단 computeOxDiagnosis(조상 폐쇄 편입) · 전체 순번 attachProblemOverallNo/computeCaseOverallOrder(caseOnly 무시, loader.server.ts:861이 전체 노드를 nodeOrder로 주입) · 노드별 통계 2종 · 판례 트리 카운트 · 노드 뷰어 URL 직접 진입 · 문제 뷰어 breadcrumb · 오프라인 테스트 subtreeNodeIds.

**정렬·순번 영향**: 트리 순서는 `sortSystematicTreeOrder`(laws/lib/systematic-order.ts:13-39)의 **parent_id+ord DFS**가 결정(path는 tie-break뿐) → 센티넬은 **루트+형제 최대 ord**로 둬야 맨 끝에 붙는다. path 채번은 기존 대분류와 prefix 충돌 없는 대역(예: `{law}.b99`) 필수 — path-prefix로 subtree를 판정하는 코드가 다수다. 전체 순번은 미배치=맨 뒤(`UNPLACED=nodes.length`) 규칙이라 **센티넬 추가 자체로는 기존 순번이 흔들리지 않으며**, 루트+최대 ord로 두면 미분류 콘텐츠를 배치해도 사실상 기존 "맨 뒤" 위치가 유지된다. 앞쪽 ord로 두면 미분류가 1번대로 몰려와 전체 재배열.

**운영 위험**: 체계도 export/import(lectures/queries.server.ts)는 case_only를 select하지 않고 import 시 기본 false로 insert + path 재채번 + node_id 신규 발급 → 왕복 시 센티넬 플래그 유실·고정 id 식별 불가, `replaceExisting=true`면 센티넬 삭제 시 배치된 problems/cases.primary_node_id가 SET NULL로 조용히 풀린다. 라벨에 '최신판례' 문자열·`^주제\d+` 패턴 회피 필요(각각 강제배치 트리거·판례 주제 축 파서가 반응).

**제외 처리 시 손볼 지점(기록만)**: 근본책은 `getSystematicSkeleton`에 센티넬 플래그(신설 컬럼)를 select+옵션 인자로 노출해 서버에서 끊는 것 — 단 판례 트리·배치 화면은 센티넬을 써야 하므로 일괄 제외가 아닌 opt-in. 개별 수정 목록은 위 (a)·(c) 전체 + RPC admin_subject_coverage(SQL).

## 8. 감사자 소견

### 8.1 지필 파트에서 실제로 남은 작업 범위 (추정 — 갭 매트릭스 기반, 공수 수치는 산정하지 않음)

기존 구현이 시험지 편성→인쇄→대리 채점 입력→노드 신호 합류→회차 추이의 골격을 이미 갖추고 있으므로, 설계서 v0.2의 지필 파트는 "신설"이 아니라 아래 델타로 좁혀진다.

**A. 신호 정합 (기존 파이프라인 마감 — 소규모)**
1. SRS 합류: saveOfflineTestResults가 `applyProblemSrsUpdate`를 호출하지 않아 `mastered`·레벨·복습 큐가 오프라인 결과를 못 본다(§2 R12). 훅 호출 추가 또는 트리거 — 수정 지점은 1함수.
2. 빈칸 결과 미합류(user_blank_attempts를 약점·마스터리가 안 읽음) + 빈칸 철회 불가(append-only) — 정책 결정 필요(빈칸을 신호에서 제외로 못박거나, 세션 컬럼 추가).
3. ord 리매핑 가드(§7.1-(b)-②): 결과 존재 시 문항 편집 차단 또는 스냅샷 동시 갱신. **결과 데이터가 0행인 지금이 유일하게 싼 시점.**

**B. 채점 무결성 (차단 해소 — 지시서 H-2)**
4. `/api/problems/attempt`의 isCorrect 서버 재계산(1개 API + 정답 페이로드 마스킹 검토). 온라인 병행 응시뿐 아니라 자습·모의 전 경로가 같은 구멍을 공유하므로 오프라인 통합과 무관하게도 가치가 있다. 부수: OX 오답노트 재채점 누락·duration 무클램프(§5.2)도 같은 묶음.

**C. 기능 신설 (미구현 6건 중 요구 확정분)**
5. R2·R3·R4 외부 문항: XOR CHECK 완화 + 자유 입력 문항 구조 + 노드 태깅 강제 + 편입 플래그 — §7.1-(b)-⑦의 전제("3종만 존재")를 깨는 가장 큰 델타. R10 저장 컬럼은 이때 함께 필요해진다(문제은행 문항은 파생 상속으로 충분).
6. R18 상태 관리: 배포 게이트 부재로 생성 즉시 학생에게 노출되는 현행이 실사용 전환의 실질 선결 과제. 컬럼 추가는 무파손이나 RLS 정책 동시 수정 필요.
7. R6 학생 자기 답안 입력(OMR형)·R16 부분점수/서술형: 요구 확정 시 wrong_ords 의미 변경 문제(§7.1-(b)-①)와 정면 충돌 — 병렬 저장 구조를 먼저 설계해야 한다.

**D. 학습시간**: 온라인 축이 실질 문제풀이 하나뿐(§6.3)이므로 오프라인 activity_type 합산 총합은 상담자 화면 전용으로 제한하고 학생 화면·경쟁 지표에서 제외할 것.

### 8.2 지시서가 예상하지 못한 발견

1. **Phase 0 "실사용" 판정 정정 (본 감사 최대 발견)**: offline_test_results 0행, 시험지 33건 전부 manager 계정의 편성 실험(30건 soft-delete, 제목 "123"·"테스트N"), 온라인 세션 6건도 동일 계정 미완료. 최근 30일 쓰기(문항 410건)는 실사용이 아니라 실험 활동이었다. → **A항목 차단의 성격이 바뀐다**: "실데이터를 가진 기능과의 중복"이 아니라 "완성도 높은 미가동 기능과의 중복"이며, 스키마 개편의 이행 비용이 사실상 0이다. 반면 스태프가 활발히 만져보고 있다는 사실 자체는 이 기능이 곧 실사용될 신호이므로, 확장 설계를 미룰수록 이행 비용이 생긴다.
2. **설계 의도가 코드에 명문화**: results.server.ts 헤더 주석이 "오프라인 결과 → 온라인 학습 신호 합류"를 이미 선언 — 통합 설계의 방향이 기존 구현과 일치한다.
3. **세 신호의 오프라인 반영 강도 불일치**: attempted_at 백데이트(시험일 정오) × dedup 정책 차이(R11 전 시도 합산 / R12·R13 최신 1건)로, 이후 온라인 재풀이가 R12·R13에서는 오프라인 결과를 밀어내고 R11에서는 둘 다 남는다. 버그는 아니나 설계서에 명시할 성질.
4. **getWeakNodes는 case_only조차 안 거른다**: 반 약점(cohort-weakness)은 거르는데 개인 약점은 안 걸러 이미 비대칭(§7.2-(c)) — 센티넬 도입 시 동반 수정 대상.
5. **admin_subject_coverage RPC 정의가 리포에 없다**: 센티넬 도입 시 앱 코드로 못 막는 유일한 집계이며, SQL 정의 소재부터 확인 필요.
6. **study_sessions.duration_ms 비대칭**: 실사용자 write 0인데 합격자 합성 시드는 값을 넣고 passer analytics가 그 값을 읽는다 — 실사용자 화면 0 vs 시드 데이터 유값.
7. **문서 stale 2건**: feat-7-042.md의 `UNIQUE(test_id,ord)`는 DDL에 없음 / SPEC.md "테이블 3종"은 실제 4종.

### 8.3 확인 불가 항목

- `admin_subject_coverage` RPC의 SQL 본문 — 리포(sql/·scripts/sql/·supabase/) 전수 grep 무결과, DB 함수 정의 조회는 수행하지 않음(범위 밖). 센티넬 설계 시 `pg_get_functiondef` 확인 필요.
- 온라인 병행 응시를 학생이 실제 완주했을 때의 E2E 동작(프리필→저장 왕복) — 실데이터 0건이라 코드 정독으로만 판정했고 실행 검증은 하지 않음(읽기 전용 감사 원칙).

---

*본 감사의 모든 DB 접근은 SELECT(스키마 카탈로그 포함)이며, 조사 스크립트는 `tmp/audit-phase0b/`에 보존한다. 코드·스키마·데이터 변경 0건.*
