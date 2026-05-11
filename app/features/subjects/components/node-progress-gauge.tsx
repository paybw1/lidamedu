// 노드 옆 3색 게이지: 조문 열람률 / 판례 열람률 / 문제 정답률.
// 0~100% 백분율. 데이터가 전혀 없는 항목은 회색. 60%↑ 녹색, 30~60% 황색, <30% 적색.

import { cn } from "~/core/lib/utils";

// 클라 안전 타입 — server.ts 의존 회피.
export interface ArticleProgressUnit {
  articleId: string;
  viewed: boolean;
  caseTotal: number;
  caseViewed: number;
  problemTotal: number;
  problemAttempts: number;
  problemCorrect: number;
}

export type NodeProgressByArticle = Record<string, ArticleProgressUnit>;

export interface NodeProgressTotals {
  articleViewed: number;
  articleTotal: number;
  caseViewed: number;
  caseTotal: number;
  problemAttempts: number;
  problemCorrect: number;
  problemTotal: number;
}

// 노드 트리 walking 시 articleIds 합산.
export function sumNodeProgress(
  articleIds: string[],
  byArticle: NodeProgressByArticle | undefined,
): NodeProgressTotals {
  const t: NodeProgressTotals = {
    articleViewed: 0,
    articleTotal: articleIds.length,
    caseViewed: 0,
    caseTotal: 0,
    problemAttempts: 0,
    problemCorrect: 0,
    problemTotal: 0,
  };
  if (!byArticle) return t;
  for (const aid of articleIds) {
    const u = byArticle[aid];
    if (!u) continue;
    if (u.viewed) t.articleViewed += 1;
    t.caseTotal += u.caseTotal;
    t.caseViewed += u.caseViewed;
    t.problemTotal += u.problemTotal;
    t.problemAttempts += u.problemAttempts;
    t.problemCorrect += u.problemCorrect;
  }
  return t;
}

function tone(pct: number | null): string {
  if (pct === null) return "bg-muted";
  if (pct >= 60) return "bg-emerald-500";
  if (pct >= 30) return "bg-amber-500";
  return "bg-rose-500";
}

function pct(num: number, den: number): number | null {
  if (den === 0) return null;
  return Math.min(100, Math.round((num / den) * 100));
}

export function NodeProgressGauge({
  totals,
  compact = false,
}: {
  totals: NodeProgressTotals;
  compact?: boolean;
}) {
  const articlePct = pct(totals.articleViewed, totals.articleTotal);
  const casePct = pct(totals.caseViewed, totals.caseTotal);
  const problemPct = pct(totals.problemCorrect, totals.problemAttempts);

  const bars: Array<{ key: string; label: string; pct: number | null }> = [
    { key: "a", label: "조문", pct: articlePct },
    { key: "c", label: "판례", pct: casePct },
    { key: "p", label: "정답", pct: problemPct },
  ];

  if (compact) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-0.5"
        title={`조문 ${articlePct ?? "-"}% · 판례 ${casePct ?? "-"}% · 정답률 ${problemPct ?? "-"}%`}
      >
        {bars.map((b) => (
          <span
            key={b.key}
            className={cn("inline-block h-1.5 w-3 rounded-sm", tone(b.pct))}
            aria-label={`${b.label} ${b.pct ?? "-"}%`}
          />
        ))}
      </span>
    );
  }

  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      {bars.map((b) => (
        <div key={b.key} className="flex items-center gap-1 text-[10px]">
          <span className="text-muted-foreground w-7 shrink-0">{b.label}</span>
          <div className="bg-muted h-1.5 w-12 overflow-hidden rounded-sm">
            <div
              className={cn("h-full transition-all", tone(b.pct))}
              style={{ width: `${b.pct ?? 0}%` }}
            />
          </div>
          <span className="text-muted-foreground w-7 shrink-0 text-right tabular-nums">
            {b.pct ?? "-"}%
          </span>
        </div>
      ))}
    </div>
  );
}
