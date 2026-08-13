# Phase 0 정합성 감사 결과 — 오프라인 학습 통합

> 성격: **읽기 전용 감사.** 코드·스키마·데이터·마이그레이션 변경 0. SELECT 조회(운영 DB mcgdoplo) + 코드 정독 + 이 보고서 1개 작성만 수행.
> 작성일: 2026-08-12. 데이터 스냅샷: 운영 DB 실측(Management API, 읽기 전용).
> 선행 문서: `오프라인학습_통합설계서_v0.1.md` — **리포지토리 내 미발견**(전 저장소 탐색 0건). 지시서에 수록된 확정 결정(P1~P3, D1~D5)을 참조 기준으로 삼았다. P4 지시서(`선순환_P4_개인약점엣지정렬_지시서.md`)도 그 파일명으로는 부재하며, 동일 내용의 `docs/features/선순환-p4-개인약점엣지정렬.md`(Stage A+B 기록)를 참조했다.
> 직전 감사 기준선: `docs/features/선순환-phase0-노드정합성-감사.md`(2026-07-15) — 이 보고서의 여러 수치가 그 시점 대비 **크게 달라졌다**(상표 태깅 0%→98.8%, lesson_node_links 0→4행 등). 직전 감사 수치를 인용하는 설계 문구는 갱신 필요.

---

## 요약 판정

| 항목 | 판정 | 한 줄 요약 |
|---|---|---|
| A. 네임스페이스 | **차단** | `offline_tests` 4종이 실사용 중(33건·최근 30일 23건 쓰기)이며 "지필 테스트 문항별 정오 입력"을 이미 구현 — 신규 구현이 아니라 **확장으로 설계 재검토** 필요 |
| B. 노드 규모 | 주의 | 계획 부착 대상(비 case_only) 노드 과목당 109~175개 — 계층 탐색+검색 병행 필수. `unclassified` 센티넬 없음 |
| C. P4 버그 | 정상 | Stage B 적용 완료(2026-07-15, 커밋 3개 확인). 개인약점·코호트·마스터리·OX 전부 단일 헬퍼로 핀 우선 통일 |
| D. 문제은행 태깅 | 정상(3과목)/차단성(1과목) | 특허 99.5%·상표 98.8%·민법 100% → (a) 편성 가능. **디자인 0% → (b) 외부 문항 등록 경로만** |
| E. 강의↔노드 매핑 | 주의 | 매핑 UI 신설·4행 입력 시작(직전 감사 0행). 단 시청 진도는 노드 미연결·소비처 부재 — 강의 계획은 당분간 시간 집계만 |
| F. 학습시간 집계 | 정상(단서) | 시간 지표는 전부 `time_spent_ms`(ms) 단일 소스 → 분 합산 가능. 단 스트릭·레벨 등은 건수 기반이라 별도 축, `study_sessions.duration_ms`는 죽은 컬럼 |
| G. 게임화 구조 | 정상 | 경쟁 요소는 코호트 공부량 브래킷 2종뿐이며 다른 요소와 입력 지표 비공유 → D5(a) 분리 적용 가능. 스트릭 하루 경계 KST 00:00 |
| H. 채점 인프라 | 주의(차단 1건 내포) | 지필 결과 입력 경로는 서버 채점(재사용 가능). 그러나 **법률 객관식 온라인 응시는 클라이언트 정오 신뢰** — 온라인 병행 응시를 지필 성적에 합류시키는 현 구조는 hard signal 위배 |
| I. 날짜 경계 | 주의 | 핵심(스트릭·일일집계·주=월요일)은 KST 00:00 일관. 단 분석 스트릭 UTC 버킷, 과제 마감 9시간 오표시 등 혼재 지점 존재 |

## 차단 항목

1. **A — 지필 테스트 기능·네임스페이스 정면 중복.** `offline_tests`/`offline_test_questions`/`offline_test_results`/`offline_test_series`(feat-7-042)가 실사용 중이며, 설계 결정 P2(문항별 정오 입력)·D1(a)(문제은행 편성)·D4(2차 제외)를 **이미 구현**하고 있다(`offline_test_results.wrong_ords`, 노드 필터 문항 빌더, 서버 점수 계산, `@media print` 시험지·정답지 출력). Phase 1 스키마 설계는 신규 테이블 신설이 아니라 **이 4종 확장(cohort 종속 완화·시리즈·외부 문항 등록 D1(b) 추가)** 을 기본안으로 재검토해야 한다. `offline_` 접두사 신규 테이블은 충돌.
2. **H(부분) — 온라인 병행 응시의 클라이언트 채점.** 법률 객관식은 정답이 응시 로더에서 클라이언트로 전량 내려가고 클라이언트가 계산한 정오를 서버가 무검증 저장한다(§H 상세). 오프라인 테스트의 온라인 응시(법률)가 이 경로를 그대로 타고 지필 결과 그리드에 프리필된다 → **지필 성적에 조작 가능 신호가 합류**. Phase 1에서 지필 입력만 쓰면 회피 가능하나, 온라인 병행을 켜기 전 `problems/api/attempt` 서버 재채점 전환(1개 API 수정, §H 권고)이 선결이다.

