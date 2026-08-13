# Phase 0 감사 보고서 — 추록/정오표 시스템 (읽기 전용)

> 실행일: 2026-08-13 · 대상 DB: 운영 `mcgdoplo` (Management API 읽기 전용 — DDL·DML 일절 없음)
> 재실행 도구: `tmp/errata-audit/audit-1.mjs` ~ `audit-5.mjs`
> 지시서: `docs/errata/errata-phase01-instruction.md` §1 / 설계서: `errata-system-design-v1.1.md` §10

**요약**: 대상 테이블·PK·RLS는 확정됐다. 다만 실측 결과가 지시서 §2.4 트리거 템플릿의 가정 4가지와 어긋난다 — ① 조문 본문은 `articles`가 아니라 `article_revisions`에 있고, ② 정답의 실체(`is_correct`·`ox_truth`)는 트리거 4종에 빠진 `problem_choices`에 있으며, ③ mcq/essay는 테이블이 아니라 `problems.format` 컬럼으로 갈리고, ④ 과목 컬럼이 템플릿의 `->> '과목컬럼'` 방식으로 추출되지 않는다(uuid FK / 배열). Phase 1 착수 전 §"판단 필요 사항"의 확정이 필요하다.

---

## A1. 대상 테이블

| 논리명 | 실제 테이블 | PK 컬럼 | PK 타입 | 행 수(정확) |
|---|---|---|---|---|
| 조문 (메타) | `articles` | `article_id` | uuid | 2,721 |
| 조문 (본문 스냅샷) ★ | `article_revisions` | `revision_id` | uuid | 2,526 |
| 판례 | `cases` | `case_id` | uuid | 834 |
| 문제 (객관식·주관식 단일 테이블) | `problems` | `problem_id` | uuid | 9,809 |
| 선지·정답 ★ | `problem_choices` | `choice_id` | uuid | 47,687 |
| 법령 | `laws` | `law_id` | uuid | 5 |
| 이론 | **전용 마스터 테이블 없음** | — | — | — |

- **PK는 전부 uuid 단일 컬럼** — 설계서가 우려한 uuid/bigint 혼재는 없다. `content_id text` 정규화는 여전히 유효하나(다형 참조라 FK 불가) "혼재 대비" 근거는 아니다.
- ★ **조문 본문은 `articles`에 없다.** `articles`는 트리 메타(라벨·경로·`importance`·`current_revision_id`)만 갖고, 본문은 `article_revisions.body_json`/`body_text`에 있다. 지시서 템플릿대로 `articles`에 트리거를 붙이면 **본문 개정이 한 건도 원장에 안 잡힌다.**
- ★ **객관식 정답·선지 해설은 `problem_choices`에 있다** (`is_correct`, `explanation_md`, OX 진위 `ox_truth`). 지시서의 트리거 4종(statute/precedent/mcq/essay)에 이 테이블이 없다 — 가장 시험 크리티컬한 `answer_change`가 원장 밖이다.
- mcq/essay 구분은 `problems.format` enum: `mc_short`·`mc_box`·`mc_case`·`ox`·`blank`·`subjective`. 실데이터는 mc 3종 + `subjective`(268건)만 존재(정오문제는 선지 파생, 빈칸은 `article_blank_sets` 파생이라 problems 행 없음).
- '이론'의 후보인 `content_chunks`(13,752행)는 교재·Q&A RAG 코퍼스(파생물, embedding 포함)라 마스터가 아니다 → **theory는 보류, 질의 목록으로**.

## A2. 대상 테이블 컬럼 구조 (트리거 인자 관련)

| 테이블 | 본문 필드 | 정답 필드 | node 컬럼 | 과목 컬럼 | updated_at | deleted_at |
|---|---|---|---|---|---|---|
| `article_revisions` | `body_json`(jsonb)·`body_text` | — | 없음 (링크 테이블 `article_systematic_links` 간접) | 없음 (`article_id`→`articles.law_id`→`laws` 2단 조인) | **없음** (`created_at`만 — 스냅샷 불변) | 없음 |
| `cases` | `summary_body_md`·`reasoning_md`·`comment_body_md`·`official_text_md`·`summary_items`(jsonb)·`related_md` | — | `primary_node_id` (+트리거 관리 `pending_primary_node_id`) | `subject_laws` — **text 배열** | 있음 | 있음 |
| `problems` | `body_md`·`explanation_md`·주관식 `model_answer_md`·`grading_rubric_md`·`rubric_items`(jsonb) | (주관식 답안 필드가 곧 정답) | `primary_node_id`, 주관식 보조 `problem_systematic_links` | `law_id`(uuid FK) + `science_subject` — **텍스트 과목코드 컬럼 없음** | 있음 | 있음 |
| `problem_choices` | `body_md`·`explanation_md`·`ox_body_md` | `is_correct`(boolean)·`ox_truth` | `related_node_id` | 부모 problem 경유 | **없음** | **없음 (하드 DELETE 가능)** |

