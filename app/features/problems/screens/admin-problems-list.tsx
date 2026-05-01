// 운영자 객관식 문제 리뷰 목록 — 출처/유형/극성/연도/scope/조문 필터 + 체계도/조문 순서 정렬.

import { ArrowRightIcon, FilterIcon } from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  listProblemYears,
  listProblemsBySubject,
  type ProblemFormat,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
} from "~/features/problems/queries.server";
import { LAW_SUBJECTS, LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-problems-list";

export const meta: Route.MetaFunction = () => [
  { title: "객관식 문제 관리 | Lidam Edu" },
];

const ORIGINS: ProblemOrigin[] = [
  "past_exam",
  "past_exam_variant",
  "mock",
  "expected",
];
const FORMATS: ProblemFormat[] = ["mc_short", "mc_box", "mc_case"];
const POLARITIES: ProblemPolarity[] = ["positive", "negative"];
const SCOPES: ProblemScope[] = ["unit", "comprehensive"];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject") ?? "patent";
  const subject = LAW_SUBJECT_SLUGS.includes(subjectParam as never)
    ? (subjectParam as (typeof LAW_SUBJECT_SLUGS)[number])
    : "patent";

  const filters = {
    origin: (url.searchParams.get("origin") || undefined) as
      | ProblemOrigin
      | undefined,
    format: (url.searchParams.get("format") || undefined) as
      | ProblemFormat
      | undefined,
    polarity: (url.searchParams.get("polarity") || undefined) as
      | ProblemPolarity
      | undefined,
    scope: (url.searchParams.get("scope") || undefined) as
      | ProblemScope
      | undefined,
    year: url.searchParams.get("year")
      ? Number(url.searchParams.get("year"))
      : undefined,
    hasUnclassified: url.searchParams.get("unclassified") === "1",
  };

  const [problems, years] = await Promise.all([
    listProblemsBySubject(client, subject, filters),
    listProblemYears(client, subject),
  ]);
  return { problems, years, subject, filters };
}

export default function AdminProblemsList({
  loaderData,
}: Route.ComponentProps) {
  const { problems, years, subject, filters } = loaderData;
  const subjectMeta = LAW_SUBJECTS[subject];
  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          운영
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {subjectMeta.name} 객관식 문제
        </h1>
        <p className="text-muted-foreground text-sm">
          체계도 / 조문 순서로 문제 목록을 조회합니다. 분류되지 않은 지문이 있는
          문제는{" "}
          <Badge variant="outline" className="ml-0.5 text-[10px]">
            ?
          </Badge>{" "}
          뱃지로 표시됩니다.
        </p>
      </header>

      <Card className="mb-4">
        <CardHeader className="px-4 pb-2">
          <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            <FilterIcon className="size-3.5" /> 필터
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Form
            method="get"
            className="flex flex-wrap items-end gap-3 text-xs"
          >
            <FilterSelect
              name="subject"
              label="과목"
              value={subject}
              options={LAW_SUBJECT_SLUGS.map((s) => ({
                value: s,
                label: LAW_SUBJECTS[s].name,
              }))}
            />
            <FilterSelect
              name="origin"
              label="출처"
              value={filters.origin ?? ""}
              options={[
                { value: "", label: "전체" },
                ...ORIGINS.map((v) => ({ value: v, label: ORIGIN_LABEL[v] })),
              ]}
            />
            <FilterSelect
              name="format"
              label="유형"
              value={filters.format ?? ""}
              options={[
                { value: "", label: "전체" },
                ...FORMATS.map((v) => ({ value: v, label: FORMAT_LABEL[v] })),
              ]}
            />
            <FilterSelect
              name="polarity"
              label="극성"
              value={filters.polarity ?? ""}
              options={[
                { value: "", label: "전체" },
                ...POLARITIES.map((v) => ({
                  value: v,
                  label: POLARITY_LABEL[v],
                })),
              ]}
            />
            <FilterSelect
              name="scope"
              label="단원/종합"
              value={filters.scope ?? ""}
              options={[
                { value: "", label: "전체" },
                ...SCOPES.map((v) => ({ value: v, label: SCOPE_LABEL[v] })),
              ]}
            />
            <FilterSelect
              name="year"
              label="연도"
              value={filters.year != null ? String(filters.year) : ""}
              options={[
                { value: "", label: "전체" },
                ...years.map((y) => ({ value: String(y), label: `${y}년` })),
              ]}
            />
            <label className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
              <input
                type="checkbox"
                name="unclassified"
                value="1"
                defaultChecked={filters.hasUnclassified}
              />
              미분류 지문 포함
            </label>
            <button
              type="submit"
              className="border-input bg-background hover:bg-accent rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              적용
            </button>
            <Link
              to={`/admin/problems?subject=${subject}`}
              className="text-muted-foreground hover:text-foreground text-[11px]"
            >
              초기화
            </Link>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 pb-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            결과 {problems.length}건
          </p>
        </CardHeader>
        <CardContent className="px-0">
          {problems.length === 0 ? (
            <p className="text-muted-foreground px-6 py-6 text-center text-sm">
              조건에 맞는 문제가 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">조문</TableHead>
                  <TableHead className="w-20 text-xs">출처</TableHead>
                  <TableHead className="w-16 text-xs">유형</TableHead>
                  <TableHead className="w-16 text-xs">극성</TableHead>
                  <TableHead className="w-16 text-xs">scope</TableHead>
                  <TableHead className="w-20 text-xs">연도/회차</TableHead>
                  <TableHead>본문 (앞부분)</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.map((p) => (
                  <TableRow key={p.problemId}>
                    <TableCell>
                      {p.primaryArticleNumber ? (
                        <span className="text-xs font-medium">
                          제{p.primaryArticleNumber}조
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {ORIGIN_LABEL[p.origin]}
                    </TableCell>
                    <TableCell className="text-xs">
                      {FORMAT_LABEL[p.format]}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.polarity ? POLARITY_LABEL[p.polarity] : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.scope ? SCOPE_LABEL[p.scope] : "—"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {p.year != null
                        ? `${p.year}${p.examRoundNo != null ? `-${p.examRoundNo}` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <p className="line-clamp-2 text-sm">
                          {truncate(p.bodyMd, 120)}
                        </p>
                        {p.unclassifiedChoices > 0 ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-amber-500 bg-amber-50 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                            title={`분류되지 않은 지문 ${p.unclassifiedChoices}개`}
                          >
                            ?{p.unclassifiedChoices}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/admin/problems/${p.problemId}`}
                        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        편집 <ArrowRightIcon className="size-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="border-input bg-background h-7 rounded-md border px-2 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
