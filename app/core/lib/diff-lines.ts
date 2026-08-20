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

// ── 토큰(어절) 단위 diff ────────────────────────────────────────────────
// 정오표의 "변경 전/후"는 한 줄짜리 문장이 대부분이라 줄 단위로는 통째로 바뀐 것처럼
// 보인다. 어디가 바뀌었는지 밑줄로 짚어 주기 위해 어절 단위로 쪼개 비교한다
// (원장 요청 2026-08-20 — "변경 전/후에 밑줄이 있으면 가독성이 올라간다").

export type DiffSegment = { text: string; changed: boolean };

/** 공백을 토큰으로 보존하며 자른다 — 이어 붙이면 원문이 그대로 복원된다. */
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** 인접한 같은 종류 세그먼트를 합친다(밑줄이 어절마다 끊기지 않게). */
function merge(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.changed === seg.changed) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out.filter((s) => s.text.length > 0);
}

/**
 * 변경 전/후 문자열을 어절 단위로 비교해 각 쪽의 강조 구간을 낸다.
 * 한쪽이 비었거나 너무 길면(LCS 가 O(n·m)) 강조 없이 통짜로 돌려준다.
 */
export function diffSegments(
  before: string,
  after: string,
): { before: DiffSegment[]; after: DiffSegment[] } {
  const plain = {
    before: before ? [{ text: before, changed: false }] : [],
    after: after ? [{ text: after, changed: false }] : [],
  };
  if (!before || !after) return plain;
  const a = tokenize(before);
  const b = tokenize(after);
  const MAX_TOKENS = 1200; // 그 이상은 강조보다 렌더 지연이 손해다.
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) return plain;

  const diff = diffLines(a, b);
  const beforeSegs: DiffSegment[] = [];
  const afterSegs: DiffSegment[] = [];
  for (const d of diff) {
    if (d.kind === "same") {
      beforeSegs.push({ text: d.text, changed: false });
      afterSegs.push({ text: d.text, changed: false });
    } else if (d.kind === "removed") {
      beforeSegs.push({ text: d.text, changed: true });
    } else {
      afterSegs.push({ text: d.text, changed: true });
    }
  }
  // 공백만 바뀐 것은 강조 대상이 아니다(눈에 안 보이는 밑줄만 남는다).
  const meaningful = (segs: DiffSegment[]) =>
    segs.map((s) => (s.changed && !s.text.trim() ? { ...s, changed: false } : s));
  return {
    before: merge(meaningful(beforeSegs)),
    after: merge(meaningful(afterSegs)),
  };
}
