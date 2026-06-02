import type { MasterIssue, SelfCheck } from "./types";

export interface IssueStats {
  total: number;
  hits: number;
  missed: number;
  wrong: number;
  coreTotal: number;
  coreHits: number;
  coreMissed: number;
  sideTotal: number;
  sideHits: number;
  sideMissed: number;
}

/**
 * 자기채점 결과 + 모범 쟁점 목록 → 짚음/빠뜨림/핵심누락 등 집계.
 * core/side 분리 집계 — 결과 화면 "핵심 누락" 강조용.
 */
export function computeIssueStats(
  masterIssues: MasterIssue[],
  selfCheck: SelfCheck | null,
): IssueStats {
  const sc = selfCheck ?? { hits: [], missed: [], wrong: [] };
  const hitSet = new Set(sc.hits);
  const missedSet = new Set(sc.missed);

  let coreTotal = 0;
  let coreHits = 0;
  let coreMissed = 0;
  let sideTotal = 0;
  let sideHits = 0;
  let sideMissed = 0;

  for (const iss of masterIssues) {
    if (iss.importance === "core") {
      coreTotal++;
      if (hitSet.has(iss.issueId)) coreHits++;
      if (missedSet.has(iss.issueId)) coreMissed++;
    } else {
      sideTotal++;
      if (hitSet.has(iss.issueId)) sideHits++;
      if (missedSet.has(iss.issueId)) sideMissed++;
    }
  }

  return {
    total: masterIssues.length,
    hits: sc.hits.length,
    missed: sc.missed.length,
    wrong: sc.wrong.length,
    coreTotal,
    coreHits,
    coreMissed,
    sideTotal,
    sideHits,
    sideMissed,
  };
}
