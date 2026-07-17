# feat-2-029 — 판례 단계별 암기 사다리 (요지 중심 + OX 기출 유래 자동 빈칸)

> 목적: 조문에만 있던 **단계별 암기(scaffold-fade)**를 판례에도 구축한다. 판례는 현재 암기카드(SRS) 한 칸뿐 → 그 앞의 점진적 회상 단계가 비어 있다.
> 성격: **설계 문서(계획).** 사용자 결정 반영본. 착수 승인 후 Phase 별 구현.
> 관련: [[feat-2-023 암기카드]] · [[feat-2-024 종류별 SRS]] · [[domain_blanks 조문 빈칸]] · [[feat-2-022 OX 진단]] · [[ox-article-matching AI후보+승인]].
> 작성일: 2026-07-16.

---

## 1. 배경 · 학습과학 근거

조문 사다리 = **단서 점진 제거**: 빈칸(cued recall) → 소제목만(부분단서) → 전체(free recall) → 암기카드(간격반복). 판례는 마지막 칸만 존재.

판례의 시험 가치는 **쟁점(issue) → 판단기준·결론(법리)** 매핑이지 이유·평석 전문 암기가 아니다. 판례는 이미 `cases.summary_items = Array<{title(쟁점), body(요지)}>` 로 **쟁점별 요지** 구조로 저장돼 있어, 이 위에 사다리를 얹는 게 자연스럽다.

---

## 2. 사다리 정의 (요지 중심)

| 단계 | 이름 | 방식 | 데이터 단위 | 신규 데이터 |
|---|---|---|---|---|
| ⓪ | **쟁점 도출(issue-spotting)** | 사실관계(또는 사건명)만 보고 **쟁점 목록**을 회상 | case (사실 stem + 쟁점 titles) | 사실 stem(생성 필요) |
| ① | **요지 핵심어 빈칸** | 각 쟁점 요지에서 **결정적 법리 키워드**만 빈칸(cloze) | summary_item.body | `case_blank_sets` |
| ② | **쟁점만 보기 → 요지 복원** | 쟁점(title)만 노출, 요지(body)를 **한 쟁점씩** 회상 | summary_item | 없음(기존 필드 토글) |
| ③ | **식별자만 → 전체 복원** | 사건명/번호만 보고 **모든 쟁점+요지** 백지 회상 | case 전체 | 없음 |
| ④ | **암기카드(SRS)** | 기존 쟁점→요지 능동재생·간격반복 | case-card | 없음(기존) |

- 학생은 **조문과 동일한 4단 토글 UX**(case-viewer 상단, chapter-viewer의 빈칸/소제목 토글 미러)를 만나 하나의 멘탈모델로 학습.
- **범위 가드**: "전체 복원(③)"은 **요지·법리 중심**이지 이유(理由) verbatim이 아님 — 학생 실제 공부법과 일치. 평석은 별도 심화(사다리 밖).

### ⓪ issue-spotting — 포함하되 토글로 배제 가능 (사용자 결정)
- 1차 범위에 포함하되 **학생 개인 설정**과 **운영자 설정** 양쪽으로 on/off.
  - 학생: 판례 학습 화면의 단계 토글에서 ⓪ 표시/숨김(개인 선호).
  - 운영자: 과목/전역 기능 플래그로 ⓪ 노출 여부 제어(예: 데이터 미비 과목은 숨김).
- **데이터 의존**: ⓪는 "사실관계 짧은 요약(fact stem)"이 필요. 현재 판례에 구조화된 fact stem 없음 → **AI 생성 + 운영자 검수**(Phase 3). stem 없는 판례는 ⓪ 자동 비활성(사건명만으로 대체 가능하나 약함). ← 토글이 필요한 실질 이유이기도 함.

---

## 3. ★핵심: 자동 빈칸 후보 파이프라인 (1차 기출 OX X문제 유래)

**통찰(사용자)**: 거짓 OX 지문은 출제자가 **핵심 법리를 바꿔서 함정을 판 것** → "무엇을 바꿨나"가 곧 **시험이 노리는 키워드**. 이걸 빈칸 후보로 뽑으면 시험 적합도가 최상.