> D의 디자인 0%는 "차단"이 아니라 지시서 판정 규칙대로 **"해당 과목 (b) 경로만 사용"** 으로 처리한다.

---

## 항목별 상세

### A. 네임스페이스 및 중복 구현

public 스키마 테이블 총 **220개**. 지정 접두사 충돌 탐색 결과:

| 접두사/키워드 | 충돌 테이블 | 비고 |
|---|---|---|
| `study_` | `study_goals`(105행), `study_sessions`(52,788행), `study_books` | 전부 실사용 — 신규 `study_*` 명명 시 충돌 |
| `offline_` | `offline_tests`(33) · `offline_test_questions`(646) · `offline_test_results`(0) · `offline_test_series`(1) | **정면 충돌 + 기능 중복(아래)** |
| `consultation` | 직접 일치 없음. 단 `student_notes`(5행, feat-7-025 강사→학생 1:1 상담 코멘트)가 상담 성격 기존 구현 | 상담 기능 설계 시 통합/구분 결정 필요 |
| `timer_` | 없음 | — |
| `plan_` | `plan_books` · `plan_book_links` · `plan_courses` · `plan_policies` | **전부 구독 상품(subscription_plans) 부속** — 학습계획과 무관하나 이름 공간은 선점됨. 학습계획에 `plan_*` 명명 금지 |
| 계획성 유사 명칭 | `study_goals` · `assignments`(3)/`assignment_items`(11)/`assignment_submissions`(36) · `curricula`(3)/`curriculum_weeks`(1)/`curriculum_items`(1) · `exam_schedules` | 아래 실사용 분석 |

**계획·일정 성격 기존 테이블의 실사용(최근 30일 쓰기 포함):**

| 테이블 | 행 수 | 최근 30일 쓰기 | 성격 · 코드 경로 |
|---|---:|---:|---|
| `study_goals` | 105 | 44 | 학생 목표(차수·시간 목표). `/study/stats` 상단 Sheet(목표·진도·통계 통폐합) |
| `assignments` 계열 | 3/11/36 | 0/–/10 | 강사→학생 과제(feat-7-021b, 마감·제출·완료). `app/features/assignments/` |
| `curricula` 계열 | 3/1/1 | 1/0/0 | 종합반 주차 커리큘럼(주차 = 개강일 기준, `curriculum-weekly` cron — 단 vercel.json 미등록, §I) |
| `offline_tests` 계열 | 33/646/0/1 | 23/540/–/0 | **종합반 지필 시험지 빌더+결과 입력(feat-7-042) — 활발히 실사용 중** |
| `cohort_attendance` / `cohort_class_sessions` | 0/0 | 0 | 출결(feat-7-043) — 테이블·화면 있으나 데이터 미입력 |
| `student_notes` | 5 | 1 | 상담 코멘트(강사→학생) |

**판정: 차단.** 사유: ① `offline_` 접두사가 그대로 충돌하고, ② 무엇보다 feat-7-042가 설계서의 "지필 테스트" 요구(문항별 정오·문제은행 편성·시험지 인쇄·서버 점수)를 이미 커버하는 **실사용 시스템**이라, 중복 구현 방지 원칙상 Phase 1은 "신설"이 아니라 "확장" 프레임으로 재검토가 필요하다. 아울러 주간 계획(week_start_date) 설계는 `curricula`(주차)·`assignments`(마감·제출)·`study_goals`(목표)와 의미 경계를 명시적으로 그어야 한다 — 특히 "학생 작성 계획"과 "강사 부여 과제"가 학생 화면에서 어떻게 병존하는지.

### B. 커리큘럼 노드 SSOT 규모와 선택기 실현 가능성

총 노드 **712** (patent 181 · trademark 223 · design 167 · civil 141). 직전 감사(692) 대비 상표 워크북 개편(+19)·디자인 최신판례(+1) 반영. `civil-procedure`·`science`는 노드 트리 없음.

**레벨(깊이)별 분포 — 계획 부착 후보 판단용** (lvl1=최상위):

| 과목 | lvl1 | lvl2 | lvl3 | lvl4 | lvl5 | 총 | case_only | **비case(계획 부착 가능)** | 비case leaf |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| patent | 11 | 38 | 72 | 60 | – | 181 | 72 | **109** | 68 |
| trademark | 14 | 51 | 99 | 35 | 24 | 223 | 48 | **175** | 102 |
| design | 11 | 46 | 94 | 14 | 2 | 167 | 17 | **150** | 100 |
| civil | 5 | 32 | 66 | 38 | – | 141 | 0 | **141** | 112 |

