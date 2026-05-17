# feat-8-024 — 기출문제 지문 기반 판례 연동

## 배경

판례–기출문제 연결(`problem_case_links`)은 그동안 "판례에서 출발해 그 판례의
회차·연도 기출문제를 찾아 매칭"하는 방향이었다. 운영자가 `case-exam-problems`
화면에서 수동으로 링크를 추가했고, 판례의 "1차 기출" 표시는 별도 컬럼
`cases.exam_1st_years`(수동 입력 연도 배열)였다. 이 방식은 (a) 운영 부담이
크고 (b) `exam_1st_years` 와 `problem_case_links` 가 따로 노는 이중 출처 문제가
있었다.

## 목표

방향을 뒤집는다 — **객관식 1차 기출문제의 지문에서 판례 사건번호를 자동
탐지**해 `problem_case_links` 를 만든다. 판례 뷰어는 "이 기출문제에 출제됨"
칩을 보여주고 클릭 시 문제로 이동한다. 지문에서 판례가 탐지되지 않은 문제는
운영자가 수동 매칭한다. `problem_case_links`(1차 객관식 한정)가 단일 출처가
된다.

## 범위

- 대상 = **객관식 1차 기출문제**:
  `problems.origin = 'past_exam'` AND `exam_round = 'first'`
  AND `format ∈ {mc_short, mc_box, mc_case}`.
- 2차(주관식)·`exam_2nd_years`·비-기출 문제는 범위 밖 — 변경하지 않는다.

## 데이터 모델

테이블 스키마 변경 없음. `problem_case_links`(problem_id, case_id,
relation_type, note, created_by) 그대로 사용. 함수 1개를 추가한다.

- 자동 탐지 링크: `relation_type = 'cited'`, `note = 'exam-scan'`, `created_by = NULL`.
- 수동 매칭 링크: `relation_type = 'cited'`, `created_by = <staff user>`.
- UNIQUE `(problem_id, case_id, relation_type)` — 중복 insert 는 `ON CONFLICT DO NOTHING`.

### `scan_exam_case_links() → integer`

