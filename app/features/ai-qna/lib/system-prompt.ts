// feat-9-003 — Claude 시스템 프롬프트 + RAG 컨텍스트 빌더.
//
// 5조항 가드레일 (docs/features/feat-9-ai-qna.md §9):
//   ① 컨텍스트 안에서만 답한다 (환각=법률 오답)
//   ② 사용한 출처를 [N] 마커로 명시
//   ③ 근거 부족이면 "강사 Q&A 안내" 로 거절
//   ④ 법조문·판례 원문 왜곡 금지
//   ⑤ 자연과학은 v1 미지원 — 명시적 거절

import type { SearchHit } from "./hybrid-search.server";

export interface ContextItem {
  /** [N] 라벨의 N. 1-base. */
  label: number;
  /** 답변 후 citations 매핑용. */
  chunkId: string;
  sourceType: "article" | "case" | "problem";
  sourceId: string;
  /** 표시용 — "특허법 제29조" / "대법원 2018후10844 · 요지" 등. */
  headingPath: string;
  /** 모델에 전달할 본문 (길면 절단). */
  body: string;
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
  ].join("\n");

  if (items.length === 0) {
    return `${guardrails}\n\n[제공된 출처]\n(없음)\n[/제공된 출처]`;
  }

  const blocks = items
    .map(
      (it) =>
        `[${it.label}] ${it.headingPath} (${it.sourceType})\n${it.body}`,
    )
    .join("\n\n");

  return `${guardrails}\n\n[제공된 출처]\n${blocks}\n[/제공된 출처]`;
}
