# feat-4-A-130b — 조문 빈칸: 단일 편집 컨텍스트(A안)로 iOS IME 이월 근본 해결

> 상태: 🟡 P1 구현 완료 — **iPad 실기 검증 대기(하드 스톱)**
> 관련: feat-4-A-130(조문 빈칸 채우기), feat-2-029(판례 빈칸), `domain_blanks` 메모

## 1. 문제 (why)

빈칸 채우기에서 **iOS/iPadOS 한글 IME 조합 잔여가 다음 칸으로 이월**("글자가 하나씩 넘어옴")된다.
근본 원인은 플랫폼 한계다:

- 현재 구조 = 빈칸마다 **별개의 `<input>` 요소**. 칸 이동 = 요소 간 blur→focus.
- **iOS WebKit은 `blur()` 시 IME 조합 버퍼를 flush 하지 않는다.** 조합 중 다른 input이
  포커스되면 잔여 음절이 그 input에 재삽입된다.
- 지금까지의 방어(blur-flush, 타이밍 윈도우 250/500ms, residual 폐기)는 전부 **휴리스틱**이라
  느린 기기·느린 타이핑에서 샌다. C안(윈도우 확대, 2026-07-22)까지 완화만 가능.

## 2. 근본 해결의 핵심 아이디어

**칸 이동이 "요소 간 focus 이동"이 아니라 "한 요소 안에서의 캐럿 이동"이 되면 이월이 구조적으로 불가능하다.**
→ 빈칸 모드 본문 전체를 **하나의 `contenteditable` 컨테이너**로 렌더. 고정 텍스트는
`contenteditable=false`, 빈칸만 편집 가능 구역. 칸 A→B 이동은 selection(캐럿) 이동이라
blur/focus가 없고, iOS는 캐럿이 그 자리를 벗어날 때 조합을 **그 칸에 확정**한다. 다른 칸으로
넘어갈 요소가 없다.

## 3. 후보 비교 (왜 contenteditable인가)

| 안 | 방식 | 이월 해결 | 비용 |
|--|--|--|--|
| roving single input | 빈칸=정적 span, 활성 칸에만 단일 input 오버레이 이동 | ✕ 불확실 — 탭 이동 시 여전히 input blur/refocus 발생 → 잔여가 새 위치로 이월 가능 | 중 |
| **단일 contenteditable** | 본문 1개 편집영역, 빈칸=편집구역, 나머지 비편집 | ○ 구조적(요소 경계 없음) | 큼 |

→ **단일 contenteditable만이 근본 해결**. (roving input은 focus 이동이 남아 확실치 않음.)

## 4. 리스크 (정직하게)

1. **React × contenteditable**: 입력마다 innerHTML 재조정하면 캐럿·IME 파괴 →
   컨테이너는 **한 번만 렌더(uncontrolled)**, 값은 DOM에서 on-demand로 읽고, 정오 색상은
   React 재렌더가 아니라 **blank span의 class를 직접 조작**. 상태-DOM 이원화가 핵심 난점.
2. **리치 콘텐츠**: 관련조문 링크(KoreanRefLink)·소제목·강사 라벨·**표**가 편집영역 안에 들어감.
   contenteditable 안의 링크 클릭/표 편집은 까다로움 → 빈칸 모드에서 일부 리치 렌더를
   **단순화**하거나 비편집 span으로 격리 필요. **표 안 빈칸이 최대 난제.**
3. **장(chapter) 뷰어 다중 조문**: 조문별 contenteditable 분리 → 조문↔조문 이동은 다시
   요소 간 focus(드묾). 그 경계만 기존 휴리스틱 flush 유지.
4. 빈칸 span 최소폭·빈 편집영역 collapse·placeholder, 음성입력·정답모두보기·다시풀기·
   checkAnswer·attempt 저장·staff 편집모드 전부 재배선.

## 5. 반드시 보존할 기능 (feat-4-A-130 표면)

- [ ] 정오 판정·색상(empty/correct/wrong/revealed), normalizeAnswer/괄호 한자 선택
- [ ] Enter/Tab 다음 칸 이동(이제 캐럿 이동), hintNext 안내
- [ ] 정답 모두 보기(reveal) / 다시 풀기(reset)
- [ ] attempt 저장(`/api/blanks/attempt` · auto-attempt), 빈칸 SRS
- [ ] 음성 입력(칸별), 칸 폭
- [ ] staff 인라인 편집(드래그 새 빈칸/chip 제거)은 **기존 모델 유지 가능**(편집은 이월 무관)
- [ ] 판례 빈칸(CaseBlankFillView)도 동일 이슈 — 조문 성공 후 이식

## 6. 단계 (★검증 게이트 우선)

- **P1 — 프로토타입(플래그 `?blankv2=1`, 저위험)** ✅ 구현: 단일 조문 + 순수 텍스트 블록만
  단일 contenteditable로. 기존 모델은 그대로 두고 플래그로만 분기. **iPad 실기 테스트.**
  → ★하드 스톱: 여기서 이월이 실제로 사라지는지 사용자가 iPad로 확인. 안 되면 A안 중단·재검토.
  - 구현: `blank-fill-view-v2.tsx`(DOM 명령형 빌드=React 재조정이 편집 중 DOM 미터치, 정오 색상
    직접 class 조작, Enter/Tab 캐럿 이동, attempt 저장) + `blank-fill-dispatch.tsx`(`BlankFill` v2 분기).
    조문 뷰어·장 뷰어 loader `blankv2` 플래그. 화면 상단 "실험 렌더(v2)" 배지.
  - P1 한계(의도): 리치 토큰(관련조문 링크)=평문, 표=미지원. iPad 이월 여부만 검증 목적.
  - 테스트: 빈칸 있는 조문/장 URL에 `?blankv2=1` 붙이고 "내용 빈칸" 토글 → 한글로 여러 칸 입력·이동.
- **P2**: 리치 콘텐츠(관련조문/소제목/라벨) 비편집 격리 + 표 안 빈칸.
- **P3**: 장 뷰어(다중 조문) + 조문 경계. ✅ **완료·iPad 검증** — 통합(unify) 대신
  조문별 카드(우측 학습도구 유지) + **"도착 후 clear"** 이월 방어(crossPrev/crossClear,
  compositionEnd 에서 딸려온 텍스트 제거). 조문 넘나드는 Tab/Enter=document 전역 슬롯 순회.
- **P4**: 판례 빈칸 이식.
- **P5**: 컷오버(구 모델·타이밍 휴리스틱 제거) + E2E 갱신 + 문서/메모 정리.

## 7. 롤백

전 단계 플래그 뒤라 언제든 구 모델로. P5 컷오버 전까지 구 경로 삭제 금지.
