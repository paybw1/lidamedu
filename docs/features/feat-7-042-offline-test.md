# feat-7-042 — 오프라인 테스트 (종합반 시험지 제작·PDF 출력·결과 입력·통합 통계)

> 상태: ✅ 전 단계 구현 완료 (2026-07-05)
> 소유 화면: `/admin/cohorts/:cohortId/assignments/:assignmentId` 하위
> 관련: feat-7-021(과제 배포) · feat-7-040(관리자 학습현황) · docs/features/과제-상담-모의-점검-연계.md

## 1. 배경 / 요구

종합반은 온라인 학습과 **오프라인 현장 시험**을 병행한다. 운영자 요구:

1. 과제 제작 페이지에서 **과목 / 파트(체계도 단원) / 중요도**로 조문·판례 기반
   문항(빈칸 · OX · 객관식)을 조합해 테스트를 만든다.
2. 만든 테스트를 **실제 시험지 양식의 PDF**로 출력해 오프라인 배포한다.
3. 오프라인 채점 결과를 입력하는 화면이 있어야 한다.
4. **온라인 관리와 오프라인 관리를 합해 통계 분석** — 오프라인 결과가 별도
   창고가 아니라 기존 온라인 학습 신호와 합쳐져야 한다.

## 2. 설계 핵심 결정

- **신규 엔티티 `offline_tests`** — 과제(assignment) 1 : 테스트 N. 기존
  `assignment_items` 모델(개별 참조 나열, OX kind 없음)은 조합 시험지를 표현할
  수 없으므로 건드리지 않는다. mcq_packs 도 객관식 전용이라 부적합.
- **문항 소스는 기존 3종 재사용** (신규 콘텐츠 테이블 없음):
  - 객관식 = `problems`(law_code · importance 0~3 · 체계도 노드 · format 필터)
  - OX = `problem_choices`/`problem_box_items` 의 `ox_truth` (isOxEligible SSOT)
  - 빈칸 = `article_blank_sets`(강사 제작 세트, blanks JSON)
- **결과는 문항별 정오로 backbone 에 합류** — 총점만 저장하면 통합 분석 불가.
  플랫폼 통계의 단일 신호는 `user_problem_attempts`(+`user_blank_attempts`)이므로
  결과 입력 시 학생별 `quiz_sessions`(scope_payload.source='offline_test')를
  만들고 문항별 시도를 기록한다 → 약점 진단 · 마스터리 · 반 공통 약점 ·
  학습현황 · at-risk 가 **수정 없이** 오프라인 결과를 포함하게 된다.
  총점·응시 여부는 `offline_test_results` 에 스냅샷(불변 기록·표시용).
- **PDF = 인쇄 전용 화면(@media print) + 브라우저 "PDF로 저장"** —
  study-print-shell 패턴 재사용. html2canvas(이미지 캡처)는 텍스트 품질·용량
  열위라 쓰지 않는다.
- **adminClient 예외**: 결과 입력은 관리자가 학생 명의 학습 기록을 쓰는 것이라
  RLS 우회(adminClient)가 필요하다. 과제 보안 원칙(feat-7-021b: 쓰기=요청
  클라이언트)의 **의도적 예외** — action 에서 ① staff 역할 ② 반 소유권
  ③ 대상 학생의 반 멤버십 재검증을 전부 통과해야 쓴다. 세션 scope_payload 에
  offline_test 출처를 명시해 사후 구분 가능.

## 3. DB

