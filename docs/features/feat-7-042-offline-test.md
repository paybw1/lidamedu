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
  CHECK (유형별 참조 XOR), UNIQUE(test_id, ord)
)
offline_test_results (
  result_id uuid PK, test_id FK, user_id FK→profiles,
  status text CHECK in ('taken','absent'),
  score numeric(6,1), max_score numeric(6,1),
  wrong_ords int[],                     -- 입력 당시 오답 문항 ord 스냅샷
  session_id uuid NULL,                 -- 신호 합류로 만든 quiz_session
  taken_at date, note text, entered_by FK→profiles, entered_at,
  UNIQUE(test_id, user_id)
)
```

RLS: 3테이블 모두 staff(=`private.is_staff`) 전체 CRUD. `offline_test_results`
는 학생 본인 read 추가(과제 상세 결과 카드). 신호 합류로 생기는
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

## 5. 범위 밖 (후속)
- 자연과학 과목 시험지(조문·판례 기반이 아니라 v1 제외)
- 오프라인 테스트의 온라인 응시 모드(만들어진 조합을 quiz_session 으로 바로
  풀게 하는 것 — 구조상 쉬우나 요구 확정 후)
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
