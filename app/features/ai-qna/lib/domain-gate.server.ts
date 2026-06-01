// feat-9 v4 — 도메인 게이트 (보조 안전망).
//
// rag-lab/src/lib/domain-gate.ts 의 production 이식본.
// **기본 OFF**. 환경변수 `AI_QNA_DOMAIN_GATE=light|strict` 로만 켜진다.
// 운영 default 는 시스템 프롬프트 7번 규칙(domain alignment)이 충분히 차단하므로 게이트 불필요.
// 게이트는 모델 회귀 감지·저가 모델 전환 시 재검증용 옵션.
//
// rag-lab v3-summary §3.3: STRICT 가 b1 같은 정상 질문 1건을 과차단(false positive)했으므로
// production default ON 금지. light 가 안전한 시작점이지만 light 도 효과 없음(프롬프트로 이미 해결).
//
// 본 모듈은 production content_chunks 메타 갭(authority_tier·subject 명시 컬럼 없음) 을 감안해
// rag-lab 보다 단순화: subject 일치 비율은 hit 의 law_code 매핑으로 근사.

import type { SearchHit } from "./hybrid-search.server";

/** 본 인덱스가 적재된 도메인. */
type CoveredDomain = "patent" | "trademark" | "design";
type ExtendedDomain =
  | CoveredDomain
  | "civil"
  | "civil_procedure"
  | "commercial"
  | "criminal"
  | "science"
  | "unknown";

const COVERED: ReadonlySet<ExtendedDomain> = new Set<ExtendedDomain>([
  "patent",
  "trademark",
  "design",
]);

const KEYWORD_MAP: Record<Exclude<ExtendedDomain, "unknown">, ReadonlyArray<string>> = {
  patent: [
    "특허법",
    "특허출원",
    "특허권",
    "발명",
    "진보성",
    "신규성",
    "청구항",
    "명세서",
    "심판편람",
    "심사기준",
    "심판원",
    "심사관",
    "거절결정",
    "거절결정불복심판",
    "균등론",
    "확대된 선출원",
    "직무발명",
    "존속기간",
    "실용신안",
    "특허법원",
  ],
  trademark: [
    "상표법",
    "상표권",
    "상표출원",
    "식별력",
    "보통명칭",
    "기술적 표장",
    "지정상품",
    "서비스표",
    "단체표장",
    "상표심사",
    "불사용취소",
  ],
  design: [
    "디자인보호법",
    "디보법",
    "디자인출원",
    "디자인등록",
    "부분디자인",
    "화상디자인",
    "관련디자인",
    "디자인심사",
    "디자인심판",
  ],
  civil: [
    "민법",
    "채권",
    "채무",
    "매매계약",
    "보험",
    "보험계약자",
    "피보험자",
    "수익자",
    "임의대리권",
    "법정대리권",
    "상속",
    "유증",
    "하자담보",
    "채권자대위",
    "소멸시효",
    "약관",
  ],
  civil_procedure: [
    "민사소송법",
    "민사소송",
    "항소장",
    "상고장",
    "소장",
    "준비서면",
    "변론준비절차",
    "관할",
    "재심",
    "확정판결",
  ],
  commercial: [
    "상법",
    "주식회사",
    "주주총회",
    "이사회",
    "합병",
    "분할",
    "주식",
    "의결권",
    "감사",
    "대표이사",
  ],
  criminal: [
    "형법",
    "범죄",
    "정당방위",
    "미수",
    "기수",
    "교사",
    "방조",
    "형사",
    "구성요건",
    "형벌",
    "책임능력",
  ],
  science: [
    "물리",
    "화학",
    "생물",
    "원자",
    "분자",
    "자유낙하",
    "전자",
    "단백질",
    "바닥상태",
    "광자",
    "엔트로피",
    "원소",
    "세포",
    "DNA",
    "RNA",
  ],
};

export interface DomainEstimate {
  domain: ExtendedDomain;
  confidence: number;
  matchedKeywords: ReadonlyArray<string>;
}

export function inferDomain(question: string): DomainEstimate {
  const text = question.toLowerCase();
  const candidates: { domain: ExtendedDomain; matched: string[] }[] = [];
  for (const [domain, kws] of Object.entries(KEYWORD_MAP) as [
    Exclude<ExtendedDomain, "unknown">,
    ReadonlyArray<string>,
  ][]) {
    const matched = kws.filter((kw) => text.includes(kw.toLowerCase()));
    if (matched.length > 0) candidates.push({ domain, matched });
  }
  if (candidates.length === 0) {
    return { domain: "unknown", confidence: 0, matchedKeywords: [] };
  }
  candidates.sort((a, b) => b.matched.length - a.matched.length);
  const top = candidates[0];
  if (!top) return { domain: "unknown", confidence: 0, matchedKeywords: [] };
  return {
    domain: top.domain,
    confidence: Math.min(1, top.matched.length / 3),
    matchedKeywords: top.matched,
  };
}