### 원천 데이터 (존재 확인됨)
- 판례 C → `problem_case_links` → C에 연결된 기출 문제.
- 각 문제의 **선지/박스 중 `ox_truth = X`(거짓)** 지문 = 함정 지문. (진위는 `auto-ox.ts` 가 발문 극성×정답여부로 파생. `mc_short` 우선, `mc_box` marker 그룹.)
- `getExamProblemsForCase`(이미 case-viewer가 사용) 재활용.

### 추출 알고리즘 (AI 후보 + 운영자 승인)
1. **수집**: C의 연결 기출에서 `ox_truth=X` 지문 S 목록.
2. **함정 판별(AI)**: S(거짓) + C의 `summary_items`(참 요지)를 주고 → ⓐ S에서 **틀린 구절**, ⓑ 그게 **원래 맞아야 할 키워드**(요지의 법리어)를 도출. 그 키워드 = 빈칸 정답.
   - 예: S="특허권자는 전용실시권자의 동의 **없이** 통상실시권을 허락할 수 있다" + 요지="…동의를 받아야…" → 함정="없이", 키워드="동의".
3. **정착(anchor)**: 키워드를 해당 `summary_item.body` 본문에서 위치 확정 → ±30자 문맥(조문 빈칸과 동일 규칙) + **근거 OX 참조**(P-{display_no}) 부착.
4. **집계·랭킹**: 여러 기출이 같은 키워드를 함정으로 쓰면 병합 + **빈도순 랭킹**(자주 함정 = 고가치). 커버리지 낮은 판례는 후보 희소.
5. **승인 큐**: 운영자가 `키워드 + 위치 + 근거 OX + 신뢰도`를 보고 **승인/수정** → `case_blank_sets` 기록. `ox-article-matching`/`admin-blanks` 승인 패턴 계승. **승인 전 학생 미노출.**
6. **폴백**: 연결 OX가 적은 판례 → AI가 요지 salience(요건·기준·효과어)만으로 후보 제시(낮은 우선순위) + 운영자 드래그 수동 지정(조문 빈칸과 동일).

### 신뢰·안전
- AI 스키마 제약 준수([[anthropic-structured-output-schema-limits]]). 실패 사유 로깅.
- **자동 노출 절대 금지** — 전량 승인 게이트(판례 법리는 오탐 시 오학습 위험).
- 대량 생성은 dry-run + 운영자 승인(Non-negotiable §8).

---

## 4. 데이터 모델

- **`case_blank_sets`** (신규, `article_blank_sets` 미러): `set_id, case_id, owner_id, version, blanks jsonb[], importance, display_name`.
  - `blanks[]` = `{ idx, answer, itemIndex(요지 항 번호), beforeContext, afterContext, sourceOx?(display_no), ... }`.
  - cloze 대상 = `summary_items[itemIndex].body` 내 위치(±30 문맥 앵커). 단일 텍스트 단위라 조문의 block-walk보다 단순.
- **판례 빈칸 렌더러**: 조문 `blanks-context`의 매칭/입력 로직을 요지 텍스트에 재사용(경량 포팅). MVP는 summary_item body 단위 cloze로 한정(전체 판례 본문 아님).
- **SRS(④)**: 기존 `case-card`/`user_*_srs` 그대로. 사다리 → SRS 핸드오프만 배선.
- **user_case_blank_srs** (선택, Phase 2 후): 빈칸 SRS를 판례에도(feat-2-011 미러). 초기엔 생략 가능.

---

## 5. 단계별 구현 계획

| Phase | 내용 | 신규 데이터 | 규모 |
|---|---|---|---|
| **1** | ②쟁점만 보기 + ③전체 복원 — **기존 summary_items만으로 UI 토글**(요지 body 숨김/식별자만). case-viewer 상단 토글(조문 미러). ④ SRS 링크 노출. | 없음 | 소 (빠른 선효과) |
| **2** | ①요지 빈칸 — `case_blank_sets` + **OX 유래 자동후보 파이프라인** + 승인 큐 + 판례 빈칸 렌더러. | case_blank_sets | 중~대 (핵심) |
| **3** | ⓪issue-spotting — fact stem AI 생성+검수 + 쟁점 회상 UI + **학생/운영자 토글**. | fact stem | 중 |
| **4** | 판례 빈칸 SRS(feat-2-011 미러) + 사다리↔SRS 진척 연동 정리. | user_case_blank_srs | 소~중 |

