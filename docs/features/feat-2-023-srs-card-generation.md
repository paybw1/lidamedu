# feat-2-023 — 암기 카드(SRS v2) 인앱 생성 (조문·판례 자동 생성)

> 상태: 🟡 A단계 구현 완료(typecheck 통과, 운영 생성·라이브 확인 대기) · 2026-06-17
> 결정 §6 = 4개 권고 모두 채택(운영자 배치·쟁점당 1카드·식별자→본문 단방향·importance≥2).
> 선행: `docs/features/srs-v2.md`(엔진 SSOT) · 본 문서는 "카드 공급" 설계.
> 배경: 암기 카드(`/srs`)는 엔진·러너·통계는 견고하나 **카드를 만들 인앱 경로가 없어**
> 콘텐츠 미시드 시 영구 빈 화면 = 사실상 비활성(점검: `docs/survey/학습관리-점검.md`).
> 조문·판례 암기는 변리사 1차 핵심이라 **살리기로 결정**(2026-06-17).

---

## 1. 현황 점검 (읽기 전용 결과)

### 1.1 엔진 — 견고 ✅
- 4 테이블 `srs_items`·`srs_review_states`·`srs_review_logs`·`srs_user_settings` + enum `srs_item_type`(qa·cloze·ox·mcq)·`srs_state`. (`srs-v2.md`)
- 풀 SM-2 순수함수 + 단위테스트 14, RPC `srs_record_review`(원자), 4-grade UI, `SRS_FAKE_TODAY` 시뮬, 통계(유지율·30일·7일 forecast)·CSV. (`app/features/srs/`)
- **카드 풀은 전역(공유)** — `srs_items`에 `user_id` 없음. 학생별 진척만 `srs_review_states`. 즉 **생성 = 전역 풀을 채우는 staff/배치 작업**, 학생은 `getReviewQueue`가 newPerDay(기본 20)씩 풀에서 뽑아 학습.
- `srs_items` 컬럼: `subject·topic·type·front·back·law_ref·source·source_type·source_id·deleted_at`. `source_type`+`source_id`로 멱등.

### 1.2 공백 — 부실 🔴
- **인앱 생성 경로 전무.** 유일 수단 = 오프라인 `scripts/srs/seed-items.ts`(수동 `tsx`). 운영자가 안 돌리면 전원 빈 화면. (`srs-v2.md`도 "카드 manual 작성 UI 향후"로 인정)
- 기존 시드 = **조문(articles)만**, `type=qa`, front="`{과목} {display_label}`", back=`article_revisions.body_text`→`flattenBodyForCard`(최대 500자). **판례 미지원**(`srs-v2.md` "향후 source_type 'case'·'problem'").
- **러너는 qa(front→back)만 렌더.** `srs-review.tsx`는 `item.type`을 참조하지 않고 front/back을 `whitespace-pre-line` 평문 출력 → cloze/ox/mcq를 만들어도 빈칸 input·OX 버튼이 안 나옴. **v1 자동 생성은 qa로 한정해야 안전.**
- new-카드 큐가 매 요청 본인 `review_states` 전체를 메모리 Set으로 필터(`srs.server.ts:174-189`) — 풀이 커지면 비효율(생성으로 풀이 커지면 더 부각).

### 1.3 콘텐츠 소스 데이터
- **조문**: `articles`(level='article', `current_revision_id`, `importance`, `display_label`, `article_number`) → `article_revisions.body_text`(ArticleBody JSON) → `flattenBodyForCard`(ref·개정메타 제거한 순수 본문). 이미 시드가 사용.
- **판례**: `cases` 본문은 **markdown**(plain 아님). 활용 후보:
  - `summary_items`(Json, 신형) = `[{title, body, commentMd}]` — **항목별 요지**(쟁점 소제목+본문). 항목당 1카드가 자연스러움.
  - `summary_body_md`(legacy 요지), `reasoning_md`(이유). `case_title`·`nickname`·`importance`(0~3)·`subject_laws`·`primary_article_id`·`deleted_at`.
  - ★ markdown 마커(`<u>`, 표, `![]()`)가 섞여 러너 평문과 안 맞음 → **판례용 markdown→plain 평탄화 유틸 필요**.

