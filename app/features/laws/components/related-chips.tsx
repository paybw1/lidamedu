import { GavelIcon, ScrollIcon, StarIcon } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { articleDisplayPrefix } from "~/features/laws/lib/identifier";
import {
  AA_RELATION_LABEL,
  AC_RELATION_LABEL,
  type RelatedArticle,
  type RelatedCase,
} from "~/features/relations/labels";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export function RelatedCasesList({
  cases,
  subject,
}: {
  cases: RelatedCase[];
  subject: LawSubjectSlug;
}) {
  if (cases.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        연결된 판례가 아직 없습니다.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {cases.map((c) => (
        <li key={c.caseId}>
          <Link
            to={`/subjects/${subject}/cases/${c.caseId}`}
            viewTransition
            className="hover:bg-accent block rounded-md border px-3 py-2 transition-colors"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-xs">
                {AC_RELATION_LABEL[c.relationType]}
              </Badge>
              <span className="font-mono text-xs">{c.caseNumber}</span>
              {c.importance >= 3 ? (
                <StarIcon className="size-3.5 text-amber-500" />
              ) : null}
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {c.decidedAt}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-medium">
              {c.summaryTitle ?? c.caseTitle}
            </p>
            {c.note ? (
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {c.note}
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RelatedArticlesChips({
  articles,
  subject,
  emptyHint,
}: {
  articles: RelatedArticle[];
  subject: LawSubjectSlug;
  emptyHint?: string;
}) {
  if (articles.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {emptyHint ?? "연결된 조문이 아직 없습니다."}
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {articles.map((a) => {
        const label = a.articleNumber
          ? articleDisplayPrefix(a.articleNumber)
          : a.displayLabel;
        const relationLabel = relationLabelFor(a.relationType);
        return (
          <li key={`${a.articleId}-${a.relationType}`}>
            {a.articleNumber ? (
              <Link
                to={`/subjects/${subject}/articles/${a.articleNumber}`}
                viewTransition
                title={a.note ?? undefined}
              >
                <Badge
                  variant="outline"
                  className="hover:bg-accent gap-1 text-xs"
                >
                  <ScrollIcon className="size-3" /> {label}
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{relationLabel}</span>
                </Badge>
              </Link>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs">
                {label}
              </Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function relationLabelFor(type: RelatedArticle["relationType"]): string {
  if (type in AA_RELATION_LABEL) {
    return AA_RELATION_LABEL[type as keyof typeof AA_RELATION_LABEL];
  }
  return AC_RELATION_LABEL[type as keyof typeof AC_RELATION_LABEL];
}

export function RelatedSection({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: typeof GavelIcon;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="text-primary size-4" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className="font-normal">
          {count}
        </Badge>
      </div>
      {children}
    </section>
  );
}