레벨별 노드명 샘플(입도 판단):
- **lvl1** (장 단위): 특허 `01 총칙/보칙 · 02 특허요건 · 03 이익제도 · 04 심사 · 05 특허권` / 민법 `제1편 총칙 · 제2편 물권 · 제3편 채권 · 제4편 친족 · 제5편 상속`
- **lvl2** (절 단위): 특허 `[01] 공지예외적용주장출원 · [01] 특허를 받을 수 있는 발명 …` / 상표 `[01] 상표등록을 받을 수 있는 상표 …` / 민법 `제1장 총칙 · 제1장 통칙 …`
- **lvl3** (논점 단위 — **계획 부착 적정 입도로 판단**): 특허 `거절결정불복심판 · 국내우선권주장출원 · 강제실시권 …`(72) / 상표 `1상표 1출원 · 거절이유의 통지 …`(99) / 디자인 `1디자인 1출원 · 강제실시권 …`(94) / 민법 `제10절 현상광고 · 제11절 위임 …`(66)
- **lvl4 이하**: 특허는 전부 case_only(판례 분류) — 계획 대상 아님. 민법 lvl4는 `제1관 계약의 성립 …`(38, 유효). 상표 lvl4는 절반가량 유효(권리소진 등).

판단 근거: 계획 항목 입도는 "이번 주 무엇을 공부하나"이므로 lvl2(절)~lvl3(논점)이 적정하다. lvl3 기준 과목당 66~99개, 비case 전체 기준 109~175개.

**센티넬 노드: 없음.** `unclassified`/`미분류` 성격 노드 부재(각 과목 `최신판례`는 case_only 판례 분류용이라 계획 센티넬로 부적합). D2의 `unresolved` 격리를 노드로 표현하려면 센티넬 신설 또는 계획 테이블 측 nullable 처리 필요 — Phase 1 설계 입력.

**판정: 주의**(과목당 100~300 구간). 플랫 선택기 불가 — **계층 탐색 + 검색 병행** 전제. 기존 자산: 주관식 탭·문제 탭의 `ProblemSystematicTree`(검색 입력 내장, `problem-systematic-tree.tsx`)와 문제 편집기의 조상-크럼 셀렉트(`admin-problem-edit.tsx` allNodeOptions)가 그대로 재사용 가능한 선택기 패턴이다. 약점 노드·최근 사용 노드 추천 진입점은 `getWeakNodes`(정렬 완료, §C)로 즉시 구성 가능.

### C. P4 약점 엣지 정렬 버그 상태 ★

**판정: 정상 — 수정 완료 확인.**

- **코드 실증**: SSOT 헬퍼 `app/features/subjects/lib/problem-node-attribution.server.ts` 존재. 4개 서브시스템 전부 이 헬퍼를 사용:
  - 개인 약점 `weak-nodes.server.ts:14,116` — `attributeProblemNodes(..., 'all')` (노드 중심 재작성)
  - 코호트 `admin/queries/cohort-weakness.server.ts:17,155` — `'all'`
  - 마스터리 `study/mastery.server.ts:10,96` — `'first'`
  - OX 진단 `study/lib/ox-diagnosis.server.ts:21,592` — `'first'`
- **커밋 이력**: `5cac1d0c`(헬퍼 추출+3자 위임, 동작 보존) → `881379b9`(개인 약점 핀 우선 정렬 — Stage B 본체) → `8380c6d1`(후속: 조문 미지정 핀 문제 집계 누락 수정). P4 문서 §5의 Stage B 완료 기록(2026-07-15)과 일치.
- **현재 귀속 규칙**: 4자 모두 **`primary_node_id` 우선 / 조문 폴백**. 개인·코호트는 폴백 다중성 'all', 마스터리·OX는 'first' — 이 부차 차이는 P4 문서가 의도적으로 범위 밖(별도 티켓)으로 남긴 것으로, **핀이 있는 문제(특허 1,095·상표 243)에서는 4자 완전 일치**한다. 설계서 §8.2 "약점 회피" 승인 신호의 전제 성립.
- 불일치 규모: 해당 없음(정렬 완료). 폴백 다중성 차이가 유효한 문제는 "핀 없음 + 조문이 복수 노드에 걸림" 케이스로, 현재 대부분 민법(핀 6/680)에 국한 — 승인 신호를 코호트('all') 규칙과 같은 개인('all') 규칙으로 만들면 영향 없음.

### D. 문제은행 노드 태깅 커버리지 — D1(a) 경로

승인(approved)·미삭제 문항 기준, **노드 도달 = `primary_node_id` 직접 OR 조문(`primary_article_id`→`article_systematic_links`) 폴백**:

| 과목 | 라운드 | 총 문항 | 핀 직접 | 조문 폴백 | 도달 | 도달률 | (a) 플랫폼 편성 |
|---|---|---:|---:|---:|---:|---:|---|
| patent | 1차 | 1,106 | 1,095 | 6 | 1,101 | **99.5%** | **가능** |
| trademark | 1차 | 246 | 243 | 0 | 243 | **98.8%** | **가능** (직전 감사 0% → 워크북 마이그레이션으로 해소) |
| civil | 1차 | 680 | 6 | 674 | 680 | **100%** | **가능** (조문 폴백 지배 — 폴백 다중성 유의, §C) |
| **design** | 1차 | 213 | 0 | 0 | 0 | **0%** | **불가 → (b) 외부 문항 등록 경로만** |
| design | 2차 | 64 | 0 | 0 | 0 | 0% | D4 범위 외 |
| patent | 2차 | 68 | 0 | 0 | 0%* | – | D4 범위 외. *단 `problem_systematic_links` 68/68(2026-08-12 주관식 복수 배치) — 2차 합류 시 이 링크 축 재사용 가능 |
| trademark | 2차 | 68 | 0 | 0 | 0 | 0% | D4 범위 외 |
| civil-procedure | 2차 | 68 | 0 | – | 0 | – | 노드 트리 자체 없음 |
| science | 1차 | 687 (물172·화171·생172·지172) | – | – | – | – | 노드 체계 밖(`science_section_id` 별도 taxonomy). 지필 빌더는 science 후보 쿼리 별도 보유(`listScienceMcqCandidates`) |