export type GateMode = "off" | "light" | "strict";

interface GateConfig {
  fastGate: boolean;          // 추정 도메인이 covered 밖이면 검색 전 즉시 거절
  subjectThreshold: number;   // top-K 의 law_code 일치 비율 임계 (0 = off)
  vectorFloor: number;        // top-1 semantic score 하한 (0 = off)
}

const GATE_PROFILES: Record<GateMode, GateConfig> = {
  off: { fastGate: false, subjectThreshold: 0, vectorFloor: 0 },
  light: { fastGate: false, subjectThreshold: 0.5, vectorFloor: 0 },
  strict: { fastGate: true, subjectThreshold: 0.5, vectorFloor: 0.45 },
};

/** 환경변수 → GateMode. 미설정 / 잘못된 값은 "off". */
export function gateModeFromEnv(): GateMode {
  const raw = (process.env.AI_QNA_DOMAIN_GATE ?? "").toLowerCase();
  if (raw === "light" || raw === "strict") return raw;
  return "off";
}

export interface GateDecision {
  pass: boolean;
  reason: string;
  estimate: DomainEstimate;
  metrics: {
    subjectMatchRatio: number | null;
    top1SemanticScore: number | null;
    fastGateTriggered: boolean;
  };
}

/** 검색 전 — covered 밖 도메인이면 즉시 거절 (fast gate). */
export function preSearchGate(
  question: string,
  mode: GateMode,
): GateDecision | null {
  const cfg = GATE_PROFILES[mode];
  const est = inferDomain(question);
  if (!cfg.fastGate) return null;
  if (est.domain === "unknown") return null;        // 분류 실패면 통과
  if (COVERED.has(est.domain)) return null;
  return {
    pass: false,
    reason: `fast-gate: estimated domain "${est.domain}" not in covered (patent|trademark|design)`,
    estimate: est,
    metrics: {
      subjectMatchRatio: null,
      top1SemanticScore: null,
      fastGateTriggered: true,
    },
  };
}

/**
 * production content_chunks 는 subject 컬럼이 없고 law_code 만 있어,
 * subject 일치 비율은 hit.lawCode 가 추정 도메인의 law_code 와 같은지로 근사.
 *   patent -> "patent" / trademark -> "trademark" / design -> "design"
 *   civil/civil_procedure/commercial/criminal/science -> 코퍼스에 없으므로 매칭 0
 */
const DOMAIN_TO_LAW_CODE: Partial<Record<ExtendedDomain, string>> = {
  patent: "patent",
  trademark: "trademark",
  design: "design",
};

/** 검색 후 게이트. */
export function postSearchGate(
  question: string,
  hits: ReadonlyArray<SearchHit>,
  mode: GateMode,
): GateDecision {
  const cfg = GATE_PROFILES[mode];
  const est = inferDomain(question);
  const targetLawCode = DOMAIN_TO_LAW_CODE[est.domain] ?? null;

  // subject 일치 비율 — lawCode 가 null 이 아닌 hit 중에서 매칭.
  const withLaw = hits.filter((h) => h.lawCode != null);
  let subjectRatio: number | null = null;
  if (withLaw.length > 0 && targetLawCode !== null) {
    const matched = withLaw.filter((h) => h.lawCode === targetLawCode).length;
    subjectRatio = matched / withLaw.length;
  }

  // top-1 semantic score.
  const top1 = hits[0];
  const top1Sem =
    top1 && typeof top1.pathScores.semantic === "number"
      ? top1.pathScores.semantic
      : null;

  const reasons: string[] = [];

  if (
    cfg.subjectThreshold > 0
    && est.domain !== "unknown"
    && subjectRatio !== null
    && subjectRatio < cfg.subjectThreshold
  ) {
    reasons.push(
      `subject_match_ratio ${subjectRatio.toFixed(2)} < ${cfg.subjectThreshold} (est=${est.domain})`,
    );
  }
  if (
    cfg.vectorFloor > 0
    && top1Sem !== null
    && top1Sem < cfg.vectorFloor
  ) {
    reasons.push(
      `top1_semantic_score ${top1Sem.toFixed(3)} < ${cfg.vectorFloor}`,
    );
  }

  const pass = reasons.length === 0;
  return {
    pass,
    reason: pass ? "ok" : reasons.join("; "),
    estimate: est,
    metrics: {
      subjectMatchRatio: subjectRatio,
      top1SemanticScore: top1Sem,
      fastGateTriggered: false,
    },
  };
}

/** 게이트 차단 시 사용자에게 보내는 표준 거절 문장 (시스템 프롬프트 3번과 동일). */
export const GATE_REFUSAL_TEXT =
  "제공된 자료로는 확실히 답하기 어렵습니다. 강사 Q&A 를 이용해 주세요.";
