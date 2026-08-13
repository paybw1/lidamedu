# Phase 3 Stage 2 완료 보고 — 진단 · 계획 · 승인

> 완료일: 2026-08-13 · 커밋 `fd8ad507`(푸시 완료 — Vercel 자동 배포)
> ※ `phase3-completion-report.md`(§6 전체 검증)는 Stage 3 완료 후 제출 — 본 문서는 Stage 2 게이트 보고.

## 1. 구현 결과

**스키마 (운영 적용 완료, `scripts/sql/20260814_phase3_study_plans.sql`)**: Stage 1 승인 설계 + 반영 4건 그대로 — 6테이블(`student_diagnostics`·`student_subject_status`·`study_plans`·`study_plan_items`·`study_logs`·`study_plan_checkpoints`), `offline_tests.is_diagnostic`, `approve_study_plan` RPC(승인 2.3 — staff 검증→반 소유권→supersede→approve→baseline 스냅샷→항목 잠금을 단일 트랜잭션), `tier_source`에 `diagnostic_retracted`(승인 2.4), 파셜 유니크 2분할(in-flight/approved), RLS 화이트리스트 + append-only(logs UPDATE/DELETE 정책 부재) + 역방향·plan_item 소유권 insert 검증.

**학생 `/study/plan`** (nav "종합반 > 월간 계획", cohort_curriculum 플래그): 계획 시작→항목 CRUD(F4 하루시간 필수)→제출. 노드 선택기 = **약점 추천·최근 사용이 기본 진입점**, 전체 탐색(계층 들여쓰기+검색)은 과목 선택 시 지연 로드(`/api/study-plan/nodes`). 강의 연결 시 resolver 경유(미매핑=노드 미연결 정직 표시). 반 공통 과제 읽기 전용 병기(자물쇠, 복제 없음). **과욕 지수 작성 중 실시간 표시**(가용시간 초과 시 경고 문구). 승인 후 잠금 + "계획 수정(새 버전)" 경로. 진단 미입력 시 안내 배너.

**staff `/admin/cohorts/:id/plans`(+`/plans/:profileId`)**: 반 현황 표(진단 유무·계획 상태·제출 큐 우선 정렬) → 상담 화면 한 흐름 — ①진단 입력(초시/재시·가용시간·메모) ②과목별 수준 9행(법 5: lecture_stage·수강이력·방향 / 과학 4: tier·점수/총문항·**출처 배지**·철회 시 재확인 경고) ③계획 검토(신호 2종: 과욕 지수 + 약점 회피 — 미포함 약점 노드 명시) ④승인(RPC)/반려(코멘트 필수). 반 상세에 "월간 계획" 진입 버튼.

**G3**: 빌더에 진단 테스트 체크박스(자연과학만), 성적 저장 시 `offline_test_answers` 정답 수 기반 tier 파생(경계 0.7/0.4 = `study-plans/labels.ts` 단일 상수), taken 전원 갱신·최신값 우선, 결과 화면에 갱신 인원 표시, absent 철회 시 값 유지+`diagnostic_retracted`+경고.

품질 게이트: typecheck ✅ · `react-router build` ✅(node-picker 등 클라 컴포넌트는 labels·subjects lib만 import — 서버모듈 경계 확인).

## 2. 검증 — vitest 통합 12/12 통과 (운영 DB, 하네스 `tmp/phase3-verify/`)

강사 경로는 admin 우회가 아니라 **실제 로그인한 instructor RLS 클라이언트**로 검증(RPC 내부 role·반 소유권 게이트까지 실동작). 테스트 데이터(학생 2·강사 1·반 1·과제 1·진단시험 1) 전량 삭제 실측(잔여 0).

| 항목 | 결과 | 비고 |
|---|---|---|
| P2 승인 후 학생 수정 차단 | ✅ | 항목 UPDATE/DELETE·plan 상태 되돌리기 전부 0행(RLS), 원본 무결 확인 |
| P5 과욕 지수 | ✅ | 평일 350/300 → warn·주말 150/600 → ok (경계 상수 경유) |
| P6 약점 회피 신호 | ✅ | 오답 5건 노드가 상위 약점으로 감지되고 계획 미포함 → avoidedCount ≥1 |
| P9 과제 미복제 | ✅ | 기간 과제 표시되되 study_plan_items 행 불변(2건 그대로) |
| P10 tier 파생 | ✅ | 순수(7/10 high·5/10 mid·2/10 low·0 low·14/20 high) + **E2E**(진단 시험 저장→high, 재저장→mid 갱신, 철회→값 유지+retracted+경고 카운트) |
| P13 RLS 교차 차단 | ✅ | 타 학생 계획·진단·항목 read 0행, 남 명의 insert 거부 |
| RPC 원자 전이 | ✅ | v2 승인 시 v1 superseded 동시 전이, baseline(진단 300/600) 동결, 항목 is_locked. 학생 RPC 호출 거부 |
| 유니크 2분할 | ✅ | 중복 draft 23505 / **v1 approved + v2 draft 공존**(Stage 1 결함 수정의 실증) + root 체인·변경 횟수 |

**P3 재정의(지시서 대비)**: 원문 P3("준수율이 v1 기준")은 승인 2.2(준수율=현재 승인본)로 철회되었으므로, 대신 버전 체인 메커니즘(공존·원자 supersede·root 체인·항목 복사·잠금 해제)을 검증했다. P1(전 경로 E2E)·P4·P7·P8·P11·P12는 일일 기록·체크포인트가 생기는 **Stage 3에서 검증**한다.

## 3. 완료 판정 기준에 대한 정직한 상태

"상담자가 종이 없이 상담 1회 완주" — **데이터 흐름**(진단 저장→신호 계산→승인 RPC→잠금)은 하네스로 실증했고, 진단→검토→승인이 한 화면(`/admin/cohorts/:id/plans/:profileId`)에 배선되어 있다. **브라우저 수준의 화면 완주 확인은 사람 눈 검수 대기** — 정확히 이 게이트에서 봐 주실 부분입니다.

## 4. 알려진 상호작용·한계 (수정 안 함, 기록)

1. **submitted 상태의 학생 회수 경로 없음** — 제출 후 학생은 수정·철회 불가, 상담자의 반려로만 풀린다(RLS 화이트리스트의 귀결). 화면에는 뱃지만 표시. 운영 게이트에서 마찰로 나타나면 재검토.
2. 강의 카탈로그 매핑 4행 — 강의 연결 항목은 당분간 대부분 "노드 미연결"로 표시(Stage 0 대응 2-1, 운영 매핑 권고 유지).
3. P10 E2E의 진단 시험 저장은 Phase 1 SRS 훅도 함께 지나갔다(간섭 없음 확인) — 진단 저장이 일반 성적 저장과 같은 경로임의 방증.
4. 검증 하네스의 `today` 계산은 월 경계(KST)에 민감 — 재사용 시 주의(내구성 있는 픽스처 아님).
5. 마이그레이션 선적용 + 코드 배포 사이 구간은 additive 전용이라 구 코드와 안전(Phase 1과 동일 패턴).

## 5. Stage 3 남은 범위

일일 기록 화면(기대 항목 파생, 노드 선택기 없음, 모바일 2탭)·계획 외 학습 경로·격주 체크포인트(checkpoint_date 기준 **소급 계산**, 승인 2.1)·지표 노출(달성률·미분류 비율·과제 이행률 병기) + P1·P4·P7·P8·P11·P12 검증 + `phase3-completion-report.md`.

*Stage 2 종료 — 승인 없이 Stage 3으로 진행하지 않는다.*
