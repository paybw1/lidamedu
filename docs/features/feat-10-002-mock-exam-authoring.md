# feat-10-002 — 1차 모의고사 출제·운영 (Phase B1)

> 상위 기획: "모의고사 체계 정비" **Phase B**. 조사 결과 Phase B 가 커서 **B1(이 문서)·B2** 로 분할.
> 검토용 설계문서 — 승인 후 SPEC 갱신 → 마이그레이션 → 구현. DB 변경은 운영 Supabase 에 즉시 반영되므로 검토 전 적용하지 않는다.

## 1. 목표 / 배경

1차(객관식) 모의고사 엔진(`mcq_packs` exam 모드)은 이미 동작한다 — 타이머·채점 숨김·자동 제출·결과 통계. 그러나 **(a) 출제 도구가 거칠고**(문제를 raw UUID 로 한 개씩 붙여넣음), **(b) 모의고사 흐름 ⑥(시험 후 학습과목 공개)이 없으며**, 오히려 `origin='mock'` 문제가 학습과목 일반 문제은행에 **그대로 누출**된다(가시성 게이트 부재).

Phase B1 은 이 둘을 해결해 1차 모의고사 루프를 **실제로 돌아가게** 만든다.

## 2. 현황 — 1차 모의고사 흐름 매핑

| 단계 | 현재 | Phase B1 |
|------|------|:--------:|
| ① 강사 출제 | `/admin/problems/new`(origin=mock 가능) ✅ / 팩 묶기는 UUID 수동 입력 ⚠️ | **개선** |
| ② 모의고사 리스트 | `/latest/mcq` 팩 리스트 ✅ | — |
| ③ 풀이·제출 | `mcq_pack` exam 모드 (타이머·자동 제출) ✅ | — |
| ④ 답안·해설 | 보기별·종합 해설 ✅ | — |
| ⑤ 통계분석 | 유형별·지문별 정답률 ✅ / 과락·등수 ❌ | B2 |
| ⑥ 학습과목 공개 | ❌ — 오히려 mock 문제가 게이트 없이 누출 | **신규** |

## 3. Phase B 분할

| | 범위 | 비고 |
|---|------|------|
| **B1** (이 문서, feat-10-002) | 모의고사 출제 도구(문제 picker) + mock 가시성 게이트 + 학습과목 공개(흐름 ⑥) | 1차 모의고사 루프가 실사용 가능해짐 |
| **B2** (후속, feat-10-004) | 점수·총점·과목별 과락 · 코호트 등수/백분위 · **다과목 시험 그룹**(`mcq_exams`) | DB 마이그레이션 + 세션 모델 변경 동반 — 별도 설계문서 |

> B2 를 분리하는 이유: 과목별 과락은 다과목 시험 그룹 없이 표현 불가하고, 코호트 등수는 "랭킹 모집단"(현재 pack 은 코호트 바인딩 없음)의 도메인 결정이 선행돼야 한다. `quiz_sessions` 에 점수 개념이 없어 세션→총점 모델 신설도 필요. B1 과 독립적으로 설계·구현할 수 있다.

## 4. 데이터 모델 (B1)

신규 테이블 없음. `problems` 에 공개 시각 컬럼 1개.

```sql
alter table public.problems add column released_at timestamptz;

comment on column public.problems.released_at is
  'feat-10-002 — origin=mock 문제의 학습과목 노출 시각. null = 모의고사 단계(학습과목 비노출). origin<>mock 문제에는 무의미.';
```

- `released_at` 은 **`origin='mock'` 문제에만 의미**가 있다. 모의고사용으로 출제된 문제는 시험이 끝나기 전까지 학습과목에 보이면 안 된다.
- 별도 인덱스 불요 — 학습과목 쿼리는 이미 `law_id`/`format` 인덱스를 타고, mock 미공개는 보조 필터 한 줄.

## 5. B1-Part 1 — 모의고사 출제 도구 (문제 picker)

**현재**: `/latest/mcq/:packId` 상세의 `AddProblemForm` 이 `problem_id`(UUID) 단일 텍스트 입력. 검색·다중 선택 없음.

**목표**: 모의고사 팩 상세에 **문제 검색 picker** — 키워드 + 과목/유형/출처 필터로 검색 → 결과 체크박스 다중 선택 → "선택 N개 추가".

- **백엔드**: 기존 staff 검색 API `/api/admin/search-content`(`kind=problem`)를 재사용하되, 선택 필터(`lawCode`·`format`·`origin`·`examRound`)를 받도록 가볍게 확장.
- **일괄 추가**: `mcq-pack.tsx` 액션에 `add_problems` intent(배열) 추가, `mcq-packs/queries.server.ts` 에 `addPackProblems(client, packId, problemIds[])` 배치 삽입. 기존 단건 `add_problem`/`addPackProblem` 은 유지(picker 내부에서 호출 가능) 또는 대체.
- **UI**: `MockPackProblemPicker` 컴포넌트 — 디바운스 검색 + 필터 + 결과 리스트(체크박스) + 일괄 추가. `mcq-pack-detail.tsx` 의 UUID 입력란을 이것으로 교체.
- 문제 순서 드래그 재정렬은 범위 밖(§10) — `ord` 는 추가 순서.