```sql
offline_tests (
  test_id uuid PK, assignment_id FK→assignments, cohort_id FK→cohorts,
  title text, law_code text,           -- 법률 5과목 (자연과학 제외, v1)
  duration_min int, instructions_md text,
  created_by FK→profiles, created_at, updated_at, deleted_at  -- soft delete
)
offline_test_questions (
  question_id uuid PK, test_id FK, ord int, points numeric(5,1) default 1,
  question_type text CHECK in ('mcq','ox','blank'),
  problem_id uuid,                      -- mcq
  ox_ref_type text ('choice'|'box'), ox_ref_id uuid, ox_problem_id uuid,  -- ox
  blank_set_id uuid,                    -- blank (세트 전체 = 1문항)
  CHECK (유형별 참조 XOR)               -- ord 유일성은 일반 인덱스뿐(UNIQUE 제약 아님 — 코드 규칙으로 유지)
)
offline_test_results (
  result_id uuid PK, test_id FK, user_id FK→profiles,
  status text CHECK in ('taken','absent'),
  score numeric(6,1), max_score numeric(6,1),
  session_id uuid NULL,                 -- 신호 합류로 만든 quiz_session
  srs_problem_applied_at timestamptz,   -- Phase 1 S1 — SRS 축별 1회 적용 마커
  srs_ox_applied_at timestamptz,
  taken_at date, note text, entered_by FK→profiles, entered_at,
  UNIQUE(test_id, user_id)
  -- wrong_ords int[] 는 Phase 1 T1 에서 offline_test_answers 로 대체(제거 예정)
)
offline_test_answers (                  -- Phase 1 T1(B안) — 문항별 정오 스냅샷
  result_id FK→offline_test_results CASCADE,
  question_id FK→offline_test_questions CASCADE,
  is_correct boolean NOT NULL,
  PK (result_id, question_id)
  -- 키 = question_id(불변): 문항 삭제·순서 변경에도 스냅샷이 다른 문항을
  --   가리키지 않는다(구 wrong_ords 는 ord 키라 리매핑 시 오염). N2(선택답·
  --   부분점수)는 컬럼 추가로 확장.
)
```

Phase 1 T2 — `offline_tests.status text CHECK in ('draft','published','closed')`
default 'draft' + published_at/closed_at. draft=학생 비노출·문항 편집 가능,
published=노출·문항 잠금(만점 불변 보장)·결과 입력, closed=결과 열람만.
revert(published→draft)는 결과 0건일 때만.

RLS: 4테이블 모두 staff(=`private.is_staff`) 전체 CRUD. 학생 SELECT 는
**화이트리스트 `status IN ('published','closed')`**(offline_tests/questions —
상태값이 추가돼도 기본 비노출) + `offline_test_results`/`offline_test_answers`
본인 read(answers 는 부모 결과 행 user_id 경유). 신호 합류로 생기는
attempts/sessions 는 기존 테이블 RLS 그대로(학생 본인 소유).

## 4. 화면 / 단계

### 1단계 — 시험지 빌더 `/admin/cohorts/:cid/assignments/:aid/tests/:testId`
- 과제 편집 화면에 "오프라인 테스트" 섹션(목록 + 새로 만들기 → 빌더 이동).
- 빌더 좌측 = 문항 후보 탐색: **과목 → 유형(빈칸/OX/객관식) → 파트(체계도
  노드) → 중요도(★N 이상)** 필터 → 후보 목록(체크박스 다건 추가) +
  "조건에서 N문항 자동 추출"(중요도 내림차순 → 무작위).
- 우측 = 담긴 문항: 순서(위/아래 버튼) · 배점 · 제거. 합계 배점 표시.
- 후보 조회 서버 쿼리: 객관식 = problems 필터(approved·soft-delete 제외),
  OX = getOxQuestionsForNode/Subject 재사용, 빈칸 = article_blank_sets
  (조문→체계도 노드 매핑은 article_systematic_links).

### 2단계 — 인쇄/PDF `/…/tests/:testId/print` (+ `?answers=1`)
- 문제지: 머리표(학원명 · 반 이름 · 과목 · 테스트명 · 시험시간 · 날짜 ·
  성명/수험번호 기입란) + 문항(번호·배점, 객관식 ①~⑤, OX 는 `( O / X )`,
  빈칸은 본문 밑줄 공란 ①②…) + 페이지 하단 쪽번호.
- 정답·해설지: 같은 양식에 정답 표기(빈칸은 답 채움) + 해설.
- study-print-shell 패턴: `@page` 여백 · `break-inside: avoid` ·
  `.no-print` 툴바 · 자동 `window.print()`.

### 3단계 — 결과 입력 `/…/tests/:testId/results`
- 그리드: 행=반 학생(cohort_members), 열=문항 ord. 기본 전원 "전부 정답"
  상태에서 **틀린 문항만 클릭**(채점 관행). 행 단위 "미응시" 체크.
