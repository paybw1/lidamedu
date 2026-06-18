# feat-2-023b — 판례 암기 카드 품질 개선 (식별자·잘림·중복)

> 상태: 🟡 구현 완료(4개 결정 채택·typecheck·dry-run 검증). **52장 데이터 적용 승인 대기** · 2026-06-18
> dry-run(특허 판례 importance≥2): 갱신 52 · 신규 67 · cap 4000으로 **잘림 0**(최대 3693자).
> 선행: `feat-2-023`(카드 생성). 본 문서는 A단계로 생성된 판례 카드(52장)의 품질 개선.
> 문제 3종: **① 식별자 누락**(어느 판례·무슨 사건유형인지 front에 없음) · **② 잘림**(긴 요지 절단) · **③ 중복/잔여**(`X — X`, `— [4]`, `[N]` 번호).

---

## 1. 현황 점검 (읽기 — 사실)

### 1.1 생성 로직 — `planCaseCards`(card-gen.server.ts)
- **front** = `` `${case_title ?? nickname ?? "(제목 없음)"} — ${item.title}` ``. summary_items 없으면 `summary_body_md`로 1카드(front=`… — 판결요지`).
- **back** = `flattenMarkdownForCard(item.body, 600)`.
- **쟁점 분할**: `summary_items` 항목당 1카드 — **작동함**(아래 샘플 카드2~5 = 한 판례의 5개 항목). 멱등 키 `source = case:{case_id}#{idx}`.
- ★ **`court`·`decided_at`·`case_number`·`case_type`·`is_en_banc` 를 select 하지도 쓰지도 않음** → 식별자 부재의 직접 원인.

