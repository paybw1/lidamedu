# feat-4-A-343 — 조문 정오(OX) 문제 표시 중복 제거

## 1. 배경 / 문제
조문 뷰어 우측 "정오문제" 패널(`getOxQuestionsForArticle`)에 같은 지문이 2~3번 뜨는
경우가 있다. 원인은 **서로 다른 정당한 문제**(예: 2018 기출·2023 기출·예상문제)가
**동일한 지문**을 묻고, 그 지문(`problem_choices`/`problem_box_items`)들이 모두 같은
조문(`related_article_id`)에 연결돼 패널에 나란히 노출되기 때문이다.

## 2. 진단 (운영 mcgdoplo, `scripts/jagwa/ox-dup-audit.mjs`)
- 패널 OX 지문 총 **3,899**, 고유 (조문·지문) **3,876**.
- **표시 중복 그룹 22건 / 초과 23개** (= 합쳐서 줄일 수 있는 표시 수). 거의 전부 특허법.
- 그중 **정답 O/X 모순 1건** (특허법 제226조 "전문심리위원…비밀 누설") — 같은 지문이
  한쪽 O, 한쪽 X. 이건 중복이 아니라 **정답 오류**라 별도 데이터 교정 대상.
- **내용 동일 중복 문제(problem) row = 0건.** (선지만으로 측정하면 박스형이 선지
  조합패턴 `①ㄱㄴ ②ㄱㄷ…` 을 공유해 244개 오탐이 나오지만, 박스 본문까지 포함한
  정확한 시그니처로는 0.) → **problem 을 삭제할 일은 없다.**

## 3. 설계 — 표시 레이어 dedup (비파괴적, DB 변경 없음)
원천 문제들이 각각 유효한 다른 회차이므로 **데이터를 지우지 않고 표시에서 합친다.**

`getOxQuestionsForArticle` 가 `out` 을 만든 뒤, **조문별로 정규화 본문이 같은 ref 들을
한 그룹으로 묶어 대표 1개만 노출**한다.

- **정규화(시그니처)**: 패널 표시와 같은 규칙으로 맞춘다 — `stripLeadingMarker`(앞
  항목번호 (가)/(ㄱ)/①/1. 등 제거) 후 모든 공백 제거. (공용 lib `problems/lib/ox-dedup.ts`
  로 추출해 패널 컴포넌트와 서버가 같은 함수 사용 → 화면에서 "같아 보이는" 것이 정확히
  합쳐짐.)
- **대표 선정 우선순위**: ① 승인(approved) > 초안(draft) ② 기출 > 기출변형 > 예상 >
  모의 > AI초안 ③ 최신 연도 ④ refId(안정 정렬). → 가장 권위 있는 회차 인스턴스가 대표.
- **회차 정보 보존(배지)**: 대표에 `dupCount`(그룹 크기)를 실어, 패널이 "여러 회차
  출제(N)" 배지로 노출 가능(선택). 합쳐도 "여러 번 나온 지문"이라는 신호는 유지.
- **모순 방어 가드**: 한 그룹에 O/X 가 섞여 있으면(`distinct_truths≥2`) **합치지 않고
  전부 노출**한다 — 정답 오류를 조용히 숨기지 않고 staff 가 보게. (현재 1건=제226조
  전문심리위원: 데이터 무교정 결정이라 이 가드가 영구적으로 모순을 데이터 변경 없이
  처리. 학생은 approved 인 2023 기출 X 만, staff 는 O·X 양쪽 노출.)
- 시도이력·메모/즐겨찾기는 숨겨진 ref 의 `refId` 로 DB 에 그대로 남는다(손실 없음).

### 기각안
- **데이터에서 중복 ref 23개를 `ox_ineligible=true` 로 비활성화**: ❌ `ox_ineligible`
  의미는 "단독 OX 부적합"이지 "중복"이 아니라 의미가 흐려짐(Layer-2 의미적 일관성).
  파괴적 일괄수정이고, 재import 시 재발. 표시 dedup 은 자동 흡수·가역.
- **중복 problem 삭제**: ❌ 진단상 0건이며, 원천 문제는 각각 유효한 다른 회차.
- **모순 2023 보기 ox_ineligible 교정**: ❌ 보류(사용자 결정 "지금 현재 상태가 맞다") —
  실제 2023 기출 원형 보존. 표시 가드가 데이터 변경 없이 처리하므로 불요.

## 4. 단계 / 게이트
- **Phase 0** (코드 0): 감사 스크립트(`ox-dup-audit.mjs`) + 본 문서 + SPEC 등록. ← 완료
- **Phase 1** — 모순 1건(제226조) 조사 **완료**. 본문 동일하나 맥락 상이(특허법=참 O /
  실용신안=거짓 X). 뿌리 = 2023 실용신안법 벌칙 문제(#14)의 보기 5개가 특허법 조문
  (225·226·229·231)에 OX 오링크. **데이터 교정 안 함(사용자 결정)** — 과거 기출 원형
  보존, 각 ox_truth 는 자기 문제 맥락에선 정답이고 해설이 맥락을 명시. 표시 가드가
  데이터 변경 없이 모순을 처리. (실용신안↔특허법 OX 오링크 전수 감사·교정은 미실행
  known-issue — 필요 시 별도 태스크.)
- **Phase 2** (코드, 핵심): `ox-dedup.ts`(`normalizeOxBody`/`stripLeadingMarker` 공유 +
  `dedupeOxByBody`) + `getOxQuestionsForArticle` 적용 + `OxQuestionItem` 에
  `reviewStatus`·`dupCount` 추가. typecheck + build. staff/student 패널 확인.
- **Phase 3** (선택): 미래 유입 방지 가드는 dedup 이 증상을 무력화하므로 YAGNI — 후속 판단.

## 5. 변경 파일 (예정)
- 신규 `app/features/problems/lib/ox-dedup.ts` — `stripLeadingMarker`(이전 중복 정의 통합)
  + `normalizeOxBody` + `dedupeOxByBody`(순수·테스트 가능).
- `app/features/problems/queries.server.ts` — `getOxQuestionsForArticle` 에 dedup 적용,
  `review_status` projection 추가.
- `app/features/problems/labels.ts` — `OxQuestionItem += reviewStatus, dupCount?`.
- `app/features/problems/components/ox-questions-panel.tsx` — `stripLeadingMarker` 를
  lib 에서 import(중복 제거), (선택) "여러 회차 출제" 배지.
- 신규 `scripts/jagwa/ox-dup-audit.mjs` — 읽기 전용 감사.
