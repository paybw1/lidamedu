// ③ 결론도출 + ④ 응용목차 — 채점 로직 (도메인 중립).
// ③ 결론: 학생 방향 ↔ 모범 방향. 단순 정규화 후 매칭(+ partial 동어이의어).
// ④ 강약: 학생 emphasis ↔ 권장(weight 우선, 없으면 core/side).

import type {
  ConclusionMatch,
  ConclusionsMap,
  EmphasisMap,
  EmphasisMatch,
  IssueEmphasis,
  IssueImportance,
  MasterIssueWithConclusion,
} from "./types";

/** weight 기반 권장 강약. NULL 이면 importance fallback. */
export function recommendedEmphasis(issue: {
  weight: number | null;
  importance: IssueImportance;
}): IssueEmphasis {
  const w = issue.weight;
  if (w !== null && w !== undefined) {
    if (w >= 66) return "strong";
    if (w >= 34) return "medium";
    return "weak";
  }
  // fallback — core 는 strong, side 는 weak.
  return issue.importance === "core" ? "strong" : "weak";
}

const EMPHASIS_RANK: Record<IssueEmphasis, number> = {
  weak: 0,
  medium: 1,
  strong: 2,
};

export function compareEmphasis(
  student: IssueEmphasis,
  recommended: IssueEmphasis,
): EmphasisMatch {
  const ds = EMPHASIS_RANK[student] - EMPHASIS_RANK[recommended];
  if (ds === 0) return "aligned";
  if (ds < 0) return "under"; // core 인데 약하게 = 부족
  return "over"; // side 인데 강하게 = 과함
}

// ───────────────────────────────────────────────────────────────────────────
// 결론 방향 정규화 + 매칭
// ───────────────────────────────────────────────────────────────────────────

// 동어이의 그룹 — 같은 의미 라벨들. 그룹 id 가 일치하면 match.
// 그룹 id 다르더라도 "긍정 vs 부정" 인지 partial 인지 가르기 위해 polarity 매핑.
type DirectionGroup = { id: string; polarity: "+" | "-" | "0"; labels: string[] };

const DIRECTION_GROUPS: DirectionGroup[] = [
  { id: "partial", polarity: "0", labels: ["일부인정", "일부성립", "부분인정", "부분성립", "일부유효"] },
  { id: "noviolation", polarity: "+", labels: ["미위반", "비침해"] },
  { id: "deny", polarity: "-", labels: ["불성립", "불인정", "불허용", "부적법", "부정", "무효", "기각", "각하"] },
  { id: "violation", polarity: "-", labels: ["위반", "침해", "부당", "위법"] },
  { id: "affirm", polarity: "+", labels: ["인정", "긍정", "성립", "유효", "유리", "허용", "정당", "적법"] },
];

function normalizeDirection(raw: string): string {
  return raw
    .trim()
    .replace(/[\s \.\,!\?\-_/]+/g, "")
    .toLowerCase();
}

function findGroup(raw: string): DirectionGroup | null {
  const n = normalizeDirection(raw);
  if (!n) return null;
  // 라벨 길이 내림차순 — "불성립"(3) 이 "성립"(2) 보다 우선.
  for (const g of DIRECTION_GROUPS) {
    const labels = [...g.labels].sort((a, b) => b.length - a.length);
    for (const l of labels) {
      if (n.includes(normalizeDirection(l))) return g;
    }
  }
  return null;
}

export function compareConclusion(
  studentDir: string,
  modelDir: string | null,
): ConclusionMatch {
  if (!modelDir || modelDir.trim().length === 0) return "skip";
  if (!studentDir || studentDir.trim().length === 0) return "wrong";

  const sg = findGroup(studentDir);
  const mg = findGroup(modelDir);

  // 둘 다 그룹 미지정 — 문자열 정규화 동등 비교.
  if (!sg || !mg) {
    return normalizeDirection(studentDir) === normalizeDirection(modelDir)
      ? "match"
      : "wrong";
  }
  if (sg.id === mg.id) return "match";
  if (sg.polarity === mg.polarity && sg.polarity !== "0") return "partial";
  if (sg.polarity === "0" || mg.polarity === "0") return "partial";
  return "wrong";
}

// ───────────────────────────────────────────────────────────────────────────
// 통합 채점
// ───────────────────────────────────────────────────────────────────────────

export interface ConclusionScoringResult {
  conclusionMatches: Record<string, ConclusionMatch>;
  emphasisMatches: Record<string, EmphasisMatch>;
  matchCount: number;
  partialCount: number;
  wrongCount: number;
  alignedCount: number;
  underCount: number;
  overCount: number;
  coreUnderCount: number; // 핵심인데 약함 — 가장 경고할 시그널
  sideOverCount: number; // 부차인데 강함 — 두 번째 경고
}

export function scoreConclusionAttempt(
  masterIssues: MasterIssueWithConclusion[],
  conclusions: ConclusionsMap | null,
  emphasisMap: EmphasisMap | null,
): ConclusionScoringResult {
  const conclusionMatches: Record<string, ConclusionMatch> = {};
  const emphasisMatches: Record<string, EmphasisMatch> = {};
  let matchCount = 0;
  let partialCount = 0;
  let wrongCount = 0;
  let alignedCount = 0;
  let underCount = 0;
  let overCount = 0;
  let coreUnderCount = 0;
  let sideOverCount = 0;

  for (const iss of masterIssues) {
    const studentConclusion = conclusions?.[iss.issueId]?.direction ?? "";
    const cm = compareConclusion(studentConclusion, iss.modelConclusionDirection);
    conclusionMatches[iss.issueId] = cm;
    if (cm === "match") matchCount++;
    else if (cm === "partial") partialCount++;
    else if (cm === "wrong") wrongCount++;

    const studentEmphasis = emphasisMap?.[iss.issueId];
    if (studentEmphasis) {
      const rec = recommendedEmphasis(iss);
      const em = compareEmphasis(studentEmphasis, rec);
      emphasisMatches[iss.issueId] = em;
      if (em === "aligned") alignedCount++;
      else if (em === "under") {
        underCount++;
        if (iss.importance === "core") coreUnderCount++;
      } else if (em === "over") {
        overCount++;
        if (iss.importance === "side") sideOverCount++;
      }
    }
  }

  return {
    conclusionMatches,
    emphasisMatches,
    matchCount,
    partialCount,
    wrongCount,
    alignedCount,
    underCount,
    overCount,
    coreUnderCount,
    sideOverCount,
  };
}
