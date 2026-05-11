// 체계도 노드의 3자 연결 미니그래프 — 조문(좌) / 판례(중) / 문제(우).
// 각 컬럼은 클릭 시 해당 자료로 이동. 호버 시 연결선 강조.
// 시각적 단순성을 위해 컬럼당 최대 12개. 초과는 "+N개 더".

import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import type { RelatedCase } from "~/features/relations/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

const COLUMN_MAX = 12;
const ROW_HEIGHT = 22;
const PADDING_Y = 12;

interface ArticleNodeItem {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
}

interface ProblemNodeItem {
  problemId: string;
  year: number | null;
  problemNumber: number | null;
  format: string;
}

interface Edge {
  from: number; // article row index
  to: number; // case/problem row index
}

export function NodeMiniGraph({
  articles,
  relatedCasesByArticle,
  problemsByArticle,
  subjectSlug,
}: {
  articles: ArticleNodeItem[];
  relatedCasesByArticle: Record<string, RelatedCase[]>;
  problemsByArticle: Record<string, ProblemNodeItem[]>;
  subjectSlug: LawSubjectSlug;
}) {
  // 컬럼 데이터 + 인덱스 맵 구성.
  const articleRows = articles.slice(0, COLUMN_MAX);
  const articleIndex = new Map<string, number>();
  articleRows.forEach((a, i) => articleIndex.set(a.articleId, i));

  // 판례 중복 제거 (여러 조문이 같은 판례에 연결될 수 있음).
  const caseSeen = new Map<string, RelatedCase>();
  const caseEdges: Edge[] = [];
  for (let i = 0; i < articleRows.length; i++) {
    const a = articleRows[i];
    const cases = relatedCasesByArticle[a.articleId] ?? [];
    for (const c of cases) {
      if (!caseSeen.has(c.caseId)) caseSeen.set(c.caseId, c);
    }
  }
  const caseRows = [...caseSeen.values()].slice(0, COLUMN_MAX);
  const caseIndex = new Map<string, number>();
  caseRows.forEach((c, i) => caseIndex.set(c.caseId, i));
  for (let i = 0; i < articleRows.length; i++) {
    const a = articleRows[i];
    const cases = relatedCasesByArticle[a.articleId] ?? [];
    for (const c of cases) {
      const j = caseIndex.get(c.caseId);
      if (j !== undefined) caseEdges.push({ from: i, to: j });
    }
  }
  const totalCases = caseSeen.size;

  // 문제: article 별 dedupe (같은 문제는 한 article 의 primary 라 1번만).
  const problemRows: ProblemNodeItem[] = [];
  const problemEdges: Edge[] = [];
  const problemSeen = new Set<string>();
  for (let i = 0; i < articleRows.length; i++) {
    const a = articleRows[i];
    const probs = problemsByArticle[a.articleId] ?? [];
    for (const p of probs) {
      if (problemSeen.has(p.problemId)) continue;
      if (problemRows.length >= COLUMN_MAX) break;
      problemSeen.add(p.problemId);
      problemEdges.push({ from: i, to: problemRows.length });
      problemRows.push(p);
    }
  }
  let totalProblems = 0;
  for (const a of articleRows) {
    totalProblems += (problemsByArticle[a.articleId] ?? []).length;
  }

  const rowsMax = Math.max(
    articleRows.length,
    caseRows.length,
    problemRows.length,
    1,
  );
  const height = rowsMax * ROW_HEIGHT + PADDING_Y * 2;

  // SVG 좌표: 3컬럼 — 라벨은 컬럼 카드로 따로 그리고, SVG 는 연결선만.
  // 컬럼 가로 위치는 grid 로 배치하고 SVG 는 absolute overlay.
  const rowY = (i: number) => PADDING_Y + i * ROW_HEIGHT + ROW_HEIGHT / 2;

  if (articleRows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            연관 자료 미니맵
          </p>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            조문 {articles.length} · 판례 {totalCases} · 문제 {totalProblems}
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="relative grid grid-cols-[1fr_auto_1fr_auto_1fr] gap-2">
          {/* Article column */}
          <Column
            title="조문"
            tone="sky"
            items={articleRows.map((a) => ({
              key: a.articleId,
              label: a.articleNumber
                ? `§${a.articleNumber}`
                : a.displayLabel.slice(0, 14),
              hint: a.displayLabel,
              href: a.articleNumber
                ? `/subjects/${subjectSlug}/articles/${a.articleNumber}`
                : null,
              anchor: `#article-${a.articleId}`,
            }))}
            overflow={articles.length - articleRows.length}
          />

          {/* connector A→C */}
          <div className="relative" style={{ width: 56, height }}>
            <svg
              width={56}
              height={height}
              className="absolute inset-0"
              preserveAspectRatio="none"
            >
              {caseEdges.map((e, idx) => (
                <Curve
                  key={`ac-${idx}`}
                  x1={0}
                  y1={rowY(e.from)}
                  x2={56}
                  y2={rowY(e.to)}
                  tone="muted"
                />
              ))}
            </svg>
          </div>

          {/* Case column */}
          <Column
            title="판례"
            tone="violet"
            items={caseRows.map((c) => ({
              key: c.caseId,
              label: c.caseNumber,
              hint: c.summaryTitle ?? c.caseTitle ?? c.caseNumber,
              href: `/subjects/${subjectSlug}/cases/${c.caseId}`,
              anchor: null,
            }))}
            overflow={totalCases - caseRows.length}
          />

          {/* connector A→P (skip over case column) */}
          <div className="relative" style={{ width: 56, height }}>
            <svg
              width={56}
              height={height}
              className="absolute inset-0"
              preserveAspectRatio="none"
            >
              {problemEdges.map((e, idx) => (
                <Curve
                  key={`ap-${idx}`}
                  x1={0}
                  y1={rowY(e.from)}
                  x2={56}
                  y2={rowY(e.to)}
                  tone="muted"
                />
              ))}
            </svg>
          </div>

          {/* Problem column */}
          <Column
            title="문제"
            tone="emerald"
            items={problemRows.map((p) => ({
              key: p.problemId,
              label: p.year
                ? `${p.year}${p.problemNumber ? `·${p.problemNumber}` : ""}`
                : `문제 ${p.problemNumber ?? "?"}`,
              hint: `${p.format} · ${p.problemNumber ?? "-"}`,
              href: `/subjects/${subjectSlug}/problems/${p.problemId}`,
              anchor: null,
            }))}
            overflow={totalProblems - problemRows.length}
          />
        </div>
      </CardContent>
    </Card>
  );
}

