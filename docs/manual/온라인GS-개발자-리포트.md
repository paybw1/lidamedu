# 온라인 GS — 개발자 리포트

> 변리사 2차 시험(주관식·논술) 대비 GS 회차 운영 기능의 기술 구조 요약. 2026-06-01 기준. 외부 신규 개발자가 인계받을 때 30분 이내에 전체 그림을 잡을 수 있도록 작성.

---

## 1. 한 줄 요약

학생이 종이 답안지에 손글씨로 작성 → 페이지별 사진 업로드 → 운영자(또는 동료) 채점 → 우수 답안 공개·포인트 지급 흐름을, **mcq_packs(객관식 모의)와 독립적으로** 운영하는 주관식 시험 시스템.

## 2. 핵심 도메인 결정 (DDD-style invariants)

| 결정 | 이유 |
|---|---|
| **종이 → 사진 업로드** 모델 (디지털 에디터 X) | 변리사 2차 실전이 종이 답안지 — 실전 감각 보존 |
| **submission 단위 N페이지 슬롯** + (페이지 ↔ 문항) **M:N 매핑** | 답안지 페이지 수가 회차마다 다르고, 한 페이지에 두 문항 겹치는 경우 존재 |
| **운영자 채점 = 최종 점수**, 동료 채점은 학습용 + 참고용 | 공정성/책임 — 학생 점수에 다른 학생이 영향 주지 않음 |
| **분쟁 큐는 표준편차 기반** (default 0.15·만점 비율) | 악의/실수 채점 자동 발견 — 운영자가 직접 확인 |
| **우수 답안은 별도 테이블**(`gs_distinguished_answers`) | submission/answer 와 분리 — 익명/공개 옵션 + 사후 추가/철회 |
| **포인트는 ledger 형식**(`gs_points_ledger`) | 잔액은 합계 계산, 모든 거래는 보존 (소급 정정 가능) |
| **답안지·페이지는 Supabase Storage signed URL** | RLS 우회 없이 본인·운영자·동료 채점자만 단기 URL 발급 |

## 3. 라우트 맵

### 학생 (`/gs/...`)
| Path | Screen | 역할 |
|---|---|---|
| `/gs` | `gs.tsx` | 대시보드 — 응시 가능/예정/종료 회차 + 내 동료 채점 배정 |
| `/gs/:roundId/take` | `gs-take.tsx` | 응시 (페이지 업로드 + 문항 매핑) |
| `/gs/:roundId/result` | `gs-result.tsx` | 결과 (제출/채점 대기/채점 완료 3-state) |
| `/gs/:roundId/distinguished` | `gs-distinguished.tsx` | 우수 답안 열람 |
| `/gs/peer-review/:assignmentId` | `gs-peer-review.tsx` | 동료 답안 익명 채점 |
| `/gs/peer-review/round/:roundId` | `gs-peer-review-round.tsx` | 한 회차의 동료 채점 진척 |
| `/gs/series/:seriesId` | `gs-my-series.tsx` | 내가 응시한 시리즈 상세 |
| `/gs/points` | `gs-points.tsx` | 내 포인트 잔액 + 거래 내역 |

### 운영자 (`/admin/gs/...`)
| Path | Screen | 역할 |
|---|---|---|
| `/admin/gs` | `admin-gs-list.tsx` | 회차 목록 (전체 status) |
| `/admin/gs/new` · `/admin/gs/:roundId` | `admin-gs-edit.tsx` | 회차 메타·문제·답안지 PDF 편집 |
| `/admin/gs/:roundId/stats` | `admin-gs-round-stats.tsx` | 회차 통계 (응시율·점수 분포·문항별) |
| `/admin/gs/:roundId/grade` | `admin-gs-grade-list.tsx` | 제출자 목록 + 채점 진행 상태 |
| `/admin/gs/:roundId/grade/:submissionId` | `admin-gs-grade.tsx` | 한 학생 채점 (답안지 갤러리 + 문항별 채점 카드 + 동료 점수 참고) |
| `/admin/gs/:roundId/peer-review` | `admin-gs-peer-review.tsx` | 동료 채점 진행 + 분쟁 큐 |
| `/admin/gs/:roundId/disputes` | `admin-gs-disputes.tsx` | 표준편차 threshold 기반 분쟁 의심 |
| `/admin/gs/:roundId/distinctions` | `admin-gs-distinctions.tsx` | 우수 답안 마킹 (자동 추천 + 수동) + 포인트 |
| `/admin/gs/series` · `/admin/gs/series/:id` · `/admin/gs/series/:id/stats` | `admin-gs-series-*.tsx` | 시리즈 묶음 + 통계 |
| `/admin/gs/points` | `admin-gs-points.tsx` | 학생 잔액 + 수동 ±조정 |

