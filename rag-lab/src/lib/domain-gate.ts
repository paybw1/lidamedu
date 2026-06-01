/**
 * 도메인 게이팅 — 코퍼스 밖 질문에 거짓답변 생성 차단.
 *
 * v2 발견: a_plus_b 모드에서 noev2(민사소송법 항소장) 질문에 대해 모델이
 * 인접 자료(심판편람)를 끌어와 답을 만들어버림(expected_behavior 0%).
 * 프롬프트 의존만으론 막히지 않으므로 **코드로 강제하는 게이트**를 도입.
 *
 * 3중 방어 (운영 권장 순서):
 *   1) preSearchGate  — 질문 추정 도메인이 코퍼스 미적재면 검색 전 즉시 거절 (fast gate)
 *   2) postSearchGate — top-k 청크의 subject 일치 비율 + top-1 vector 유사도 검사
 *   3) (보조) llm.ts SYSTEM_PROMPT 의 도메인 일치 원칙 강화
 *
 * 임계값은 GateConfig 로 분리, eval CLI 에서 OFF/Light/Strict 토글.
 */
import type { Chunk, Subject } from '../schema/chunk.js';
import type { SearchHit } from './hybrid.js';

/** 추정 도메인 — Subject 외에 코퍼스 밖 도메인 도 포함. */
export type EstimatedDomain =
  | Subject
  | 'commercial'   // 상법
  | 'criminal'     // 형법
  | 'science'      // 자연과학
  | 'unknown';

/** 본 인덱스가 적재된 도메인. 이 집합에 없는 추정 도메인은 fast gate 차단 대상. */
const COVERED_DOMAINS = new Set<EstimatedDomain>(['patent', 'trademark', 'design']);

/**
 * 도메인 키워드 사전 — 단순 시작, §3 평가 결과로 튜닝.
 * 우선순위: 특정 법 명칭(특허법/민법 등) > 도메인 고유 용어 > 일반 용어.
 */
const KEYWORD_MAP: Record<Exclude<EstimatedDomain, 'unknown'>, string[]> = {
  patent: [
    '특허법', '특허출원', '특허권', '특허청', '특허청장', '지식재산처장',
    '발명', '진보성', '신규성', '청구항', '명세서',
    '심판편람', '심사기준', '심판원', '심사관', '거절결정', '거절결정불복심판',
    '균등론', '확대된 선출원', '직무발명', '존속기간', '실용신안', '특허법원',
  ],
  trademark: [
    '상표법', '상표권', '상표출원', '식별력', '보통명칭', '기술적 표장',
    '지정상품', '서비스표', '단체표장', '상표심사', '불사용취소',
  ],
  design: [
    '디자인보호법', '디보법', '디자인출원', '디자인등록', '부분디자인',
    '화상디자인', '관련디자인', '디자인심사', '디자인심판',
  ],
  civil: [
    '민법', '채권', '채무', '매매계약', '보험', '보험계약자', '피보험자', '수익자',
    '임의대리권', '법정대리권', '상속', '유증', '하자담보',
    '채권자대위', '소멸시효', '약관', '청구권 시효', '유언',
  ],
  civil_procedure: [
    '민사소송법', '민사소송', '항소장', '상고장', '소장', '준비서면',
    '변론준비절차', '관할', '재심', '확정판결',
    // '답변서' 는 변리사 심판편람에도 나오므로 매우 약한 신호 — 단독 사용 금지
  ],
  commercial: [
    '상법', '회사', '주주총회', '이사회', '주식회사', '합병', '분할',
    '주식', '의결권', '감사', '대표이사',
  ],
  criminal: [
    '형법', '범죄', '정당방위', '미수', '기수', '교사', '방조', '형사',
    '구성요건', '형벌', '책임능력',
  ],
  science: [
    '물리', '화학', '생물', '원자', '분자', '자유낙하', '전자', '단백질',
    '바닥상태', '광자', '엔트로피', '원소', '세포', 'DNA', 'RNA',
  ],
};

export interface DomainEstimate {
  domain: EstimatedDomain;
  confidence: number;            // 0~1, 매칭 키워드 수 기반
  matched_keywords: string[];
}

/** 질문 → 추정 도메인. 단순 키워드 카운트 (간섭 시 가장 많이 매칭된 도메인 채택). */
export function inferDomain(question: string): DomainEstimate {
  const text = question.toLowerCase();
  const candidates: { domain: EstimatedDomain; matched: string[] }[] = [];
  for (const [domain, kws] of Object.entries(KEYWORD_MAP) as [Exclude<EstimatedDomain, 'unknown'>, string[]][]) {
    const matched = kws.filter((kw) => text.includes(kw.toLowerCase()));
    if (matched.length > 0) candidates.push({ domain, matched });
  }
  if (candidates.length === 0) {
    return { domain: 'unknown', confidence: 0, matched_keywords: [] };
  }
  candidates.sort((a, b) => b.matched.length - a.matched.length);
  const top = candidates[0];
  if (!top) return { domain: 'unknown', confidence: 0, matched_keywords: [] };
  const confidence = Math.min(1, top.matched.length / 3);
  return { domain: top.domain, confidence, matched_keywords: top.matched };
}

