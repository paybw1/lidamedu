# feat-10-001 — GS 문항 → 학습과목 주관식 문제은행 승격 (2차 모의고사 단계 ⑥)

> 상위 기획: **"모의고사 체계 정비"** 3단계 중 **Phase A**. SPEC 신설 섹션 `5.10` 예정.
> 검토용 설계문서 — 승인 후 SPEC 등록 → 마이그레이션 → 구현. DB 변경은 운영 Supabase 에 즉시 반영되므로 검토 전 적용하지 않는다.

## 1. 목표 / 배경

2차 모의고사(= 온라인 GS)는 출제·응시·채점·통계가 모두 구현돼 있으나, **모의고사가 끝난 뒤 그 문항이 학습과목 주관식 문제로 넘어가는 경로(흐름 ⑥)가 없다.** 동시에 `problems` 테이블의 주관식 문항은 **현재 0건** — 학습과목 주관식 풀이 화면(feat-4-A-305)·`/latest/essay`(feat-3-401)이 콘텐츠 없이 비어 있다.

Phase A 는 이 둘을 한 번에 해결한다: **종료된 GS 회차의 `gs_questions` 를 `problems`(format=subjective, origin=mock) 로 승격**하는 운영자 동작을 만든다. 그 결과 2차 모의고사 루프가 닫히고, 비어 있던 주관식 문제은행이 채워진다.

## 2. 사용자 흐름

1. 운영자가 GS 회차를 운영한다 (출제 → 응시 → 채점). — *기존*
2. 회차가 **종료(`status='closed'`)** 되면, 운영자 GS 회차 편집 화면에 **"주관식 문제은행에 등록"** 패널이 활성화된다.
3. 운영자가 버튼을 누르면 그 회차의 `gs_questions` 가 `order_index` 순서대로 `problems` 로 일괄 승격된다.
4. 승격된 문항은 즉시 `/latest/essay` 및 학습과목 주관식 색인·풀이 화면에 `모의고사` 출처로 노출된다.
5. 운영자는 `/admin/problems/:id` 에서 승격된 문제의 분류(사례/논점)·키워드·해설 등을 후속 보강한다.

> 흐름 ⑥의 "순서대로" = `gs_questions.order_index` 오름차순 → `problems.problem_number`.

## 3. 데이터 모델

신규 테이블 없음. `problems` 에 GS 역참조 컬럼 1개만 추가.

```sql
alter table public.problems
  add column source_gs_question_id uuid
    references public.gs_questions(question_id) on delete set null;

-- 한 GS 문항은 최대 1개 problem 으로 승격 (멱등성 키).
-- soft delete 된 승격분은 제외 → 삭제 후 재승격 허용.
create unique index uq_problems_source_gs_question
  on public.problems (source_gs_question_id)
  where source_gs_question_id is not null and deleted_at is null;
```

- `on delete set null`: GS 문항이 나중에 삭제돼도 승격된 problem 은 독립 콘텐츠로 보존(역참조만 끊김).
- 컬럼 1개 + 부분 유니크 인덱스 — link 테이블 불필요(1:1 관계).

## 4. 필드 매핑 (`gs_questions` → `problems`)

| problems 컬럼 | 값 | 비고 |
|---|---|---|
| `format` | `'subjective'` | 고정 |
| `origin` | `'mock'` | 모의고사 문항. `ORIGIN_LABEL.mock = "모의고사"` |
| `exam_round` | `'second'` | GS 는 2차 고정 |
| `subject_type` | `'law'` | 고정 |
| `law_id` | `gs_rounds.subject`(슬러그) → `laws.law_code` 조회 | 매핑 실패 시 `null`(nullable). 2차 4과목은 모두 seed 됨 |
| `body_md` | `gs_questions.body_md` | NOT NULL — 항상 존재 |
| `model_answer_md` | `gs_questions.model_answer_md` | 비어 있으면 null |
| `total_points` | `gs_questions.max_score` | |
| `rubric_items` | `gs_questions.rubric` (채점 criterion 배열) | jsonb. 형태 상이 시 `[{label, points}]` 로 정규화 |
| `subjective_topic` | `gs_questions.title` | 비어 있으면 null |
| `year` | `extract(year from gs_rounds.start_at)` | |
| `exam_round_no` | `gs_rounds.round_number` | |
| `problem_number` | `gs_questions.order_index + 1` | "순서대로" |
| `source_gs_question_id` | `gs_questions.question_id` | 멱등성 키 |
| `created_by` | 승격 실행 운영자 | |
| `primary_article_id` | `null` | GS 문항은 조문 미연결 — nullable |
| `subjective_kind` · `subjective_keywords` · `explanation_md` | `null` | 운영자가 `/admin/problems/:id` 에서 후속 보강 |