### 1.4 빈칸(blank) 시스템과의 경계 — 중복 회피 ★
- `article_blank_sets` = 운영자가 **조문 원문에서 드래그로 고른 문구의 cloze**(빈칸 채우기). 별도 SRS 트랙(`user_blank_srs`), `/study/srs` 빈칸 섹션.
- 즉 **"조문 핵심 문구 암기(cloze)"는 빈칸이 이미 담당.** 암기 카드에 `type=cloze` 조문을 만들면 **직접 중복**.
- → 암기 카드(qa)의 자리 = **(a) 조문 통독형**(식별자→본문 회상) + **(b) 판례 이해형**(사건/쟁점→요지). cloze는 빈칸에 위임.

---

## 2. 설계 목표
운영자가 **인앱에서** 조문·판례 암기 카드를 **자동 생성·관리**(멱등·dry-run·소프트삭제)하여 전역 풀을 채우고, 학생 `/srs`가 즉시 비지 않게 한다. v1은 **qa 카드 한정**(러너 호환), markdown/JSON은 평문화.

## 3. 카드 모델 (v1 = qa 전용)
| 소스 | front | back | law_ref | source_type · source_id |
|---|---|---|---|---|
| **조문** | `{과목} {display_label}` (예: "특허법 제29조") | `flattenBodyForCard(body_text)` (cap ~500자) | `{slug}#{article_number}` | `article` · article_id |
| **판례** | `{case_title 또는 nickname} · {summary_items[i].title}` (쟁점) | `summary_items[i].body` 평문화 (없으면 `summary_body_md` 1카드) | `primary_article_id`→`{slug}#{n}`(있으면) | `case` · case_id (+ 항목 idx 는 source 메모) |

- **방향**: v1은 단방향(식별자/쟁점 → 내용). 역방향·요건추출형은 §5 향후.
- **길이**: back cap(조문 500·판례 요지 항목 단위라 보통 짧음). 초과 조문은 v1에서 통째 cap(분할은 향후).
- **멱등 키**: 조문=`(article, article_id)`. 판례=`(case, case_id)` + 항목 idx 충돌 피하려 `source`에 `case:{case_id}#{idx}` 기록(같은 판례 다항목 카드 구분). 재생성 시 기존 비교 후 신규만 insert.

## 4. 생성 경로 (인앱)
**소유자 = 운영자(staff) 배치.** 전역 풀이므로 학생별 생성 아님.

신규 운영자 화면 **`/admin/srs-cards`** (staff 게이트):
1. **풀 현황** — 과목×소스(조문/판례)별 카드 수, 최근 생성일. "비어 있음" 경고.
2. **생성 폼** — 과목(5) · 소스(조문|판례) · `importance ≥ N` · 상한 개수. → **dry-run**: 생성될 카드 수·중복 skip 수 미리보기(사용자 승인 후 실제 insert). 멱등.
3. **카드 목록·소프트삭제** — 품질 나쁜 카드 `deleted_at` 처리(러너 큐가 이미 `deleted_at IS NULL` 필터).

서버: `app/features/srs/card-gen.server.ts`(신규) — `generateArticleCards`(기존 seed 로직 이식·정리) + `generateCaseCards`(신규, 판례 평탄화). admin client(service-role, srs_items는 전역 콘텐츠라 staff 쓰기). action = `/admin/api/srs-cards`(zod).

> seed-items.ts(오프라인)는 유지하되 로직을 `card-gen.server.ts`로 단일화(스크립트가 헬퍼 호출) — DRY.

## 5. 단계 / 게이트
- **A. 풀 채우기(핵심·최소)** — `card-gen.server.ts`(조문 이식 + 판례 신규 + 판례 markdown→plain 유틸) + `/admin/srs-cards`(현황·dry-run·생성·소프트삭제). 산출: 운영자가 조문·판례 카드를 인앱에서 생성 → `/srs`가 비지 않음. **여기까지면 "살리기" 1차 완료.**
- **B. 카드 품질·러너 확장** — (1) 러너 `type` 분기(cloze 빈칸 input·ox 버튼) → cloze/ox 카드 활성, (2) 조문 장문 분할(항 단위), (3) 역방향/요건형 카드. 각각 별 태스크.
- **C. 학생 기점 생성** — 조문/판례 뷰어에 "암기 카드에 추가" (개인 풀 or 제안 큐). 별 태스크.
- **D. 인접 정리(별건)** — 두 SRS 명칭 혼동(`복습`/`암기 카드`)·new-큐 성능(`review_states` 전량 로드)·러너 로딩 스피너. (점검 문서 항목)