- 저장(문항별 정오 확정) 시:
  1) `offline_test_results` upsert (점수 = 배점 합산 자동)
  2) 학생별 quiz_session 생성(mode='exam', scope_payload
     `{source:'offline_test', testId}`) + 문항별 시도 기록 —
     mcq→user_problem_attempts, ox→user_problem_attempts(ox_answer),
     blank→user_blank_attempts(세트 전 blank_idx 동일 정오)
  3) 재저장 시 기존 세션 시도 삭제 후 재기록(세션 재사용, 중복 방지)
- 학생 과제 상세(`/assignments/:id`)에 "오프라인 테스트: {제목} — 82/100"
  결과 카드.

### 4단계 — 통합 통계
- 빌더/결과 화면에 테스트 통계: 평균 · 최고/최저 · 점수 분포 · **문항별
  정답률**(변별 낮은 문항 식별) · 미응시 명단.
- 반 모니터링(admin-cohort-stats)에 오프라인 테스트 결과 카드(테스트별 평균,
  온라인 정답률 대비).

## 5. 확장 (2026-07-05 당일 후속 구현)
- **자연과학 시험지**(22d1390): 과목 = law_code XOR science_subject(DB check).
  자과=객관식 전용·파트=science_sections·중요도 필터 숨김. 과목명 SSOT =
  labels.offlineTestSubjectName.
- **온라인 응시 모드**(34e5bac): 객관식만으로 구성된 테스트 한정. 학생 과제
  상세 [온라인 응시] → `/api/offline-test/online-start` 가 세션
  (scope_payload.source='offline_test_online', exam+시험시간) 생성 → 기존 문제
  뷰어 러너. 접근 증명 = RLS 멤버 read(offline_test_questions member-read 정책).
  결과 입력 화면 [온라인 응시 불러오기] = 완료 세션의 문항별 정오 프리필
  (미응답=오답) → 저장 시 **스냅샷만 기록 + 학생 세션 연결**(시도 재기록 없음
  = 이중 신호 방지). saveOfflineTestResults 의 세션 재사용·철회는
  source='offline_test' 세션으로 한정 — 온라인 세션(학생 실기록)은 불가침.

## 5c. Phase 1 — 지필 마감 (2026-08-13, 오프라인 학습 통합 Phase 1)

**T1 — 정오 스냅샷 ord 의존 해소(E4)**: `wrong_ords`(ord 키) →
`offline_test_answers`(question_id 키, B안 정규화 테이블). 그리드·API 페이로드도
`wrongQuestionIds`. 문항 편집이 스냅샷을 오염시키는 경로 제거.

**T2 — 배포 게이트**: status 3단계 + 학생 RLS 화이트리스트(§3). 문항 편집
intent(add/auto_pick/remove/move/set_points)는 draft 에서만(API 서버 게이트 +
빌더 UI 잠금), 결과 입력(save_results)은 published 에서만, 온라인 응시 시작은
published 에서만(closed 는 노출 유지 — 학생 결과 카드 보존).

**S1 — SRS 합류**: saveOfflineTestResults 가 mcq→`applyProblemSrsBulk`
(user_problem_srs) · ox→`applyOxRefSrsBulk`(user_ox_ref_srs) 배치 갱신.
단건 함수는 배치 위임으로 재작성(쓰기 경로 일원화, SM-2 계산 =
computeNextSrsState 공유). 지필 오답이 복습 큐(문제 SRS = /study/srs,
OX = OX 복습)에 등장한다.

- **멱등(축별 스탬프)**: `srs_problem_applied_at`·`srs_ox_applied_at` — 각 축은
  자기 스탬프가 NULL 일 때만 적용. 부분 실패 시 실패한 축만 NULL 로 남아
  재저장 시 그 축만 재적용(자가 치유). 실패는 저장 응답 `srsWarnings` 로
  운영자 화면에 경고 표시(조용한 미반영 금지).
- **정책**: SRS 는 성적이 아니라 복습 스케줄이다. 성적 정정으로 인한
  ease·interval 차이는 무시 가능한 수준인 반면, 재적용을 허용하면 되돌릴 수
  없는 reps 부풀리기 경로가 생긴다. 따라서 result 하나당 축별 1회만 적용한다.
  같은 이유로, 철회(taken→absent) 시에도 SRS 는 되돌리지 않는다(학생이 그
  문제를 접했다는 사실은 유효). 온라인 응시 불러오기 행은 응시 시점에 정규
  경로로 SRS 가 이미 갱신됐으므로 적용 없이 두 축 스탬프만 기록.