### API (`/api/gs/...`)
| Path | 역할 |
|---|---|
| `/api/gs/take` | POST — submission/페이지 swap/끼워넣기/매핑/판독 확인/제출 |
| `/api/gs/peer` | POST — 동료 채점 답안 저장·제출. GET — 답안 첨부 signed URL |
| `/api/gs/ai-draft` | POST — 문제 본문에서 모범답안·루브릭 AI 초안 |
| `/api/cron/gs-auto-assign` | cron — 회차 종료 후 동료 채점 자동 배정 |

## 4. DB 스키마 (`gs_*`)

```
gs_series ────< gs_rounds ────< gs_questions
                   │
                   ├──< gs_submissions ────< gs_submission_pages ──> attachments
                   │         │
                   │         ├──< gs_answers (문항별 채점 결과)
                   │         └──< gs_distinguished_answers
                   │
                   └──< gs_peer_assignments ──< gs_peer_review_answers

gs_points_ledger (user_id, +/-amount, source, ref)
```

### 핵심 테이블

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `gs_series` | series_id, title, subject, description_md | 회차 묶음 (선택) |
| `gs_rounds` | round_id, series_id?, title, subject, status('draft'|'published'|'closed'), start_at, end_at, duration_min, expected_pages, paper_pdf_path?, answer_key_pdf_path? | status 전이가 RLS·loader 가드의 기준 |
| `gs_questions` | question_id, round_id, order_index, title?, body_md, model_answer_md?, max_score, rubric jsonb (RubricCriterion[]) | rubric 항목 수에 따라 채점 UI 분기 |
| `gs_submissions` | submission_id, round_id, user_id, started_at, submitted_at?, graded_at?, graded_by?, total_score?, max_total? | unique(round_id, user_id) |
| `gs_submission_pages` | page_id, submission_id, page_number, attachment(jsonb: {path, mime, size, ocr_text?, ocr_confidence?}), question_ids text[], legibility_confirmed bool | M:N 매핑은 `question_ids` 배열로 — 별도 join 테이블 없이 page row 내에 |
| `gs_answers` | answer_id, submission_id, question_id, score?, feedback_md?, rubric_scores jsonb? | 강사 최종 채점값 — 학생 결과 화면 source of truth |
| `gs_peer_assignments` | assignment_id, round_id, submission_id, reviewer_user_id, submitted_at? | unique(submission_id, reviewer_user_id) |
| `gs_peer_review_answers` | id, assignment_id, question_id, score?, feedback_md? | 동료 점수 (운영자 채점에 영향 X) |
| `gs_distinguished_answers` | distinction_id, submission_id, question_id?(null=회차종합), reason?, points_awarded, is_published, is_anonymous | 우수 답안 — submission/answer 와 분리 |
| `gs_points_ledger` | id, user_id, amount, source('distinguished_round'|'distinguished_question'|'manual_grant'|'manual_revoke'|...), ref?, description?, created_at | ledger — 잔액 = SUM(amount) |

### Enum 타입
- `gs_round_status`: draft | published | closed

### 일관성 규칙
- **submission 잠금**: `graded_at IS NOT NULL` ↔ "강사 채점 마무리". 잠금 후 학생에게 결과 공개. `unsealGrading()` 호출로 재열기 가능
- **불변 invariants**: `gs_peer_review_answers.score ≤ gs_questions.max_score`, `SUM(gs_answers.score) = gs_submissions.total_score` (DB 트리거 또는 finalizeGrading() 내부 검증)
- **page_number**: 1-indexed. swap/shift는 트랜잭션으로 정합성 보존

## 5. 주요 흐름 시퀀스

### 5-1. 응시 (`/gs/:roundId/take` → `/api/gs/take`)

