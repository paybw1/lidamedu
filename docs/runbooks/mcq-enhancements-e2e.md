# 1차 객관식 응시·결과 고도화 E2E 시연 가이드 (2026-06-01)

§A 응시 CBT 기본기 + §B 결과 학습 연결 + §B5 통합 시험 안내. 채점 코어는 변경 0(읽기만).

## 사전 자동 검증 (즉시)

```bash
npx tsx scripts/verify-mcq-enhancements.ts
```

기대 결과:
```
=== ① 채점 코어 함수 import ===        4/4 ✓
=== ② 빈 input helper 안전성 ===       5/5 ✓
=== ③ flag toggle 멱등 (실 DB) ===     5/5 ✓
종합: 14 통과 / 0 실패
```

채점 코어 함수 import 가능 = 시그니처 변경 0. 빈 input 안전성 = 누락 데이터에서도 정상 처리.

---

## 수동 E2E (브라우저)

dev server + staff 또는 학생 계정 로그인:
```bash
npm run dev
```

### 동선 A — 응시 CBT 기본기

1. `/latest/mcq` 에서 mock 종류 팩 1개 진입 → "응시 시작" (시험 모드)
2. **네비 버튼** 클릭 → 그리드 표시
   - ✓ 응답한 문제는 emerald, 미응답은 outline
   - ✓ 그리드 셀 클릭 → 해당 문제로 스크롤
3. 임의 문제 카드 우측 **북마크 아이콘** 클릭 → 노란색 활성 + sticky 헤더에 "다시 볼 문제 N" 표시
   - ✓ 그리드 셀에 노란 점
   - ✓ **페이지 새로고침** → 플래그 그대로 (DB 복구)
4. 일부 미응답 상태로 "결과 보기" 또는 "시험 끝내기" 클릭 → **미응답 모달**
   - ✓ "미응답 N문항" + 점프 버튼들
   - ✓ "계속 풀기" / "그래도 제출" 선택 가능 (강제 X)
5. **점수·정답은 시험 모드 동안 노출 0** (실전 환경 유지) ✓

### 동선 B1 — 결과: 오답별 근거 바로가기

1. 응시 끝나면 `/latest/mcq/<packId>/result/<sessionId>` 자동 이동
2. 오답이 있으면 표 아래 **"오답별 근거 바로가기"** 섹션 표시
3. 각 오답 카드 안:
   - **조문 chip** (`/subjects/:lawCode/articles/:n` link, prefetch=intent)
     - via 표시: "내가 고른 보기 근거" / "주요 조문" / "ㄱ 보기 근거" 등
   - **판례 chip** (`/subjects/:lawCode/cases/:id`)
   - **AI 근거 청크** preview (mc_short/mc_box origin=ai_draft 한정)
   - **해설 보기** details (fold)
4. 3유형 시연 확인:
   - **유형 1 (AI 문제)**: `source_chunk_ids` → 청크 preview 표시
   - **유형 2 (related_id)**: 보기/문제의 `related_article_id` → 조문 chip
   - **유형 3 (해설만 fallback)**: 위 두 개 없으면 해설 details만

### 동선 B1-박스 — 박스형 보기별 근거 (★)

박스형(mc_box) 오답이 있는 회차에서:
- 카드의 조문 chip에 **via "ㄱ 보기 근거" / "ㄴ 보기 근거" ...** 표시
- 각 marker가 어느 조문에 연결되었는지 확인 가능
- ✓ "어느 보기 판정을 틀렸는지"까지 추적 가능

### 동선 B2 — 오답 묶기 재도전

오답 있는 결과 화면 상단의 **"오답 N문항 묶어 다시 풀기"** 패널:
1. **오답 재도전** 클릭 → 새 wrong-note 세션 생성 → 첫 오답 문제로 redirect
2. URL: `/subjects/<lawCode>/problems/<problemId>?session=<newSessionId>&mode=study`
3. ✓ 같은 문제·같은 순서 + 학습 모드 (즉시 채점 가능)
4. **(향후 SRS 자리)**: 새 세션의 `scope_payload.sourceSessionId` 에 원본 sessionId 보존 → 데이터 재작업 없이 "이 오답들을 SRS 큐에 추가" 기능 추가 가능

검증:
```sql
SELECT scope_payload FROM quiz_sessions WHERE session_id = '<newSessionId>';
-- → { sourceSessionId: "...", sourceExamAttemptId: null/uuid, originLabel: "이번 회차 오답" }
```

### 동선 B3 — 약점 단원 패널

응시 결과의 점수 요약 아래 **"단원별 정답률"** 표:
- 정답률 낮은 순 5개
- rose(<50%) / amber(<75%) / emerald 톤 구분
- 단원 라벨 클릭 → `/subjects/:lawCode/systematic/:nodeId`
- 가장 약한 단원이 60% 미만이면 💡 추천 메시지

