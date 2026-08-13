// 라인 단위 diff — 간단한 LCS 기반 (Myers 풍 단순화).
// 원출처: admin-law-revision-workspace 로컬 함수 → errata Phase 3 에서 공용 추출
// (개정 워크스페이스 신구조문대비표 + 추록·정오표 발행 모달이 공유).

export type DiffLine = { kind: "same" | "removed" | "added"; text: string };

export function diffLines(before: string[], after: string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  // LCS DP
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = before[i] === after[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ kind: "same", text: before[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "removed", text: before[i] });
      i++;
    } else {
      out.push({ kind: "added", text: after[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: "removed", text: before[i++] });
  while (j < m) out.push({ kind: "added", text: after[j++] });
  return out;
}