```
loader:
  getGsRound + getOrCreateOwnSubmission + listGsQuestions + listSubmissionPages
  + getGsPaperSignedUrl(round.paperPdfPath)
  ↓ submission.submittedAt 있으면 → redirect /gs/:id/result

action (intent 별):
  - upload-page         : 새 페이지 슬롯에 첨부 (Storage 업로드 + OCR 트리거)
  - swap-pages          : page_number 교환 (트랜잭션)
  - shift-pages-down    : N부터 끝까지 한 칸 뒤로 (insert 자리 마련)
  - delete-page         : 페이지 삭제 + Storage 정리
  - map-question        : page.question_ids 갱신
  - confirm-legibility  : legibility_confirmed = true
  - submit              : 가드 체크(모든 문항 매핑·모든 페이지 판독) → submitted_at = now()
```

### 5-2. 채점 (`/admin/gs/:roundId/grade/:submissionId`)

```
loader:
  getGradingDetail (submission + pages + questions + answers + 학생 정보)
  + listPeerReviewsForSubmission (동료 점수 참고용)
  + 모든 page attachment signed URL prefetch

action (intent 별):
  - grade-answer  : updateAnswerGrading (score + feedback + rubricScores)
  - finalize      : finalizeGrading (submission.graded_at = now() + 결과 공개 트리거)
  - reopen        : unsealGrading (graded_at = null + 학생에게 "재채점 중" 안내)
```

### 5-3. 동료 채점 cron 자동 배정 (`/api/cron/gs-auto-assign`)

```
정책:
  - status='published' AND end_at < now()
  - 제출자 ≥ 2
  - 그 회차에 동료 채점 배정 0건일 때만 (수동 배정 회차는 건드림 X)
  - 답안당 default 3명 reviewer (?perSubmission=)

assignPeerReviewers:
  제출 학생들 사이에서 round-robin 배정 (본인 답안은 본인이 채점 X)
  → gs_peer_assignments insert
  → notifyPeerAssignments (Resend 이메일 + 인앱 알림)
```

### 5-4. 우수 답안 마킹 (`/admin/gs/:roundId/distinctions`)

```
markDistinguished (intent=mark):
  - gs_distinguished_answers insert (submission_id + question_id|null + points_awarded + is_published + is_anonymous + reason)
  - if points_awarded > 0:
      gs_points_ledger insert (amount=+N, source='distinguished_round|question', ref=distinction_id)
```

## 6. 외부 통합

### 6-1. Anthropic Claude API (`app/features/gs/lib/ai-grader.server.ts`)
- 모델: `claude-sonnet-4-6`
- 입력: 문제 + 모범답안 + 학생 답안(OCR 텍스트) + max_score + rubric?
- 출력: JSON `{ score, feedback (md), reasoning?, rubricScores? }`
- 환경변수: `ANTHROPIC_API_KEY` — 미설정 시 null 반환(graceful degrade)
- 용도: 운영자 채점 화면에서 **초안** 으로 사용. 최종 점수는 운영자가 확정

### 6-2. Google Cloud Vision OCR (`app/features/gs/lib/ocr.server.ts`)
- API: DOCUMENT_TEXT_DETECTION + languageHints=['ko','en']
- 5000자까지 저장 — 채점 AI 컨텍스트 + 동료 채점 미리보기 + 분쟁 검토용
- 판독률 등급: good(한글 ≥50 + conf ≥0.75) / warn(≥15 + ≥0.5) / bad
- 환경변수: `GOOGLE_CLOUD_VISION_API_KEY` — 미설정 시 첨부는 저장되나 ocr_text 누락

### 6-3. Supabase Storage
- 버킷 분리: `gs-papers` (시험지·모범답안 PDF — staff 업로드, 학생 다운로드는 signed URL), `gs-submissions` (학생 답안 페이지 — 본인·운영자·배정된 동료 채점자만 signed URL)
- 다운로드는 모두 **signed URL TTL 20분** — RLS 우회 없이 권한 검증 후 발급

### 6-4. Vercel Cron (`/api/cron/gs-auto-assign`)
- `vercel.json` 또는 외부 cron 가능
- `CRON_SECRET` env로 인증 (`?secret=` 또는 Authorization Bearer)
- 응답 후 fire-and-forget 알림은 `runAfterResponse()` (서버리스 freeze 회피)

## 7. 서버리스 제약 대응

