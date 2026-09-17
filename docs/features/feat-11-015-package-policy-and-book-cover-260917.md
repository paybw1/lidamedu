# feat-11-015 — 패키지 등록화면 수강정책 항목 정리 · 「함께 쓰는 교재」 이미지 깨짐 (260917 요청서)

> 요청서: `source/학습플랫폼/패키지강의 등록화면 불필요 수강정책 항목 제거+도서이미지깨짐현상.html` (2026-09-17). 조사: 읽기 전용 리더 2갈래(패키지 정책 / 교재 이미지) + 운영 `mcgdoplo` 실측·HTTP 재현(2026-09-17). 상위 설계: `feat-11-013` D3·D12·D13·P4. **PART 1 은 설계 단계(원장 결정 2건 §4), PART 2 는 확정 버그(승인 시 1커밋).**

## 0. 한 줄

- **PART 1(패키지 정책)**: 요청서는 「패키지는 구성 단과강의에서 설정한 수강정책을 그대로 쓴다」를 전제하지만, **그 「단과강의의 설정값」은 어디에도 없다.** `courses` 에는 `max_plays` 하나뿐이고 요청서가 열거한 정책(배수·PC/모바일·다운로드·일시정지·유료연장)은 전부 `plan_policies`(상품 1:1)에만 있다. 게다가 그 5개 중 **실제로 작동하는 것은 일시정지 하나**다. 그래서 이 요청은 「폼에서 항목 숨기기」가 아니라 ①사문화된 항목을 걷어내고 ②정책의 소유 축(강의 vs 상품)을 정하는 일이며, **폼만 숨기면 서버가 저장값을 기본값으로 덮어쓴다**(§2.3).
- **PART 2(교재 이미지)**: 원인 확정 — 강의 상세가 `cover_file_path`(이미 완성 공개 URL)에 버킷 프리픽스를 **한 번 더** 붙여 `.../book-covers/https://.../book-covers/covers/...` 를 내보낸다(HTTP 400 NoSuchKey 재현). 도서몰은 저장값을 그대로 쓰므로 정상. 도입(2026-07-27)부터 한 번도 정상 렌더된 적 없음. 수정 = 도서몰의 `pickCover` 재사용 1줄 + 프레임 비율.

## 1. PART 1 — 현황 (실측)

### 1.1 요청서가 뺄 5개 그룹의 실제 상태

| 항목 | `plan_policies` 칸 | 소비처(집행) | 상태 |
|---|---|---|---|
| 수강배수 | `multiplier` | `playback.server.ts` `ENFORCE_MULTIPLIER = false`(하드코딩) → 분기 dead. **재생 제한의 실권위는 `courses.max_plays`**(`play-limit.server.ts`) | **dead** — 「단과강의의 배수 설정」은 이미 강의 편집화면 `max_plays` 로 존재 |
| PC / 모바일 허용 | `allow_pc / allow_mobile` | 폼·upsert 외 **0곳** | dead |
| 자료 다운로드 | `allow_download` | `material-download.tsx` 가 읽지 않음(게이트 = 유효 수강권 + `is_published`) | dead |
| 일시정지 | `pause_allowed / total / max_count / min / max` | `my-courses.tsx` pause_request 가 **enrollments.plan_id → 패키지 자신의 정책**으로 서버 검증 | **작동(유일)** — 수강권(enrollment) 단위 |
| 유료 연장 | `extension_*` | `extension-policy.ts` `EXTENDABLE_PRODUCT_KIND = 'course'` → tpass 원천 거절 | dead(패키지) |

### 1.2 「단과 값 상속」이 성립하지 않는 이유(운영 데이터)

- 유일한 패키지 `pt_tpass`(상시 패키지) 구성 4강의 중 **단과 상품이 따로 있는 것은 1개**(특허법 기본강의 2026판 ↔ `patent_basic_2026`). 나머지 3개(draft 1건 포함)는 패키지에만 연결돼 **상속원이 없다**.
- 그 1개마저 값이 이미 갈린다: 단과 `pause_allowed=false`(2회·7~60일·총 90일) vs 패키지 `pause_allowed=true`(3회·30/30/30). 「단과 값 적용」으로 바꾸면 패키지 수강생의 일시정지가 사라지는 방향(현재 pt_tpass 수강권 0건이라 실영향 없음).
- 한 강의가 여러 단과 상품에 걸릴 때 어느 것을 고를지 정의 불가.
- feat-11-013 **D3/P4(`plan_courses` 확장)는 방향이 반대**다: `plan_courses.*` NULL 이면 **상품 값을 상속**. allow_*/pause_*/extension_* 은 D3 대상이 아니다. 요청서와 D3 가 겹치는 항목은 「구성강의별 정상가격(환불용)」(`list_price_krw / refund_weight`)뿐.

