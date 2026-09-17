# feat-12-003 — 강의 캘린더 정리·분류 축 (2026-09-17 원장 지시)

> 원장 메시지 2건(2026-09-17): ① 「강의캘린더에서 실시간 강의는 없으니 삭제」 ② 「강의 캘린더가 현장강의일정인데 영상이 들어가는 것도 이상 — 현장/영상도 삭제」 + 「강의분류를 1차/2차, 민법/특허법/상표법/디자인보호법/민사소송법/자연과학/2차 선택으로 구분하면 찾는 데 도움될 것 같은데 어떻게 생각해?」 → 찬성 의견·구체안 제시 → 「진행 OK」.

## 1. 결정

| | 결정 | 근거 |
|---|---|---|
| 형태 축 제거 | 캘린더·홈 레일·상세·사이트맵 = **현장(offline)만**. 형태 칩·색·라벨 삭제, 일정 폼의 형태 칸 제거(항상 offline) | 실시간 강의는 운영하지 않고 영상은 강의 카탈로그의 몫. 운영 6건 중 실시간 2·영상 1(시험 데이터)은 공개 달력에서 빠지고 운영자 목록에 「공개 달력 제외」 표시 |
| 구분 축 | `lecture_schedules.exam_round`(NULL/round1/round2) 신설 — 폼에서 지정, NULL = 「구분 없음」 | 상품 축 `lecture_category` 는 판매 상품 분류이고 일정 6건 중 5건이 상품 미연결. 특허법 등은 1·2차 모두라 과목으로 추정 불가 |
| 과목 축 | 일정 전용 목록 = LMS 과목 6 + `elective2`「2차 선택」. `lecture_schedules.subject_code` CHECK 7값. 도서·강의개설 SSOT(`subject-options.ts`)는 **건드리지 않음** | 「2차 선택」은 과목이 아니라 묶음 — 도서몰 진열·강의개설 폼에 빈 항목이 생기지 않게 일정 전용으로 둔다 |
| 소개 문구 | 「현장·실시간·영상」→「현장·영상」(site-intro·리담 소개 섹션) | 실시간 강의가 없다는 원장 진술과 공개 문구가 어긋나지 않게(지시 범위 밖 — 보고함) |

## 2. 구현

- **형태 축 제거** dd619e88: `schedule.tsx`(칩·FMT_BAR·라벨·CSS), `queries.server.ts listSchedules`(공개 = offline 필터), `admin-schedule-edit.tsx`(hidden offline + 비현장 행 안내), `schedule-rail`·`schedule-detail`(형태 행 삭제), `admin-schedules`(비현장 행 표시), `site-intro`·`builtin-sections` 문구.
- **DDL** `scripts/sql/20260917_schedule_exam_round.sql`(+rollback) — 운영 적용·typegen 60944112.
- **분류 SSOT** `app/features/landing/lib/schedule-taxonomy.ts`: `EXAM_ROUNDS`/`EXAM_ROUND_LABEL`/`EXAM_ROUND_NONE_LABEL`/`toExamRound`/`examRoundLabel`, `SCHEDULE_SUBJECT_OPTIONS`(7)/`scheduleSubjectLabel`/`isScheduleSubjectCode`, `ScheduleFilter` 타입 + `matchesScheduleFilter`(round 'all' 이면 전부, 아니면 exam_round 일치 — **NULL 은 전체에서만**: 미분류 강의를 1차/2차 칩 아래 보여 주면 빈 상태 문구·칩 의미가 거짓이 되는 반쪽 열림이라 채택하지 않음. 테스트 26건).
- **필터·메타 헬퍼** `app/features/landing/lib/schedule-filter.ts`(테스트 7건): `parseScheduleFilter`(URL `?round=&subject=` → 필터, 모르는 값은 all), `scheduleFilterLabel`(빈 상태 문구), `scheduleSubjectText`(코드 라벨 → 구 `subject_label` 폴백), `scheduleMetaParts`/`scheduleMetaLabel`(「1차 · 특허법」), `scheduleMonogramText`. ★「2차 선택」+2차는 구분 낱말 생략(「2차 · 2차 선택」 중복 방지), 모노그램은 「선택」.
- **캘린더 화면** `schedule.tsx`: 칩 컴포넌트 `components/schedule-filter-chips.tsx`(표시+이벤트만, 상태는 URL). 달 화살표·「가장 이른 개강」 링크는 ym 만 바꾸고 필터 보존. `shouldRevalidate` 로 같은 경로의 search 변경(칩·달 이동)에서는 loader 재실행을 막음(필터·달은 전부 클라 계산, stats.tsx 선례). 실측(2026-09-17 로컬): 칩 클릭 시 `.data` 요청의 `_routes`=root·lecture.layout 뿐 — 일정 loader(listSchedules) 제외 확인. root·레이아웃 loader 는 RR 기본 재검증(가벼움, 범위 밖).
- **관리자 폼**: 과목 자유 입력 2칸 → 과목 select 1개(7옵션, 필수) + 구분 select(구분 없음/1차/2차). 서버가 `subject_label` 을 코드에서 생성(컬럼 유지 — 카드·레일·상세가 읽음).
- **캘린더**: 오른쪽 목록 위 칩 2줄(구분: 전체·1차·2차 / 과목: 전체+7), URL SSOT(`?round=&subject=`), 달력 막대와 목록에 같은 필터, 「가장 이른 개강」도 필터 기준, 카드 메타 「◆ 1차 · 특허법 · 월·목 · 19:00–22:00」(구분 없으면 과목부터). 홈 레일 카드도 「1차 · 특허법」.
- 기존 6건: 과목 코드는 전부 7값 안, 구분은 NULL → 원장이 폼에서 지정.

## 3. 게이트·리허설

- 2026-09-17: typecheck ✅ · vitest 688/688 ✅ · build ✅ · 로컬 스크린샷 ✅(칩 2줄, 과목 칩 → 카드 「◆ 특허법 · 월·목 · 19:00–22:00」, 1차 칩 → 「3월에 개강하는 1차 특허법 현장강의가 없습니다」(운영 6건 exam_round NULL), 달 이동 링크가 필터 보존, 관리자 목록 「구분 없음」 배지 6건, 폼 과목 select 7옵션·구분 select 3옵션·subject_label 입력 없음·format hidden offline).
- 푸시(하드스톱) → 운영 확인 → 원장이 기존 일정의 구분을 폼에서 지정.