**하드 스톱**: A 구현 전 §6 결정 확인. A 후 라이브(운영자 생성→학생 학습) 확인되면 B 착수 여부 재논의.

## 6. 착수 전 결정 (사용자 확인 필요)
1. **생성 owner** — 권고: **운영자 배치(`/admin/srs-cards`)**로 전역 풀 채우기(A). 학생 기점 추가(C)는 후순위. (대안: 학생이 직접 카드화 — 개인 풀 개념이 없어 스키마 확장 필요 → 비권고)
2. **판례 카드 단위** — 권고: **`summary_items` 항목당 1카드**(쟁점 단위, 자가채점 적정). `summary_items` 없으면 `summary_body_md`로 판례당 1카드 폴백. (대안: 판례당 1카드 — 요지가 길어 자가채점 부담)
3. **조문 카드 방향** — 권고: v1 **식별자→본문 단방향**(기존 시드와 동일, 변리사 "제29조가 뭐였더라" 회상에 직결). 양방향/요건형은 B.
4. **생성 범위 기본값** — 권고: **`importance ≥ 2`** 부터(핵심 우선), 과목당 상한 두고 점증. (오픈 전 풀 과다 방지)

> 위 4개 권고대로면 바로 A 착수 가능. 다른 선택 있으면 알려주세요.

## 8. A단계 구현 메모 (2026-06-17)
**신규/변경 파일**:
- `app/features/srs/lib/srs-markdown.ts` — 판례 markdown→plain 평탄화(경량 정규식, 러너 평문 호환).
- `app/features/srs/card-gen.server.ts` — `previewCards`(dry-run)·`generateCards`(멱등 insert)·`getCardPoolStats`·`listRecentCards`·`softDeleteCard`. 조문(식별자→본문, source_id 멱등)·판례(쟁점당 1카드, `source=case:{id}#{idx}` 멱등, summary_items 없으면 summary_body_md 폴백).
- `app/features/admin/api/srs-cards.tsx` — staff 게이트 + intent(preview·generate·soft-delete), 쓰기는 adminClient.
- `app/features/admin/screens/admin-srs-cards.tsx` — 생성 폼 + dry-run 미리보기→승인 생성 + 풀 현황 + 최근 카드 소프트삭제.
- `app/routes.ts` — `/admin/srs-cards`·`/api/admin/srs-cards` 등록. `admin-shell.tsx` — 빈칸 클러스터를 "암기 자료"로 라벨 변경 + "암기 카드 생성" 메뉴.

**운영 DB(mcgdoplo) 검증(읽기 전용, `tmp/srs-card-preview-count.mjs`)**:
- `srs_items` 테이블 **존재**(마이그 불필요). 현재 60장 전부 조문(구 seed), **판례 0장**.
- 후보(importance≥2): 특허 조문 54·판례 78, 상표 조문 20, 디자인/민법/민소법 0(importance 미설정).
- → importance≥2 기본값은 특허·상표에 유효. 디자인·민법은 **importance 임계를 낮추거나(폼 0~5)** 사전 importance 큐레이션 필요. 기존 60장은 source_id 멱등으로 재생성 시 skip.

**남은 확인(라이브)**: `/admin/srs-cards`에서 dry-run→생성(특허 판례 권장) 후 학생 `/srs`에서 카드 노출·러너 동작.

## 7. 비고
- 카드 풀 전역 공유라 한 번 생성하면 전 학생 혜택. RLS: `srs_items` 읽기 전체공개·쓰기 staff(현 정책 확인 후 A에서 점검).
- `area_study_mgmt` 게이트: `/srs`는 현재 nav `review` 그룹(area_study_mgmt). 생성은 운영자 화면이라 무관.
- 정답키·법령 원문 불변 규칙과 무관(카드는 조문/판례에서 파생한 학습 보조물, 원본 미수정).
