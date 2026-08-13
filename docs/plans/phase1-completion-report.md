# Phase 1 완료 보고 — 지필 마감 (T1·T2·S1·S3·E3)

> 완료일: 2026-08-13 · 커밋 `a0ec8d0e`(푸시 완료 — Vercel git 연동 자동 배포)
> 선행: `phase1-stage0-recheck.md` · `phase1-stage1-design.md` + Stage 1 승인(확정 4건 전부 반영)
> 적용 전 재확인: `offline_test_results` **0행** (시한부 규약 충족 상태에서 적용)

## 1. 검증 결과 (V1~V9 — vitest 통합 13건 전부 통과)

실행 방식: 실제 서버 함수(`saveOfflineTestResults`·`setOfflineTestStatus`·`getDueProblems`·`getDueOxRefs`·`getWeakNodes`·`applyProblemSrsBulk`)를 vitest 로 직접 호출(운영 DB). 테스트 학생(@test.local)+전용 반+시험지 4건을 만들고 종료 시 전량 삭제(사후 실측: 시험지 33건 전부 draft·results/answers 0행·테스트 유저/반 0건). 하네스: `tmp/phase1-verify/phase1.itest.ts`.

| # | 검증 | 결과 | 비고 |
|---|---|---|---|
| V1-a | mcq 지필 오답 → 문제 SRS 복습 큐(`getDueProblems`) 등장 | ✅ | 신규 오답의 due 는 익일이므로 **시간 경과를 `next_due_at` 에이징으로 시뮬레이션** 후 큐 등장 확인 |
| V1-b | ox 지필 오답 → OX 복습 큐(`getDueOxRefs`) 등장 | ✅ | 동일 방식. eligibility(ox_truth·ineligible) 통과 ref 로 검증 |
| V2 | 같은 문제 공유 시험지 2건 → `reps = 2` | ✅ | 설계 §3.4 전제(1시험=1회 적용) 그대로 — 오프라인 단독 mastered 도달 가능 |
| V2-b | OX 전용으로는 problem SRS 미생성(mastered 불가) | ✅ | ox 소속 problem_id 가 `user_problem_srs` 에 없음을 실측 — 문서 §5c 한계와 일치 |
| V3 | draft 학생 비노출 → publish 후 노출 | ✅ | **학생 RLS 클라이언트**(password grant)로 tests/questions 각각 0건→노출 확인. 브라우저 레벨이 아닌 RLS 레벨 검증(차단 주체가 RLS) |
| V4 | 기존 33건 전부 draft | ✅ | `status <> 'draft'` 0건 실측 |
| V5 | 문항 삭제 후 정오 스냅샷 무결 | ✅ | 성적 저장 → 문항 제거(`removeTestQuestion`) → 남은 오답 목록이 여전히 올바른 question_id 를 가리킴(구 ord 키였다면 밀림) |
| V6-a | 동일 성적 2회 저장 → 양 축 reps 증가 0·두 스탬프 불변 | ✅ | SRS 스냅샷 deep-equal + 스탬프 타임스탬프 동일 |
| V6-b | ox 축 실패 인위 유도 → 경고 반환·부분 스탬프 → 재저장 시 미적용 축만 적용 | ✅ | vi.mock 으로 `applyOxRefSrsBulk` throw 유도 → `srsWarnings` 1건("OX…")·ox 스탬프 NULL·problem 스탬프 기록 → 재저장 시 mcq reps 불변·ox 만 신규 적용·경고 0건 |
| V7 | 철회(taken→absent): attempts 삭제·SRS 유지·스탬프 유지 | ✅ | 세션 attempts 0건 + SRS 스냅샷·스탬프 불변 |
| V8 | R11 합류 회귀 — 오프라인 attempts 가 `getWeakNodes` 반영 | ✅ | 같은 노드 mcq 5문항 전부 오답 저장 → 해당 노드가 시도 5·정답률 0% 로 약점 목록 등장 |
| V9 | SRS 배치 쿼리 수 비선형 | ✅ | counting-fetch 클라이언트로 40 outcome 일괄 적용 시 **HTTP 요청 ≤ 3**(단건 루프였다면 80) |
| 부수 | 결과 있는 시험지 revert 거부 · closed 후 학생 노출 유지(결과 카드 보존) · detail.status 노출 | ✅ | T2 전이 게이트·화이트리스트 RLS 의도 확인 |

UI 경고 표시(V6-b 의 화면 측)는 결과 입력 화면의 `srsWarnings` 렌더 블록으로 구현(코드 검토 + typecheck/build 통과 — 브라우저 검증은 미실시).

## 2. 실제 변경 파일

**DB (운영 적용 완료, `run-prod-sql.mjs`)**
- `scripts/sql/20260813_offline_test_phase1.sql` — `offline_test_answers`(B안, staff_all + 부모 결과 경유 select_own RLS) · `offline_tests.status/published_at/closed_at` · `offline_test_results.srs_problem_applied_at/srs_ox_applied_at` · 학생 SELECT RLS 화이트리스트 `status IN ('published','closed')` 교체(tests/questions). `begin;…commit;` 래핑
- `database.types.ts` 재생성