// ---------- gate config ----------

export interface GateConfig {
  fastGate: boolean;            // 코퍼스 미적재 도메인 즉시 거절
  subjectThreshold: number;     // top-k 청크 subject 일치 비율 임계 (0 = OFF)
  vectorFloor: number;          // top-1 vector 유사도 하한 (0 = OFF)
}

export const GATE_OFF: GateConfig = {
  fastGate: false, subjectThreshold: 0, vectorFloor: 0,
};
export const GATE_LIGHT: GateConfig = {
  fastGate: false, subjectThreshold: 0.5, vectorFloor: 0,
};
export const GATE_STRICT: GateConfig = {
  fastGate: true, subjectThreshold: 0.5, vectorFloor: 0.45,
};

export function gateConfigByName(name: string): GateConfig {
  switch (name) {
    case 'off':    return GATE_OFF;
    case 'light':  return GATE_LIGHT;
    case 'strict': return GATE_STRICT;
    default: throw new Error(`unknown gate: ${name} (expected: off|light|strict)`);
  }
}

// ---------- gate decisions ----------

export interface GateMetrics {
  subject_match_ratio: number | null;
  top1_vector_score: number | null;
  fast_gate_triggered: boolean;
}

export interface GateDecision {
  pass: boolean;
  reason: string;
  estimate: DomainEstimate;
  metrics: GateMetrics;
}

/** 검색 전 빠른 차단. unknown 은 분류 실패라 차단하지 않음 (false negative 우려). */
export function preSearchGate(question: string, cfg: GateConfig): GateDecision | null {
  const est = inferDomain(question);
  if (!cfg.fastGate) return null;
  if (est.domain === 'unknown') return null;     // 모르겠으면 일단 통과
  if (COVERED_DOMAINS.has(est.domain)) return null;
  return {
    pass: false,
    reason: `fast-gate: estimated domain "${est.domain}" not in covered set (patent|trademark|design)`,
    estimate: est,
    metrics: { subject_match_ratio: null, top1_vector_score: null, fast_gate_triggered: true },
  };
}

/**
 * 검색 후 게이트.
 * - subjectThreshold > 0 이고 추정 도메인이 covered 이면 일치 비율 검사
 * - vectorFloor > 0 이면 top-1 vector score 검사
 * - 추정 도메인이 unknown 이면 subject 검사 skip (false positive 방지)
 */
export function postSearchGate(
  question: string,
  chunks: Chunk[],
  hits: SearchHit[],
  cfg: GateConfig,
): GateDecision {
  const est = inferDomain(question);
  const hitChunks = hits.map((h) => chunks[h.idx]).filter((c): c is Chunk => !!c);
  const withSubject = hitChunks.filter((c) => c.subject != null);
  let subjectRatio: number | null = null;
  if (withSubject.length > 0) {
    const matched = withSubject.filter((c) => c.subject === est.domain);
    subjectRatio = matched.length / withSubject.length;
  }
  const top1Vec = hits[0]?.vecScore ?? null;
  const reasons: string[] = [];

  if (cfg.subjectThreshold > 0
      && est.domain !== 'unknown'
      && subjectRatio !== null
      && subjectRatio < cfg.subjectThreshold) {
    reasons.push(`subject_match_ratio ${subjectRatio.toFixed(2)} < ${cfg.subjectThreshold} (est=${est.domain})`);
  }
  if (cfg.vectorFloor > 0 && top1Vec !== null && top1Vec < cfg.vectorFloor) {
    reasons.push(`top1_vector_score ${top1Vec.toFixed(3)} < ${cfg.vectorFloor}`);
  }
  const pass = reasons.length === 0;
  return {
    pass,
    reason: pass ? 'ok' : reasons.join('; '),
    estimate: est,
    metrics: {
      subject_match_ratio: subjectRatio,
      top1_vector_score: top1Vec,
      fast_gate_triggered: false,
    },
  };
}

/** 게이트 차단 시 사용할 표준 거절 응답 (코드로 직접 생성, LLM 호출 0). */
export const GATE_REFUSAL_TEXT = '자료에서 근거를 찾지 못했습니다.';

export function formatGateRefusal(decision: GateDecision): string {
  return `${GATE_REFUSAL_TEXT}\n\n(도메인 게이트: ${decision.reason})`;
}