✓ subject가 patent/trademark/design/civil/civil_procedure 에서만 노출 (industrial/science 혼합은 link 비활성으로 panel 미표시)

### 동선 B4 — 성장 표현

점수 요약 헤더에:
- **"합격까지 N점"** badge (점수 < passScore일 때)
- **"합격선 +N점"** badge (점수 >= passScore일 때, emerald)
- **"지난 회차 ±N점"** badge (같은 pack의 이전 완료 응시 있을 때)
  - +면 emerald, -면 rose, 동률이면 muted

지난 회차 없으면 표시 안 됨.

### 동선 B5 — 통합 시험 안내 (3교시)

`/latest/mcq/exam/:examId` 응시 중 상태:
- ✓ amber 안내 상자에 **"지금 다음으로 풀 교시는 N교시"**
- ✓ **"교시는 순서대로 잠금 해제 + 독립 타이머"** 명시
- ✓ 잠긴 교시 옆 **"이전 교시 완료 후 열림"** label + hover title 사유

서버 게이트(`/api/mcq-pack/start`)는 그대로 유지.

### 동선 C — 채점 비회귀 (코어 불변)

| 항목 | 검증 방법 |
|---|---|
| 점수 | 응시 결과의 점수 = `correct/total × 100` 변화 0 |
| 합격/불합격 | 합격선 비교 로직 변화 0 |
| 등수/백분위/z | `mcq_pack_attempt_stats` RPC 그대로 |
| 통합 시험 평균/과락/판정 | `getExamAttemptBreakdown` 단일 진입점 그대로 |
| 교시 drill-in | 통합 시험 결과 → 교시 행 클릭 → mcq-pack-result 정상 |
| 유형/지문 정답률 | `getPackResultStats` 표 동일 |

이 항목들의 코드는 손대지 않음 — git diff로 확인 가능.

---

## 회귀 체크리스트

- [ ] `scripts/verify-mcq-enhancements.ts` 14/14
- [ ] `npm run typecheck`
- [ ] 응시 화면에 점수·정답 노출 0 (시험 모드 동안)
- [ ] 플래그 → 새로고침 후 복구
- [ ] 미응답 모달 → "계속 풀기" / "그래도 제출" 둘 다 동작
- [ ] 오답 근거 chip 3유형 모두 시연 (AI source / related_id / 해설 fallback)
- [ ] 박스형 오답 카드에 marker별 via 표시
- [ ] 오답 재도전 → 새 세션 생성 + 첫 문제 redirect + `scope_payload.sourceSessionId` 보존
- [ ] 약점 단원 패널 → 정답률 낮은 순 정렬 + 단원 link 정상
- [ ] 합격선까지 / 지난 회차 ± badge 표시
- [ ] 통합 시험 응시 중 안내 "지금 다음으로 풀 교시" / 잠금 사유 표시
- [ ] 통합 시험 결과 → 교시 행 클릭 → 팩 결과 화면 정상 (drill-in)
- [ ] 같은 점수 입력에 대해 ranking.score 변화 0

---

## 변경 파일 요약

### 마이그
- `user_quiz_flags(session_id, problem_id, user_id PK)` + RLS

### 코드
- `app/features/study/api/quiz-flag.tsx` (신규, §A)
- `app/features/study/api/session-from-attempts.tsx` (신규, §B2)
- `app/features/study/queries.server.ts` (확장): `getSessionFlagSet` / `getEvidenceForWrongProblems` / `getSessionWeakNodes` / `getPreviousPackScores`
- `app/features/latest/screens/mcq-pack-sheet.tsx` (§A: 네비/플래그/모달)
- `app/features/latest/screens/mcq-pack-result.tsx` (§B1~B4)
- `app/features/latest/screens/mcq-exam-runner.tsx` (§B5)
- `app/routes.ts` (2 신규 라우트)
- `database.types.ts` (마이그 결과)

### 검증
- `scripts/verify-mcq-enhancements.ts`
- `docs/runbooks/mcq-enhancements-e2e.md` (본 문서)

### 변경 안 한 것 (의도)
- `mcq-packs/queries.server.ts` 점수·등수 RPC 래퍼
- `mcq-exams/queries.server.ts` 통합 합격 판정 (`getExamAttemptBreakdown`)
- `study/queries.server.ts` 의 `getQuizSessionResult` / `getProblemStatsBulk`
- `mcq-pack-sheet`의 `recordAttempt` / `completeSession` / 타이머 / 채점숨김
- `/api/mcq-pack/start` 교시 게이트
- `mcq-exam-result.tsx` (drill-in 으로 §B 자동 적용)

---

## 롤백

§A 마이그:
```sql
DROP TABLE IF EXISTS public.user_quiz_flags;
```
나머지는 git revert (DB 변경 0).