- 지시서가 언급한 "576문항 미태깅(상표+디자인)"은 **stale** — 현재 미태깅은 **디자인 213(1차)뿐**.
- 1차/2차 구분: `problems.exam_round ∈ {first, second}` 컬럼. 라운드 필터 적용 지점 — 지필 빌더 후보 쿼리(`offline-tests/queries.server.ts:759` 이하)는 문항 유형(mcq/ox/blank) 필터로 사실상 1차만 다루며, 학습과목 쿼리는 `listProblemsBySubject`/`getSubjectAxisCounts`에서 `exam_round`로 분리.

**판정**: patent·trademark·civil **정상**, design **30% 미만 → (b) 외부 문항 등록 경로만 사용**(보고서 명시 요구사항). 디자인도 상표와 동일한 워크북 기반 배치 파이프라인(memory `trademark-workbook-migration`)이 준비돼 있어 태깅 백필은 별도 작업으로 가능하다.

### E. 강의↔노드 매핑 상태 — D2(b) 의존성 ★

직전 감사 대비 **상태 변화 큼**:

| 지표 | 직전 감사(07-15) | 현재(08-12) |
|---|---:|---:|
| `lesson_node_links` 행 | 0 | **4** (최근 30일 생성) |
| `courses` | 3 (테스트) | **6** (published 4 · draft 2) |
| `course_lessons` | 4 (테스트) | **17** |
| `course_series` | – | 4 (임병웅 특허법 기본강의·조문강의, 김동진 민법, 테스트) |
| 시청 데이터 | – | `watch_ledger` 3 · `watch_positions` 7 · `lesson_completions` 0 · `enrollments` 2 |

- **매핑 등록 UI: 존재**(직전 감사의 "쓰기 경로 전무"는 stale). `admin-lms-course-detail.tsx:431-479` `set_lesson_nodes` 인텐트(에디션 과목의 systematic_nodes로 필터 후 delete+insert), `:1252-1405` 회차별 체크박스 멀티셀렉트 UI, 에디션 복제 시 링크 복제(`admin-lms-courses.tsx:325-337`).
- 현재 매핑 4행 내용: 특허 코스의 OT·1강(총칙/보칙), 1회 2강(목적) 등 — **실운영 입력이 시작된 초기 상태**.
- **강의 참조 계획 항목의 노드 해석 가능 비율 추정: 4/17 ≈ 24% (추정 근거: 회차 17개 중 매핑 4개; 실제 계획에 등장할 회차가 어떤 것일지는 미지)**. 카탈로그 자체가 아직 소규모라 비율보다 "절대량이 작다"가 정확한 서술.
- **시청 진도→노드 집계는 미배선**: `watch.server.ts`·`playback.server.ts`에 노드 참조 0회. `lesson_node_links`를 소비해 단원별 시청을 집계하는 코드는 앱 전체에 없음(관리자 편집 화면 읽기 1곳뿐). 종합반 커리큘럼의 강의 항목(`curriculum_items`)은 `lecture_title/url/duration_min` 자유 텍스트로 `lesson_id`·`node_id` FK 자체가 없음 — **커리큘럼 강의는 표시 전용**.

**판정: 주의(차단 아님)** — 지시서 판정 그대로. **"강의 단위 계획은 당분간 시간 집계에만 기여하고 노드 신호를 만들지 않음"을 설계서 v0.2에 명시할 것.** `lesson_node_links` 채우기(및 `curriculum_items.lesson_id` FK 신설 검토)의 우선순위 상향을 권고한다. resolver 경유(D2) 전제는 성립 — 테이블·UI·FK가 준비돼 있고 소급 재해석이 가능한 구조다.

### F. 학습시간 집계의 현재 정의

**핵심: "학습시간"의 실소스는 `user_problem_attempts.time_spent_ms` 단 하나(ms 단위)다.** 문제가 화면에 뜬 시각→제출 시각의 벽시계 차(클라이언트 계상, 상한 없음 — `problems/api/attempt.tsx:19`에 `.max()` 부재). 이미 자기보고에 가까운 신뢰 모델이라, 오프라인 자기보고 분(minutes)을 더해도 신뢰 모델이 새로 나빠지지 않는다.