## 6. B1-Part 2 — mock 가시성 게이트 + 학습과목 공개 (흐름 ⑥)

**문제**: `listProblemsBySubject`(`problems/queries.server.ts`)는 `law_id` + `deleted_at is null` 만 강제 — `origin='mock'` 문제가 과목 문제 색인·맞춤 퀴즈 후보·체계도에 그대로 노출된다. RLS 도 origin 무관 전체 공개 읽기. (현재 mock 문제 0건이라 잠복 버그 — B1 에서 mock 문제를 넣는 순간 터진다.)

**해결**:
1. **가시성 게이트** — `listProblemsBySubject` 에 `opts.includeHiddenMock`(기본 false) 추가. false 면 `(origin <> 'mock' OR released_at IS NOT NULL)` 필터 적용. 과목 허브 로더(`subjects/lib/loader.server.ts`)·맞춤 퀴즈(`quiz-setup`)·체계도 호출부는 기본(false)으로 게이트 적용, 단 **staff 는 `includeHiddenMock: isStaff` 로 우회**(미공개 mock 도 열람).
   - `origin` 옵션 목록에서 `mock` 을 제거하지는 **않는다** — 공개된 mock 문제는 "모의고사" 출처로 정상 노출돼야 하므로. 게이트는 `released_at` 으로만.
2. **학습과목 공개(⑥)** — `/latest/mcq/:packId` 상세(mock 종류 팩)에 **"학습과목에 공개" 패널**: 버튼 → `intent=release_to_subjects` → 그 팩에 속한 `origin='mock'` 문제 중 `released_at IS NULL` 인 것들에 `released_at = now()` 일괄 설정. 멱등(이미 공개분 건너뜀). Phase A 의 승격 패널과 동일 철학(회차 단위·운영자 수동).
   - 공개 후 그 문제들은 학습과목 색인·맞춤 퀴즈에 `origin=mock`("모의고사") 문제로 등장.

> mock 문제를 학생이 시험으로 푸는 경로(`/api/mcq-pack/start` → `quiz_sessions`)는 게이트와 무관 — 팩 응시는 팩의 문제 목록을 직접 쓴다. 게이트는 "과목으로 문제를 탐색·연습"하는 학습과목 표면에만 적용된다.

## 7. 라우트 / 파일 (구현 가이드)

- 마이그레이션: `problems.released_at` 컬럼 → `npm run db:typegen`
- `problems/queries.server.ts` — `listProblemsBySubject` 에 `includeHiddenMock` opt + 게이트
- `subjects/lib/loader.server.ts` — `listProblemsBySubject` 호출에 `includeHiddenMock: isStaff` 전달
- `admin/api/search-content.tsx` — `kind=problem` 검색에 선택 필터 추가
- `mcq-packs/queries.server.ts` — `addPackProblems`(배치), `releasePackProblems(client, packId)`
- `admin/api/mcq-pack.tsx` — `add_problems` · `release_to_subjects` intent
- `latest/screens/mcq-pack-detail.tsx` — `MockPackProblemPicker` 교체 + "학습과목에 공개" 패널
- 문서: `SPEC.md` 5.10(feat-10-002 = B1 로 갱신, B2 행 추가), `docs/db-schema.md`

## 8. 구현 단계

1. **마이그레이션** — `problems.released_at` → `db:typegen`
2. **가시성 게이트** — `listProblemsBySubject` opt + 호출부(과목 로더)
3. **공개 동작** — `releasePackProblems` + `release_to_subjects` intent
4. **출제 picker** — `search-content` 확장 + `addPackProblems` + `add_problems` intent + `MockPackProblemPicker`
5. **화면** — `mcq-pack-detail.tsx` picker 교체 + 공개 패널
6. **typecheck + 문서**

## 9. 위반 가드 / 결정사항

- mock 문제는 `origin='mock'` 유지 — `released_at` 으로 **가시성만** 제어(출처 라벨 "모의고사" 보존).
- 학습과목 공개는 **팩(회차) 단위 운영자 수동** — Phase A 승격과 동일.
- 가시성 게이트는 RLS 가 아닌 **쿼리 레벨**(staff 우회 + 사용자 무관 단순 조건이라 RLS 보다 쿼리 opt 가 적합).
- `service_role` 미사용. 멱등 동작(공개 재실행 무해).

## 10. 범위 밖 (Phase B2 — feat-10-004)

- 점수·총점·**과목별 과락**(`mcq_packs` cut score)
- 코호트 **등수·백분위·z-score** — `mcq_pack_student_stats` RPC (GS `gs_round_student_stats` 본뜸), 랭킹 모집단 정의
- **다과목 시험 그룹** — `mcq_exams` + `mcq_exam_papers` + 통합 응시/채점/과락
- 세션 측 점수 저장 모델, 서버 측 타이머 강제, 재응시 이력 비교
- 팩 문제 순서 드래그 재정렬