- Phase 1을 먼저 내어 **판례에도 단계가 생겼다**는 체감 + 데이터 무변경으로 위험 0.
- Phase 2가 사용자 통찰(OX 유래 빈칸)의 본체.

---

## 6. 재사용 & 일관성
- 재사용: `summary_items`(단위)·`getExamProblemsForCase`/`problem_case_links`(OX 원천)·`auto-ox`(진위)·조문 빈칸 매칭/입력 로직·기존 SRS·승인 큐 패턴.
- 일관성: case-viewer 토글 = chapter-viewer 토글 UX 미러(학생 학습부담↓).

---

## 7. 결정 (2026-07-16 확정)
1. **판례 빈칸 범위 = 요지 + 판시/이유 일부** (요지만 아님). cloze 대상 텍스트 단위를 `summary_items[].body` 뿐 아니라 판시사항·이유 문단까지 확장. → `case_blank_sets.blanks[].target`(summary/holding/reasoning) + 텍스트 위치로 일반화.
2. OX 후보 원천 = **`mc_short`/`mc_box`만**(사례형 `mc_case` 제외).
3. **⓪ fact stem = AI 생성 + 운영자 검수.** 데이터 미비 판례는 ⓪ 자동 숨김.
4. **Phase 2는 OX 연결 있는 판례(특허 우선)부터**, 착수 시 실측 커버리지 dry-run 선행.
5. **진행 = Phase 1+2 함께 착수**(단계별 하드스톱·검증 게이트 유지).

### Stage 분해 (Phase 1+2 통합 착수) — 전 단계 완료 (2026-07-17)
- **S1 ✅** (Phase 1, 데이터 0): case-viewer 상단 토글 — ②쟁점만 보기 + ③전체 복원. ★staff 게이트(수험생 미노출).
- **S2 ✅** (Phase 2 DB): `case_blank_sets` 스키마 + `case-queries.server.ts`(listCaseBlankSetsByCase).
- **S3 ✅** (Phase 2 렌더러): `CaseBlankFillView` — 요지/판시/평석 단일 텍스트 cloze(cumOffset 우선/문맥 앵커, IME 보호) + 뷰어 ①빈칸 토글.
- **S4 ✅** (Phase 2 후보 파이프라인): `scripts/cases/gen-case-blank-candidates.mjs` → `case_blank_candidates`(staff RLS). verbatim 검증·재실행 안전. **특허 327건 적재.**
- **S5 ✅** (Phase 2 승인 큐): `/admin/blanks/cases`(admin-ox-review 큐 패턴).

