# feat-9-010 — 커뮤니티 Q&A 대상 지정 질문

## 목적
지금까지 조문·판례·문제에 대한 Q&A는 각 **상세 화면 우측 Q&A 패널**에서만 시작할 수 있었다. 이를 **커뮤니티 Q&A(`/qna`)에서도** 시작할 수 있게 한다. 사용자가 대상을 사람이 읽는 식별자로 특정하면(조문=과목+조문번호, 판례=판례번호, 문제=과목+차수+년도+번호), 상세 패널에서 질문한 것과 **완전히 동일한** 스레드가 생성된다.

## 핵심 원칙 — 상세패널과 등가 (스키마·뮤테이션 무변경)
`qna_threads.target_type + target_id` 는 이미 존재한다. 상세패널 질문과 커뮤니티 질문은 같은 `createThread` 로 저장되고, subject 자동분류·AI 즉답(RAG 앵커)·QnaPanel 노출까지 동일하다. 따라서 이 기능은 **"식별자 → target_id 해석" + "해석된 표준 URL(`/qna/new?targetType&targetId`)로 진입"** 이면 충분하다. **createThread·createSchema·DB 스키마 변경 없음.**

## 구성 요소
1. **식별자 해석 헬퍼** `app/features/qna/lib/target-resolve.server.ts`
   - `resolveArticleTarget(client, subject, articleNumber)` — 기존 `getLawByCode`+`getArticleByNumber` 재사용. 번호 정규화("제29조의2"→"29의2").
   - `resolveCaseTarget(client, caseNumber)` — `cases.case_number` 조회.
   - `resolveProblemTarget(client, {subject, examRound, year, problemNumber, origin})` — `problems(law_id, exam_round, year, problem_number, origin)` 조회. origin 기본 `past_exam`.
   - 각기 `{targetType, targetId, label, href}` 반환(없으면 null).
2. **해석 엔드포인트** `GET /api/qna/target-resolve` — 파라미터 파싱 → 해석 → `{ok, targetType, targetId, label, href}` or `{ok:false, error:"not-found"}`. 인증 필수.
3. **대상 표시 보강** `target-display.server.ts` — v1에서 라벨만이던 판례/문제에 **정식 라벨 + 딥링크** 부여. 판례=`판례번호` → `/subjects/{subject}/cases/{case_id}`, 문제=`{과목} {년도}년 {차수} {번호}번[(변형/예상)]` → `/subjects/{law}/problems/{problem_id}`. 커뮤니티·상세 스레드 모두 대상으로 이동 가능.
4. **대상 선택기** `qna-new.tsx` — 대상 없이 진입 시(mode "none") 안내문 대신 **인터랙티브 피커**:
   - 유형 선택: 조문 / 판례 / 문제 / 공부방법.
   - 유형별 식별자 필드 입력 → "대상 확인"(fetcher.load 해석 엔드포인트).
   - 성공 시 **표준 URL `/qna/new?targetType&targetId` 로 이동** → 기존 content-mode 폼(대상 칩+제목+본문)이 그대로 인수. 공부방법은 `?targetType=study_method`.
   - 실패 시 인라인 "대상을 찾을 수 없습니다".

## 문제 식별 필드 (확정)
과목(법률과목) + 차수(1차=first/2차=second) + 년도 + 번호. 기본 출처 = 기출(past_exam). (자연과학 문제·기출변형/예상 확장은 후속.)

## 3계층 게이트
- **Judgment**: 상세패널에만 있던 진입을 커뮤니티로 확대(스펙상 유용). 기존 타깃 경로 재사용이라 중복 최소.
- **Structure**: 해석·검증은 서버(엔드포인트+생성 시 재검증), 피커 입력은 FE 인터랙션. 뮤테이션 경로 단일 유지(createThread 무변경).
- **Code**: 라벨/링크 SSOT는 target-display, 해석은 target-resolve.

## 범위 밖(후속)
자연과학 문제 대상, 기출변형/예상 origin 선택 UI, 판례 번호 자동완성, 조문 항·호 단위 타깃.
