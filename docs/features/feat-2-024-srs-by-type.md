# feat-2-024 — 암기 카드 종류별(조문/판례) 분리 학습 + 밀림 안내

> 상태: 🟡 구현 완료(5개 결정 채택, typecheck·단위테스트 통과, 라이브 확인 대기) · 2026-06-18
> 결정 §3 = 5개 권고 모두 채택(인-러너 칩 / 전역+인터리브 / 양쪽 안내 / 개수·경과일 OR N=10·D=3 / 종류우선+과목칩).
> 선행: `docs/features/srs-v2.md`(엔진) · `feat-2-023`(카드 생성). 본 문서는 "학습 진입·큐 분리·밀림 안내" 설계.
> 배경: A단계로 조문(81)·판례(52) 카드가 한 전역 풀에 섞여 있고, `/srs` 큐가 통합이라
> created_at 오래된 순(=조문 먼저)으로 나와 **판례가 뒤에 묻힌다**. 종류를 골라 학습하고,
> 방치된 종류의 밀림을 안내한다.

---

## 1. 현황 점검 (읽기 — 사실 확인)

### 1.1 종류 구분 — ✅ 별도 컬럼 불필요
- `srs_items.source_type`(`database.types.ts:5322`, `string | null`)에 A단계가 **조문=`'article'` · 판례=`'case'`** 를 저장(`card-gen.server.ts` planArticleCards/planCaseCards). 운영 DB 실측: article 81 · case 52.
- 멱등 `source` 키(`article:{id}` / `case:{id}#{idx}`)도 있으나 **종류 판별은 `source_type` 한 컬럼으로 충분**(쿼리 `.eq("source_type","case")`).
- 주의: `srs_items.type`(enum `qa|cloze|ox|mcq`, `database.types.ts:5325`)은 **카드 형식** 축이지 조문/판례가 아니다. 현재 전부 `qa`. 종류 = `source_type`, 형식 = `type` — 혼동 금지.
- → **추가 스키마 불필요.** 종류 필터는 기존 컬럼으로 즉시 가능.

### 1.2 SRS 큐 종류 필터 — ⚠️ 인자 없음(추가 필요)
- `getReviewQueue(client, userId)`(`srs/srs.server.ts:110`)는 **필터 인자가 없다**.
  - due: `srs_review_states` + `srs_items!inner(... source_type ...)` 조인(`:119-127`) → **조인된 `source_type`/`subject` 로 필터 추가 가능**.
  - new: `srs_items` 직접 select(`:181-186`) → `.eq("source_type", …)` / `.eq("subject", …)` 추가 가능.
- 진입점도 인자 미배선: `/srs` 화면 loader(`srs-review.tsx:52`)와 `GET /api/srs/queue`(`api/queue.tsx:17`) 모두 `getReviewQueue(client, user.id)` 만 호출.
- → **손볼 곳**: `getReviewQueue` 시그니처에 `{ subject?, sourceType? }` 옵션 추가 + due/new 쿼리 필터 + 두 진입점에서 URL 파라미터(`?type=&subject=`) 전달.

### 1.3 종류별 밀림(due) 집계 — ⚠️ 조인 가능, 전용 함수 없음
- `srs_review_states`(user×item, `due_date`·`state`·`created_at`, `:122` 조인 확인)는 `item_id`로 `srs_items`와 조인 → **`source_type`/`subject`별 due 카운트 산출 가능**.
- 현재 집계는 `getStats`(`srs.server.ts:327`)의 totalItems·retention·forecast 뿐 — **종류별 due 분해 없음**. `getReviewQueue`도 `dueCount`/`newCount`를 종류 무관 합산만 반환.
- → **손볼 곳**: 종류별 due/oldest-overdue 를 세는 신규 함수(예: `getDueCountsByType`) 필요(밀림 안내용).

### 1.4 과목 필터 — ⚠️ 컬럼 있음, 필터 미사용
- `srs_items.subject`(law slug) 존재. 러너는 `subjectLabel`(`srs-review.tsx:32`)로 **카드별 과목 표시**만 하고, 큐를 과목으로 거르지는 않는다.
- → 과목 필터도 1.2와 같은 자리(`.eq("subject", slug)`)에 추가. **과목 × 종류 조합**(예: "특허법 판례")은 두 `.eq` 동시 적용으로 성립. 추가 스키마 불필요.

