# GS AI·OCR 비용 가드 — E2E 시연 가이드 (2026-06-01)

§1 사용량 로깅 + §2 cap·graceful degrade + §3 운영자 가시성·알림 통합.

**핵심 원칙**: cap 도달 시 학생 응시 / 강사 직접 채점 등 **핵심 흐름은 절대 차단되지 않는다**. AI 초안·OCR 보조 기능만 멈춘다.

---

## 사전 자동 검증 (즉시)

```bash
npx tsx scripts/verify-gs-cost-guard.ts
```

기대 결과: `25 통과 / 0 실패 (총 25)`

검증 범위:
- pricing 단가 (Opus 4.7 / Sonnet 4.6 / Vision OCR) 6건
- KST 시간대 변환 2건
- 실 DB insert / 비용 산정 / 회수 4건
- 집계 RPC (today + daily summary staff guard) 2건
- cap 게이트 시뮬 (env override) 7건
- notifyCapReachedOnce 멱등 + staff fanout 3건
- cleanup 1건

---

## 수동 시연 (브라우저 + dev server)

### A. 준비 — cap 매우 낮게 설정

`.env` 또는 dev server 실행 시 env 주입:

```bash
GS_AI_DAILY_COST_USD_CAP=0.0001 \
GS_OCR_DAILY_COST_USD_CAP=0.0001 \
GS_OCR_DAILY_CALL_CAP=1 \
npm run dev
```

> cap 값이 매우 낮아 1~2건 호출만으로 도달함. 시연 후 env 변수 해제.

---

### B. 시나리오 1 — OCR cap 도달 시 학생 페이지 업로드 **정상 진행** (핵심)

#### 절차
1. 학생 계정 로그인 → `/gs` → 응시 가능 회차 진입
2. 첫 페이지 이미지(JPG) 업로드 → 정상 OCR (1번째 호출)
3. 두 번째 페이지 이미지 업로드 — **여기서 OCR cap 도달**

#### 기대 결과 (✓)
- ✓ 두 번째 페이지 슬롯에 **썸네일 정상 표시** (Storage 업로드 OK)
- ✓ 페이지 매핑·판독 자가확인 등 모든 UI 동작 정상
- ✓ "제출하기" 버튼은 매핑·판독만 충족하면 활성화 (OCR 결과 무관)
- ✓ DB `gs_submission_pages.attachment.ocrSkippedReason = 'cap'` 마킹
- ✓ DB `gs_ai_usage` 에 `kind='ocr', outcome='skipped_cap', reason='ocr_daily_cost'` 행 추가
- ✓ DB `gs_cap_alerts (today, 'ocr_daily_cost')` 행 추가 (첫 도달)
- ✓ staff 전원에게 인앱 알림 (`user_notifications.kind='gs_cap_reached'`)

#### SQL 점검
```sql
-- skipped_cap 행 확인.
SELECT date, kind, outcome, reason, occurred_at
  FROM gs_ai_usage
 WHERE kind = 'ocr'
   AND outcome = 'skipped_cap'
 ORDER BY occurred_at DESC
 LIMIT 5;

-- 페이지 attachment 에 마킹 확인.
SELECT page_number, attachment->>'ocrSkippedReason' AS skipped
  FROM gs_submission_pages
 WHERE submission_id = '<위 응시 submission_id>'
 ORDER BY page_number;
```

---

### C. 시나리오 2 — AI 채점 cap 도달 시 강사 직접 채점 **정상**

#### 절차
1. staff 계정 로그인 → `/admin/gs/<roundId>/grade/<submissionId>` 진입
2. 문항 1 카드에서 **"AI 초안" 버튼 클릭** — 정상 응답(1번째 호출)
3. 문항 2 카드에서 **"AI 초안" 버튼 클릭** — cap 도달

#### 기대 결과 (✓)
- ✓ 화면에 에러 메시지: **"AI 채점 초안 일일 한도에 도달했습니다. 강사 직접 채점을 이용해 주세요."** (HTTP 503)
- ✓ **점수·피드백 입력란 정상 동작** — 강사 수동 입력으로 채점 완료 가능
- ✓ 다른 문항 카드의 "AI 초안" 버튼도 동일하게 503 응답
- ✓ "채점 마무리(잠금)" 정상 진행, 학생 결과 공개 정상
- ✓ DB `gs_ai_usage` 에 `kind='ai_draft', outcome='skipped_cap'` 행 추가
- ✓ staff 알림 (오늘 첫 AI cap 도달 시 한 번만)

---

### D. 시나리오 3 — 운영자 사용량 화면 가시성

#### 절차
1. staff 계정 → 운영관리 → **주관식 문제** → **AI·OCR 사용량** (사이드바)
2. URL: `/admin/gs/usage`

#### 기대 결과 (✓)
- ✓ 오늘 카드 3종 (AI 비용 / OCR 비용 / OCR 호출수)
  - 현재값 / cap 막대 비율 표시 (≥100% 일 때 rose)
  - cap 미설정 시 "GS_AI_DAILY_COST_USD_CAP 미설정 — cap 비활성" 안내
- ✓ "최근 7일 추이" 표 — 시연 후 시연 일자 행에 호출수·비용·skip(cap) 모두 표시
- ✓ skip(cap) 컬럼에 coral chip 표시 (cap 도달 시연한 만큼)
- ✓ "비용 상위 회차" 표 — 시연한 회차가 노출
- ✓ 회차 행 클릭 → `/admin/gs/<roundId>/stats` 로 drill-in

