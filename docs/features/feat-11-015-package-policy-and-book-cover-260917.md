# feat-11-015 — 패키지 등록화면 수강정책 항목 정리 · 「함께 쓰는 교재」 이미지 깨짐 (260917 요청서)

> 요청서: `source/학습플랫폼/패키지강의 등록화면 불필요 수강정책 항목 제거+도서이미지깨짐현상.html` (2026-09-17). 조사: 읽기 전용 리더 2갈래(패키지 정책 / 교재 이미지) + 운영 `mcgdoplo` 실측·HTTP 재현(2026-09-17). 상위 설계: `feat-11-013` D3·D12·D13·P4. **원장 결정 2026-09-17 12:13 반영(§4) — B-fix·P3-c·§6 착수.**

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

### D17. 정책 소유 축 — **패키지는 구성 강의의 「단과 상품(강의개설)」 정책을 따른다** **[원장 결정 2026-09-17]**

권고(강의 축·패키지 일시정지 유지)는 **채택되지 않았다.** 원장 결정문의 「단과 강의 개설시 설정」에서 「강의개설」= `/admin/lectures` 판매상품 목록(`admin-shell.tsx:248`)이므로, 기준은 **구성 강의에 연결된 단과 상품의 `plan_policies`** 다. 단과 폼은 그대로 두고 패키지 폼에서만 뺀다.

| 항목 | 결정 | 구현 |
|---|---|---|
| 수강배수 | **B1 — 구성 강의의 단과 상품 배수 기준.** 단과 폼 유지, 패키지 폼 제거 | 지금은 어디서도 집행되지 않는 값(`ENFORCE_MULTIPLIER=false`, 재생 제한은 강의의 `max_plays`). 이행의 `multiplier_snapshot` 은 **이번에 바꾸지 않는다** — 집행을 켤 때 같은 resolver(아래)로 스냅샷도 옮긴다(D13 기록) |
| PC / 모바일 · 다운로드 | **B3 — 단과·패키지 폼 모두 제거.** 전역 DRM 정책은 D18 | 서버는 저장값 유지(집행 소비처 0) |
| 유료 연장 | 패키지 폼 제거(요청서 목록) | tpass 원천 거절 — 저장만 되는 값. 단과 폼 유지 |
| 일시정지 | **B2 — 패키지 폼 제거, 구성 강의의 단과 상품 설정 기준** | **resolver 신설**(아래) → `my-courses` 로더·`pause_request` 액션 둘 다 경유. 패키지 자신의 `pause_*` 행으로 **절대 폴백하지 않는다**(pt_tpass 의 저장값 `pause_allowed=true` 가 새면 안 됨) |
| 수강기간 · 과정기간(P3-b termFields) | 유지 | — |
| 구성강의별 정상가격(환불용) | P4 로 분리 | = D3 `plan_courses.list_price_krw / refund_weight` |

**resolver 「구성 강의의 단과 상품 정책」** (`app/features/lms/lib/single-course-plan.ts` 순수 선택 규칙 + 서버 래퍼):
- 입력: 수강권의 `course_id` + 그 강의에 `plan_courses` 로 연결된 상품들(`product_kind='course'`, `course_format` 이 패키지가 아닌 온라인 유형). ★`subscription_plans` 에는 `deleted_at` 이 없다(hard delete + `plan_courses` cascade) — 삭제된 상품은 후보에 오르지 못한다.
- 선택: `sale_status='on_sale'` 우선 → 그다음 `created_at` 최신(`Date.parse` 수치 비교, 동률이면 plan_id 사전순) . 없으면 **null**(일시정지 불가, 안내 「구성 강의의 단과 상품 정책이 없어 일시정지할 수 없습니다」).
- 조회 실패는 **닫힘**(fail-closed): 로더는 버튼·안내 없이 그리고, 액션은 500 「일시정지 정책을 확인하지 못했습니다」. 패키지 plan_id 는 어느 분기에서도 `plan_policies` 조회 집합에 들어가지 않는다(구조적 폴백 차단).
- 운영 실측(2026-09-17 구현 후, 읽기 전용): 패키지 상품 pt_tpass 1건 — `extension_allowed null`·`extension_plan_ids []`(폼에서 사라진 연장 값이 학생에게 새지 않음), `pause_allowed true`(저장값 그대로, resolver 가 읽지 않음), 패키지 수강권 0건. 종류↔유형 조합 = course→online_always 3 · tpass→package_always 1.
- 패키지가 아닌 수강권은 자기 상품 정책 그대로(변경 없음).
- ★운영 결과: pt_tpass 구성 4강의 중 단과 상품이 있는 것은 1개(특허법 기본강의 2026판, `pause_allowed=false`) → 4강의 전부 일시정지 불가로 뜬다. 열려면 **단과 상품을 만들어야** 한다(원장 보고).

### D18. 전역 DRM 정책 — 원장 진술 2026-09-17 **[기록 · 이번 범위에서 만드는 것 없음]**

| 진술 | 현재 구현 |
|---|---|
| PC·모바일 스트리밍 재생 가능 | 그대로(제한 소비처 없음) |
| 다운로드는 모바일에서만, PC 다운로드 불가 | 콜러스 앱 정책(콘솔) — 코드에 없음 |
| 최대 등록기기 10대 | `plan_policies.max_devices_pc/mobile` 저장값은 1(휴면, `ENFORCE_DEVICE` off). 켤 때 10 으로 맞출 것 — feat-11-012 D10 에 넘김 |
| 동시 재생 제한 유지 | 콜러스 콘솔 |
| 관리자 기기 조회·초기화 | 있음 — `admin-lms-devices.tsx`, `device_reset_logs` |