| 지표 | 정의·계산 경로 | 단위 | 오프라인 분 직접 합산 |
|---|---|---|---|
| 주간 공부량(자기성장) | `study/lib/study-volume.ts:22-33` `weeklyStudyMs` ← `getDailyStudyStats`(`study/queries.server.ts:1842-1904`, attempts의 `time_spent_ms` KST 일자 버킷) | ms | **가능** |
| 지난주 대비 % | `study-volume.ts:36-42` | ms 파생 | 가능 |
| 주별 학습시간 차트 | `stats.tsx:988-1015` | ms | 가능 |
| 코호트 공부량 브래킷 | `study/cohort-percentile.server.ts:24-50` `sumTimeMsByUser`(attempts 전기간 합) | ms | 가능하나 **비권장**(§G — 자기보고를 상대비교에 넣으면 공정성 붕괴) |
| at-risk "공부량 급감" | `exam-results/at-risk.server.ts:192-198` (7d vs 7d ms 합) | ms | 가능 |
| 스트릭·주간 활동일·히트맵 | `study/lib/streak.ts:21-61`·`activity-heatmap.server.ts` — **attemptCount>0인 날 수/건수** | 건수 | **불가**(별도 축) |
| 글로벌 레벨 | `study/lib/level.ts:22-37` — 마스터 단원 **수** | 개수 | 불가·무관 |
| 단원 마스터리 | `study/lib/mastery.ts:31-48` — 시도수·정답률·SRS reps | 건수·비율 | 불가·무관 |
| 합격예측 "학습량" | `study/lib/pass-predict.ts:81-83` — 조문·문제 **진도율%** (이름만 학습량) | % | 불가·무관 |
| 진도 정체·강의만 시청 | `at-risk.server.ts:288-297, 277-284` — 접속 일수·건수 | 건수 | 불가 |

- **중대 발견 ①**: `study_sessions`는 시간을 재지 않는다. `duration_ms`/`ended_at` 컬럼은 있으나 실쓰기 경로가 없고(`recordStudySession`은 user_id+scope만 insert, `study/queries.server.ts:32-36`; 실측 52,788행 중 `duration_ms` 非NULL **0건**), 유일한 쓰기는 합성 시드(`exam-results/seed.server.ts:225`). 이를 읽는 analytics `totalTimeMs`(합격자 트렌드 "학습시간" 곡선, `analytics.server.ts:206,266` 등)는 **실사용자 기준 항상 0** — 죽은 지표.
- **중대 발견 ②(합산 설계에 유리)**: 시간 축(`DayStudy.timeMs`)과 활동 축(`DayActivity.attemptCount`)이 이미 **인터페이스로 분리**돼 있다. 오프라인 분을 별도 소스로 만들어 `DayStudy.timeMs`에만 합류시키면 스트릭·히트맵·진도정체를 오염시키지 않는다. 반대로 "가짜 attempt 행"으로 주입하는 설계는 건수 지표 전부를 오염시키므로 금지해야 한다.
- `useStudyTimer` 훅: **존재하지 않음**(전 저장소 검색 0건 — CLAUDE.md 디렉토리 맵의 기재는 stale). 타이머는 화면 인라인 wall-clock 3곳(`problem-viewer.tsx:806-809` 등).
- 집계 단위 ms, 기준 타임존 KST(§I).

**판정: 정상**(시간 단위 기반 — 직접 합산 가능). 단 위 두 발견을 설계서 v0.2에 반영: 합산 대상 = `DayStudy.timeMs` 계열만, `study_sessions.duration_ms`·analytics 학습시간은 죽은 상태임을 전제로 할 것.

### G. 게임화 보상 구조 — D5(a) 가드레일

| 요소 | 입력 지표 (파일:함수) | 경쟁성 |
|---|---|---|
| 글로벌 레벨(입문~통달) | 마스터 단원 **수** (`level.ts:22`, 임계 [0,3,8,15,25]) | 개인(절대 임계) — 비경쟁 |
| 단원 마스터리 티어 | 시도≥5·정답률≥85·SRS reps≥2·overdue 0 (`mastery.ts:31`) | 개인 — 비경쟁 |
| 스트릭(연속일·freeze)·주간 활동일·최장 기록 | attemptCount>0 일수 (`streak.ts:21,34`; 영속 `user_gamification.longest_streak_days`) | 개인 — 비경쟁 |
| 주간 공부량 자기성장(지난주 대비) | `time_spent_ms` (`study-volume.ts:22,36`) | 개인(자기 대비) — 비경쟁 |
| **코호트 공부량 브래킷** | `time_spent_ms` 전기간 합 (`cohort-percentile.server.ts:24-50,101`) | **경쟁**(상위%·구간 라벨을 학생 본인에게 노출, `stats.tsx:368`). 완충: 리더보드 금지·4구간 밴드·B동의 대칭+표본 10 게이트(현재 B동의 1명 → 실질 잠김) |
| **관리자 반내 공부량 위치** | 동일 ms 합 (`cohort-percentile.server.ts:120-166`) | **경쟁**(강사 노출; 학생 화면 아님. 표본 5 게이트) |
| "약점 정복" | **독립 요소 아님** — 설계 문서에만 있고(`동기부여-게임화-설계.md` §2.3, `user_node_conquest` 테이블 미생성) 실구현은 마스터리의 UI 라벨("정복한 단원") | – |
| 뱃지 | 미구현(검색 0건) | – |

