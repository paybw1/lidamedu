// 최신 주관식 문제 — 등록일 최신 50건. 카드별 "지금 풀어보기" CTA.

import { ArrowRightIcon, NewspaperIcon, PencilIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  ORIGIN_LABEL,
  type ProblemOrigin,
} from "~/features/problems/labels";
import { listRecentProblems } from "~/features/problems/queries.server";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/essay";

export const meta: Route.MetaFunction = () => [
  { title: "주관식 문제 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const problems = await listRecentProblems(client, 50, "subjective");
  return { problems };
}

function lawName(slug: string): string {
  if (slug in LAW_SUBJECTS) return LAW_SUBJECTS[slug as LawSubjectSlug].name;
  return slug;
}

export default function LatestEssay({ loaderData }: Route.ComponentProps) {
  const { problems } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NewspaperIcon className="size-3.5" /> 최신 정보
        </p>
        <h1 className="text-2xl font-bold tracking-tight">주관식 문제</h1>
        <p className="text-muted-foreground text-sm">
          등록일 기준 최신 {problems.length}건 (subjective)
        </p>
      </header>

      {problems.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            등록된 주관식 문제가 없습니다 (2차 콘텐츠는 추후 도입 — feat-4-A-320~).
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="latest-essay-list">
          {problems.map((p) => (
            <Link
              key={p.problemId}
              to={`/subjects/${p.lawCode}/problems/${p.problemId}`}
              viewTransition
              className="group block"
            >
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="px-4 pb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default" className="text-xs">
                      <PencilIcon className="size-3" /> {lawName(p.lawCode)}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {ORIGIN_LABEL[p.origin as ProblemOrigin] ?? p.origin}
                    </Badge>
                    {p.year ? (
                      <Badge variant="outline" className="text-xs tabular-nums">
                        {p.year}
                        {p.problemNumber ? ` · ${p.problemNumber}번` : ""}
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      등록 {p.createdAt.slice(0, 10)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 text-sm">
                  <p className="line-clamp-2 leading-snug">{p.bodySnippet}</p>
                  <p className="text-primary mt-2 inline-flex items-center gap-1 text-xs">
                    지금 풀어보기 <ArrowRightIcon className="size-3" />
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
