# AI 객관식 문제 초안 + 강사 검증 E2E 시연 가이드 (2026-06-01)

§5 검증·완료 조건. 이 가이드대로 1회 따라가면 §1~§4 모든 동작이 통합 검증된다.

## 사전 자동 검증 (즉시 실행)

```bash
npx tsx scripts/verify-review-gate.ts
```

성공 시 출력:
```
=== ① 구조 검증 단위 케이스 ===
  ✓ mc_short 정상 (5선지 + 정답 1)
  ✓ mc_short 정답 0개 (오류)
  ✓ mc_short 정답 2개 (오류)
  ✓ mc_short 선지 중복 (오류)
  ✓ mc_box 정상 (보기 4, 정답 = 참 보기 set)
  ✓ mc_box 정답 마커 불일치 (참=ㄱ,ㄷ 인데 정답 ① ㄱ,ㄴ — ★ 핵심)
  → 6/6 통과

=== ② 게이트 시뮬 (DB 직접) ===
  ✓ listProblemsBySubject(default) — draft 제외 (n=0)
  ✓ listProblemsBySubject(includeUnapproved) — staff 우회 가능 (n=1)
  ✓ search-content picker — draft 제외 (n=0)
  ✓ addPackProblems(bulk) — added=0, skippedUnapproved=1
  ✓ addPackProblem(single) — unapproved error
  ✓ approve 후 listProblemsBySubject — 노출 (n=1)
  ✓ approve 후 addPackProblem — 성공

전체: 13 통과 / 0 실패
```

이 스크립트는 임시 draft 문제를 만들어 게이트 동작을 확인하고 cleanup. dev server 불요. **모든 게이트 강제 동작을 자동 확인**.

---

## 수동 E2E 시연 (브라우저)

dev server 띄우고 staff 계정 로그인:

```bash
npm run dev
```

### 단계 1 — AI 초안 생성

1. `/admin/problems/ai-gen` 접속
2. 입력:
   - 과목: **특허법(patent)**
   - 주요 조문 ID: 비움 (lawCode 전체 무작위 분배)
   - 단답형(mc_short): **1**
   - 박스형(mc_box): **1**
   - 모델: Claude Sonnet 4.6
3. **생성 시작** 클릭
4. 1-3분 대기 → "생성 결과" 리포트 표시

**확인 항목**:
- ✓ 요청 2 / 성공 생성 1~2건
- ✓ 비용 ~$0.05~0.10
- ✓ 입력/출력 토큰 표시
- ✓ "근거 부족 skip" "구조 경고" "중복 의심" 카운트 표시
- ✓ "생성된 문제" 목록에 problemId 클릭 가능 (검증 큐 link)

### 단계 2 — 검증 큐 진입 확인

1. `/admin/problems/review` 접속 (또는 결과 리포트에서 link)
2. 좌측 목록에 방금 생성된 문제 표시

**확인 항목**:
- ✓ 형식 badge ("단답형" / "박스형")
- ✓ origin badge "AI 초안"
- ✓ 모델명 (claude-sonnet-4-6) 우측 표시
- ✓ source_chunk 수 0이면 "근거 부족" amber badge

### 단계 3 — 상세 + 근거 패널

1. 카드 클릭 → 우측 상세 패널 표시

**확인 항목**:
- ✓ 문제 본문 표시
- ✓ 박스형이면 보기 ㄱㄴㄷㄹㅁ 각각 (`o`/`X` 정오 표시)
- ✓ 선지 5개 + 정답 emerald 강조
- ✓ 해설 표시
- ✓ **근거 청크 패널** — RAG 청크 (조문/판례 본문) 그대로 표시
  - 청크 source_type badge
  - heading path
  - 청크 본문 600자까지

### 단계 4 — 박스형 구조 검증 확인 (★ 사용자 명세 핵심)

박스형 문제 중 모델이 잘못 답한 경우 (가끔 발생):
- 참 보기가 ㄱ,ㄷ인데 정답 선지가 "① ㄱ, ㄴ" 같이 불일치

**확인 항목**:
- ✓ `gen_range.structureWarning` 에 "정답 선지 누락 보기: ㄷ" 등 메시지 저장
- ✓ 자동 폐기 안 함 — 강사가 검증 큐에서 보고 판단 (반려 또는 빠른 수정 후 승인)
- ✓ 자동 검증 스크립트의 핵심 케이스 6번이 이 검증을 보장 (자동)

운영자가 화면에서 보고 싶다면 향후 `gen_range.structureWarning`을 ReviewListCard 에 표시하도록 확장 (§3 minimum 범위 밖).

### 단계 5 — 게이트 동작 확인 (검증 전)

1. 다른 탭에서 `/latest/mcq` 접속 → mock 종류 팩 1개 진입 (예: `/latest/mcq/<packId>`)
2. **문제 picker** 영역에서 방금 생성한 문제 본문의 첫 단어로 검색