### 1.5 독립 트랙 — ✅ due는 자동 독립 / ⚠️ 일일 신규 예산만 공유
- SRS 일정은 **per-item**(`srs_review_states` user×item)이라, 조문만 며칠 학습해도 **판례 due는 그대로 누적**된다. → 종류별 독립 보존은 **이미 구조적으로 성립**(필터만 더하면 "판례만" 큐가 됨).
- 단 두 가지가 **전역 공유**:
  - `maxReviewsPerDay`(기본 200, `:54`) — due 총량 상한.
  - `newPerDay`(기본 20, `:53`) + `newIntroducedToday`(오늘 도입 신규, `:152-157`) — **하루 신규 도입 예산이 종류 무관 합산**. 조문 새 카드 20장 도입하면 그날 판례 새 카드 슬롯이 0이 됨.
- → "due 독립"은 공짜. "신규 예산 독립(조문 20 + 판례 20 따로)"을 원하면 종류별 카운팅 추가 필요(§2 결정 ②).

### 1.6 빈칸 경계 — ✅ 무관(유지)
- 빈칸은 `article_blank_sets` + `user_blank_srs`(별 트랙), `srs_items`와 무관. 본 설계는 `srs_items` 내 종류(조문/판례) 분리일 뿐 빈칸을 건드리지 않음. A단계 경계(빈칸=cloze 문구 / 카드=qa 통독·이해) 그대로 유지.

### 점검 요약
| 항목 | 가능? | 손볼 곳 |
|---|---|---|
| 종류 구분 | ✅ `source_type` | 없음(기존 컬럼) |
| 큐 종류/과목 필터 | ⚠️ | `getReviewQueue` 인자+필터, `/srs`·`/api/srs/queue` 파라미터 배선 |
| 종류별 due 집계 | ⚠️ | 신규 `getDueCountsByType` |
| 과목×종류 | ✅(컬럼) | 위 필터에 `.eq("subject")` 동시 |
| due 독립 트랙 | ✅ 자동 | 없음 |
| 신규 예산 독립 | ⚠️ | 종류별 newPerDay 카운팅(원할 때만) |

---

## 2. 설계 (선택지 + 권고)

### 2.1 선택 화면 (종류 + 과목)
- **(A) 인-러너 칩 필터 〔권고〕** — `/srs` 상단에 〔종류: 전체·조문·판례〕〔과목: 전체·특허·상표…〕 칩. 선택 시 `?type=&subject=` 로 큐 재로드. 별 화면 없이 한 곳에서 즉시 전환. 기본=전체(현행과 동일).
- (B) 별도 선택 화면 — `/srs` 진입 전 종류·과목 고르는 메뉴 카드 → 런너. 단계가 늘어 이탈↑.
- (C) 종류 칩만(과목 후순위) — 가장 작지만 "특허 판례만" 같은 조합 불가.
- **권고 = A**: 한 화면 칩, 종류·과목 동시 제공, 기본 전체. 칩에 종류별 due 배지 동반(2.3).

### 2.2 종류별 독립 SRS (큐)
- 공통: `getReviewQueue(client, userId, { subject?, sourceType? })` 로 확장 → due/new 쿼리에 필터. due 독립은 자동(1.5).
- **신규 예산**:
  - **(i) 전역 공유 유지 + "전체" 모드 종류 인터리브 〔권고〕** — newPerDay 20 그대로. 단 "전체" 모드의 new 픽을 created_at asc 대신 **조문/판례 라운드로빈**으로 섞어 판례가 묻히지 않게(현 ㉠ 이슈 해소). 종류를 고르면 그 종류만 픽.
  - (ii) 종류별 독립 예산 — 조문 newPerDay + 판례 newPerDay 따로(예: 각 10~15). 더 균형적이나 설정·카운팅 추가.
- **권고 = (i)**: v1 단순 + 인터리브로 "판례 묻힘" 해결. 종류 선택 시 자연히 그 종류만. (ii)는 효과 데이터 보고 B에서.

### 2.3 밀림 안내 (★ 핵심)
"한쪽 방치 시 '판례 N개 복습 대기'."
- **위치**:
  - (a) `/srs` 선택 칩에 **상시 종류별 due 배지**("판례 23").
  - (b) `오늘 할 일`/대시보드에 **치우침 경고**(임계 초과 시만).
  - **(c) 양쪽 〔권고〕** — 칩 배지는 항상(정보), 오늘 할 일 경고는 임계 넘을 때만(개입).
