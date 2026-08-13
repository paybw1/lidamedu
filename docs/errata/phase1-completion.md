# Phase 1 완료 보고 — 개정 원장 인프라 (errata)

> 적용일: 2026-08-13 · 대상: 운영 `mcgdoplo` · DDL: `scripts/sql/20260813_errata_revision_ledger.sql`
> 근거: 지시서 v1.1 §2.1·§2.2·§2.5·§2.6 + 결정서 v1.2.1 §2~§4 (편차 D1~D4 포함 승인)
> 롤백: `node scripts/run-prod-sql.mjs scripts/sql/20260813_errata_revision_ledger_rollback.sql` (트리거·함수만 제거, 원장·억제 이력 보존)

## 1. 설치 내역

**테이블·뷰**: `content_revisions`(원장, append-only 가드 2종) · `revision_suppress_windows`(억제 창, RLS staff select) · `v_revision_recent`/`v_revision_merge_pending`(security_invoker)

**함수**: `fn_log_revision_article()`(조문 전용, before=시행 순서 직전 리비전, 시행일 기준 applied/scheduled 자동 판정) · `fn_problem_content_type(text)`(mc%→mcq, subjective%→essay) · `fn_log_revision_problem()`(problems/problem_choices 겸용) · `fn_log_content_revision()`(범용) · `fn_revision_suppressed()`/`fn_open_suppress_window()`/`fn_close_suppress_window()`(D1 권한 가드: staff 또는 service_role)

**트리거 4종 (우선순위 순)**:

| # | 트리거 | 테이블 | 이벤트 | content_type | 제외 컬럼 |
|---|---|---|---|---|---|
| ① | `log_revision_problem_choices` | problem_choices | I/U/D | mcq/essay (부모 format) | (없음) |
| ② | `log_revision_problems` | problems | I/U/D | mcq/essay (format 파생) | `updated_at` |
| ③ | `log_revision_article` | article_revisions | **INSERT만** | statute | ignore: `revision_id,created_at,created_by` |
| ④ | `log_revision_cases` | cases | I/U/D | precedent | `updated_at, search_tsv, official_text_checked_at, official_text_check_count, official_text_unavailable, pending_primary_node_id` |

`articles` 본체 트리거는 결정서 §1.1대로 미설치(Phase 2 재판단). `content_id`: 조문=`article_id`, 선지=부모 `problem_id`. RLS: 원장 select/update = `private.is_staff()`.

## 2. 검증 결과 — 10/10 통과 (전부 트랜잭션 롤백, 재실행: `node tmp/errata-audit/verify-run.mjs`)

| # | 항목 | 결과 |
|---|---|---|
| 1 | 트리거 4종 설치 확인 | ✅ 4/4 |
| 2 | 정상 기록 (cases UPDATE → precedent/changed_fields/subject_ref 배열) | ✅ |
| 3 | 노이즈 필터 (updated_at만 변경 → 미기록) | ✅ |
| 4 | append-only 가드 (변경 실체 수정·삭제 차단) | ✅ |
| 5 | GUC 우회 (`set local lidam.skip_revision_log='on'` → 미기록) | ✅ |
| 6 | ★정답 정정 포착 — content_id=부모 problem_id, source_ref{table,id,choice_no}, changed={is_correct} | ✅ |
| 7 | 조문 before 산출 — op=UPDATE, before=시행 순서 직전 리비전, applied | ✅ |
| 8 | ★시행일 예약 판정 — 미래 시행 insert → scheduled, scheduled_for=시행일, applied_at null | ✅ |
| 9 | 억제 창 — scope('precedent') 억제 + scope 밖(mcq) 기록, service_role 경유 open/close | ✅ |
| 10 | [D1] 무권한 `fn_open_suppress_window` 호출 차단 | ✅ |

검증 중 테스트 SQL 자체 수정 1건: `article_revisions.body_text`는 **GENERATED 컬럼**이라 insert 대상에서 제외(운영 코드 무관).

## 3. 발견 사항

1. **기존 조문 리비전의 87%가 `effective_date` NULL** (2,202/2,526 — 시드 관례 "effective_date=NULL로 트리거 회피"의 결과). §3.2 before 조회는 시행 순서 기준이므로 **NULL 시행일 리비전은 직전 리비전으로 잡히지 않는다** → 해당 조문에 새 리비전이 들어오면 op='INSERT'(before 없음)로 기록될 수 있음. Phase 3 착수 전 결정 필요: NULL 시행일 백필 또는 before 조회에 NULL 폴백(created_at 순) 추가. 결정서 §7.2(expired_date 정합 확인)와 함께 처리 권장.
2. `problems.format`에 `mc` 접두가 아닌 객관식 계열 **없음** 확인(mc_short/mc_box/mc_case/ox/blank/subjective — 접두 매칭 그대로 유효).
3. 적용 직후 원장 0행 — 검증 롤백 정상, 실트래픽 유입 대기 상태.

## 4. 48시간 모니터링 (결정서 §5.2 — ~2026-08-15)

```bash
node tmp/errata-audit/ledger-status.mjs   # app_name × content_type × op 분포
```
- 일 수백 건 이상 → 노이즈 컬럼 누락, 즉시 제외 목록 보강
- `(unknown)` 다수 → application_name 미설정 경로 식별(8/12 cases 124건 유형의 정체가 여기서 드러남)
- 대량 배치 규칙: 실행 전 `fn_open_suppress_window(사유, 분, scope)` — staff/service_role 전용, 최대 120분. SQL 직결은 `set local lidam.skip_revision_log='on'` 보조.

*Phase 1 종료. Phase 2(판본·매핑) 이후는 별도 지시 대기.*