plpgsql, `SECURITY DEFINER`. 1차 객관식 기출문제의 각 지문(선택지·박스항목)에
입력된 판례 필드 — `problem_choices.related_case_number` /
`problem_box_items.related_case_number` — 에서 사건번호 토큰
(`[0-9]{2,4}[가-힣]+[0-9]+`)을 추출하고(이 필드는 "대법원 2003.10.10. 선고
2001후2757" 같은 전체 인용문이므로 토큰만 뽑는다), `cases.case_number` 와
**정확 일치**하는 것을 `problem_case_links` 에 insert(`ON CONFLICT DO
NOTHING`). 새로 만든 링크 수를 반환. 인증된 호출자는 staff 여야 한다(미인증 =
admin 직접 실행은 허용). 재실행 가능(idempotent) — 기존 링크는 건드리지 않고
누락분만 추가한다.

## 동작

### 자동 탐지 (규칙 1)

- 사건번호 = `[0-9]{2,4}[가-힣]+[0-9]+` 형식 토큰 (예 `2019후11541`, `84후19`).
  각 지문(선택지·박스항목)의 `related_case_number` 필드에서 토큰을 추출해
  `case_number` 와 **정확 일치**로만 매칭한다 — 부분 문자열 매칭의 오탐을 피한다.
- 매칭된 (문제, 판례) → `problem_case_links` `'cited'` 링크.

### 판례 측 표시 (규칙 1)

- 판례 뷰어에서 1차 기출 표시를 연도 칩(`ExamYearChip` 1차)에서 **문제별
  칩**으로 교체. 칩 라벨 "{연도} 1차 {번호}번", 클릭 시 해당 문제 뷰어
  (`/subjects/{lawCode}/problems/{problemId}`).
- 2차 표시(`exam_2nd_years` 기반)는 유지하되, 링크 대상(`case-exam-problems`)이
  사라지므로 비-링크 배지로 바뀐다.

### 수동 매칭·검토 (규칙 2)

- staff 화면 `/admin/relations/exam-cases` — 과목별 1차 객관식 기출문제 중
  **판례형 지문(`choice_type='precedent'`)인 선택지·박스 항목이 하나라도 있는
  문제만** 표시(연도 내림차순). 판례 출제 지문이 없는 문제는 연결할 판례가
  없으므로 목록에서 제외한다(단, 이미 판례 링크가 걸린 문제는 해제·검토용으로
  유지). "미연결만" 필터 토글.
- 각 문제 카드는 **발문·박스 항목·선택지 전체 지문**을 마크다운으로 렌더해
  운영자가 문제를 읽고 판례를 식별할 수 있게 한다(140자 요약 X — 운영자가
  지문을 못 봐서 매칭 불가하던 문제 수정). 선택지/박스 항목에 입력된 판례
  인용문(`related_case_number`)은 강조 표시하고, 사건번호 토큰이 추출되면
  "이 판례 연결" 원클릭 버튼을 제공한다(이미 연결된 토큰은 "✓ 연결됨").
- 사건번호 직접 입력으로 링크 추가 / 오탐 링크 해제, "문제 전체 보기" 링크로
  문제 뷰어 이동, 전체 재스캔 버튼(`scan_exam_case_links` RPC).
- **미연결 문제의 인라인 해설 편집** — 미연결 문제의 판례형 지문은 "해설 수정"
  버튼으로 해당 선택지/박스 항목의 해설(`explanation_md`)을 매칭 화면에서 바로
  편집한다(`ExplanationEditor` 재사용, `intent=edit-explanation`,
  `useFetcher` 인플레이스 제출). 저장 시 `extractCaseNumber` 로 해설에서
  사건번호를 추출해 `related_case_number` 를 갱신하고, 추출된 번호로 `cases`
  를 정확일치 조회해 `problem_case_links` 를 생성한다. 연결에 성공하면 문제가
  "미연결"에서 빠지면서 편집기가 자동으로 닫힌다(파생 상태). 사건번호 미인식·
  판례 DB 미존재 시에는 해설만 저장하고 안내 메시지를 표시한다.

## 기존 데이터 정리 (규칙 3) — 1회성

1. `cases.exam_1st_years` 를 모두 빈 배열로 (1차 기출 연도 수동 표시 제거).
2. 1차 객관식 기출문제에 걸린 기존 `problem_case_links` 삭제.
3. `scan_exam_case_links()` 1회 실행으로 재생성.

## 제거 (규칙 4)

- `case-exam-problems` 화면(`app/features/subjects/screens/case-exam-problems.tsx`)
  + 라우트(`/subjects/:subject/cases/:caseId/exam/:round/:year`) 전체 삭제 —
  판례→문제 수동 매칭 방식 폐기.
- `/admin/relations/bulk` 의 "문제 ↔ 판례" 탭 제거.

## 범위 밖

- 2차(주관식) 기출 — `exam_2nd_years`, 2차 `problem_case_links` 미변경.
- 판례 뷰어 우측 "유사 문제" 탭(`getRelatedProblemsByCase`, 조문 우회 추천) —
  기출 매칭과 별개로 유지.
- 재스캔은 누락분만 추가(insert-missing). 운영자가 해제한 오탐 자동 링크가
  재스캔 시 다시 생길 수 있음 — 알려진 한계 (정확 일치라 오탐 자체가 드묾).

## 관련 파일

- DB: `scan_exam_case_links()` (Supabase 마이그레이션 `exam_case_link_scan`)
- `app/features/problems/queries.server.ts` — `getExamProblemsForCase`(판례별
  기출문제) · `listExamCaseLinkRows`(수동 매칭 목록) · `app/features/problems/labels.ts`
  `MC_FORMATS`
- `app/features/cases/components/exam-year-chip.tsx` — `ExamProblemChip` 신설,
  `ExamYearChip` 비-링크 배지화
- `app/features/subjects/screens/case-viewer.tsx` — 헤더 기출 칩
- `app/features/admin/screens/admin-exam-case-links.tsx` (staff 화면, loader/action
  — `link`/`unlink`/`rescan`/`edit-explanation` intent)
  + `app/features/admin/components/exam-case-row.tsx` (문제 카드 — 전체 지문 렌더
  + 인라인 해설 편집)
  + `routes.ts` `/admin/relations/exam-cases`
- 재사용: `extractCaseNumber` (`app/features/problems/extract.ts`),
  `ExplanationEditor` (`app/features/problems/components/explanation-editor.tsx`)
- `ExamCaseLinkRow`·`ExamCaseLink`·`ExamCaseSegment` 타입 — `app/features/problems/labels.ts` 소유
  (클라이언트 컴포넌트가 import 하므로 `.server.ts` 가 아닌 `labels.ts`)
- **삭제**: `app/features/subjects/screens/case-exam-problems.tsx` + 라우트
- `app/features/admin/screens/admin-relations-bulk.tsx` (조문↔판례 전용으로 축소)
- `app/features/latest/screens/cases.tsx` · `subjects/components/tabs/cases-tab.tsx`
  (`ExamYearChip` 호출 정리)
