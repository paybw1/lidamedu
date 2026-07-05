# feat-7-043 — 출결 대장 (종합반 오프라인 수업 출석부)

> 상태: 🟡 진행 중 (2026-07-05 착수)
> 관련: feat-7-042(오프라인 테스트) · feat-8-014/7-035(위험군) · 온·오프 병행 종합반 로드맵 P0-①

## 1. 배경

온·오프 병행 종합반의 주간 운영 리듬(수업→과제→테스트→피드백)의 첫 축.
오프라인 수업 회차별 출석을 기록하고, 온라인 대체 시청 인정 규칙을 담으며,
결석 신호를 위험군 감지에 합류시킨다. 접속 이력(access log)과는 별개 —
출결은 "수업 회차"에 대한 명시적 대장이다.

## 2. DB

```sql
cohort_class_sessions (
  class_session_id uuid PK,
  cohort_id FK→cohorts cascade,
  session_no int,            -- 회차 번호(운영자 지정, 정렬 축)
  held_on date,              -- 수업일
  title text,                -- 예: "특허법 3강 — 특허요건"
  note text,
  created_by, created_at, deleted_at  -- soft delete
)
cohort_attendance (
  attendance_id uuid PK,
  class_session_id FK cascade,
  profile_id FK→profiles cascade,
  status text CHECK in ('present','late','absent','online','excused'),
  -- 출석 / 지각 / 결석 / 온라인 대체(VOD 등 인정) / 공결(사유 인정)
  note text,
  recorded_by, recorded_at,
  UNIQUE(class_session_id, profile_id)
)
```

RLS: 두 테이블 staff 전체 CRUD. 학생은 자기 attendance select +
자기 반 class_sessions select(맥락 표시용).

## 3. 화면

1. **회차·출석 관리** `/admin/cohorts/:cohortId/attendance`
   - 회차 목록(번호·수업일·제목·출석 요약 chip) + 회차 추가 폼.
   - 하단: 학생별 누계 표(출석/지각/결석/온라인/공결 · 출석률%).
2. **출석 체크** `/admin/cohorts/:cohortId/attendance/:classSessionId`
   - 학생 목록 그리드 — 기본 "전원 출석" 버튼 후 예외만 상태 변경
     (오프라인 테스트 결과 입력과 같은 관행 최적화 UX). 비고 입력.
3. **학생 노출**: `/assignments`(학습관리) 상단에 내 출결 요약 카드
   (출석률 + 최근 회차 상태 chips).
4. **위험군 합류**: at-risk 사유에 "최근 결석"(최근 4회 중 결석·무단 2회 이상)
   신호 추가.

## 4. 원칙

- 출석률 = (출석+지각+온라인+공결) / 전체 회차. 지각은 별도 카운트로 병기.
  결석만 분모 대비 감점 — 온라인 대체는 출석 인정(병행반 정책).
- 기록 쓰기 = 요청 클라이언트(RLS staff) + action 반 소유권 게이트
  (assignment API 와 동일 원칙). 학생 명의 기록이 아니므로 adminClient 불필요.
- 파생값(출석률) 저장하지 않음 — 조회 시 계산.

## 5. 진행 로그
- 2026-07-05: 사용자 승인("출결 대장부터 고고"), 문서 작성.