#### 회차 통계 화면
- 같은 회차의 통계 화면(`/admin/gs/<roundId>/stats`)에서:
  - 상단 KPI 카드 아래에 **"AI · OCR 사용량 (이 회차)"** 카드
  - AI 비용 + 호출수 / OCR 비용 + 호출수, skip(cap) 있으면 rose 텍스트

---

### E. 시나리오 4 — staff 알림 받기

#### 절차
1. 시나리오 B 또는 C 직후 staff 계정으로 인박스 진입: `/admin/inbox`

#### 기대 결과 (✓)
- ✓ "GS AI 채점 일일 한도 도달" 또는 "GS OCR 일일 한도 도달" 알림 표시
- ✓ 본문에 cap 값·차단 영향 안내 (강사 채점 정상 / 페이지 업로드 정상)
- ✓ 링크 클릭 시 `/admin/gs/usage` 이동
- ✓ 같은 reason 으로 같은 날에 알림 추가 X (멱등)

---

## 환경변수 정리

| 변수 | 의미 | default |
|---|---|---|
| `GS_AI_DAILY_COST_USD_CAP` | AI(채점+초안) 일일 비용 cap (USD) | 미설정 = OFF |
| `GS_OCR_DAILY_COST_USD_CAP` | OCR 일일 비용 cap (USD) | 미설정 = OFF |
| `GS_OCR_DAILY_CALL_CAP` | OCR 일일 호출 수 cap | 미설정 = OFF |
| `GS_OCR_PAGE_USD` | OCR 페이지 단가 override | 미설정 = $0.0015 |

> 운영 default = 모두 OFF. 실 운영에서 회차 1~2회 추세 보고 적정 값 설정 권장.

---

## 회귀 체크리스트

- [ ] `npx tsx scripts/verify-gs-cost-guard.ts` 25/25
- [ ] `npm run typecheck` 통과
- [ ] **OCR cap 도달 시** 페이지 업로드·매핑·판독·제출 정상
- [ ] **AI cap 도달 시** 점수·피드백 입력·채점 마무리 정상
- [ ] cap 도달 알림은 같은 날 reason 별 1회 (멱등)
- [ ] 사용량 화면 cap 잔여 막대 색상 분기 (emerald/amber/rose/muted)
- [ ] 회차 통계 화면에 사용량 카드 표시 (호출 0 이면 카드 자체 숨김)
- [ ] cap 해제 후 (env 변수 0/미설정) 다시 호출 정상
- [ ] 호출 측 다른 진입점 없음 (`generateGradingDraft`/`analyzeHandwriting` grep 결과 2 곳뿐)

---

## 롤백

### DB
```sql
DROP TABLE IF EXISTS public.gs_cap_alerts;
DROP FUNCTION IF EXISTS public.gs_ai_usage_top_rounds(int, int);
DROP FUNCTION IF EXISTS public.gs_ai_usage_recent_days(int);
DROP FUNCTION IF EXISTS public.gs_ai_usage_round_summary(uuid);
DROP FUNCTION IF EXISTS public.gs_ai_usage_daily_summary(date);
DROP FUNCTION IF EXISTS public.gs_ai_usage_today_totals();
DROP TABLE IF EXISTS public.gs_ai_usage;
-- enum 값은 ROLLBACK 불가 — 미사용 상태로 잔존 (영향 0)
```

### 코드
`git revert` (TS 모듈 / 호출 측 / 사용량 화면 / 사이드바 / 라우트).

### 결과
호출 측 `generateGradingDraft` / `analyzeHandwriting` 는 cap 가드·meta 로깅 없이 기존 동작으로 복귀. 기존 기능 영향 0.

---

## 변경 파일 요약

### 마이그
- `gs_ai_usage` 테이블 + 인덱스 3개
- `gs_cap_alerts` (date, reason) PK 테이블
- RPC 5개 (`today_totals` / `daily_summary` / `round_summary` / `recent_days` / `top_rounds`)
- enum `staff_notification_kind += 'gs_cap_reached'`

### 신규
- `app/features/gs/lib/pricing.ts`
- `app/features/gs/lib/usage-tracker.server.ts`
- `app/features/gs/queries-usage.server.ts`
- `app/features/gs/screens/admin-gs-usage.tsx`
- `scripts/verify-gs-cost-guard.ts`
- `docs/runbooks/gs-cost-guard-e2e.md` (본 문서)

### 수정
- `app/features/gs/lib/ai-grader.server.ts` — usage 메타 + recordAiUsage 자동 기록
- `app/features/gs/lib/ocr.server.ts` — usage 메타 + recordOcrUsage 자동 기록
- `app/features/gs/api/ai-draft.tsx` — cap preflight + 알림
- `app/features/gs/api/take.tsx` — OCR cap preflight + ocrSkippedReason 마킹 + 알림
- `app/features/gs/queries.server.ts` — `GsAttachment.ocrSkippedReason` 필드
- `app/features/gs/screens/admin-gs-round-stats.tsx` — 회차 사용량 카드
- `app/features/admin/components/admin-shell.tsx` — 사이드바 "AI·OCR 사용량"
- `app/routes.ts` — `/admin/gs/usage` 라우트

### 변경 안 한 것 (의도)
- `generateGradingDraft` / `analyzeHandwriting` 의 **시그니처 호환** — meta 가 optional 추가만, 기존 호출 시그니처 깨지지 않음
- 강사 채점 화면 (`admin-gs-grade.tsx`) — AI 초안 503 응답은 기존 에러 표시 그대로 사용 가능
- 학생 응시 UI — OCR 보류는 attachment 마킹으로 추후 UI 안내 추가 여지 (현재 텍스트 안내는 §3 후속 작업으로 분리)
