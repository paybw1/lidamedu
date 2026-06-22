// 문제 선택 규칙(순수) — 출제/세션 공용 seam. DB 접근 없음(데이터 주입 → problem_id[] 반환).
//
// 설계 의도(docs/features/모의고사-문제집추가-고도화.md §4): 선택 규칙을 pack-write·
// session-write 와 분리해, 아래 양쪽이 같은 규칙을 재사용한다.
//   - B(강사): 난이도/반 공통 약점 → mcq_pack (addPackProblems)
//   - D(학생, 차후): 개인 약점 → quiz_session (createQuizSession)
// 이 파일은 어느 쪽도 import 하지 않는다(싱크 비의존). 소스(난이도 통계·약점 노드)도
// 호출부가 모아 넘긴다 → 클라이언트(picker)·서버 어디서나 호출 가능.

export interface DifficultyCandidate {
  problemId: string;
  /** 전역 정답률(%). 표본 부족이면 null. */
  accuracyPct: number | null;
  /** 전역 시도 수 — 표본 게이트(minAttempts)용. */
  attempts: number;
}

/**
 * 난이도(전역 정답률) 기준 상위 N 문제 선택.
 * - order "hard" = 정답률 낮은 순(어려움 우선, 기본), "easy" = 높은 순.
 * - 표본(attempts) 이 minAttempts 미만이거나 정답률 null 인 문제는 제외(난이도 미확정).
 * - excludeIds(이미 팩에 든 문제 등)는 제외.
 */
export function pickProblemsByDifficulty(
  candidates: readonly DifficultyCandidate[],
  opts: {
    topN: number;
    order?: "hard" | "easy";
    minAttempts?: number;
    excludeIds?: ReadonlySet<string>;
  },
): string[] {
  const { topN, order = "hard", minAttempts = 5, excludeIds } = opts;
  if (topN <= 0) return [];
  const eligible = candidates.filter(
    (c) =>
      c.accuracyPct !== null &&
      c.attempts >= minAttempts &&
      !(excludeIds?.has(c.problemId) ?? false),
  );
  eligible.sort((a, b) => {
    // accuracyPct 는 위 필터로 non-null 보장.
    const aa = a.accuracyPct as number;
    const ba = b.accuracyPct as number;
    if (aa !== ba) return order === "hard" ? aa - ba : ba - aa;
    // 동률은 표본 많은 쪽 우선(신뢰도).
    return b.attempts - a.attempts;
  });
  return eligible.slice(0, topN).map((c) => c.problemId);
}
