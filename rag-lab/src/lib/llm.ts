/**
 * Anthropic Claude 클라이언트.
 * 본 실험에서 `claude-sonnet-4-6` 단일 모델 (feat-9 §14 결정).
 * - 답변 생성: 시스템 프롬프트 가드레일 + 컨텍스트 + 질문
 * - LLM judge: 평가 단계의 정답 비교
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { docTypeLabel, type Chunk } from '../schema/chunk.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `당신은 대한민국 변리사 시험 수험생을 돕는 학습 보조 AI 입니다. 아래 규칙을 절대 위반하지 마세요.

1. 답변은 반드시 제공된 컨텍스트의 근거 안에서만 작성합니다. 컨텍스트 밖의 사실·법조문·판례를 만들어내지 마세요.
2. 컨텍스트에 근거가 충분하지 않으면 추측하지 말고 정확히 이 문장으로 답합니다:
   "자료에서 근거를 찾지 못했습니다."
3. 답변 본문에는 사용한 출처를 [번호] 형태로 인용하고, 답변 끝에 출처 목록을 다음 형식으로 명시합니다:
   출처:
   - [1] [법령] 특허법 제29조
   - [2] [판례] 대법원 2020다1234
   - [3] [기본서] 리담특허법 p.123
4. 출처 등급:
   - 1차 권위: [법령], [판례], [문제] (공식·검증)
   - 2차 권위: [기본서], [실무서] (해석·요약)
   1차와 2차가 상충하면 1차를 우선하고, "조문상으로는 X / 기본서 해석으로는 Y" 형식으로 구분해 제시합니다.
5. 자연과학(물리·화학·생물·지구과학) 질문에는 답하지 않습니다 — "본 시스템은 법률 5과목만 다룹니다." 라고만 답합니다.
6. 답변은 한국어 수험 톤으로 간결하고 정확하게.
7. **도메인 일치 원칙(중요)**: 질문의 주제(과목)와 컨텍스트 자료의 주제가 다르면, 단어가 인접해 보여도 절대 답하지 마세요.
   - 본 시스템 코퍼스 도메인 = 특허법·상표법·디자인보호법 (+ 부속 기본서·실무서). 그 외 도메인 = 코퍼스 밖.
   - 예: 질문이 민법·민사소송법·상법·형법·보험 등에 관한 것이면, 특허 영역의 "심판편람·심사기준·심판청구서·답변서" 같은 자료가 검색 결과에 끌려와도 그것을 근거로 답하지 마세요. 그건 다른 도메인 자료입니다.
   - 인접 단어(예: "답변서"·"심판"·"청구")가 겹친다고 해서 다른 도메인 자료를 끌어 쓰는 것은 환각입니다.
   - 이런 경우 정확히 다음 문장으로 답합니다: "자료에서 근거를 찾지 못했습니다."`;

export interface CitationCtx {
  number: number;
  chunk: Chunk;
}

export function formatContextBlock(citations: CitationCtx[]): string {
  return citations
    .map((c) => {
      const label = docTypeLabel(c.chunk.doc_type);
      return `[${c.number}] [${label}] ${c.chunk.source}\n${c.chunk.content}`;
    })
    .join('\n\n---\n\n');
}

export interface LlmAnswer {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateAnswer(
  question: string,
  citations: CitationCtx[],
): Promise<LlmAnswer> {
  const context = formatContextBlock(citations);
  const userMessage =
    `컨텍스트:\n${context}\n\n` +
    `질문: ${question}\n\n` +
    `위 컨텍스트만을 근거로 답해주세요. 본문 인용은 [1], [2] 형태로 표기하고 끝에 출처 목록을 정리하세요.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return {
    text,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

/** LLM judge — 모범답안과 모델 답변의 의미 일치도 채점 (0~3). */
export interface JudgeResult {
  score: 0 | 1 | 2 | 3;
  rationale: string;
  inputTokens: number;
  outputTokens: number;
}

const JUDGE_SYSTEM = `당신은 변리사 시험 채점자입니다. 학생의 답변을 모범답안과 비교하여 0~3 점으로 채점합니다.

채점 기준:
- 3 = 모범답안의 핵심 사실을 모두 정확하게 포함
- 2 = 핵심 사실의 대부분 포함, 일부 누락 또는 부정확
- 1 = 일부 관련 내용은 있으나 핵심을 빠뜨리거나 잘못된 정보 포함
- 0 = 무관·"근거를 찾지 못함"·완전한 환각

JSON 한 줄로 답하세요: {"score": N, "rationale": "한 줄"}`;

export async function judgeAnswer(
  expected: string,
  actual: string,
): Promise<JudgeResult> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: JUDGE_SYSTEM,
    messages: [{
      role: 'user',
      content: `모범답안:\n${expected}\n\n학생답변:\n${actual}\n\nJSON 한 줄로 채점:`,
    }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('').trim();
  // JSON 추출 (코드펜스나 prose 가 섞일 수 있어 강인하게)
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) {
    return { score: 0, rationale: `판정 실패: ${text.slice(0, 80)}`, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  }
  try {
    const j = JSON.parse(m[0]) as { score: number; rationale: string };
    const s = Math.max(0, Math.min(3, Math.round(j.score))) as 0 | 1 | 2 | 3;
    return { score: s, rationale: j.rationale ?? '', inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  } catch {
    return { score: 0, rationale: `JSON parse 실패: ${m[0].slice(0, 80)}`, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  }
}