### P3-c. 폼 정리 + 서버 보호 **[S · 이 문서의 본체]**

1. `courseFormatFormRules` 에 정책 그룹 노출 플래그 추가 — `policyGroups: { multiplier, device, pause, extension }`(boolean). **패키지 유형(`package_term / package_always`) = 넷 다 false**(B1·B2·B3·요청서). **단과·혼합(`online_always / online_term / blended`) = device 만 false**(B3), multiplier·pause·extension true. 현장은 기존 `showOnlinePolicy=false` 그대로. `course-format.test.ts` 표를 6유형 전부로 확장.
2. `PlanPolicyFields` 가 `policyGroups` 를 받아 블록별 렌더. hidden input 으로 값을 실어 보내지 **않는다**(폼이 값을 모른다는 사실을 서버가 알아야 함).
3. `admin-plan.tsx`: 숨긴 그룹의 칸은 **update 모드 = 저장값 유지**(기존 행 전체 select 후 merge — `keptPolicy` 를 22칸으로 확장), **create 모드 = 명시 기본값**(allow true · pause false · min 1 · max 30 · multiplier null · extension null — DDL 기본과 일치). `policySchema` 의 「미전송 → false/0」 파싱은 **노출 그룹에만** 적용.
4. `copyPlan` 은 원본 전 칸 복사 유지(변경 없음) — 3 이 보호하므로 오염 전파 없음.
5. 일시정지 resolver(D17) + `my-courses.tsx` 로더 맵을 **수강권 단위**로(plan_id 키 폐기) + `pause_request` 액션 동일 경유 + 단위 테스트(선택 규칙 fixture).
6. 운영 영향: 기존 `pt_tpass` 의 저장값은 그대로 남는다(값 변화 0, 폼에서만 사라짐). 단과 3건은 device 칸만 사라짐.

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

## 4. ★원장 결정 — **2026-09-17 12:13 확정** (`source/학습플랫폼/권고사항 9건 최종 결정 및 개발 반영 요청.html`)

| | 질문 | 권고 | **결정** |
|---|---|---|---|
| **B1** | 수강배수의 권위(D13 재결정) | 강의 축 `courses.max_plays`, 폼에서 제거(단과 포함) | **미채택 — 「단과 강의의 수강배수를 기준으로 합니다」**: 패키지는 구성 강의의 단과 상품 배수를 따른다. 단과 폼 유지, 패키지 폼 제거 |
| **B2** | 패키지의 일시정지 | 패키지 폼에 유지 | **미채택 — 「요청서대로 제거, 단과 강의 개설시 설정을 기준」**: 패키지 폼 제거, 구성 강의의 단과 상품 정책 상속(D17 resolver) |
| B3 | PC/모바일·다운로드 | 단과 폼에서도 뺀다 | **채택 — 「단과·패키지 폼에서 제거해도 됩니다」** + 전역 DRM 정책 진술(D18) |
| B4 | PART 2 즉시 수정 | 승인 시 1커밋 | **채택 — 「제안한 수정안대로」** |

같은 결정문의 **추가 요청**: 운영관리 › 회원 관리 › 수강생 › 수동 수강권 부여가 「Required」로 실패 → §6.

## 5. Phase

| Phase | 내용 | 공수 | 선행 |
|---|---|---|---|
| **B-fix** | PART 2 교재 이미지(§3.2 1~5) | XS | B4 ✅ |
| **P3-c** | `policyGroups` 규칙 + 폼 블록 + 서버 저장값 유지/기본값 + 일시정지 resolver + 테스트 | S | B1·B2·B3 ✅ |
| P4 | 구성강의별 정상가격·강의 단위 이행(기존 로드맵) | L | P3-c |

게이트: DDL 없음(P3-c·B-fix). typecheck·build·vitest(`course-format.test.ts` 6유형·resolver fixture) → 운영 리허설: 패키지 상품 수정 저장 전후 `plan_policies` 22칸 diff = 0(숨긴 칸 보존 증명), 단과 저장도 동일.

## 6. 추가 요청 — 수동 수강권 부여 「Required」 **[확정 버그]**

- 경로: 회원 CRM 수강생 상세 → 「수강권·결제」 패널(`subscriptions/components/admin-subscription-panel.tsx`) → 수동 수강권 부여 / 만료 연장 / 취소.
- 원인: 3ae98659(feat-7-014 「사유 필수·감사 로그」)가 `/api/admin/subscription` 의 grant·extend·cancel 스키마에 `note: noteSchema`(필수)를 넣었는데, 패널 폼 3곳은 `note` 를 보내지 않는다 → zod 3 의 기본 메시지 「Required」가 그대로 화면에. 같은 액션을 쓰는 `/admin/subscriptions`(`admin-subscriptions.tsx`)도 확인 대상.
- 수정: 세 폼에 「사유」 입력(필수, `noteSchema` 최소 길이와 일치)을 붙이고 `note` 로 전송. 취소는 `confirm()` 대신 사유 입력 포함. 서버 스키마는 그대로(사유 필수 정책 유지).
