# 2차 논점 추출 훈련 — E2E 시연 가이드 (2026-06-01)

§1 논점 데이터+승인 게이트 + §2 학생 백지 작성+자기채점 + §3 AI 보조 + §4 결과·연결.

핵심 원칙:
- **승인된 논점만** 학생 노출 (서버 재검증).
- **답안 전체 X — 핵심 논점만** 백지에서 빠르게 반복.
- AI 는 **단정 X, 보조 의견**. 최종 판단은 학생 자기채점.

---

## 자동 검증 (3 스크립트)

```bash
npx tsx scripts/verify-gs-issues.ts            # §1 — 데이터·게이트  (8/8)
npx tsx scripts/verify-gs-issue-attempts.ts    # §2 — 학생 흐름      (10/10)
npx tsx scripts/verify-gs-issue-analyze.ts     # §3 — AI 분석·degrade (8/8)
npx tsx scripts/verify-gs-issue-e2e.ts         # §4 — 통합 + ref link (9/9)
```

총 35 체크.

---

## 수동 E2E (브라우저)

```bash
npm run dev
```

### A. 강사 흐름 — 논점 추출·승인

1. staff 계정 로그인 → 운영관리 → 주관식 문제 → **주관식 회차** → 회차 선택
2. 회차 편집 화면 헤더의 **"논점 관리"** 버튼 클릭 → `/admin/gs/:roundId/issues`
3. 좌측 문항 클릭 → 우측에서 **"AI 로 논점 추출"** 클릭
   - ✓ 비용 가드 cap 도달 시 503 ("AI 채점 초안 일일 한도 도달")
   - ✓ 정상 시 모범답안에서 3~8 개 draft 추출
4. 각 카드의 **승인 / 반려 / 수정** 액션
   - 수정: 라벨·설명·importance(핵심/부차)·ref_hint 편집
   - **일괄 승인**: 체크박스 다중 선택 → 상단 툴바 "일괄 승인"
5. **승인된 논점만** 학생 화면에 노출 (다음 단계에서 검증)

### B. 학생 흐름 — 백지 작성 → 자기채점 → AI 보조

#### B-1. 색인 진입

학생 계정 로그인 → **/gs** 대시보드 진입 → 상단 **"논점 추출 훈련"** 카드 클릭 → `/gs/issues`
- ✓ 미응시 / 진행 / 제출 / 완료 4 섹션
- ✓ 과목 필터 (특허/상표/디자인/민법/민사소송법)
- ✓ **승인 논점 없는 문항은 미노출** (게이트)

#### B-2. 작성 단계 (모범 잠금)

문항 카드 클릭 → `/gs/issues/:questionId`
- ✓ 사례 본문만 노출, **모범 논점은 보이지 않음**
- ✓ textarea 에 한 줄씩 자유 서술 — autosave (700ms debounce)
- ✓ "자동 저장됨" / "저장 중…" indicator
- 새로고침 → 본문 그대로 복구 (재진입 OK)

#### B-3. 제출 → 자기채점 단계

"제출 → 모범 논점 보기" → 모범 논점 reveal:
- ✓ 각 모범 논점에 "짚음 / 빠뜨림" 버튼 (default = 미정)
- ✓ "잘못 넣은 논점" 자유 텍스트 입력란
- ✓ 결정 N/M 카운터
- "자기채점 저장" 클릭 → 완료 단계

#### B-4. (선택) AI 의견 받기

자기채점 단계 상단 amber 패널 **"AI 의견 요청"** 클릭:
- ✓ cap 도달 시 panel 안에서 "오늘 AI 한도 도달 — 자기채점으로 진행하세요" (graceful)
- ✓ 정상 시 결과 노출:
  - "AI: 짚었을 가능성" / "AI: 빠뜨렸을 가능성" chip 이 각 모범 카드에 추가
  - evidence ("학생이 '신규성 위반' 표현 사용") 회색 italic
  - "extras" — 모범에 없는 자작 논점 목록
- ✓ **단정 어조 금지** 확인: "…일 가능성", "확인해보세요", "사람 판단으로 최종"
- 학생이 AI 결과를 참고해 짚음/빠뜨림 토글 — AI 가 자동으로 결정 안 함

#### B-5. 완료 단계 + 다음 단계 연결

자기채점 저장 후:
- ✓ 3 카드 (짚은 / 빠뜨린 / 핵심 누락)
- ✓ AI 의견 받아뒀으면 요약 패널 같이 노출
- ✓ "빠뜨린 논점" 카드 안에 **"근거 학습 →"** chip
  - ref_article_id 연결되어 있으면 `/subjects/<law>/articles/<번호>` link
  - ref_case_id 연결되어 있으면 `/subjects/<law>/cases/<id>` link
- ✓ 하단 액션 3종:
  1. **"답안 작성 단계로 →"** → `/gs/<roundId>/take` (PPT 흐름: 논점→답안)
  2. **"다시 풀기"** → reset (student_issues_md 비움 + 단계 초기화)
  3. **"목록으로"** → `/gs/issues`

---

## 회귀 체크리스트

### 게이트
- [ ] draft / rejected 논점은 학생 색인·진입·결과 어디서도 노출되지 않음
- [ ] URL 직접 입력으로도 미승인 문항 진입 차단 (서버 재검증)
- [ ] 강사 검증·승인 큐만 모든 status 노출

