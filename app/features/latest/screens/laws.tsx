// 최신 법 개정 — 모든 과목 통합. 공시일(published_at) 내림차순 50건.

import { ArrowRightIcon, GavelIcon, NewspaperIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { listRecentLawRevisions } from "~/features/laws/queries.server";

import type { Route } from "./+types/laws";

export const meta: Route.MetaFunction = () => [
  { title: "법 개정 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const revisions = await listRecentLawRevisions(client, 50, user.id);
  return { revisions };
}

export default function LatestLaws({ loaderData }: Route.ComponentProps) {
  const { revisions } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NewspaperIcon className="size-3.5" /> 최신 정보
        </p>
        <h1 className="text-2xl font-bold tracking-tight">법 개정</h1>
        <p className="text-muted-foreground text-sm">
          공시된 법 개정 최신 {revisions.length}건 · 공시일 기준 내림차순
        </p>
      </header>

      {revisions.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            공시된 법 개정이 없습니다.
          </p>
        </div>
      ) : (
        <div
          className="space-y-2"
          data-testid="latest-laws-list"
        >
          {revisions.map((r) => (
            <Link
              key={r.lawRevisionId}
              to={`/subjects/${r.lawCode}`}
              viewTransition
              className="group block"
            >
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="px-4 pb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default" className="text-xs">
                      <GavelIcon className="size-3" /> {r.lawName}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {r.revisionNumber ?? "—"} 개정
                    </Badge>
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      {r.publishedAt
                        ? `공시 ${r.publishedAt.slice(0, 10)}`
                        : "공시일 미정"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-baseline gap-3 px-4 pb-4 text-sm">
                  <span>
                    <span className="text-muted-foreground text-xs">공포 </span>
                    <span className="tabular-nums">
                      {r.promulgatedAt ?? "미정"}
                    </span>
                  </span>
                  <span>
                    <span className="text-muted-foreground text-xs">시행 </span>
                    <span className="tabular-nums">
                      {r.effectiveDate ?? "미정"}
                    </span>
                  </span>
                  {r.affectedArticleCount > 0 ? (
                    <Badge variant="secondary" className="text-xs">
                      영향 조문 {r.affectedArticleCount}건
                    </Badge>
                  ) : null}
                  {r.myBookmarkedAffectedCount > 0 ? (
                    <Badge
                      variant="default"
                      className="bg-amber-500 text-xs hover:bg-amber-600"
                    >
                      ★ 내 즐겨찾기 {r.myBookmarkedAffectedCount}건
                    </Badge>
                  ) : null}
                  <span className="text-primary ml-auto inline-flex items-center gap-1 text-xs">
                    {r.lawName} 보러가기 <ArrowRightIcon className="size-3" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
