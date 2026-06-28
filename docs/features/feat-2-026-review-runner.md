# feat-2-026 — 복습 전용 러너 (풀기형 세션 + 조문 정독 읽기)

> 점검 근거: `docs/survey/복습전용화면-점검.md`
> 방향(사용자 승인): **(b)갈래 분리 토대 + (a)한 입구 감각의 하이브리드.**

## 문제 (점검 결론 요약)

- `/study/srs`는 "복습 허브"가 아니라 **종류별 표(table)** 묶음이다. MCQ·빈칸 표의 각 행을 누르면 `/subjects/{과목}/...`로 **단건 scatter** — 한 문제 풀고 표로 돌아와 또 클릭. 흐름이 끊긴다.
- **OX 섹션만** 이미 "정오문제 복습 시작" 러너 버튼(`/study/srs/ox`)을 가진다 — MCQ·빈칸엔 그 진입이 없다.
- 혼재의 실체 = **풀기 다수(MCQ·빈칸·OX) + 보기 하나(조문 정독)**. "반반" 아님.

## 설계 (하이브리드)

- **풀기형(MCQ·빈칸·OX)** = due를 **모아 세션 러너로 prev/next 순회**. 기존 자산 재사용:
  - MCQ: `createQuizSession` + `problem-viewer`(세션 prev/next·채점 이미 구현).
  - OX: 공용 `QuestionCard`(풀기/보기 양용) + 기존 `/study/srs/ox`.
- **보기(조문 정독)** = 러너에 강제로 넣지 않고 **읽기 목록**으로 유지(채점 대상이 아님 — feat-2-016).
- (c)통일안은 불가: 조문 정독은 "풀 문제"가 없음.

## 확정 제약 (코드 근거)

- **세션 = 단일 과목** — `createQuizSession`이 `lawCode XOR scienceSubject` 강제(`study/queries.server.ts:430`), `problem-viewer`는 `/subjects/{lawCode}/...` 단일 과목 경로 + `runnerNav`도 단일 lawCode 가정(`:340-427`). → SRS due는 다과목이므로 **MCQ 복습 러너는 과목별 세션**이어야 한다(과목별이 정확히 호환).
- **`QuizScopeType`에 "srs" 없음**(`node|filter|wrong-note|bookmark|free|pack`) → **"filter" 재사용** + `scopePayload`로 출처·복귀 구분. **DB 마이그레이션 불필요.**
- `getDueProblems`가 문제별 `lawCode` 반환(`srs.server.ts:80`) → 과목 그룹핑 가능.

## 단계

### Stage 1 — MCQ 풀기형 세션 러너 진입 (이번)
가장 가볍고(재사용 최대) 흩어짐이 가장 심한 MCQ를 러너로 전환.

1. **API** `app/features/study/api/session-from-srs.tsx`(POST, `subject` 필수, `mode` 기본 study) — `getDueProblems`에서 그 과목 due만 필터 → `createQuizSession({lawCode, scopeType:"filter", scopePayload:{source:"srs", originLabel:"복습 풀이", backHref:"/study/srs"}, problemIds})` → `/subjects/{subject}/problems/{firstId}?session=&mode=study` redirect. due 0이면 400. (패턴 = `session-from-wrong.tsx`.)
2. **`routes.ts`** — `/api/study/session-from-srs` 등록.
3. **`problem-viewer.tsx`** — `navLabel`·`navBackHref`에 `scopePayload.originLabel`/`backHref` **제너릭 override** 추가(범용·소규모). 복습 세션 러너의 라벨="복습 풀이", 뒤로가기=`/study/srs`.
4. **`srs.tsx` MCQ 섹션** — OX 섹션처럼 "복습 시작" 버튼 추가. due MCQ를 lawCode로 그룹핑해 **과목별 버튼**(`「특허법」 12`) Form POST. 표는 전체 미리보기로 유지(주 CTA = 러너 버튼).

검증: `npm run typecheck`. 데스크톱에서 버튼→러너 진입·prev/next·뒤로가기 `/study/srs` 복귀 확인. **하드 스톱(푸시 전 보고).**