- **오프라인 시간 반영 시 값이 변하는 지점(전수)**: `weeklyStudyMs`·`studyDeltaPct`(`study-volume.ts:22-42`) → `GamificationSummary`(`gamification.server.ts:90-92`) → 학생 공부량 카드·주별 차트(`stats.tsx:928-1015`)·대시보드(`dash-growth.tsx:72`, `dash-activity.tsx:152-173`)·관리자 미러(`admin-student-detail.tsx:2521-2603`) + **경쟁 2종**(`cohort-percentile.server.ts`) + at-risk 공부량 급감(`at-risk.server.ts:192-198`). 변하지 않는 것: 레벨·마스터리·스트릭·히트맵·합격예측(건수/개수 기반).
- **스트릭 하루 경계: KST 00:00** (`queries.server.ts:1829-1836` `ymdKst` = +9h 후 UTC 필드 추출; `streak.ts:4` 계약 주석). 주 시작 = 월요일(`streak.ts:12-18`).
- **분리 가능성: 구조적으로 이미 분리.** 경쟁 2종(브래킷·반내 위치)만 ms 합을 상대비교에 쓰고, 레벨·마스터리·스트릭은 입력 지표를 전혀 공유하지 않는다. D5(a) "비경쟁에만 반영"은 **`sumTimeMsByUser`에 오프라인 소스를 합류시키지 않는 것만으로 달성**된다(자기성장 쪽 `getDailyStudyStats` 계열에만 합류).
- 부수 발견(버그, 기록만): `streak_freezes_remaining`이 읽히기만 하고 쓰이는 곳이 없어(`gamification.server.ts:43,50` 읽기 2곳 / 쓰기 0곳, 기본값 `?? 1` 매회 재부여) **결석 1일 면제가 사실상 무제한**. 스트릭 윈도 120일 상한(`GAM_STREAK_WINDOW_DAYS`), 오프라인 시간이 스트릭에 안 잡히는 것 자체가 "오프라인 학습일이 결석 취급"되는 현상 — D5 설계 시 "오프라인 기록일도 활동일로 인정할지"가 별도 결정 포인트다(시간 합산과 별개의 축).

**판정: 정상**(경쟁 요소 명확 분리 가능).

### H. 채점·시험지 인프라 재사용 가능성

**기존 지필 인프라(feat-7-042)가 요구의 대부분을 이미 구현:**

- **시험지 편성**: `admin-offline-test-edit.tsx` — 유형(mcq/ox/blank)·**노드(파트) subtree**·중요도 필터 후보 탐색 + 자동 추출 + 체크박스 담기, 순서·배점 편집(`offline-tests/queries.server.ts:310-433,676-943`). 노드 선택+문항 선택을 겸비한 유일한 빌더.
- **지필 결과 입력(P2 문항별 정오)**: `admin-offline-test-results.tsx` 학생×문항 그리드 → `saveOfflineTestResults`(`results.server.ts:304`) — **서버가 `points`로 점수 계산**(`:414-415`), 정오를 `user_problem_attempts`/`user_blank_attempts`로 역산 기록(`:339-466`), `quiz_sessions(source='offline_test', mode='exam')` 생성, `offline_test_results` 스냅샷(unique test_id,user_id). 재입력·결석 처리 포함. adminClient 사용은 의도된 예외로 호출측 3중 게이트(`admin/api/offline-test.tsx:93-102`).
- **시험지·정답지 출력**: `admin-offline-test-print.tsx` — `@media print` + `window.print()`(브라우저 PDF 저장), `?answers=1` 정답·해설지 분리. **서버 PDF 렌더러는 없음**(puppeteer 등 부재; jspdf 클라이언트 1곳은 학습보조 전용).
- **정답 저장 위치**: `problem_choices.is_correct` / `ox_truth` / `article_blank_sets.blanks[].answer`.

**서버 권위 여부 — 경로별 비대칭(★):**

| 경로 | 서버 권위? | 근거 |
|---|---|---|
| 지필 결과 입력(그리드) | **예** | `results.server.ts:414-415` 서버 점수 계산 |
| OX 시험 | 예 | `mcq-pack-ox-exam.tsx:130-144` — 클라 정오 폐기·서버 재채점(레퍼런스 패턴) |
| 자연과학 뷰어 | 예 | `science/problem-viewer.tsx:141-150` choiceId로 서버 재도출 |
| 빈칸 | 예 | `blanks/api/attempt.tsx:38-57` |
| **법률 객관식 뷰어·MCQ 팩·통합 모의고사** | **아니오 — 클라이언트 신뢰** | 정답이 응시 로더에 전량 직렬화(`problems/queries.server.ts:2325,2335`→`mcq-pack-sheet.tsx:88`, 시험 모드 분기 없음) → 클라가 `isCorrect` 계산(`mcq-pack-sheet.tsx:228`, `problem-viewer.tsx:804`) → 서버 무검증 저장(`problems/api/attempt.tsx:17,55`, `study/queries.server.ts:453`) → 통합 모의 성적·등수·합격판정이 이 집계 위(`mcq-exams/queries.server.ts:533-624`) |
| 오프라인 테스트 온라인 병행 응시 | **법률=아니오 / 자연과학=예** | `assignments/api/offline-test-online.tsx:79-82`가 과목별 뷰어 러너로 리다이렉트 → 법률이면 위 클라 신뢰 경로. 그 결과가 `getOnlineSessionPrefill`(`results.server.ts:208`)로 지필 그리드에 프리필 |