`problems` 의 NOT NULL 필수 컬럼은 `exam_round / subject_type / origin / format / body_md` 5개 — 위 매핑이 모두 충족. 주관식은 보기(`problem_choices`) 가 없으므로 부속 테이블 INSERT 불필요.

## 5. 승격 동작

- **권한**: staff(`instructor` 이상) — 콘텐츠 생성이므로 `getStaffRole` 게이트 (problem-create 와 동일).
- **전제조건**: 회차 `status = 'closed'`. 시험 종료 전 문항이 문제은행에 새는 것을 막는다 (흐름 ⑥ = "시험 후").
- **멱등성**: 이미 승격된 문항(`problems.source_gs_question_id` 에 존재, `deleted_at is null`)은 건너뛴다. 재실행 시 신규 문항만 승격. 결과로 `{ 승격 N건, 건너뜀 M건 }` 반환.
- **되돌리기**: 승격 결과물은 일반 `problems` 행 — `/admin/problems/:id` 에서 soft delete. 부분 유니크 인덱스가 `deleted_at` 제외이므로 삭제 후 재승격 가능.
- **트랜잭션**: 회차 단위 일괄 INSERT. 부분 실패 시 전체 롤백(또는 RPC 로 원자성 보장 — 구현 시 결정).
- `supa-admin-client` 불필요 — `problems` INSERT 는 staff RLS 가 이미 허용(problem-create 와 동일 경로).

## 6. 화면

신규 학생 화면 없음 — 승격분은 기존 `/latest/essay` + 학습과목 주관식 색인·풀이에 자동 노출.

운영자: **`/admin/gs/:roundId` 회차 편집 화면(`admin-gs-edit.tsx`)에 "주관식 문제은행 등록" 패널** 추가.
- 회차 종료 전: 비활성 + "회차 종료 후 등록 가능" 안내.
- 회차 종료 후: 문항 수 / 이미 등록된 수 표시 + "N개 문항 등록" 버튼.
- 등록 후: 생성된 문제 링크(`/admin/problems/:id`) 목록. 각 GS 문항 행에 "문제은행 등록됨" 배지.

## 7. 라우트 / 파일 (구현 가이드)

- 마이그레이션: `problems.source_gs_question_id` 컬럼 + 부분 유니크 인덱스 → `npm run db:typegen`
- `app/features/gs/queries-promotion.server.ts` (신규) — `promoteRoundToProblemBank(client, roundId, userId)`
- `app/features/gs/api/promote.tsx` (신규) — POST 액션, 라우트 `/api/gs/promote`
- `app/features/gs/screens/admin-gs-edit.tsx` (수정) — 승격 패널 컴포넌트
- 문서: `SPEC.md` 5.10 신설 + feat-10-001 등록, `docs/db-schema.md`(problems 컬럼 추가 반영)

## 8. RLS / 권한

- 신규 테이블 없음 → 신규 RLS 없음. `problems` 기존 RLS(콘텐츠: 인증 읽기 / staff 쓰기) 그대로 적용.
- 승격 액션은 서버에서 staff role + 회차 closed 를 명시 검증. RLS 가 backstop.

## 9. 구현 단계

1. **마이그레이션** — `source_gs_question_id` 컬럼 + FK + 부분 유니크 인덱스 → `db:typegen`
2. **queries** — `promoteRoundToProblemBank` (closed 검증, 멱등 승격, 필드 매핑, law_code 조회)
3. **API** — `api/promote.tsx` (`/api/gs/promote`, zod, staff 게이트)
4. **화면** — `admin-gs-edit.tsx` 승격 패널
5. **typecheck + 문서** — SPEC 5.10 등록, db-schema 갱신

## 10. 위반 가드 / 결정사항

- `origin='mock'` — GS 문항은 모의고사 출처. 학습과목에서 "모의고사" 라벨로 노출.
- 승격은 **회차 종료 후 운영자 수동 동작** (자동 아님) — 타이밍 통제 + 검토 여지.
- GS ↔ problems 는 **단방향 스냅샷** — 승격 후 GS 문항을 고쳐도 problem 에 자동 반영 안 됨(역도 동일). 승격 시점 복사본. (기존 problem-create 의 problem→gs_question 미러와 동일 철학.)
- 흐름 ⑥의 "순서" = `order_index`.

## 11. 범위 밖 (Phase B/C 또는 후속)

- 1차 모의고사(`mcq_packs`) 콘텐츠·과락·등수 — **Phase B**
- "모의고사" / "기출문제" IA 통합 — **Phase C**
- GS↔problem 양방향 동기화, 승격분의 조문(`primary_article_id`) 자동 매핑
- 승격된 주관식 문제의 채점기준 구조화 편집 (기존 `/admin/problems/:id` 활용)