### Stage 2 — 조문 정독(보기) 읽기 목록 + 빈칸 러너 검토

**① 조문 정독 → 읽기 목록 (완료)**: `/study/srs` 조문 정독 섹션을 풀기 섹션과 같은 표 → **읽기 전용 클릭 리스트**(`ArticleReviewList`)로 교체. 행 전체가 조문 뷰어(정독의 자연 위치)로 가는 링크 — 클릭하면 방문 기록이 남아 일정이 자동 갱신(채점 없음). "읽기 목록 · 채점 없음" 칩으로 풀기와 명시 구분. **러너로 강제하지 않음**(조문은 풀 대상이 아니고, 재독은 트리 맥락이 있는 조문 뷰어가 적합). 조문 뷰어 무개입.

**② 빈칸 러너 → 검토 결론(결정 대기)**:
- 빈칸은 **풀기**라 MCQ처럼 scatter(세트 풀고 → `/study/srs` 복귀 → 다음 세트) 문제가 동일하게 있음 → 러너 가치 있음.
- 그러나 빈칸 풀이는 **조문 뷰어 빈칸 모드**(`?blank=setId`, `BlankFillView`)에서 일어나고, 세트가 **여러 조문(·과목)에 흩어져** 있어, 진짜 러너는 조문 뷰어 빈칸 모드에 **세트 간 시퀀스(`?blankSeq=`) + "다음 빈칸 세트" 내비**를 추가해야 함.
- 비용/위험: param-gated 추가(없으면 기존과 동일 → 회귀위험 낮음)이나, **복잡·critical 파일인 조문 뷰어 개입**. → **승인 게이트**(사용자 go 후 Stage 2b로 구현 권장). 임시 대안(per-subject "빈칸 복습 시작"=첫 세트만 열기)은 체이닝이 없어 scatter 미해소 → 반쪽이라 보류.

### Stage 2b (제안 — 승인 후) — 빈칸 러너
- API `session-from-srs`처럼 per-subject "빈칸 복습 시작" → 첫 due 세트 조문 `?blank={setId}&blankSeq={setId 목록}` 진입. 조문 뷰어 빈칸 모드가 `blankSeq` 있으면 진행도("빈칸 복습 N/M") + "다음 빈칸 세트"(다음 세트의 조문·blank 로 풀 내비) + 끝나면 `/study/srs` 복귀. 세트가 타 과목이면 과목 넘어가며 진행.

### Stage 3 (선택) — 허브 재구성 + 보기 게이트
- `/study/srs` 상단 통합 "복습 시작" 진입 정리, OX prev/next 카드 네비 보강, MCQ "오답 답 없이 다시 보기"(보기 게이트 `revealed || viewMode` 한 줄, `problem-viewer.tsx:1280`).

## 파일 (Stage 1)

- 신규: `app/features/study/api/session-from-srs.tsx`
- 수정: `app/routes.ts`(라우트), `app/features/subjects/screens/problem-viewer.tsx`(payload override), `app/features/study/screens/srs.tsx`(MCQ 러너 버튼)
- DB/마이그 없음(scope "filter" 재사용), typecheck 수행.

## 3계층 게이트

- **L1**: 점검으로 확인된 UX 결함(scatter) 해소 — 필수. 더 단순한 대안 = 기존 세션+뷰어 재사용(채택). DRY = `createQuizSession` 재사용(새 mutation 경로 아님, 신규 caller). 서버 권위 = 세션 생성 서버 action.
- **L2**: 상태 경계 OK(세션=persisted). 소유자 = 서버 action. scopePayload override는 범용·의미 일관. 반쪽 열림 없음. 뮤테이션 경로 동결 — `createQuizSession` 그대로.
- **L3**: feature api 모듈, Zod 검증, `any` 없음, 상수(`PER_PROBLEM_LIMIT_SEC`) 형제 파일과 일치.

## 한계

- 다과목 due를 **한 스트림**으로 섞어 prev/next 하려면 `/subjects/{law}/` 밖의 신규 러너가 필요(세션=단일 과목 제약). Stage 1은 과목별 세션으로 충분(OX는 이미 별도 cross-subject 러너). 통합 스트림은 후속 판단.