**재사용 가능 목록**: `saveOfflineTestResults`·`getOnlineSessionPrefill`·`getOfflineTestWithQuestions`·`getOfflineTestPrintData`·후보 4쿼리·문항 편집 4함수·`getOxQuestionsForPack`(서버 채점 SSOT)·`createQuizSession`/`recordProblemAttempt` + 테이블 `offline_test_*` 4종·`quiz_sessions`·`user_problem_attempts`·`user_blank_attempts` + 화면 4종.

**지필 전용 신규 필요분**: ① 선택지 단위 답안 캡처(현재 `wrong_ords` 정오만 — 오답 시 `selected_choice_id=null`, `results.server.ts:426-428`) ② D1(b) 외부 문항 등록(문제은행 밖 문항의 시험지 합류 — 현 스키마는 problem_id/ox_ref/blank_set FK만) ③ 비종합반 대상 확장(`offline_tests.cohort_id NOT NULL` 완화) ④ 부분점수(현재 all-or-nothing).

**판정: 주의** — 지필 입력 경로 자체는 서버 채점으로 **재사용 가능(정상)**이나, 지시서 판정 기준("정답 대조가 클라이언트에서 수행되는 부분이 있다면 차단")에 걸리는 **법률 객관식 온라인 경로가 존재**하고 그것이 온라인 병행 응시로 지필 성적에 합류한다 → 이 부분은 **차단**으로 기록(위 차단 항목 2). 해소는 국소적: `problems/api/attempt`를 OX 시험 패턴대로 `selectedChoiceId`만 받아 서버 재대조로 바꾸고, 시험 모드 로더에서 `is_correct`/`ox_truth`/해설 필드를 제거(`getProblemDetailsByIds`에 withAnswers 플래그). 1개 API 수정으로 팩·통합시험·온라인 병행이 동시에 서버 권위로 전환된다.

### I. 날짜 경계와 타임존 정합

- **하루 경계 = KST 00:00, 핵심 경로 일관.** 일일 집계 SSOT `ymdKst`(`study/queries.server.ts:1829-1836`, +9h 고정 오프셋 — DST 없음), 스트릭(`streak.ts:4` 계약 주석), 히트맵·SRS due·오늘의 메뉴·at-risk(`at-risk.server.ts:126-130`) 전부 동일 패턴. **오프라인 `log_date`를 KST 달력일로 정의하면 기존과 정합.**
- **주 시작 = 월요일, 단일 관행.** `streak.ts:12-18` `mondayOf` — 주간 공부량·주별 정답률·코호트 주별·Q&A SLA·결제 주 버킷·주간 리포트 전부 월요일(KST). **`week_start_date`는 월요일로 정의하면 충돌 없음.** 유일 예외: 종합반 커리큘럼 "주차"는 요일이 아니라 **개강일 기준 7일 단위**(`cron/api/curriculum-weekly.tsx:35-40`, `curricula/queries.server.ts:508-519`) — 주간 계획을 커리큘럼 주차와 나란히 보여줄 경우 "이번 주"가 두 의미가 되는 지점.
- **DB 타임존: UTC(Supabase 기본, 마이그레이션에 타임존 설정 없음).** `AT TIME ZONE 'Asia/Seoul'` 사용은 2곳(도서 정산·쿠폰 매출일)뿐.
- **혼재(불일치) 지점 — 기록:**
  1. [高] 학습 분석 스트릭이 **UTC 버킷**: `exam-results/analytics.server.ts:268,275-279` — KST 00:00~08:59 학습이 전날로 밀려 대시보드 스트릭과 다른 값 가능(단 §F대로 이 지표는 실데이터 0인 죽은 경로).
  2. [高] **과제 마감시각 9시간 오표시**: `student-assignments.tsx:265`·`student-assignment-detail.tsx:126`·알림 본문(`assignments/queries.server.ts:283,285`) — timestamptz ISO를 `slice(0,16)`해 UTC 문자열 그대로 노출("14:59"로 보이나 실제 KST 23:59). 판정 로직은 instant 비교라 정확, **표시만 오류**.
  3. [中] `pass_prediction_snapshots.snapshot_date` = DB default(UTC current_date)인데 크론이 정확히 KST 자정(UTC 15:00)에 발화 → 라벨이 하루 뒤처짐(내부 자기일관, 표시 어긋남). *DDL 미확인 — create table SQL이 repo에 없어 default는 코드 주석 근거(확인 불가 표기).*
  4. [中] 정산 기준일 규칙 분기: `20260704_instructor_share_rules.sql:14`(UTC current_date) vs `20260711_book_settlement_rules.sql:14`(KST) — 같은 도메인 내 상이.
  5. [低] KST 변환 헬퍼가 최소 12곳 중복 정의(`ymdKst`·`kstDay`·`kstToday`·`srsToday`·`toKst` 등) — 위 1·2 같은 누락의 구조적 원인.
  6. [참고] `vercel.json` 크론은 UTC 해석 — 주요 배치가 KST 00:00~03:00에 몰림(정합). 단 **크론 5종 미등록**(`curriculum-weekly`·`weekly-reports`·`exam-result-reminder`·`inactive-alert`·`bank-transfer-expire`) — 주차 자동 과제·주간 리포트가 Vercel Cron으로는 안 돌고 있음(외부 트리거 존재 여부 확인 불가).