- **임계**(경고 트리거):
  - 개수 기준: 한 종류 due ≥ N(예 10).
  - 경과 기준: 그 종류 가장 오래된 due가 ≥ D일 경과(예 3일).
  - **권고 = 둘 다(OR)**: `due ≥ 10` **또는** `oldest overdue ≥ 3일` → "판례 복습이 밀리고 있어요(N개)" 안내 + `/srs?type=case` 딥링크.
- 데이터: 2.3 배지·경고 모두 §1.3 `getDueCountsByType`(+oldest overdue)로 충당. 오늘 할 일 경고는 `today-summary.server.ts`(현 `review.flashcardDue` 합산만)를 종류 분해로 확장.

### 2.4 빈칸 경계 유지
- 본 작업은 `srs_items`(qa) 내 종류 분리·안내뿐. `article_blank_sets`/`user_blank_srs` 미변경. 조문 카드(통독)와 빈칸(문구 cloze)의 역할 경계 유지(A단계 정책).

---

## 3. 결정 남은 항목 (질문)
1. **선택 UI** — A(인-러너 칩) / B(별 화면) / C(종류만)? → 권고 **A**.
2. **신규 예산** — (i)전역+인터리브 / (ii)종류별 독립? → 권고 **(i)**.
3. **밀림 안내 위치** — (a)/srs만 / (b)오늘할일만 / (c)양쪽? → 권고 **(c)**.
4. **밀림 임계** — 개수만 / 경과일만 / 둘 다(OR)? 값(N=10·D=3)? → 권고 **둘 다, N=10·D=3**.
5. **과목 분리 범위** — 종류만 먼저(과목 칩은 기본 전체로 같이) / 과목×종류 풀세트? → 권고 **종류 우선, 과목 칩 동반(기본 전체)**.

> 5개 권고대로면 §4 범위로 바로 구현 가능.

## 4. 구현 시 영향 범위 (참고 — 코드 미변경)
- `app/features/srs/srs.server.ts` — `getReviewQueue` 옵션(`subject?`,`sourceType?`) + due/new 필터 + "전체" 인터리브. 신규 `getDueCountsByType(client,userId)`(종류별 due·oldest overdue).
- `app/features/srs/screens/srs-review.tsx` — 칩 필터 UI + `?type=&subject=` 파라미터 → loader 전달, 종류별 due 배지.
- `app/features/srs/api/queue.tsx` — 동일 파라미터 수용(외부 큐 호출 일관).
- `app/features/study/today-summary.server.ts` + `today.tsx`/대시보드 — 종류별 밀림 경고(임계) 추가(현 `review` 요약을 종류 분해로 확장).
- 스키마/마이그레이션 **불필요**(기존 컬럼). typecheck 대상.
- 영향 밖: 빈칸 시스템, 카드 생성(feat-2-023), 자동 SRS(/study/srs, feat-2-010~016).

## 5. 구현 메모 (2026-06-18)
**변경 파일**:
- `srs/srs.server.ts` — `ReviewQueueOptions{subject?,sourceType?}` + `getReviewQueue` due/new 임베디드 필터, "전체" `interleaveGroups`(조문/판례 라운드로빈), `fetchNewCandidates`. `getDueCountsByType`(종류별 due+oldestOverdueDays). 밀림 임계 `SRS_BACKLOG_DUE_THRESHOLD=10`·`SRS_BACKLOG_OVERDUE_DAYS=3`·`isKindBacklogged`.
- `srs/screens/srs-review.tsx` — `?type=&subject=` loader 파라미터 → 큐 필터, `ChipFilters`(종류·과목 칩, 기본 전체) + 종류별 due 배지(밀림 시 rose).
- `srs/api/queue.tsx` — 동일 파라미터 수용.
- `study/today-summary.server.ts` — `cardBacklog`(임계 초과 종류) 추가. `study/screens/today.tsx` — `CardBacklogNotice`(밀림 종류별 `/srs?type=` 딥링크). `today-summary.test.ts` 픽스처 반영(14 통과).

**검증(읽기 전용, 운영 데이터 모사)**: "전체" 인터리브 = 조문/판례 교차(판례 2번째 등장, 묻힘 해소) · "판례만" = case 풀만. due 독립은 per-item이라 자동. 밀림 배지/경고는 **due**(복습 후 도래분) 기준이라 학습 시작 전엔 0 — 카드 학습 누적 후 노출. 임계 10·3은 시작값(라이브 조정).

**미해결(범위 밖)**: 판례 카드 앞면 중복(`[1] X — [1] X`, A단계 생성분) — feat-2-023 B단계 품질 개선 후보.