### 1.2 평탄화 — `srs-markdown.ts`(`flattenMarkdownForCard`)
- 이미지/링크/인라인태그/헤더(#)/인용(>)/표/강조(**,*,`) 마커 제거 + `maxLen=600` 초과 시 `slice(0,600)+"…"`.
- ★ **`[1] X` 의 `[N]` 은 평탄화 깨짐이 아니라 `summary_items.title` 데이터 그 자체**(쟁점 번호). 평탄화는 정상 동작 — 문제는 데이터 prefix를 front에 그대로 노출한 것.

### 1.3 식별자 데이터 (cases) — 존재하나 미사용
- `court`(enum `case_court`; `COURT_LABELS` → 대법원/특허법원/고등법원/지방법원), `decided_at`, `case_number`, `case_type`(**자유 텍스트**, 예 `등록무효(특)`·`거절결정(특)`), `is_en_banc`(전원합의체).
- ★ **표준 인용 빌더가 이미 있음** — `buildCitation`(cite-copy.tsx): `대법원 전원합의체 2015. 1. 22. 선고 2011후927 판결 【등록무효(특)】`. 카드는 이걸 안 씀(재사용 가능).

### 1.4 잘림 원인 — app cap(필드 제한 아님)
- `srs_items.back` = `text`(DB 길이 **무제한**). **잘림은 오직 앱 cap `CASE_BACK_MAX=600`**(평탄화 maxLen).
- 쟁점 분할은 되지만 **한 요지 항목이 600자를 넘으면 그 항목이 문장 중간에서 절단**(샘플 카드6 = 601자, "…연구자의 지 …"로 끊김).

### 1.5 ★ 실제 카드 샘플 (운영 데이터, 읽기 전용)

| # | 현재 front | back | 문제 | 사용 가능한 인용(미사용) |
|---|---|---|---|---|
| 1 | `'바람직하게'…명확성 요건을 충족하는지 여부 — '바람직하게'…충족하는지 여부` | 524자 | **③ 완전 중복**(case_title==item.title) | 대법원 2017. 4. 7. 선고 2014후1563 판결 【거절결정(특)】 |
| 2 | `'제조방법이 기재된 물건발명'…여부(적극) — [4]` | 469자 | **③ bare `[4]`** 꼬리 | 대법원 **전원합의체** 2015. 1. 22. 선고 2011후927 판결 【등록무효(특)】 |
| 6 | `[1] 특허법 제33조…발명을 한 자…기준 — [1] …기준` | **601자 ★잘림** | **②잘림 + ③중복 + `[1]`** | 대법원 2012. 12. 27. 선고 2011다67705 판결 【특허권공유확인등·특허등록명의이전】 |
| 7 | `[1] …발명을 한 자…기준 — [2] 특허를 받을 수 있는 권리를…공유지분을 가지는지 여부(적극)` | 228자 | **③ `[1]`/`[2]` 번호** 노출 | (동) |
| 8 | `청구범위의 정정이…판단 기준 — 청구범위의 정정이…판단 기준` | 310자 | **③ 완전 중복** | 대법원 2010. 4. 29. 선고 2008후1081 판결 【등록무효(특)】 |

→ **공통**: 8장 전부 front에 **법원·선고일·사건번호·사건유형이 없음**(①). 학생은 어느 판례의·무슨 유형(등록무효 vs 거절결정 vs 침해 등) 쟁점인지 모른 채 답을 떠올려야 함 — 사건유형에 따라 결론이 달라지는데 맥락이 빠짐. 중복·번호 꼬리(③)는 거의 모든 카드. 600자 초과 항목은 절단(②).

---

## 2. 개선 설계 — 식별자(앞면) (선택지+권고)

목표: **front = 〔식별자(법원·선고일·번호·★사건유형)〕 + 〔쟁점 질문〕 / back = 그 쟁점의 결론·법리.**

- **인용 형식**:
  - **(a) 표준 인용 전체 〔권고〕** — `buildCitation` 재사용: `대법원 전원합의체 2015. 1. 22. 선고 2011후927 판결 【등록무효(특)】`. 학술 표기 정본과 일치, 사건유형 `【…】` 항상 포함.
  - (b) 축약 — `대법원 2011후927 【등록무효(특)】`(선고일 생략). 짧지만 정본성↓.
  - 권고 **(a)**. front 1줄차에 인용, 2줄차에 쟁점 질문(러너가 `whitespace-pre-line` 평문 렌더 → 개행 그대로 보임).
- **사건유형 보장**: `case_type` 이 null이면 `【…】` 생략(buildCitation 동작) — null 비율은 재생성 dry-run에서 확인, 많으면 보강 별도.
- **구현 노트**: `buildCitation` 은 현재 client 컴포넌트(cite-copy.tsx)에 있음 → 서버(card-gen)에서 쓰려면 **`cases/labels.ts`(클라/서버 공용)로 이동** 후 양쪽 import. (COURT_LABELS 는 이미 labels.ts.)

## 3. 개선 설계 — 쟁점 질문 정리 + 잘림 + 품질

### 3.1 쟁점 질문(앞면 2줄차)
- `[N] ` prefix strip, `case_title`과 중복 시 1개만.
- **(a) item.title 우선 · bare면 case_title fallback 〔권고〕** — item.title이 `[4]`처럼 번호뿐이면 `case_title`(또는 `summary_title`) + `(쟁점 4)` 로 대체. 그 외엔 strip한 item.title 사용.
- (b) 항상 `case_title + (쟁점 N)` — 단순하나 항목별 고유 제목(카드7의 "[2] …공유지분…")을 버림.
- 권고 **(a)**: 항목 제목이 의미 있으면 살리고, 없을 때만 case_title 폴백.

### 3.2 잘림 수정
- back cap 은 앱 값(DB 무제한). **(a) cap 상향 1500 〔권고〕** — 요지 항목 대부분 보존(현 최대 ~600+, 1500이면 거의 전량). (b) 해제(0=무제한) — 아주 긴 항목은 카드로 과다. (c) 600 유지(현행, 절단 지속).
- 권고 **(a) 1500**(조문 카드 cap은 별개 유지). 항목 자체가 분할 단위라 과다 위험 낮음.

### 3.3 품질
- 평탄화는 양호(잔여 기호 거의 없음) — 추가 변경 불필요. front 중복/번호만 3.1로 해소. 분할은 현행 유지(작동).

## 4. 재생성 계획 (멱등·dry-run·★진척 보존)
- ★ **멱등 함정**: 현 `generateCards`는 같은 `source` 키를 **skip(insert-only)** → front/back 로직만 고치고 재생성하면 **기존 52장은 갱신 안 됨**.
- ★ **진척 보존**: 기존 카드를 soft-delete + 재삽입하면 **새 item_id** 가 생겨 `srs_review_states`(학생 복습 진척)가 고아가 됨 → **in-place UPDATE(같은 item_id의 front/back만 갱신)** 권고. (현재 진척 거의 없겠으나 원칙.)
- 구현: `generateCards`에 **update 모드** 추가(같은 source 매칭 시 front/back UPDATE, 신규는 INSERT). `/admin/srs-cards` 폼에 "기존 카드 갱신 포함" 토글.
- **dry-run**: 적용 전 `갱신 N장 · 신규 M장` + **before→after front/back 샘플** 표시 → 사용자 승인 후 실행(CLAUDE.md 다건=dry-run+승인).

## 결정 질문
1. **인용 형식** — (a) 표준 전체 / (b) 축약? → 권고 **(a)**.
2. **쟁점 질문 폴백** — (a) item우선·bare면 case_title / (b) 항상 case_title+쟁점N? → 권고 **(a)**.
3. **back cap** — 1500 / 해제 / 600유지? → 권고 **1500**.
4. **재생성** — in-place UPDATE 모드(진척 보존) 확정? → 권고 **예**.

> 4개 권고대로면 §구현(card-gen front/back 재작성 + buildCitation labels 이동 + cap 1500 + update 모드 + dry-run) 후, dry-run 샘플 확인받고 52장 갱신.

## 5. 구현/검증 메모 (2026-06-18)
- `cases/labels.ts` — `buildCitation`(cite-copy→공용 이동, null-safe). `srs/lib/case-card.ts`(신규 순수 헬퍼: `stripIssueNumber`·`composeCaseTopic`·`composeCaseFront`).
- `srs/card-gen.server.ts` — 판례 front=`buildCitation`+쟁점, back cap **4000**(실측 max 3693). plan이 기존 카드(`existing` map) 포함, `generateCards(...,updateExisting)` = 신규 insert + 기존 **in-place UPDATE(item_id 보존)**. `previewCards`에 wouldUpdate·before→after·maxBackLen·truncatedCount 추가.
- `admin/api/srs-cards.tsx`·`screens/admin-srs-cards.tsx` — "기존 카드도 갱신" 토글 + 갱신/신규 분리 미리보기(before→after) + 잘림 점검 표시.
- **cap 결정**: 119항목 median 350·>1500 5장·max 3693 → 한 쟁점 법리는 분할 불가하여 4000 상향(잘림 0). 향후 4000 초과 시 truncatedCount로 노출.
- **dry-run 검증(읽기전용, 동일 헬퍼)**: before `[1] 진보성 판단기준 — [1] 진보성 판단기준` → after `대법원 2021. 4. 8. 선고 2019후10609 판결 【등록무효(특)】 ⏎ 특허발명의 진보성 판단기준`. bare `[3]`→`…(쟁점 3)` 폴백 정상.
- **남은 작업**: 운영 52장 in-place UPDATE 적용(+신규 67 동반 여부 사용자 확인). dry-run 통과.

## 영향 범위 (참고 — 코드 미변경)
- `app/features/cases/labels.ts` — `buildCitation` 이동(서버 공용). `cite-copy.tsx` 는 거기서 import.
- `app/features/srs/card-gen.server.ts` — `planCaseCards` front(인용+쟁점)/back 재작성, `generateCards` update 모드 + dry-run 차이 노출.
- `app/features/srs/lib/srs-markdown.ts` — 케이스 cap 1500(또는 호출부 인자).
- `app/features/admin/screens/admin-srs-cards.tsx`·`api/srs-cards.tsx` — "기존 갱신" 토글 + 갱신/신규 분리 미리보기.
- 스키마 변경 없음. 영향 밖: 조문 카드, 큐/필터(feat-2-024).