- **OX ref 집계 규칙**: 같은 ref 에 속한 문항 중 하나라도 오답이면 그 ref 를
  오답으로 처리한다(보수적 — 복습 빈도가 다소 높아지는 것은 손해가 아님).
  문제 축도 동일 규칙으로 통일.
- **알려진 한계**: `getNodeMastery` 의 srsReps 조건은 user_problem_srs 만
  읽는다 — **OX 전용 시험지로는 `mastered` 단계에 도달할 수 없다.** mcq 문항이
  포함된 시험에서만 마스터리가 진행된다.

**E3 — 빈칸 결과 신호 정책(확정)**: 빈칸(blank) 문항 결과는
`user_blank_attempts` 에 저장되며, **약점 진단·마스터리 계산·SRS 에 합류하지
않는다. 이는 결함이 아니라 확정된 정책이다.** 근거: 빈칸 attempt 는 세션
컬럼이 없어 철회가 불가능(append-only)하므로, 신호에 합류시키면 되돌릴 수
없는 오염 경로가 생긴다. 빈칸은 시험 점수(score)에는 정상 반영된다.

**S3 — 세 신호의 오프라인 반영 강도 불일치(명시)**: 오프라인 지필 결과의
`attempted_at` 은 시험일 정오(KST)로 백데이트된다. 이로 인해 학생이 이후 같은
문제를 온라인으로 풀면,
- `getWeakNodes`(전 시도 합산): 오프라인·온라인 결과가 모두 남는다
- `getNodeMastery`·`getCohortWeakNodes`(최신 1건 dedup): 온라인 결과가
  오프라인을 밀어낸다

버그가 아니라 dedup 정책 차이다. 지표 해석 시 이 비대칭을 전제해야 한다.

## 5b. 범위 밖 (후속)
- OX·빈칸 혼합 시험지의 온라인 응시(혼합형 러너 부재)
- OMR 스캔/CSV 업로드 입력, 문항별 부분 점수

## 6. 진행 로그
- 2026-07-05: 설계 승인(사용자 "진행 OK"), 문서 작성.
- 2026-07-05: 전 단계 구현·푸시 완료 — DB(ee34e48) → ①빌더(922fd5a) →
  ②인쇄/PDF(573c527) → ③결과 입력·신호 합류·학생 결과 카드·멤버 read RLS(a387d51)
  → ④테스트 통계(결과 화면 KPI+문항별 정답률)·반 통계 카드(admin-cohort-stats).
  구현 파일: app/features/offline-tests/{queries,results}.server.ts,
  admin/api/offline-test.tsx, admin/screens/admin-offline-test-{edit,print,results}.tsx.
- 알려진 한계: 빈칸 시도(user_blank_attempts)는 세션 컬럼이 없어 append-only —
  재저장은 최신 시도 우선 규칙이 흡수하지만 taken→absent 전환 시 빈칸 기록은
  철회되지 않음(객관식·OX 는 세션 삭제로 철회됨).

## 7. feat-7-044 — 테스트 시리즈·성적 추이 (2026-07-06, 병행 종합반 P0-②)
- `offline_test_series`(반 단위 묶음) + offline_tests.series_id/series_round_no.
  빌더 "시리즈" 영역에서 지정(회차 미입력=다음 회차 자동), 새 시리즈 인라인 생성.
- `/admin/cohorts/:id/test-series` — 학생×회차 매트릭스(점수% 톤, 툴팁=점수·석차·
  상위%), 반 평균 행, 학생 평균·추세(최근−직전 %p) 컬럼. 반 상세 [시험 추이] 진입.
- 학생 /assignments "내 시험 추이" 카드 — 최근 시리즈 회차별 내 점수% + 반 평균
  (반 평균은 adminClient 집계, 개인 식별 없음).
- 파생값(순위·평균) 저장 안 함 — getSeriesTrend 가 조회 시 계산.