**확인 항목**:
- ✓ **검색 결과에 안 뜸** (review_status=draft + search-content gate)

3. 학생 계정으로 전환 (또는 시크릿 창) → `/subjects/patent?tab=problems`
- ✓ **AI 초안 문제 안 보임** (listProblemsBySubject gate)

### 단계 6 — 승인 → 노출 → mcq_pack 추가 → 응시

1. staff로 다시 `/admin/problems/review`
2. 좌측 카드 체크박스 선택 → **승인 버튼** 클릭 → 확인 → 큐에서 사라짐 (또는 단일 카드 상세 패널 "승인" 버튼)
3. mcq_pack picker로 돌아가 같은 검색 재시도

**확인 항목**:
- ✓ picker에 표시됨
- ✓ "선택 N개 추가" 클릭 → mcq_pack_problems에 추가됨 → pack 상세에 문제 등장

4. 학생 또는 staff 로 `/latest/mcq/<packId>` 응시 시작
5. 시트에서 그 문제 등장 확인

### 단계 7 — 반려 흐름

1. `/admin/problems/review` 에서 다른 ai_draft 문제 1건 카드 선택
2. **반려** 버튼 → 사유 입력 → 확인
3. 큐 status 필터를 "rejected" 로 전환

**확인 항목**:
- ✓ rejected 큐로 이동, rejected_reason 빨간 상자에 표시
- ✓ 다른 화면 어디에도 노출 안 됨 (게이트 동일 작동)

### 단계 8 — 비용 cap 작동

`AI_QNA_DAILY_COST_USD_CAP=0.01` 같이 매우 낮게 설정 후 `npm run dev` 재시작 → AI 생성 시도 → 첫 article 직전 cap blocked → 결과 리포트의 `perArticleErrors` 에 "[GLOBAL CAP BLOCKED]" 표시.

---

## 비회귀 체크리스트

- [ ] `scripts/verify-review-gate.ts` 13/13 통과
- [ ] 기존 풀 (939건) 학생 화면 노출 변화 0 — `/subjects/patent?tab=problems` 정상
- [ ] `/admin/problems` 단순 검색·필터 정상
- [ ] mcq_pack picker — 기존 approved 문제 검색 정상

---

## 변경 파일 요약 (§1~§5)

### 마이그레이션
- `problems.review_status` enum + 7컬럼 + 인덱스 + 기존 939건 approved backfill

### 게이트 코드
- `app/features/problems/queries.server.ts` — listProblemsBySubject + includeUnapproved opt + listProblemsForReview/getProblemForReview 추가
- `app/features/admin/api/search-content.tsx` — picker 게이트
- `app/features/mcq-packs/queries.server.ts` — addPackProblem(s) 양쪽 서버 재검증

### 검증 화면 (§2)
- `app/features/admin/screens/admin-problem-review.tsx`
- `app/features/admin/api/problem-review.tsx` (approve/reject/bulk/quick-edit)

### AI 생성 (§3+§4)
- `app/features/admin/lib/ai-problem-gen.server.ts` (분배·RAG·Anthropic·구조 검증·중복·cap)
- `app/features/admin/api/ai-problem-gen.tsx`
- `app/features/admin/screens/admin-ai-problem-gen.tsx`

### 검증 스크립트 (§5)
- `scripts/verify-review-gate.ts`

### 라벨
- `app/features/problems/labels.ts` — origin "AI 초안" 라벨

### 라우트
- `/admin/problems/review`
- `/admin/problems/ai-gen`
- `/api/admin/problem-review`
- `/api/admin/ai-problem-gen`

---

## 안전 가드 요약

| 위치 | 가드 |
|---|---|
| DB | review_status NOT NULL DEFAULT 'draft' — 신규 row 자동 차단 |
| listProblemsBySubject | review_status='approved' 강제 (staff opt 우회) |
| search-content picker | review_status='approved' 강제 |
| addPackProblems / addPackProblem | 서버 재검증 — unapproved 차단 |
| AI 생성 | origin='ai_draft' + draft → § 2 큐 진입 |
| AI 생성 | 1회 30문항 상한 + 매 article 전 cap 체크 |
| 구조 검증 | 실패도 폐기 안 함, gen_range.structureWarning 보존 |
| 근거 부족 | hits < 2 시 자동 skip + 사유 기록 |

## 롤백

§1 마이그레이션 롤백 SQL (필요 시):
```sql
DROP INDEX IF EXISTS public.problems_law_review_idx;
ALTER TABLE public.problems
  DROP COLUMN gen_range, DROP COLUMN source_chunk_ids,
  DROP COLUMN generated_at, DROP COLUMN generated_by,
  DROP COLUMN rejected_reason, DROP COLUMN approved_by,
  DROP COLUMN approved_at, DROP COLUMN review_status;
DROP TYPE IF EXISTS public.problem_review_status;
```
enum value `ai_draft`는 PG 제약상 제거 불가, 미사용으로 둠. 코드 롤백은 git revert.
