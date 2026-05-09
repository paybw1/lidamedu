// 최신 판례 — 모든 과목 통합. 선고일(decided_at) 내림차순 50건.

import { ArrowRightIcon, FilterXIcon, GavelIcon, NewspaperIcon, StarIcon } from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { COURT_LABELS } from "~/features/cases/labels";
import { listRecentCases } from "~/features/cases/queries.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/cases";

export const meta: Route.MetaFunction = () => [
  { title: "최근 판례 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject");
  const subject =
    subjectParam &&
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(subjectParam)
      ? (subjectParam as LawSubjectSlug)
      : undefined;
  const importantOnly = url.searchParams.get("important") === "1";

  const cases = await listRecentCases(client, 50, {
    subject,
    minImportance: importantOnly ? 3 : undefined,
  });
  return { cases, subject: subject ?? null, importantOnly };
}

function lawName(slug: string): string {
  if (slug in LAW_SUBJECTS) {
    return LAW_SUBJECTS[slug as LawSubjectSlug].name;
  }
  return slug;
}

export default function LatestCases({ loaderData }: Route.ComponentProps) {
  const { cases, subject, importantOnly } = loaderData;
  const filterActive = subject !== null || importantOnly;

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NewspaperIcon className="size-3.5" /> 최신 정보
        </p>
        <h1 className="text-2xl font-bold tracking-tight">최근 판례</h1>
        <p className="text-muted-foreground text-sm">
          선고일 기준 최신 {cases.length}건
          {subject ? ` · ${LAW_SUBJECTS[subject].name}` : ""}
          {importantOnly ? " · 중요판례 (★3+)" : ""}
        </p>
      </header>

      <Form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground tracking-wide">과목</span>
          <select
            name="subject"
            defaultValue={subject ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            <option value="">전체</option>
            {LAW_SUBJECT_SLUGS.map((s) => (
              <option key={s} value={s}>
                {LAW_SUBJECTS[s].name}
              </option>
            ))}
          </select>
        </label>
        <label className="border-input flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
          <input
            type="checkbox"
            name="important"
            value="1"
            defaultChecked={importantOnly}
            className="size-3.5"
          />
          <StarIcon className="size-3" /> 중요판례만
        </label>
        <Button type="submit" size="sm" className="h-8">
          적용
        </Button>
        {filterActive ? (
          <Button asChild type="button" size="sm" variant="ghost" className="h-8">
            <Link to="/latest/cases">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        ) : null}
      </Form>

      {cases.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            등록된 판례가 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="latest-cases-list">
          {cases.map((c) => {
            const firstSubject = c.subjectLaws[0] ?? "patent";
            return (
              <Link
                key={c.caseId}
                to={`/subjects/${firstSubject}/cases/${c.caseId}`}
                viewTransition
                className="group block"
              >
                <Card className="hover:border-primary transition-colors">
                  <CardHeader className="px-4 pb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="default" className="text-xs">
                        <GavelIcon className="size-3" /> {COURT_LABELS[c.court]}
                      </Badge>
                      <Badge variant="outline" className="text-xs tabular-nums">
                        {c.caseNumber}
                      </Badge>
                      {c.isEnBanc ? (
                        <Badge variant="secondary" className="text-xs">
                          전합
                        </Badge>
                      ) : null}
                      {c.subjectLaws.map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {lawName(s)}
                        </Badge>
                      ))}
                      <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                        선고 {c.decidedAt}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 text-sm">
                    <p className="font-medium leading-snug">
                      {c.summaryTitle ?? c.caseTitle}
                    </p>
                    <p className="text-primary mt-2 inline-flex items-center gap-1 text-xs">
                      판례 본문 보기 <ArrowRightIcon className="size-3" />
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