### 학생 작성
- [ ] 작성 단계에서 모범 논점 절대 노출 X
- [ ] autosave 동작 + 새로고침 복구
- [ ] 제출 후 단계 자동 전환 (revalidator)

### AI
- [ ] AI 결과는 "가능성" 어조 + evidence 표시 + 사람 판단 안내 문구
- [ ] cap 도달 시 자기채점 흐름은 계속 가능
- [ ] AI 가 학생 hits/missed 를 자동 마킹하지 않음 — 학생이 직접 선택

### 비용 가드
- [ ] `/admin/gs/usage` 에서 `ai_issue_extract` + `ai_issue_analyze` 비용이 AI 합산에 포함
- [ ] cap 환경변수 그대로 — 추가 설정 없이 작동

### 다음 단계 link
- [ ] 빠뜨린 논점에 ref_article_id 가 있으면 조문 뷰어 link
- [ ] ref_case_id 가 있으면 판례 뷰어 link
- [ ] "답안 작성 단계로 →" → `/gs/<roundId>/take` 정상 진입

### 비회귀
- [ ] 기존 회차 응시·채점 흐름 영향 0
- [ ] 기존 GS 비용 가드 동작 영향 0 (kind 확장만)
- [ ] `npm run typecheck` 통과

---

## 환경변수 (변경 없음)

기존 GS 비용 가드 그대로 사용:
- `GS_AI_DAILY_COST_USD_CAP` — `ai_issue_extract` + `ai_issue_analyze` 합산 포함
- `GS_OCR_*` — 영향 0 (논점은 OCR 사용 안 함)
- `ANTHROPIC_API_KEY` — 미설정 시 모든 AI 흐름 graceful (자기채점 그대로)

---

## 롤백

### DB
```sql
DROP TABLE IF EXISTS public.user_issue_attempts;
DROP TABLE IF EXISTS public.gs_question_issues;
DROP TYPE IF EXISTS public.gs_issue_importance;
-- gs_ai_usage kind CHECK 원복 (3종)
ALTER TABLE public.gs_ai_usage DROP CONSTRAINT IF EXISTS gs_ai_usage_kind_check;
ALTER TABLE public.gs_ai_usage ADD CONSTRAINT gs_ai_usage_kind_check
  CHECK (kind IN ('ai_grade','ai_draft','ocr'));
-- staff_notification_kind enum — 'gs_cap_reached' 은 그대로 유지(영향 0).
```

### 코드
`git revert` (TS lib / queries / api / screens / routes / sidebar link).

---

## 신규 파일 / 수정 요약

### 마이그
- `gs_issue_importance` enum
- `gs_question_issues` 테이블 (gs_question_id XOR problem_id CHECK — 승격 대비)
- `gs_ai_usage_kind_check` 확장 (`ai_issue_extract`, `ai_issue_analyze`)
- `gs_ai_usage_today_totals` / `_recent_days` / `_top_rounds` — `ai_*` 패턴으로 자동 합산
- `user_issue_attempts` 테이블 ((user, gs_question) UNIQUE + 본인 R/W + staff R)

### 신규 코드
- `app/features/gs/lib/ai-issue-extractor.server.ts`
- `app/features/gs/lib/ai-issue-analyzer.server.ts`
- `app/features/gs/queries-issues.server.ts`
- `app/features/gs/queries-issue-attempts.server.ts`
- `app/features/gs/api/issue-draft.tsx`
- `app/features/gs/api/issue-review.tsx`
- `app/features/gs/api/issue-attempt.tsx`
- `app/features/gs/api/issue-analyze.tsx`
- `app/features/gs/screens/admin-gs-issues.tsx`
- `app/features/gs/screens/gs-issues.tsx`
- `app/features/gs/screens/gs-issue-take.tsx`
- `app/features/gs/screens/gs-issue-take-ai-panel.tsx`
- `scripts/verify-gs-issues.ts`
- `scripts/verify-gs-issue-attempts.ts`
- `scripts/verify-gs-issue-analyze.ts`
- `scripts/verify-gs-issue-e2e.ts`
- `docs/runbooks/gs-issue-extraction-e2e.md` (본 문서)

### 수정
- `app/features/gs/lib/usage-tracker.server.ts` — `AiUsageKind` 4종 (`ai_grade`/`ai_draft`/`ai_issue_extract`/`ai_issue_analyze`)
- `app/features/gs/screens/admin-gs-edit.tsx` — "논점 관리" 버튼
- `app/features/gs/screens/gs.tsx` — "논점 추출 훈련" 진입 카드
- `app/routes.ts` — 신규 학생/관리 라우트 6개

### 변경 안 한 것 (의도)
- 1차 객관식 review 패턴 — 같은 enum (`problem_review_status`) 재사용
- 기존 회차 응시·채점·동료채점·우수답안 흐름 — 영향 0
- 사이드바 — staff 진입은 회차 편집 액션으로 (별도 사이드바 항목 없음)
- 학생 진입 — 학생 사이드바 없음. `/gs` 대시보드의 진입 카드 + `/gs/issues` 직접 URL