**코드**
- `app/features/study/srs.server.ts` — `applyProblemSrsBulk` 신설, `applyProblemSrsUpdate` 를 배치 위임으로 재작성(SM-2 = `computeNextSrsState` 공유, 쓰기 경로 일원화)
- `app/features/study/ox-srs.server.ts` — `applyOxRefSrsBulk` 동일 패턴(ref 집계 "하나라도 오답이면 오답")
- `app/features/offline-tests/labels.ts` — `OfflineTestStatus`·라벨, Summary/Detail 에 status
- `app/features/offline-tests/queries.server.ts` — status select/반환, `setOfflineTestStatus`(publish/close/revert — revert 는 결과 0건 게이트)
- `app/features/offline-tests/results.server.ts` — T1 전환(listOfflineTestResults→answers 조회, 프리필 question_id, 저장 question_id 키+`replaceAnswers`) + S1 통합(축별 outcome 수집·bulk 적용·축별 스탬프·`srsWarnings` 반환·온라인 프리필 행 두 축 스탬프)
- `app/features/admin/api/offline-test.tsx` — intent 3종(publish/close/revert_test), 문항 편집 5-intent draft 게이트, save_results published 게이트, zod `wrongQuestionIds`
- `app/features/admin/screens/admin-offline-test-results.tsx` — 그리드 question_id 키 전환, published 게이트 배너/버튼, `srsWarnings` 경고 표시
- `app/features/admin/screens/admin-offline-test-edit.tsx` — 상태 뱃지+배포/마감/회수 액션(`TestStatusControls`), 비-draft 시 후보 패널 숨김·문항 행 잠금
- `app/features/admin/screens/admin-assignment-edit.tsx` — 목록 상태 뱃지
- `app/features/assignments/api/offline-test-online.tsx` — published 아닌 시험지 응시 시작 차단(draft 는 RLS, closed 는 API)

**문서** — `docs/features/feat-7-042-offline-test.md`(§3 스키마 갱신 + §5c Phase 1: S1 정책·OX 집계 규칙·mastered 한계·**E3 빈칸 제외 정책**·**S3 신호 비대칭** + `UNIQUE(test_id,ord)` 오기 정정), `SPEC.md`(테이블 3종→5종 + Phase 1 요약), `docs/db-schema.md`(4테이블 절 전면 갱신).

**품질 게이트**: `npm run typecheck` ✅ · `react-router build` ✅(서버모듈 경계) · 검증 13/13 ✅.

## 3. 설계 대비 이탈 사항

승인된 확정 4건(B안·RLS 화이트리스트·축별 스탬프+경고·과제 유지)은 전부 그대로 반영. 이탈이라기보다 방법상 보완 3건:

1. **V1 시간 경과 시뮬레이션** — 신규 오답의 due 는 익일(간격 1일)이라 실시간 큐 등장은 물리적으로 다음 날에만 가능. `next_due_at` 을 과거로 에이징해 큐 read 경로를 검증했다(코드가 만든 행 그대로, 시각만 변경).
2. **V3 검증 레벨** — 브라우저 대신 학생 RLS 클라이언트로 검증(차단 주체가 RLS 이므로 실질 동일). 브라우저 E2E 는 기존 e2e 스위트 확장 시 추가 가능.
3. **온라인 프리필 행의 스탬프 시각** — 설계는 "기존 스탬프 유지"였는데 구현은 upsert 특성상 기존 값 있으면 그 값을 재기록(의미 동일, 값 불변). 신규면 now() — 설계와 일치.

**의도적 미실시** — M4(`wrong_ords` 컬럼 제거)는 설계대로 **검증 통과 + 사람 별도 확인 후** 단계로 남겨 두었다(컬럼은 default '{}' 로 잔존, 신 코드는 참조 0). 확인만 주시면 `alter table offline_test_results drop column wrong_ords` 한 줄 마이그레이션으로 마무리된다.

## 4. 운영 참고

- 이번 push 로 Vercel 이 신 코드를 자동 배포한다. 배포 전 구간(구 코드+신 스키마)은 Stage 1 혼합 상태 매트릭스대로 안전 — 살아있는 시험지 0건이라 체감 무영향.
- **이후 새 시험지는 draft 로 생성되어 [배포] 전까지 학생에게 보이지 않는다** — 스태프 공지 필요(빌더 헤더에 상태 뱃지·배포 버튼).
- B3 후속: 잔존 테스트 과제("종합반 문제 제작 테스트")는 승인대로 유지 — 운영자가 제목만 정리(운영 작업).

*Phase 1 종료. Phase 2(채점 무결성 I1)로 자동 진행하지 않는다.*