### 1.3 폼만 숨기면 생기는 일

- `admin-plan.tsx` `policySchema` 는 미전송 칸을 `allow_* = false · pause_allowed = false · pause_* = 0 · multiplier = null · extension_* = null` 로 파싱하고, `upsertPlanPolicy` 는 **22칸 전부**를 upsert 한다(부분 갱신 없음). `keptPolicy` 선례는 `max_devices_*` 2칸만 보호.
- 지금은 allow_* 가 미집행이라 무해해 보이지만 `copyPlan` 이 전파하고, 향후 집행을 켜는 순간 패키지 수강생이 일괄 차단된다.
- `courseFormatFormRules` 에 정책 그룹 노출 필드가 없고 `PlanPolicyFields` 에 숨김 prop 도 없다(`durationMode`·`termFields` 만).

## 2. PART 1 — 설계

### D17. 정책 소유 축 — **작동하는 것만 남기고, 축은 「강의 = 재생」·「상품 = 수강권」으로** **[원장 결정 2건]**

요청서의 「단과 값을 쓴다」는 재생 관련 항목에서는 **이미 사실**(`courses.max_plays`)이고, 수강권 관련 항목(일시정지·연장)에서는 **성립하지 않는다**(상속원 부재). 그래서 항목별로 갈라 답한다.

| 항목 | 권고 | 근거 |
|---|---|---|
| 수강배수 | **패키지·단과 폼 모두에서 제거.** 권위 = `courses.max_plays`(강의 편집화면). `plan_policies.multiplier` 는 남겨 두되 폼에서 빼고 서버는 저장값 유지 | D13 결론을 「**강의 축 권위**」로 뒤집는다 — 요청서가 이미 그렇게 말한다. 원장 확인 1줄(§4 B1) |
| PC / 모바일 · 다운로드 | **패키지 폼 제거**(무해). 단과 폼도 집행 소비처가 생길 때까지 제거 권고 | 소비처 0곳 — 켜지지 않는 스위치를 원장에게 보여주는 것이 「반쪽 열림」 |
| 유료 연장 | **패키지 폼 제거** | tpass 원천 거절 — 저장만 되는 dead 값 |
| 일시정지 | **패키지 폼에 유지**(요청서와 다른 유일한 지점) | 유일하게 작동하며 수강권 단위. 구성강의 4개 중 3개는 상속원이 없고 1개는 값이 갈림. 패키지 수강권은 패키지 정책을 따르는 현행이 맞다. 원장 확인 1줄(§4 B2) |
| 수강기간 · 과정기간(P3-b termFields) | 유지 | 요청서 「전체 수강기간 또는 과정기간」 |
| 구성강의별 정상가격(환불용) | **P4 로 분리** | = D3 `plan_courses.list_price_krw / refund_weight`. `refund-calc` bundle 이 아직 강의별 값을 읽지 않으므로 P4·P7 후속 |

### P3-c. 폼 정리 + 서버 보호 **[S · 이 문서의 본체]**

1. `courseFormatFormRules` 에 정책 그룹 노출 플래그 추가 — `policyGroups: { multiplier, device, pause, extension }`(boolean). 패키지 유형(`package_term / package_always`) = multiplier·device·extension false, pause true. 단과 유형 = multiplier·device false(B1 채택 시), pause·extension true. 현장·혼합은 기존 `showOnlinePolicy` 게이트 그대로. `course-format.test.ts` 표 갱신.
2. `PlanPolicyFields` 가 `policyGroups` 를 받아 블록별 렌더. hidden input 으로 값을 실어 보내지 **않는다**(폼이 값을 모른다는 사실을 서버가 알아야 함).
3. `admin-plan.tsx`: 숨긴 그룹의 칸은 **update 모드 = 저장값 유지**(`keptPolicy` 를 22칸 전체로 확장), **create 모드 = 명시 기본값**(allow true · pause false · min 1 · max 30 · multiplier null · extension null — DDL 기본과 일치). `policySchema` 의 「미전송 → false/0」 파싱은 노출 그룹에만 적용.
4. `copyPlan` 은 원본 전 칸 복사 유지(변경 없음) — 3 이 보호하므로 오염 전파 없음.
5. 운영 영향: 기존 `pt_tpass` 의 multiplier null·allow true·extension null 은 그대로 남는다(값 변화 0). 단과 3건도 동일.

### P4(별건, 기존 로드맵) — 구성강의별 정상가격 · 강의 단위 이행

- D3 그대로: `plan_courses.list_price_krw / refund_weight`(+`duration_days / opens_at` 은 필요 시). NULL = 상품 값 상속.
- `fulfillCourseEnrollments` 강의 단위 루프 + `refund-calc` bundle 의 강의별 배분은 P7 후속과 함께.
- **일시정지·연장은 P4 에서도 강의별로 가지 않는다**(수강권 단위 정책 = 상품 소유). 요청서가 이를 의도했다면 §4 B2 에서 뒤집는다.

