// 판례훈련 — 사실관계 요약(facts_summary_md) 에 쟁점·판단·결론이 누출됐는지 검사.
// 학생이 답을 미리 보면 훈련 가치 0 → 강사 승인 전에 자동 lint 로 신호.
// 강사가 수동으로 통과 시킬 수 있음(WARN 만, BLOCK 아님). 단정적으로 막지 않는다.

export interface LeakageHit {
  pattern: string;
  excerpt: string;
  position: number;
}

export interface LeakageResult {
  hits: LeakageHit[];
  hasLeakage: boolean;
}

/**
 * 누출 신호 키워드 — 사실관계엔 거의 등장 X, 판단·결론 텍스트엔 빈출.
 * "쟁점" 자체는 fact 에선 거의 안 나옴 — 등장 시 즉시 의심.
 */
const LEAKAGE_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /쟁점/g, label: "쟁점" },
  { re: /판시사항/g, label: "판시사항" },
  { re: /(법원|대법원)\s*은[\s\S]{0,25}(판단|판결|결론|보았다|봤다|인정|배척)/g, label: "법원의 판단/판결" },
  { re: /결론적으로/g, label: "결론" },
  { re: /따라서[\s\S]{0,20}(인정|불인정|기각|파기|무효|유효|위반|아니|없)/g, label: "따라서~결론" },
  { re: /이므로[\s\S]{0,20}(인정|불인정|기각|파기|무효|유효|위반)/g, label: "이므로~결론" },
  { re: /판결\s*요지/g, label: "판결요지" },
  { re: /(원심|상고심|항소심)\s*판단/g, label: "원심/상고심 판단" },
  { re: /(인정된다|인정될\s*수\s*있다|부정된다|무효이다|유효하다|위반이다|위반된다)/g, label: "단정적 법적 판단" },
];

const EXCERPT_RADIUS = 20;

export function lintFactsForLeakage(factsMd: string): LeakageResult {
  const hits: LeakageHit[] = [];
  for (const { re, label } of LEAKAGE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(factsMd)) !== null) {
      const start = Math.max(0, m.index - EXCERPT_RADIUS);
      const end = Math.min(factsMd.length, m.index + m[0].length + EXCERPT_RADIUS);
      hits.push({
        pattern: label,
        excerpt: factsMd.slice(start, end).replace(/\s+/g, " "),
        position: m.index,
      });
      if (hits.length >= 20) break; // 안전장치
    }
    if (hits.length >= 20) break;
  }
  return { hits, hasLeakage: hits.length > 0 };
}