const TONE_CLASSES: Record<"sky" | "violet" | "emerald", string> = {
  sky: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200",
  violet:
    "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200",
  emerald:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
};

function Column({
  title,
  tone,
  items,
  overflow,
}: {
  title: string;
  tone: "sky" | "violet" | "emerald";
  items: {
    key: string;
    label: string;
    hint: string;
    href: string | null;
    anchor: string | null;
  }[];
  overflow: number;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-[11px] font-semibold">{title}</p>
      <ul className="space-y-1">
        {items.length === 0 ? (
          <li className="text-muted-foreground py-1 text-[11px]">—</li>
        ) : (
          items.map((it) =>
            it.href ? (
              <li key={it.key}>
                <Link
                  to={it.anchor ? `${it.href}${it.anchor}` : it.href}
                  viewTransition
                  title={it.hint}
                  className={cn(
                    "block truncate rounded-md border px-2 py-0.5 text-[11px] font-medium hover:opacity-80",
                    TONE_CLASSES[tone],
                  )}
                >
                  {it.label}
                </Link>
              </li>
            ) : (
              <li key={it.key}>
                <a
                  href={it.anchor ?? "#"}
                  title={it.hint}
                  className={cn(
                    "block truncate rounded-md border px-2 py-0.5 text-[11px] font-medium hover:opacity-80",
                    TONE_CLASSES[tone],
                  )}
                >
                  {it.label}
                </a>
              </li>
            ),
          )
        )}
        {overflow > 0 ? (
          <li>
            <Badge variant="outline" className="text-[10px]">
              +{overflow}개 더
            </Badge>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function Curve({
  x1,
  y1,
  x2,
  y2,
  tone,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone: "muted";
}) {
  const dx = (x2 - x1) / 2;
  const d = `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
  return (
    <path
      d={d}
      fill="none"
      strokeWidth={1}
      className={
        tone === "muted"
          ? "stroke-muted-foreground/30"
          : "stroke-muted-foreground/60"
      }
    />
  );
}
