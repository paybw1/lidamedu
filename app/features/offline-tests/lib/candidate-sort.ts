// 오프라인 시험지 — 문항 후보 정렬 SSOT.
//
// 오류신고(2026-09-04): "리스트를 정렬하는 기능 추가 필요 1. 조문 순서대로
// 2. 별 중요도 순으로 3. 최근 기출 연도별 순으로"
//
// ★세 기준이 모든 유형에서 같은 값으로 나오지 않는다.
//   조문 순서 — 빈칸은 조문 자체가 문항이라 바로 되고, 객관식·정오는 문항의 대표
//               조문(`problems.primary_article_id`)으로 잡는다. 대표 조문이 없는 문항은
//               뒤로 보낸다(없는 값을 0 으로 치면 제1조인 척한다).
//   최근 기출 — 객관식·정오는 문항의 `year` 가 곧 그것이다. 빈칸은 연도가 없어,
//               그 조문이 **기출 선지에 마지막으로 나온 해**를 쓴다(problem_choices).
//   중요도    — 셋 다 있다.

/** 정렬 기준 — 화면 select 와 서버 쿼리가 같은 값을 쓴다. */
export const CANDIDATE_SORTS = [
  { value: "importance", label: "별 중요도 순" },
  { value: "article", label: "조문 순서" },
  { value: "year", label: "최근 기출 연도" },
] as const;

export type CandidateSort = (typeof CANDIDATE_SORTS)[number]["value"];

export const DEFAULT_CANDIDATE_SORT: CandidateSort = "importance";

export function parseCandidateSort(v: string | null | undefined): CandidateSort {
  return CANDIDATE_SORTS.some((s) => s.value === v)
    ? (v as CandidateSort)
    : DEFAULT_CANDIDATE_SORT;
}

/**
 * 조문 번호 비교 — `29` < `29의2` < `30`.
 * ★문자열로 비교하면 "제10조"가 "제2조"보다 앞선다. 숫자와 가지 번호를 따로 본다.
 */
export function compareArticleNumber(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  // 번호를 모르는 것은 언제나 뒤로. 0 으로 치면 제1조인 척한다.
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const [an, ab] = splitArticleNumber(a);
  const [bn, bb] = splitArticleNumber(b);
  return an - bn || ab - bb;
}

function splitArticleNumber(s: string): [number, number] {
  const m = String(s).match(/^\s*(\d+)(?:\s*의\s*(\d+))?/);
  if (!m) return [Number.MAX_SAFE_INTEGER, 0];
  return [Number(m[1]), m[2] ? Number(m[2]) : 0];
}

/** 최근 연도 우선. 연도를 모르는 것은 뒤로. */
export function compareYearDesc(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

/** 중요도 높은 순. */
export function compareImportanceDesc(a: number, b: number): number {
  return b - a;
}

/** 후보 하나가 정렬에 쓰는 값. */
export interface SortKeys {
  importance: number;
  articleNumber?: string | null;
  latestYear?: number | null;
}

/**
 * 고른 기준으로 정렬한다. 같은 값이면 **중요도 → 연도** 로 갈라 순서가 흔들리지 않게 한다
 * (같은 조문에 문항이 여러 개인 경우가 흔하다).
 */
export function sortCandidates<T extends SortKeys>(rows: T[], sort: CandidateSort): T[] {
  const byImportance = (a: T, b: T) => compareImportanceDesc(a.importance, b.importance);
  const byYear = (a: T, b: T) => compareYearDesc(a.latestYear, b.latestYear);
  const byArticle = (a: T, b: T) => compareArticleNumber(a.articleNumber, b.articleNumber);
  const chain =
    sort === "article"
      ? [byArticle, byImportance, byYear]
      : sort === "year"
        ? [byYear, byImportance, byArticle]
        : [byImportance, byYear, byArticle];
  return rows.slice().sort((a, b) => {
    for (const cmp of chain) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });
}
