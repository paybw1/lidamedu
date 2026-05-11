// 운영자 — 미배정 자료 패널 (D-10).
// /admin/relations/gaps?law=patent → 미매핑 조문/판례/문제 일람 + 즉시 매핑 진입점.

import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  GavelIcon,
  ListChecksIcon,
  NetworkIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { getRelationGaps } from "~/features/admin/queries/relation-gaps.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  lawSubjectSlugSchema,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-relation-gaps";

export const meta: Route.MetaFunction = () => [
  { title: "미배정 자료 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const lawParam = url.searchParams.get("law") ?? "patent";
  const parsed = lawSubjectSlugSchema.safeParse(lawParam);
  const lawCode: LawSubjectSlug = parsed.success ? parsed.data : "patent";
  const gaps = await getRelationGaps(client, lawCode, 100);
  return { gaps, lawCode };
}

export default function AdminRelationGaps({
  loaderData,
}: Route.ComponentProps) {
  const { gaps, lawCode } = loaderData;
  const subject = LAW_SUBJECTS[lawCode];
  const totals =
    gaps.unmappedArticles.length +
    gaps.unmappedCases.length +
    gaps.unmappedProblems.length;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 운영자
      </Link>
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <AlertTriangleIcon className="size-3" /> 콘텐츠 매핑 점검
        </p>
        <h1 className="text-2xl font-bold tracking-tight">미배정 자료</h1>
        <p className="text-muted-foreground text-sm">
          {subject.name} · 총 {totals.toLocaleString("ko-KR")}건
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1.5">
        {LAW_SUBJECT_SLUGS.map((slug) => (
          <Link
            key={slug}
            to={`/admin/relations/gaps?law=${slug}`}
            viewTransition
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              slug === lawCode
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent border-input text-muted-foreground"
            }`}
          >
            {LAW_SUBJECTS[slug].name}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="체계도 미매핑 조문"
          subtitle={`${gaps.unmappedArticles.length}건`}
          icon={NetworkIcon}
          empty="모든 조문이 체계도에 매핑되어 있습니다."
        >
          {gaps.unmappedArticles.map((a) => (
            <Link
              key={a.articleId}
              to={
                a.articleNumber
                  ? `/admin/relations/article/${lawCode}/${a.articleNumber}`
                  : `/admin/laws/${lawCode}/revisions`
              }
              viewTransition
              className="hover:bg-accent block rounded-md border px-2 py-1.5 text-xs"
            >
              <span className="font-medium">{a.displayLabel}</span>
            </Link>
          ))}
        </Section>

        <Section
          title="조문 매핑 없는 판례"
          subtitle={`${gaps.unmappedCases.length}건`}
          icon={GavelIcon}
          empty="모든 판례가 최소 1개 조문과 매핑되어 있습니다."
        >
          {gaps.unmappedCases.map((c) => (
            <Link
              key={c.caseId}
              to={`/subjects/${lawCode}/cases/${c.caseId}`}
              viewTransition
              className="hover:bg-accent block rounded-md border px-2 py-1.5 text-xs"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-medium tabular-nums">{c.caseNumber}</span>
                {c.importance >= 3 ? (
                  <Badge variant="default" className="text-[10px]">
                    중요
                  </Badge>
                ) : null}
              </div>
              {c.caseTitle ? (
                <p className="text-muted-foreground line-clamp-1">
                  {c.caseTitle}
                </p>
              ) : null}
              {c.decidedAt ? (
                <p className="text-muted-foreground text-[10px] tabular-nums">
                  {c.decidedAt}
                </p>
              ) : null}
            </Link>
          ))}
        </Section>

        <Section
          title="조문 매핑 없는 문제"
          subtitle={`${gaps.unmappedProblems.length}건`}
          icon={ListChecksIcon}
          empty="모든 문제가 primary_article 을 가집니다."
        >
          {gaps.unmappedProblems.map((p) => (
            <Link
              key={p.problemId}
              to={`/admin/problems/${p.problemId}`}
              viewTransition
              className="hover:bg-accent block rounded-md border px-2 py-1.5 text-xs"
            >
              <div className="flex items-center gap-1.5">
                {p.year ? (
                  <span className="font-medium tabular-nums">
                    {p.year}
                    {p.problemNumber ? `·${p.problemNumber}` : ""}
                  </span>
                ) : null}
                <Badge variant="outline" className="text-[10px]">
                  {p.format}
                </Badge>
              </div>
              <p className="text-muted-foreground line-clamp-2">
                {p.bodySnippet}
              </p>
            </Link>
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon: Icon,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof NetworkIcon;
  empty: string;
  children: React.ReactNode;
}) {
  const childrenArr = Array.isArray(children) ? children : [children];
  const isEmpty = childrenArr.filter(Boolean).length === 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Icon className="text-primary size-4" />
            {title}
          </h2>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {subtitle}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {isEmpty ? (
          <p className="text-muted-foreground py-6 text-center text-xs">
            {empty}
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
