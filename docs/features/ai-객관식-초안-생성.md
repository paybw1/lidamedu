# AI 객관식 문제 초안 생성 (판례 : 조문/이론 비율 제어)

운영자/강사가 RAG 근거 기반으로 1차 객관식 문제 **초안(draft)** 을 일괄 생성하는 기능.
생성물은 `review_status='draft'` 로 학생 비노출 — 검증 큐에서 강사 승인 후에만 노출된다.

- 화면: `/admin/problems/ai-gen` — `app/features/admin/screens/admin-ai-problem-gen.tsx`
- API: `/api/admin/ai-problem-gen` — `app/features/admin/api/ai-problem-gen.tsx` (staff 게이트, blocking)
- 코어: `app/features/admin/lib/ai-problem-gen.server.ts`

## 입력
- **과목**(lawCode) + (선택) 주요 조문 ID 콤마 입력
- **형식 분배**: 단답형(mc_short) 수 + 박스형(mc_box) 수 (합계 ≤ 30)
- **지식 유형 비율**(판례 : 조문/이론) — 슬라이더 0~100%, **기본 50:50**
- 생성 모델 (sonnet 4.6 기본 / opus / haiku)

## 지식 유형 2분할 (이 기능의 핵심)
실제 1차 시험은 판례 ↔ 조문/이론이 약 50:50 출제 → 기본값 50%, 운영자가 조절.

- **판례(precedent)** = **case-seeded**. `cases`(subject_laws ∋ lawCode)에서 무작위 표본 →
  질의에 `case_number` 포함 → `hybridSearch` 의 structured 경로가 그 판례 청크를 **직격** +
  graph 로 관련 조문 확장. 판시사항 1청크로도 충분하므로 근거 임계 = 1.
  - 저장: `primary_node_id` = 판례의 노드(단원 앵커), `primary_article_id` = 판례의 조문(있으면),
    `problem_case_links`(relation_type=`cited`) 로 출처 판례 연결, `gen_range.knowledgeType='precedent'`
    + `primaryCaseId`/`primaryCaseNumber`.
- **조문/이론(statute_theory)** = **article-seeded** (기존 흐름). 조문 라벨로 RAG → 출제.
  근거 임계 = 기본 2. `gen_range.knowledgeType='statute_theory'` + `primaryArticleId`.

> OX 진단(feat-2-022)의 3분할 `statute/precedent/theory` 와 달리 여기서는 **조문+이론을 한 묶음**
> 으로 보는 2분할(사용자 요청). `KnowledgeType = "precedent" | "statute_theory"`.

## 슬롯 배분
총 N = mc_short + mc_box. `precedentCount = round(N × ratio/100)`, 나머지 = statute_theory.
`planSlots()` 가 (형식 × 지식유형)을 N개 슬롯에 배정 — 지식유형은 Bresenham 균등 분산(정확히
precedentCount 개) 후 **셔플**해서 형식↔유형 상관 제거(박스형이 전부 판례로 쏠리는 것 방지).
유형별 대상 풀(article/case)에서 순서대로 소진.

## 제약 — 판례 색인은 현재 특허법만
`content_chunks`(source_type='case') 와 `cases` 는 **특허법만** 적재돼 있다(372건/792청크).
타 과목에서 판례 비율 > 0 이면 해당 판례 슬롯은 **생성 불가 → skip**(`totalSkippedNoCases`).
화면이 비특허 과목+판례>0 시 경고를 띄운다. 타 과목 판례 출제를 원하면 먼저 판례를 적재해야 한다.

## 검증·저장
- §4 1차 정답 구조 검증(mc_short 정답 1개 등 / mc_box 참보기 조합 일치) — 실패도 저장하되
  `gen_range.structureWarning` 기록(강사 판단). 중복 의심은 body_md 앞부분 substring 매칭.
- 비용/토큰은 `recordUsage` + global cap(`checkGlobalCap`) 슬롯마다 재확인.
- 리포트: 성공/판례·조문이론 생성수/근거부족 skip/판례 미색인 skip/구조경고/중복/비용/토큰.

## RLS
모든 쓰기는 요청 컨텍스트 클라이언트(RLS). `problems`/`problem_choices`/`problem_box_items` +
`problem_case_links`(`pcl_write_staff` = ALL for `private.is_staff`) 모두 staff 쓰기 허용.
cap 집계용 `recordUsage`/`checkGlobalCap` 만 adminClient.