**판정: 주의** — 신규 `log_date`/`week_start_date`는 **KST 달력일·월요일 시작**으로 정의하면 기존 핵심 경로와 일치한다. 단 위 혼재 지점(특히 과제 마감 표시)은 Phase 1 이전에 정의 통일(및 KST 헬퍼 SSOT화)을 권고.

---

## 감사자 소견

**Phase 1(지필 테스트 합류) 즉시 착수 가능 여부 — 조건부 가능.**
지필의 "문항별 정오 입력 + 서버 점수 + 학습 신호 합류"는 feat-7-042로 **이미 운영 중**이다. 따라서 Phase 1의 실제 작업은 신설이 아니라 갭 메우기다: ① D1(b) 외부 문항 등록, ② 비종합반 대상 확장, ③ (원하면) 선택지 단위 답안 캡처. 스키마 설계는 `offline_test_*` 4종 확장을 기본안으로 재검토하라(차단 항목 1). 온라인 병행 응시를 지필 성적에 합류시키는 기능은 법률 과목 클라이언트 채점(차단 항목 2)이 해소되기 전까지 **끄거나 자연과학·OX로 한정**할 것.

**Phase 2(계획·승인) 착수 전 반드시 해소해야 할 것**
1. 차단 항목 2 — `problems/api/attempt` 서버 재채점 전환(승인 신호에 조작 가능 데이터가 섞이지 않게).
2. 노드 선택기 설계 확정 — 과목당 비case 109~175개이므로 "약점 노드·최근 사용 노드 추천 기본 진입 + 계층 트리 검색"(§B). 기존 `ProblemSystematicTree`·크럼 셀렉트 재사용 가능.
3. `unclassified` 센티넬 부재 — D2 `unresolved` 격리를 노드로 표현할지, 계획 항목의 nullable 참조로 표현할지 결정(후자 권장 — 센티넬 노드는 트리 UI·통계에 새어 나옴).
4. 계획 vs 과제 vs 커리큘럼 주차의 의미 경계 문서화(§A·§I 예외).
5. P4는 해소 완료(§C) — Phase 2 차단 사유 아님.

**지시서가 예상하지 못한 발견**
- **직전 감사 수치의 대규모 stale**: 상표 태깅 0%→98.8%, lesson_node_links 0→4행(+등록 UI 신설), 강의 카탈로그 3/4→6/17. 설계서가 직전 감사를 인용한 부분은 v0.2에서 전면 갱신 필요.
- **`study_sessions.duration_ms`는 죽은 컬럼**(실데이터 0) — "온라인 학습시간"으로 이것을 상정했다면 잘못된 전제. 실합산 대상은 `user_problem_attempts.time_spent_ms`뿐이고, 강의 시청 시간(`watch_ledger`)은 제3의 축으로 아직 어떤 학습시간 지표에도 합산되지 않는다. 온·오프 합산 설계는 "문제풀이 ms + 오프라인 분 (+ 향후 시청 시간)"의 3원 구조를 처음부터 명시하는 게 안전하다.
- **시간 축과 활동(건수) 축이 이미 인터페이스로 분리**(`DayStudy` vs `DayActivity`) — 오프라인 분을 시간 축에만 합류시키는 D5 가드레일이 구조적으로 저렴하다. 반대로 "오프라인 기록일을 스트릭 활동일로 인정할지"는 시간 합산과 독립된 미결정 사항으로 v0.2에 올릴 것.
- 부수 버그 3건(기록만, 미수정): ① 스트릭 freeze 미소모(무제한 면제, `gamification.server.ts` 쓰기 0곳) ② 과제 마감 9시간 오표시(§I-2) ③ analytics 학습시간 실데이터 0(§F). 크론 5종 vercel.json 미등록(§I-6)도 운영 확인 필요.

**확인 불가 항목**: `오프라인학습_통합설계서_v0.1.md` 원문(리포 부재 — 지시서 수록 결정으로 대체) / `pass_prediction_snapshots` DDL default(repo에 create table 부재) / 미등록 크론의 외부 트리거 여부(인프라 밖) / Supabase 프로젝트 타임존 실설정(마이그레이션 무설정 → UTC 추정).

---

*본 보고서 제출로 Phase 0 감사를 종료한다. 후속 작업(설계서 v0.2, Phase 1 스키마)은 사람 검토 후 별도 지시로 진행한다.*