| 제약 | 대응 |
|---|---|
| 응답 후 함수 종료 | 알림 발송·로깅은 `app/core/lib/wait-until.server.ts` `runAfterResponse()` |
| `/tmp` 외 파일시스템 read-only | PDF 분할은 클라이언트 사이드(`lib/pdf-split.client.ts`)에서 처리 후 페이지별 업로드 |
| 인스턴스 임시 (전역 캐시 금지) | 모든 상태는 DB + Storage. 동료 채점 진행률 등 누적치는 RPC로 매번 집계 |
| 함수 timeout 10s (hobby) / 60s (pro) | OCR 호출은 페이지당 1건 단위로 비동기 처리 (배치 X) |
| 외부 API 키는 Vercel 환경변수 | ANTHROPIC / GOOGLE_CLOUD_VISION / CRON_SECRET / RESEND_API_KEY 등 |

## 8. 보안 / RLS

- `gs_submissions` / `gs_submission_pages` / `gs_answers`: 본인 (`user_id = auth.uid()`) R/W + staff R/W
- `gs_peer_assignments` / `gs_peer_review_answers`: 본인 reviewer 만 R/W + staff R
- `gs_distinguished_answers`: 모든 인증 사용자 R (단 `is_published=true` 만), staff R/W
- `gs_points_ledger`: 본인 R, staff R/W
- Storage 정책: 본인 user_id 폴더만 본인이 업로드 가능, 다운로드는 signed URL 으로만
- **service_role 사용처**: 운영자/동료 채점자가 다른 학생 답안 첨부의 signed URL을 받을 때 (RLS 우회) — 권한은 라우트 loader 에서 한 번 더 명시 검증

## 9. 알려진 한계 / 확장 포인트

| 항목 | 현재 | 확장 후보 |
|---|---|---|
| **에디터** | 종이만 (사진 업로드) | 디지털 에디터 (옵션) — 단 실전 환경 불일치 우려 |
| **AI 채점 자동 반영** | 강사가 초안을 보고 확정 | 자동 반영 + 강사 sample 검수 모드 (검증 후) |
| **OCR 다중 페이지 합본** | 페이지별 개별 OCR | 답안지 합본 OCR(문맥 보존) |
| **분쟁 큐 threshold UI** | t=0.15 default + URL param | UI 슬라이더 + 시각화 |
| **포인트 사용처** | 명예 점수 | 할인쿠폰 / 콘텐츠 잠금 해제 등 |
| **우수 답안 검색** | 회차별 | 단원/주제별 cross-회차 검색 |
| **재응시** | 한 회차 1회 응시(submission unique) | 회차별 재응시 정책 (시리즈 단위 best score) |
| **시리즈 leaderboard** | 시리즈 통계 (회차별 추이) | 시리즈 누적 leaderboard + 명예의 전당 |

## 10. 관련 코드·문서 포인터

- 라우트: `app/routes.ts` (검색: `/gs`, `/admin/gs`)
- 핵심 query: `app/features/gs/queries.server.ts` (메타·페이지·채점 finalize 등 큰 파일)
- 동료 채점: `queries-peer.server.ts`
- 우수 답안·포인트: `queries-distinctions.server.ts`
- 문제집 승격 (이 회차 우수 답안을 추후 문제 풀에 넣는 기능): `queries-promotion.server.ts` + `docs/features/feat-10-001-gs-question-promotion.md`
- 알림: `notify.server.ts` (Resend + 인앱)
- AI 채점: `lib/ai-grader.server.ts`
- OCR: `lib/ocr.server.ts`
- DB types: `database.types.ts` (`gs_*` 검색)
- 학생 manual: `docs/manual/온라인GS-응시자-사용설명서.md`
- 강사 manual: `docs/manual/온라인GS-출제자-사용설명서.md`

## 11. 운영 체크리스트 (배포·유지보수)

- [ ] **환경변수** 점검: `ANTHROPIC_API_KEY`, `GOOGLE_CLOUD_VISION_API_KEY`, `CRON_SECRET`, `RESEND_API_KEY`
- [ ] **Vercel Cron** 등록 (또는 외부 cron) — `/api/cron/gs-auto-assign` daily
- [ ] **Storage 버킷** 정책 점검 — `gs-papers`, `gs-submissions`
- [ ] **RLS policies** — Supabase 대시보드에서 `gs_*` 테이블 정책 확인
- [ ] **회차 종료 후** — 분쟁 큐 확인 → 채점 마무리 → 우수 답안 마킹 (운영자 작업)
- [ ] **포인트 ledger 검증** — 잔액 = SUM(amount) 가끔 sanity check

---

*Last updated: 2026-06-01.*
*다음 주요 업데이트 후보: AI 채점 자동 반영 (sample 검수 모드), 우수 답안 cross-회차 검색.*