## 3. PART 2 — 「함께 쓰는 교재」 이미지 깨짐 **[확정 버그 · 승인 시 1커밋]**

### 3.1 원인

| | |
|---|---|
| 결함 지점 | `app/features/lms/queries.server.ts:1128` — `coverUrl = cover_path \|\| getPublicUrl(cover_file_path)` |
| 저장 측 | `bookstore/lib/book-fields.server.ts:21` — 업로드 후 `getPublicUrl(path).data.publicUrl`(**완성 절대 URL**)을 `cover_file_path` 에 저장. `cover_path` 는 외부 URL 입력 전용 |
| 운영 데이터 | books 16권: `cover_path` 0건, `cover_file_path` 14건 전부 `https://…/book-covers/covers/<uuid>.jpg`(상대경로 0). 강의상품 연결 교재 30행 전부 같은 형태 → **이 섹션은 100% 이중 프리픽스** |
| 재현 | 저장 URL GET 200 image/jpeg · 이중 URL GET 400 `NoSuchKey`. `getPublicUrl(절대URL)` 이 프리픽스를 다시 붙이는 것을 node 로 재현 |
| 대조군 | 도서몰·도서상세·랜딩은 `bookstore/queries.server.ts:49` `pickCover = cover_path \|\| cover_file_path` 로 저장값 그대로 → 정상 |
| 이력 | 완성 URL 저장 2a6cca21(2026-07-09) < lms 매핑 fc83457b(2026-07-27 feat-11-007 P3) → **도입 시점부터 깨져 있었음**(데이터 회귀 아님). 교재명·가격·상세보기·담기는 다른 컬럼이라 정상 |

### 3.2 수정 **[설계 확정]**

1. `bookstore/queries.server.ts` 의 `pickCover` 를 export 하고 lms 매핑이 재사용(같은 의미·같은 소유자·같은 변경 축 → 단일 소유). `getPublicUrl` 분기 제거. 향후 상대경로가 들어올 계획이 없으므로 가드 불필요(들어오면 `startsWith('http')` 가드를 `pickCover` 한 곳에).
2. 프레임: `lecture-product-detail.tsx:304` 40×56px + `object-cover` → **`object-contain` + `bg-muted`**(도서몰 정책과 일치). URL 만 고치면 가로형 크롭 6권(조문정리·강의노트·스터디키트 — `book-cover-landscape-crop` 메모)이 중앙만 잘려 보이는 2차 증상이 즉시 난다.
3. 폴백: 표지 없으면 도서몰 `BookCover` 제목 placeholder 로 통일(현 빈 회색 박스 · 운영에선 도달 불가). `alt` = 교재명(현 `alt=""`).
4. `docs/db-schema.md` books 항목에 「`cover_file_path` 값 = 완성 공개 URL(경로 아님)」 명기 — 컬럼명이 「경로」라 다음 소비처에서 재발.
5. 검증: 운영 상품 상세 4건 HTTP 200 스크린샷(임시 관리자 하네스 재사용) + `lecture-product-detail` 스냅샷.

공수 XS. 위험 없음(읽기 경로 1줄 + 표시).

## 4. ★원장 결정

| | 질문 | 권고 |
|---|---|---|
| **B1** | 수강배수의 권위(D13 재결정) | **강의 축 = `courses.max_plays`**. `plan_policies.multiplier` 는 폼에서 제거(단과 포함), `ENFORCE_MULTIPLIER` 는 켜지 않고 dead 분기 정리 |
| **B2** | 패키지의 일시정지 | **패키지 폼에 유지**(패키지 수강권은 패키지 정책). 요청서대로 강의별로 가려면 상속원이 없는 3강의의 정책을 먼저 만들어야 함 |
| B3 | PC/모바일·다운로드를 단과 폼에서도 뺄지 | 뺀다(집행 소비처 생길 때 되살림) |
| B4 | PART 2 즉시 수정 | 승인 시 1커밋 |

## 5. Phase

| Phase | 내용 | 공수 | 선행 |
|---|---|---|---|
| **B-fix** | PART 2 교재 이미지(§3.2 1~5) | XS | B4 |
| **P3-c** | `policyGroups` 규칙 + 폼 블록 + 서버 저장값 유지/기본값 + 테스트 표 | S | B1·B2·B3 |
| P4 | 구성강의별 정상가격·강의 단위 이행(기존 로드맵) | L | P3-c |

게이트: DDL 없음(P3-c·B-fix). typecheck·build·vitest(`course-format.test.ts` 갱신) → 운영 리허설: 패키지 상품 수정 저장 전후 `plan_policies` 22칸 diff = 0(숨긴 칸 보존 증명), 단과 저장도 동일.
