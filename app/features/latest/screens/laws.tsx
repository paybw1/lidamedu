// 최신 법 개정 — 모든 과목 통합. 검색·과목 필터 + 공시일 내림차순.

import {
  ArrowRightIcon,
  FilterXIcon,
  GavelIcon,
  NewspaperIcon,
  SearchIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { listRecentLawRevisions } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/laws";

export const meta: Route.MetaFunction = () => [
  { title: "법 개정 | Lidam Edu" },
];

interface Filters {
  q: string;
  subject?: LawSubjectSlug;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const subjectRaw = url.searchParams.get("subject");
  const subject: LawSubjectSlug | undefined =
    subjectRaw &&
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(subjectRaw)
      ? (subjectRaw as LawSubjectSlug)
      : undefined;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const filters: Filters = { q, subject };

  const revisions = await listRecentLawRevisions(client, 100, user.id, {
    subject: filters.subject,
    query: filters.q || undefined,
  });
  return { revisions, filters };
}

export default function LatestLaws({ loaderData }: Route.ComponentProps) {
  const { revisions, filters } = loaderData;
  const filterActive = !!filters.subject || filters.q !== "";

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NewspaperIcon className="size-3.5" /> 최신 정보
        </p>
        <h1 className="text-2xl font-bold tracking-tight">법 개정</h1>
        <p className="text-muted-foreground text-sm">
          {revisions.length}건
          {filters.subject ? ` · ${LAW_SUBJECTS[filters.subject].name}` : ""}
          {filters.q ? ` · "${filters.q}" 검색` : ""} · 공시일 내림차순
        </p>
      </header>

      <Form
        method="get"
        className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
      >
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="법명·개정 번호 검색"
            className="pl-9"
          />
        </div>
        <select
          name="subject"
          defaultValue={filters.subject ?? ""}
          className="border-input bg-background h-9 rounded-md border px-2 text-xs"
        >
          <option value="">전체 과목</option>
          {LAW_SUBJECT_SLUGS.map((s) => (
            <option key={s} value={s}>
              {LAW_SUBJECTS[s].name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" className="h-9">
          적용
        </Button>
      </Form>
      {filterActive ? (
        <div className="mb-4">
          <Button asChild type="button" size="sm" variant="ghost" className="h-7">
            <Link to="/latest/laws">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        </div>
      ) : null}

      {revisions.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            조건에 맞는 법 개정이 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="latest-laws-list">
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
