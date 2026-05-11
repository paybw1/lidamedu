// 최신 주관식 문제 — 등록일 최신순. 검색·과목·년도·출처 필터.

import {
  ArrowRightIcon,
  FilterXIcon,
  NewspaperIcon,
  PencilIcon,
  SearchIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  ORIGIN_LABEL,
  type ProblemOrigin,
} from "~/features/problems/labels";
import { listRecentProblems } from "~/features/problems/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/essay";

export const meta: Route.MetaFunction = () => [
  { title: "주관식 문제 | Lidam Edu" },
];

interface Filters {
  q: string;
  subject?: LawSubjectSlug;
  year?: number;
  origin?: ProblemOrigin;
}

const ORIGINS: Array<{ value: ProblemOrigin | "all"; label: string }> = [
  { value: "all", label: "전체 출처" },
  { value: "past_exam", label: "기출" },
  { value: "past_exam_variant", label: "기출변형" },
  { value: "expected", label: "예상" },
  { value: "mock", label: "모의" },
];

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
  const yearRaw = url.searchParams.get("year");
  const year =
    yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : undefined;
  const originRaw = url.searchParams.get("origin");
  const origin: ProblemOrigin | undefined =
    originRaw === "past_exam" ||
    originRaw === "past_exam_variant" ||
    originRaw === "expected" ||
    originRaw === "mock"
      ? originRaw
      : undefined;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const filters: Filters = { q, subject, year, origin };

  const problems = await listRecentProblems(client, {
    limit: 100,
    formatFilter: "subjective",
    subject: filters.subject,
    year: filters.year,
    origin: filters.origin,
    query: filters.q || undefined,
  });
  return { problems, filters };
}

function lawName(slug: string): string {
  if (slug in LAW_SUBJECTS) return LAW_SUBJECTS[slug as LawSubjectSlug].name;
  return slug;
}

export default function LatestEssay({ loaderData }: Route.ComponentProps) {
  const { problems, filters } = loaderData;
  const filterActive =
    !!filters.subject ||
    !!filters.year ||
    !!filters.origin ||
    filters.q !== "";

  // 빠른 year 옵션 — 최근 10년.
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - i);

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NewspaperIcon className="size-3.5" /> 최신 정보
        </p>
        <h1 className="text-2xl font-bold tracking-tight">주관식 문제</h1>
        <p className="text-muted-foreground text-sm">
          {problems.length}건
          {filters.subject ? ` · ${LAW_SUBJECTS[filters.subject].name}` : ""}
          {filters.year ? ` · ${filters.year}년` : ""}
          {filters.origin
            ? ` · ${ORIGIN_LABEL[filters.origin] ?? filters.origin}`
            : ""}
          {filters.q ? ` · "${filters.q}" 검색` : ""}
        </p>
      </header>

      <Form
        method="get"
        className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="본문 검색"
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
        <select
          name="year"
          defaultValue={filters.year ?? ""}
          className="border-input bg-background h-9 rounded-md border px-2 text-xs tabular-nums"
        >
          <option value="">전체 년도</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          name="origin"
          defaultValue={filters.origin ?? "all"}
          className="border-input bg-background h-9 rounded-md border px-2 text-xs"
        >
          {ORIGINS.map((o) => (
            <option key={o.value} value={o.value === "all" ? "" : o.value}>
              {o.label}
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
            <Link to="/latest/essay">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        </div>
      ) : null}

      {problems.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            조건에 맞는 주관식 문제가 없습니다.
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
