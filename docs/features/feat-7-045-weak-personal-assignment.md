# feat-7-045 — 약점 개인 보충 과제 자동 생성

> 상태: 🟡 진행 중 (2026-07-06 착수)
> 관련: feat-7-021(과제) · feat-7-040(약점 seam) · 온·오프 병행 종합반 로드맵 P0-③

## 1. 목적

진단(약점 매트릭스)이 행동(과제)으로 자동으로 닫히게 한다. "매주, 학생별 약점
단원에서 N문항 개인 보충 과제 자동 생성" — 진단→처방 루프의 마지막 연결
(기존에는 약점→모의 배선만 있고 약점→과제 CTA 0곳).

## 2. 설계

- **개인 과제 = `assignments.target_profile_id`** (null=반 전체, 값=그 학생 전용).
  기존 과제 파이프라인(완수 자동 판정·마감 정책·주간 리포트·진척 표)을 그대로
  타는 것이 핵심 — 별도 추천 큐를 만들지 않는다.
- **RLS**: `assignments/assignment_items_member_read` 재생성 — 학생 경로에
  `(target is null or target = auth.uid())` 결합. owner/manager 는 전부 열람.
- **약점→문제 추출은 기존 개인 seam 재사용**: `getWeakNodes(개인)` →
  체계도 노드 문제 시퀀스(approved 필터) → `pickProblemsFromWeakNodes`(가중 배분).
  session-from-weakness("D")와 동일 로직을 `weak-problem-pick.server.ts` 공용
  헬퍼로 추출(세션 생성 vs 과제 생성만 다름).
- **생성기** `generateWeakAssignmentsForCohort(cohortId, {n, dueDays})`:
  학생별로 ① 이번 주 이미 개인 약점 과제 있으면 skip(주 1회 가드)
  ② 최근 4주 개인 약점 과제에 출제된 문제 제외(반복 출제 방지)
  ③ 약점 데이터 부족 학생 skip. 제목 = "약점 보충 — {과목} (M/D 주)".
- **트리거 2경로**: 반 과제 목록 화면 [약점 개인 보충 지금 생성] 버튼(즉시) +
  `/api/cron/weak-assignments`(CRON_SECRET, `cohorts.weak_assignment_auto=true`
  반만 — opt-in 토글은 과제 목록 화면).
- **알림**: 개인 과제는 반 전체 공지 fanout 생략(타인에게 무의미) — 학생
  노출은 /assignments 목록·대시보드 마감 임박 배너·주간 리포트가 담당.
- adminClient 로 생성(cron·일괄) — 반 소유권 게이트는 API 에서 선행
  (assignment API 동일 원칙).

## 3. 진행 로그
- 2026-07-06: 착수. DB(target_profile_id·weak_assignment_auto·RLS 재생성) 운영 적용.
