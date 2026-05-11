// 우측 패널 "유사 문제" 탭 — 같은 primary_article 다른 문제 노출.

import { ArrowRightIcon } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  type ProblemFormat,
  type ProblemOrigin,
} from "~/features/problems/labels";
import type { RelatedProblemItem } from "~/features/problems/queries.server";

export function RelatedProblemsList({
  items,
}: {
  items: RelatedProblemItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-xs leading-relaxed">
        같은 조문이 일차 분류된 다른 문제가 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="related-problems-list">
      {items.map((it) => (
        <Link
          key={it.problemId}
          to={`/subjects/${it.lawCode}/problems/${it.problemId}`}
          viewTransition
          className="hover:border-primary block rounded-md border px-3 py-2 transition-colors"
        >
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {it.isCited ? (
              <Badge className="bg-amber-500 text-white text-[10px] hover:bg-amber-500">
                직접 인용
              </Badge>
            ) : null}
            <Badge variant="secondary" className="text-[10px]">
              {ORIGIN_LABEL[it.origin as ProblemOrigin] ?? it.origin}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {FORMAT_LABEL[it.format as ProblemFormat] ?? it.format}
            </Badge>
            {it.year ? (
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {it.year}
                {it.problemNumber ? ` · ${it.problemNumber}번` : ""}
              </span>
            ) : null}
            <ArrowRightIcon className="text-muted-foreground ml-auto size-3" />
          </div>
          <p className="line-clamp-2 text-xs leading-snug">{it.bodySnippet}</p>
        </Link>
      ))}
    </div>
  );
}