### S5 구현 상세 (2026-07-17)
- **화면** `app/features/blanks/screens/admin-case-blanks.tsx` — 상태 chip(대기/승인됨/거절됨+카운트), 판례별 그룹 헤더(사건번호·뷰어 링크), 행 = 대상(요지#n/판시이유/평석) + 빈칸 문맥(정답 **인라인 수정 가능**) + 근거 기출(P-{n} 링크·거짓지문·AI rationale) + 승인/거절/되돌리기. admin nav "암기 자료 > 판례 빈칸 승인".
- **API** `/api/blanks/case-candidate-review` — staff 게이트, op=approve|reject|revert.
- **승인 로직** `case-candidates.server.ts` — ①승인 시점 원문 verbatim **재검증**(판례 편집 대비, 수정 정답 재앵커) → ②케이스당 `display_name='기출 유래'` 세트 find-or-create → ③같은 자리(target·항·정답) blank 중복이면 근거 OX만 병합 → ④후보에 승인 시점 값 기록(되돌리기용). **되돌리기** = 같은 blank 공유하는 다른 승인 후보 없을 때만 세트에서 제거 후 pending 복귀. 전 과정 요청 클라이언트(RLS) — adminClient 불사용.
- **E2E** `e2e/admin/case-blank-approve.spec.ts` — 승인→세트 기록→되돌리기→원복 왕복(잔류 변경 없음), 팝업 공지 모달 dismiss 처리.

### 후보 일괄 검수 (2026-07-17 수행)
- 표본 40건 수동 검토(승인 22·거절 1) → AI 재분류(direct 87/indirect 170/bad 47, rationale 미제공=자기확증 차단) → direct 일괄 승인 → 사용자 지시로 indirect 도 일괄 승인.
- **최종: 승인 267 · 대기 12(장문 6·겹침 6) · 거절 48** — 152개 판례에 '기출 유래' 세트.
- 가드 3종(20자 초과·verbatim·같은 자리 겹침)은 코드로 강제. 도구 `tmp/auto-review-candidates.mjs`(gitignore).

### 뷰어 인라인 편집 (2026-07-17 구현)
- 판례 뷰어 ①빈칸에 staff 전용 **풀기↔편집 미니 토글**. 편집 모드(`case-blank-edit-view.tsx`) = 요지/판시이유/평석 전 섹션 렌더, **드래그 → "새 빈칸" 플로팅 버튼**, **빈칸 chip × 제거**.
- 오프셋 = 세그먼트 span `data-cum` + selection offset (결정적, 동일 표현 다회 등장 안전).
- API: `/api/blanks/case-admin-add-blank` · `/api/blanks/case-admin-remove-blank` (staff 게이트).
- 서버 공용 진입점 `appendBlankToAutoSet`(승인·직접 추가 공용 — verbatim 검증·find-or-create·정확 일치 병합·부분 겹침 거부) / `removeCaseBlank`(**제거 시 같은 자리 승인 후보 rejected 동기화** — 큐 정합).
- 세트 없는 판례도 편집에서 첫 빈칸 추가 시 세트 자동 생성. E2E `e2e/admin/case-blank-edit.spec.ts`.

### 조문 이식 (2026-07-17 — 상표·디자인 빈칸 작업 준비)
판례에서 검증된 두 축을 조문에 이식:
1. **뷰어 인라인 편집** — 조문 뷰어 '내용 빈칸'에 풀기↔편집 서브 토글(`article-blank-edit-overlay.tsx`). 드래그→새 빈칸(`admin-add-blank` 재사용, ★항상 '내' 세트 — fork 정책 유지), chip 클릭→제거. staff 는 세트 없어도 진입(첫 빈칸에서 자동 생성). **빈칸 화면 prev/next**(모드 유지: 조문 `?blankMode=1&blankEdit=1`, 판례 `?mem=blanks&blankEdit=1`) — 조문 넘기며 연속 작업.
2. **OX 유래 후보 파이프라인** — `article_blank_candidates` + `scripts/laws/gen-article-blank-candidates.mjs`(조문 원문 verbatim, 본문=current_revision body_json 플랫텐) + 승인 큐 `/admin/blanks/article-candidates`(법령 탭, 승인=승인자 '내 세트'에 `addBlankToSet` ±80 hint, 되돌리기=`approved_set_id/blank_idx` 정확 제거).

**선행 백필 2종(상표·디자인 데이터 준비, 2026-07-17 운영 적용)**:
- `scripts/laws/backfill-ox-truth.mjs` — auto-ox 규칙(극성×정답) 굳힘, null 만. 상표 1,130·디자인 1,060 선지. (특허 선례 86c09e00 원칙)
- `scripts/laws/backfill-ox-article-citations.mjs` — 명시 인용 결정적 매핑(civil s1 범용화, 유일 1개·타법 접두 제외). 상표 469·디자인 205 연결. 나머지 미매핑은 admin-ox-review '조문 미매칭' AI 후보 큐로(후속).

### 잔여
- 판례: 대기 12건(장문·겹침) UI 검수 + 뷰어 다듬기 → staff 게이트 해제 판단.
- 조문: 상표·디자인 후보 검수(`/admin/blanks/article-candidates`) → 뷰어 인라인로 보완.
- OX 조문 미매핑 잔여분 AI 매칭 후보(civil-ox-article-suggest 범용화) — 매핑 늘면 후보 재생성으로 커버리지 확대.
- Phase 3(⓪ fact stem) · Phase 4(판례 빈칸 SRS) 후속.

---

### 부록 — 확인된 인프라 근거
- 판례 요지 구조: `summary_items: Array<{title?,body?}>`(`cases/queries`, `case-body.tsx`).
- OX↔판례: `problem_case_links` + `getExamProblemsForCase`(case-viewer import).
- OX 진위 파생: `problems/lib/auto-ox.ts`(극성×정답 → O/X, mc_short/mc_box).
- 판례 SRS 카드: `srs/lib/case-card.ts`(쟁점 front → 요지 back), `card-gen.server.ts`.
- 조문 빈칸(재사용 원본): `blanks/` (context ±30 앵커, blanks-context 매칭/입력).
