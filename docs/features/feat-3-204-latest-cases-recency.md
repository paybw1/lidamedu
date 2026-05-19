# feat-3-204 — 최근 판례 운영자 노출 기간 설정

> `/latest/cases`(학습정보 → 최근 판례)는 전 과목 판례를 선고일 최신순으로 모두 노출했다.
> 이 문서는 운영자가 "최근"의 범위(롤링 N개월)를 설정하고, 수험생은 그 창 안의 판례만 보게 한다.

## 1. 목표 / 배경

`/latest/cases` 는 `cases` 전체를 `decided_at` 내림차순으로 보여준다 — 이름은 "최근 판례"지만 실제로는 전 판례 색인이다. 운영자가 "수험생에게 보일 최근 범위"를 직접 통제하고 싶다는 요구 → 운영자가 롤링 기간(개월)을 설정하면 그 안에 선고된 판례만 노출한다.

전체 판례 데이터·학습과목 판례 탭·판례 뷰어는 그대로 두고, **`/latest/cases` 의 노출 창만** 좁힌다.

## 2. 데이터 모델

전역 설정용 범용 key-value 테이블 `app_settings` 신설 (`docs/db-schema.md` §23).

```sql
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(profile_id)
);
```

- RLS: 읽기 전체 공개(비민감 — 학생 loader 가 cutoff 계산), 쓰기 staff(`private.is_staff`).
- 키 `latest_cases_recency_months` — 정수 개월. 시드 `0`(= 제한 없음). 배포 즉시엔 현행과 동일하고, 운영자가 1+ 로 저장해야 적용된다(반쪽 열림 방지).

## 3. 노출 로직

- `/latest/cases` loader 가 `getLatestCasesRecencyMonths` 로 N 을 읽는다.
- N > 0 이면 cutoff = 오늘 − N개월(`monthsAgoDate`), `listLatestCases` 가 `decided_at ≥ cutoff` 필터.
- N = 0 이면 필터 없음(전체).
- **수험생·운영자 공통** — 운영자도 같은 창을 본다(설정 효과를 바로 확인). 전체 판례 열람·관리는 `/admin/cases`.
- RLS 가 아닌 **쿼리 레벨** 게이트 — 노출 창은 `/latest/cases` 전용이고, 학습과목 판례 탭·뷰어(`/subjects/:subject/cases/...`)는 영향받지 않아야 하므로 (feat-10-002 mock 가시성 게이트와 동일 판단).

## 4. 화면

- `/latest/cases` 상단 **staff 전용 패널**(`RecencyPanel`) — "최근 N개월" 숫자 입력 + 저장. `0 = 제한 없음` 안내. 저장은 페이지 자체 `action`(staff 게이트, `app_settings` upsert).
- 노출 창이 활성(N>0)이면 페이지 `desc` 에 "최근 N개월" 표기 — 수험생에게도 노출(투명성).

## 5. 위반 가드 / 결정사항

- 노출 창은 **쿼리 레벨**(`listLatestCases`) — RLS 아님. 학습과목 판례 면은 미적용.
- 설정은 persisted(`app_settings` 한 행), cutoff 는 매 요청 파생(`monthsAgoDate`).
- 뮤테이션 단일 경로 — `/latest/cases` 의 `action` 하나. `setAppSetting` 은 RLS 로 staff 강제.
- 개월 수 검증 0–120 (action). 0 = 제한 없음. `service_role` 미사용, 저장은 멱등(upsert).

## 6. 범위 밖 (YAGNI)

- 절대 기준일 방식(특정 날짜 이후) — 롤링 개월로 충분, 유지보수 불필요.
- 과목별 개별 노출 기간 — 전역 단일 값.
- 학습과목 판례 탭·뷰어의 노출 제한 — `/latest/cases` 전용.
- 운영자용 "전체 보기" 토글 — 전체 열람은 `/admin/cases` 로 충분.
