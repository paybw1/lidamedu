// feat-9-003 — Claude 시스템 프롬프트 + RAG 컨텍스트 빌더.
//
// 7조항 가드레일 (rag-lab v3 검증 — eval/reports/v3-summary.md):
//   ① 컨텍스트 안에서만 답한다 (환각=법률 오답)
//   ② 사용한 출처를 [N] 마커로 명시
//   ③ 근거 부족이면 "강사 Q&A 안내" 로 거절
//   ④ 법조문·판례 원문 왜곡 금지
//   ⑤ 자연과학은 v1 미지원 — 명시적 거절
//   ⑥ 톤 — 간결·정확·법률 용어 정확
//   ⑦ 도메인 일치 원칙 (★ rag-lab v3 추가) — 인접 단어로 끌려와도 다른 도메인 자료 전용 금지.
//      v2 noev2(민사소송법 항소장) 가 심판편람 각주를 끌어와 거짓답을 만든 회귀를 7번 규칙으로 차단함.

import { DOC_TYPE_LABEL, type CitationSourceType } from "./citations";
import type { SearchHit } from "./hybrid-search.server";

export interface ContextItem {
  /** [N] 라벨의 N. 1-base. */
  label: number;
  /** 답변 후 citations 매핑용. */
  chunkId: string;
  sourceType: CitationSourceType;
  sourceId: string;
  /** 표시용 — "특허법 제29조" / "대법원 2018후10844 · 요지" 등. */
  headingPath: string;
  /** 모델에 전달할 본문 (길면 절단). */
  body: string;
  /** v5-④ : 1=1차 (법령·판례·문제), 2=2차 (기본서·실무서). 모델 프롬프트의 [등급] 라벨. */
  authorityTier: 1 | 2;
}

/** 한 청크 본문의 최대 길이 — 토큰 비용·컨텍스트 윈도우 보호. */
const MAX_CHUNK_BODY_CHARS = 1200;

export function buildContextItems(hits: ReadonlyArray<SearchHit>): ContextItem[] {
  return hits.map((h, i) => ({
    label: i + 1,
    chunkId: h.chunkId,
    sourceType: h.sourceType,
    sourceId: h.sourceId,
    headingPath: h.headingPath ?? `(${h.sourceType} ${h.sourceId.slice(0, 8)})`,
    body:
      h.bodyText.length > MAX_CHUNK_BODY_CHARS
        ? h.bodyText.slice(0, MAX_CHUNK_BODY_CHARS) + "…"
        : h.bodyText,
    authorityTier: h.authorityTier,
  }));
}

/**
 * 시스템 프롬프트 = 가드레일 + 컨텍스트 블록. 사용자 질문은 user message 로 별도 전달.
 *
 * 컨텍스트가 비어 있어도 가드레일은 동일하게 전달 — 모델이 ③ 거절 흐름으로 답하도록 한다.
 */
export function buildSystemPrompt(items: ReadonlyArray<ContextItem>): string {
  const guardrails = [
    "당신은 대한민국 변리사 시험 학습 보조 AI입니다. 다음 규칙을 반드시 지킵니다:",
    "",
    "1. 아래 '제공된 출처' 블록 안에서만 답합니다. 출처에 없는 사실·법령·판례·연도·인명은 추측하지 마세요.",
    "2. 답변 중 사용한 출처를 [1], [2] 식의 마커로 명시합니다. 마커 번호는 출처 라벨과 정확히 일치해야 합니다. 같은 문장에 두 출처를 쓰면 [1][2] 처럼 연달아 표기합니다.",
    "3. 출처가 비어 있거나 부족해 답을 모르겠다면 다음 문장으로만 답하세요: \"제공된 자료로는 확실히 답하기 어렵습니다. 강사 Q&A 를 이용해 주세요.\" — 추측·일반론으로 메우지 마세요.",
    "4. 법조문·판례를 인용할 때 원문 표현을 왜곡하지 않습니다. 의역할 때는 '요약하면', '취지는' 같은 표현으로 명시합니다.",
    "5. 자연과학(물리·화학·생물·지구과학) 질문은 답하지 말고 다음 문장으로만 답하세요: \"자연과학 질문은 현재 AI Q&A 가 지원하지 않습니다. 강사 Q&A 를 이용해 주세요.\"",
    "6. 한국어 변리사 수험생 대상 톤 — 간결, 정확, 법률 용어 정확. 불필요한 서두·자기 소개 없이 바로 답합니다.",
    "7. **도메인 일치 원칙(중요)**: 본 시스템 코퍼스 도메인은 특허법·상표법·디자인보호법(및 부속 기본서·실무서)입니다. 질문의 주제(과목)와 컨텍스트 자료의 주제가 다르면, 단어가 인접해 보여도 절대 답하지 마세요.",
    "   - 예: 질문이 민법·민사소송법·상법·형법·보험 등에 관한 것이면, 심판편람·심사기준·심판청구서·답변서 등 변리사 영역 자료가 검색 결과에 끌려와도 그것을 근거로 답하지 마세요.",
    "   - 인접 단어(예: \"답변서\"·\"심판\"·\"청구\"·\"항소\"·\"대리권\") 가 겹친다고 다른 도메인 자료를 끌어 쓰면 환각입니다.",
    "   - 이런 경우 3번 거절 문장으로 답합니다.",
    "8. 답변은 참고용이며, 학생은 반드시 최신 법령·원문·강사 검수를 통해 확인해야 합니다. 답변 말미에 한 줄 안전 고지를 추가하세요: \"※ 본 답변은 참고용이며, 최신 법령·원문 확인이 필요합니다.\"",
    "9. [강사 Q&A] 출처는 강사가 과거 실제 수험생 질문에 답한 기록입니다. 질문 상황이 일치하면 그 결론과 설명 방식을 우선 참고하되, 답변 시점 이후 법령이 개정되었을 수 있으므로 가능하면 법령·판례 출처와 함께 인용하고, 강사 Q&A 단독 근거일 때는 시점 유의 취지를 한 줄 덧붙이세요.",
  ].join("\n");

  if (items.length === 0) {
    return `${guardrails}\n\n[제공된 출처]\n(없음)\n[/제공된 출처]`;
  }

  // v5-④ : 컨텍스트 블록에 doc_type 한글 라벨([법령]/[판례]/[기본서]/[실무서]) 노출.
  //   모델은 답변에 같은 라벨로 출처 인용 → 시스템 프롬프트 4번 (1차/2차 충돌 시 1차 우선) 활용도↑.
  const blocks = items
    .map(
      (it) =>
        `[${it.label}] [${DOC_TYPE_LABEL[it.sourceType]}/T${it.authorityTier}] ${it.headingPath}\n${it.body}`,
    )
    .join("\n\n");

  return `${guardrails}\n\n[제공된 출처]\n${blocks}\n[/제공된 출처]`;
}