- 템플릿의 `v_row ->> v_subject_col` 방식이 성립하는 테이블이 **하나도 없다**: cases는 배열(`->>`가 `["patent"]` 문자열을 뱉음), problems는 uuid FK, article_revisions는 컬럼 자체가 없음.
- `problem_choices`에 `updated_at`·`deleted_at`이 없어 **지금은 정답을 고쳐도 어디에도 흔적이 남지 않는다.**

## A3. 기존 이력 인프라 — 중복 판단

| 기존 장치 | 내용 | 신규 원장과의 관계 |
|---|---|---|
| `article_revisions` + `law_revisions` + `article_revisions_protect_in_force` 트리거 | 조문 개정 스냅샷(이벤트 소싱). 시행 중 스냅샷은 UPDATE/DELETE 차단 | **조문 축은 이미 원장이 있다.** 신규 트리거는 이 테이블의 INSERT(=개정 발생)를 훅해서 고지(축A)·판본(축C) 상태만 얹으면 된다. 중복 스냅샷 재저장 불필요 |
| `audit_logs` (846행) | 앱 레벨 액션 로그 — `case.update` 472건, `case.set_primary_placement` 35건 등. **before/after 스냅샷 없음**, action 문자열 + metadata만 | 원장과 목적이 다름(감사 추적 vs diff 기반 정오). **병존 권고** — 통합하면 스냅샷이 없어 정오표 프리필이 불가능 |
| `book_updates` (0행) | `edition`·`kind`·`pdf_url`·`importance` 등 — **과거에 만들다 만 정오표성 테이블**로 보임 | Phase 2 `publications` 설계와 충돌 소지 — 폐기/흡수 결정 필요 (판단 사항 #6) |
| 대상 테이블 기존 트리거 | `set_updated_at`(articles/cases/problems/laws, BEFORE UPDATE), cases `force_latest_case_placement`(BEFORE INSERT/UPDATE — 최신판례 강제배치), `cleanup_case_links_on_soft_delete`(AFTER UPDATE) | 전부 BEFORE 또는 목적이 다른 AFTER — 신규 AFTER 로깅 트리거와 충돌 없음. 단 cases는 BEFORE 트리거가 `primary_node_id`를 바꿀 수 있으므로 AFTER 시점 스냅샷이 정확(문제 없음) |

## A4. node_id 태깅 커버리지

| content | 구분 | 전체 | 태깅 | 비율 |
|---|---|---|---|---|
| problems (`primary_node_id`) | 법률 mc_short | 1,689 | 1,028 | 60.9% |
| | 법률 mc_case | 365 | 169 | 46.3% |
| | 법률 mc_box | 202 | 148 | 73.3% |
| | 법률 subjective | 268 | 0 | 0% — 단 `problem_systematic_links`로 68건(특허 전량) 커버 |
| | 자연과학 | 688 | 0 | 0% (자과는 `science_section_id` 별도 축 사용) |
| cases (`primary_node_id`) | patent | 383 | 363 | 94.8% |
| | trademark | 356 | 356 | 100% |
| | design | 62 | 62 | 100% |
| articles (`article_systematic_links` 간접) | patent 277/315 · trademark 244/258 · design 222/249 · civil 1,193/1,334 · **civil-procedure 0/565** | | | |

★ **설계서 §5.2의 "상표/디자인 태깅 0%" 가정은 낡았다** — 판례는 상표·디자인이 오히려 100%다. 실제 공백은 자연과학 문제(0%), 주관식 `primary_node_id`(0% — 복수 배치 정책상 links 테이블 사용), 민소 조문(0%)이다. `node_id` nullable 설계는 그대로 유효.

## A5. 볼륨·변경 빈도 (원장 볼륨 추정)

| 테이블 | 행 수 | 최근 6개월 실변경* | 최근 1개월 실변경 |
|---|---|---|---|
| articles | 2,721 | 1,471 | 216 |
| cases | 834 | 791 | 278 |
| problems | 9,809 | 9,734 | 1,375 |
| problem_choices | 47,687 | 측정 불가 (updated_at 부재) | — |

\* `updated_at > created_at + 1분` 기준. 서비스가 2026-04 개시라 전 행이 6개월 이내 생성 — 6개월 수치는 상한으로 볼 것.

**변경의 대부분은 사람 편집이 아니라 배치 스크립트다.** 최근 1개월 일자 분포에서 버스트가 명확하다: problems 07-30 **867건**(법률 mc 전반)·07-20 317건, cases 07-20 103건·**08-12 124건(원인 미상 — official_text 점검 5건·신규 0건 외 주체 미확인)**, articles 07-22 214건. 일상 편집은 일 0~40건 수준. → 원장 볼륨의 지배 변수는 **배치 작업 규율**(판단 사항 #7)이며, 48시간 모니터링(§3.1)에서 08-12류 미확인 대량 갱신 주체를 반드시 식별해야 한다.

## A6. 노이즈 컬럼

조회수·정답률류 실시간 카운터 컬럼은 **대상 테이블에 없다**(통계는 `user_problem_attempts`에서 라이브 계산). 상시 노이즈는 다음이 전부다:

| 테이블 | 컬럼 | 사유 |
|---|---|---|
| 공통 | `updated_at` | `set_updated_at` 트리거 자동 갱신 |
| cases | `search_tsv` | **GENERATED stored** — `to_jsonb(row)`에 포함되므로 제외 목록에 반드시 명시 (본문 변경 시 항상 동반 변경 → changed_fields 오염) |
| cases | `official_text_checked_at`·`official_text_check_count`·`official_text_unavailable` | 원문 자동 점검 배치가 주기 갱신 (최근 1개월 13건) |
| cases | `pending_primary_node_id` | `force_latest_case_placement` 트리거 관리 |
| problems | (제외 후보 없음 — `mismatch_flagged_at` 등은 staff 액션이라 기록 가치 있음) | |

## A7. 확장 기능

| 확장 | 상태 |
|---|---|
| `pgcrypto` 1.3 | ✅ 활성 — `gen_random_uuid()` 사용 가능 |
| `pg_cron` | ❌ **미설치** (`cron.job` 부재) — Phase 1 무관, **Phase 3~5 전제(예약 반영·월간 draft) 깨짐**. Supabase 대시보드에서 활성화 가능하나 별도 결정 필요 |
| 기타 | ltree·pg_trgm·uuid-ossp·vector 0.8.0·pg_stat_statements |

## A8. RLS 현황

- 대상 6테이블 전부 RLS 활성. 패턴 일관: 읽기 = 공개(`deleted_at IS NULL OR staff`), 쓰기 = `private.is_staff(auth.uid())`.
- 관리자 판별 = **`private.is_staff(uuid)`** (SECURITY DEFINER, `profiles.role IN ('instructor','manager','admin')`). ★ CLAUDE.md에 없는 **`manager` 롤이 실재**한다 — 원장 정책은 롤을 다시 나열하지 말고 이 함수를 그대로 쓸 것.
- 콘텐츠 편집이 요청 클라이언트(RLS) 경유면 트리거의 `auth.uid()`가 잡히고, adminClient(service_role)·SQL 스크립트 경유면 null → `created_by_label='system'` 폴백이 실제로 자주 쓰일 것이다(배치 갱신이 지배적이므로).

## A9. 교재 판본 현황

- `books`(도서몰 상품, 15행)의 타이틀에 판 라벨이 있다: 리담특허법 [제25판] · 도해특허법 [제20판] · 리담상표법 [제20판] · 객관식 Ⅰ/Ⅱ [제20판] · 판례 [제10판] · 강의노트 [제10판/제4판] · 조문정리 [제5판/제1판] · 서브노트 [제2판] · 진도별 OX [제3판] · 조문 스터디 키트 [제1판] ×2 (+'삭제예정' 1행). `isbn`·`published_on` 컬럼 보유 — Phase 2 `publication_editions` 시드의 출발점으로 쓸 수 있다.
- **DB에 없는 것 → 임별님 질의 목록**:
  1. 위 14종 중 현재 유통(정오표 지원 대상) 판본 확정 — 디자인보호법 교재가 books에 없는데 유통 중인지
  2. 각 판의 **쇄** 구분과 인쇄일, 원고 마감 시점(`frozen_at` 소급 기준)
  3. 조판 원본 파일 형식 (InDesign / HWP / DOCX) — Phase 7 페이지 역주입 경로
  4. `book_updates` 테이블(0행)의 유래 — 폐기해도 되는지

---

## 판단 필요 사항 (각 항목에 단일 권고안)

1. **statute 훅 위치** — `articles` 템플릿은 무효(본문이 없음). **권고: `article_revisions` AFTER INSERT를 훅하고 `content_id`는 revision_id가 아니라 그 행의 `article_id`로 기록**(정오표는 "조문" 단위로 묶여야 하므로). `articles` 자체에는 트리거를 붙이지 않는다 — 메타 변경은 고지 가치가 없고, 기존 개정 인프라(protect 트리거)가 본문 불변을 이미 보장한다.
2. **`problem_choices`를 5번째 트리거 대상으로 추가** — `answer_change`(정답 정정)의 실체가 이 테이블에 있다. **권고: content_id는 choice_id가 아니라 `problem_id`로 기록**해 문제 단위로 원장이 묶이게 한다(선지 diff는 snapshot에 담김). deleted_at이 없어 **op='DELETE'가 실제 발생하는 유일한 테이블**이다.
3. **content_type 파생 방식** — mcq/essay는 테이블이 아니라 `problems.format`으로 갈리므로 정적 `tg_argv[0]`으로는 못 나눈다. **권고: 트리거 함수가 problems에 한해 format으로 파생**(`subjective`→`essay`, 그 외→`mcq`). Phase 1 착수 시 템플릿 함수의 이 수정이 필요하다(지금 구현하지 않음).
4. **subject_code 추출** — 템플릿의 `->> '과목컬럼'`이 성립하지 않는다. **권고: 함수에서 problems는 `law_id`→`laws.law_code` 서브쿼리(5행 테이블, 비용 무시 가능) + 자과는 `science_subject`, cases는 `subject_laws` 배열 첫 원소(`-> 'subject_laws' ->> 0`), statute는 Phase 1에서 null로 두고 조회 뷰에서 조인.**
5. **`audit_logs`와의 관계** — **권고: 병존.** 목적이 다르고(액션 감사 vs diff 원장) audit_logs에는 스냅샷이 없어 통합 시 정오표 프리필이 불가능하다.
6. **`book_updates`(0행) 처리** — Phase 2 판본 설계와 겹친다. **권고: Phase 2 착수 시 DROP(0행이므로 무손실), 그 전까지 방치.** 유래는 A9 질의로 확인.
7. **대량 배치 갱신 규율** ★ 볼륨 지배 변수 — `lidam.skip_revision_log` GUC는 SQL 세션에서만 잡힌다. supabase-js(PostgREST) 단발 요청으로는 `set local`을 못 쓴다. **권고: 대량 정비 스크립트는 `scripts/run-prod-sql.mjs`(단일 트랜잭션 내 `set local lidam.skip_revision_log='on'`) 경유를 규칙화**하고, 어드민 화면의 단발 편집은 그대로 기록되게 둔다(그게 원장의 목적). A5의 08-12 미확인 대량 갱신 주체를 48h 모니터링에서 식별해 이 규칙 적용 대상인지 판정.
8. **soft delete 해석** — articles/cases/problems는 `deleted_at` UPDATE로 지우므로 원장의 `op='DELETE'`는 사실상 안 생긴다. **권고: 소비 측(추록 UI·뷰)에서 "changed_fields에 deleted_at 포함 + after.deleted_at not null = 삭제"로 해석**하는 규칙을 Phase 3 문서에 명시.
9. **pg_cron 미설치** — Phase 1은 무관. **권고: Phase 3 착수 전 Supabase 대시보드에서 활성화**하고 설계서 §8 전제에 각주 반영.
10. **theory 보류** — 마스터 테이블이 없다(content_chunks는 RAG 파생물). **권고: Phase 1 enum에는 `theory`를 남겨두되 트리거는 설치하지 않고**, 이론 콘텐츠의 실체(교재 원고 관리 계획)는 A9 질의와 함께 확인.

## 권고 트리거 대상 (content_type 매핑안)

| content_type | 테이블 | 이벤트 | content_id | node 컬럼 | subject 소스 | 제외 컬럼 |
|---|---|---|---|---|---|---|
| `statute` | `article_revisions` | AFTER **INSERT** | 행의 `article_id` | (null — links 간접) | null (뷰 조인) | — (스냅샷 불변이라 UPDATE 없음) |
| `precedent` | `cases` | AFTER INSERT/UPDATE/DELETE | `case_id` | `primary_node_id` | `subject_laws[1]` (배열 추출) | `updated_at`, `search_tsv`, `official_text_checked_at`, `official_text_check_count`, `official_text_unavailable`, `pending_primary_node_id` |
| `mcq` / `essay` (format 파생) | `problems` | AFTER INSERT/UPDATE/DELETE | `problem_id` | `primary_node_id` | `law_id`→laws 조회 / `science_subject` | `updated_at` |
| `mcq` (선지·정답) | `problem_choices` | AFTER INSERT/UPDATE/DELETE | **`problem_id`** | `related_node_id` | 부모 경유 (null 허용) | — (updated_at 없음) |
| `theory` | (보류) | — | — | — | — | — |

---

*Phase 0 종료. 지시서 §1.3 게이트에 따라 여기서 정지한다 — 위 "판단 필요 사항" 10건과 A9 질의 4건을 임별님이 확정한 뒤에만 Phase 1(원장 구축)에 착수한다.*
