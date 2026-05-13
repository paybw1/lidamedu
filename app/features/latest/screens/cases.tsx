// 최신 판례 — 모든 과목 통합. 검색·과목·중요·기출 필터 + 페이지네이션.

import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterXIcon,
  GavelIcon,
  NewspaperIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { COURT_LABELS, type CaseListItem } from "~/features/cases/labels";
import { ExamYearChip } from "~/features/cases/components/exam-year-chip";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";
import type { Database } from "database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Route } from "./+types/cases";

export const meta: Route.MetaFunction = () => [
  { title: "최근 판례 | Lidam Edu" },
];

const LIST_COLUMNS =
  "case_id, court, decided_at, case_number, case_title, case_type, is_en_banc, importance, summary_title, summary_items, subject_laws, exam_1st_years, exam_2nd_years";

function extractFirstSummaryTitle(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (!first || typeof first !== "object") return null;
  const t = (first as Record<string, unknown>).title;
  if (typeof t !== "string") return null;
  const trimmed = t.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type ExamMode = "any" | "exam_1st" | "exam_2nd";

interface LatestCasesFilters {
  q: string;
  subject?: LawSubjectSlug;
  importantOnly: boolean;
  exam: ExamMode;
  page: number;
  pageSize: number;
}

async function listLatestCases(
  client: SupabaseClient<Database>,
  filters: LatestCasesFilters,
): Promise<{ items: CaseListItem[]; total: number }> {
  let q = client
    .from("cases")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);
  if (filters.subject) q = q.contains("subject_laws", [filters.subject]);
  if (filters.importantOnly) q = q.gte("importance", 3);
  if (filters.exam === "exam_1st") q = q.not("exam_1st_years", "eq", "{}");
  if (filters.exam === "exam_2nd") q = q.not("exam_2nd_years", "eq", "{}");
  const trimmed = filters.q.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(
      `case_number.ilike.${pattern},case_title.ilike.${pattern},case_type.ilike.${pattern},summary_title.ilike.${pattern},summary_body_md.ilike.${pattern},reasoning_md.ilike.${pattern}`,
    );
  }
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;
  const { data: rows, error, count } = await q
    .order("decided_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  const items: CaseListItem[] = (rows ?? []).map((r) => ({
    caseId: r.case_id,
    court: r.court,
    decidedAt: r.decided_at,
    caseNumber: r.case_number,
    caseTitle: r.case_title,
    caseType: r.case_type,
    isEnBanc: r.is_en_banc,
    importance: r.importance ?? 1,
    summaryTitle: r.summary_title,
    summaryFirstTitle: extractFirstSummaryTitle(r.summary_items),
    subjectLaws: r.subject_laws ?? [],
    exam1stYears: r.exam_1st_years ?? [],
    exam2ndYears: r.exam_2nd_years ?? [],
  }));
  return { items, total: count ?? 0 };
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject");
  const subject =
    subjectParam && (LAW_SUBJECT_SLUGS as readonly string[]).includes(subjectParam)
      ? (subjectParam as LawSubjectSlug)
      : undefined;
  const importantOnly = url.searchParams.get("important") === "1";
  const examRaw = url.searchParams.get("exam") ?? "any";
  const exam: ExamMode =
    examRaw === "exam_1st" || examRaw === "exam_2nd" ? examRaw : "any";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const filters: LatestCasesFilters = {
    q,
    subject,
    importantOnly,
    exam,
    page,
    pageSize: 50,
  };
  const { items, total } = await listLatestCases(client, filters);
  return { cases: items, total, filters };
}

function lawName(slug: string): string {
  if (slug in LAW_SUBJECTS) {
    return LAW_SUBJECTS[slug as LawSubjectSlug].name;
  }
  return slug;
}

export default function LatestCases({ loaderData }: Route.ComponentProps) {
  const { cases, total, filters } = loaderData;
  const filterActive =
    !!filters.subject ||
    filters.importantOnly ||
    filters.exam !== "any" ||
    filters.q !== "";
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  const makeUrl = (overrides: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    if (filters.subject) sp.set("subject", filters.subject);
    if (filters.importantOnly) sp.set("important", "1");
    if (filters.exam !== "any") sp.set("exam", filters.exam);
    if (filters.q) sp.set("q", filters.q);
    if (filters.page !== 1) sp.set("page", String(filters.page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) sp.delete(k);
      else sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NewspaperIcon className="size-3.5" /> 최신 정보
        </p>
        <h1 className="text-2xl font-bold tracking-tight">최근 판례</h1>
        <p className="text-muted-foreground text-sm">
          {total}건 검색됨
          {filters.subject ? ` · ${LAW_SUBJECTS[filters.subject].name}` : ""}
          {filters.importantOnly ? " · 중요판례 (★3+)" : ""}
          {filters.exam === "exam_1st" ? " · 1차 기출 보유" : ""}
          {filters.exam === "exam_2nd" ? " · 2차 기출 보유" : ""}
          {filters.q ? ` · "${filters.q}" 검색` : ""}
        </p>
      </header>

      <Form method="get" className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="사건번호·사건명·요지 검색"
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
          name="exam"
          defaultValue={filters.exam}
          className="border-input bg-background h-9 rounded-md border px-2 text-xs"
        >
          <option value="any">기출 무관</option>
          <option value="exam_1st">1차 기출</option>
          <option value="exam_2nd">2차 기출</option>
        </select>
        <label className="border-input flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
          <input
            type="checkbox"
            name="important"
            value="1"
            defaultChecked={filters.importantOnly}
            className="size-3.5"
          />
          <StarIcon className="size-3" /> 중요만
        </label>
        <Button type="submit" size="sm" className="h-9">
          적용
        </Button>
      </Form>
      {filterActive ? (
        <div className="mb-4">
          <Button asChild type="button" size="sm" variant="ghost" className="h-7">
            <Link to="/latest/cases">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        </div>
      ) : null}

      {cases.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            해당 조건의 판례가 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="latest-cases-list">
          {cases.map((c) => {
            const firstSubject = c.subjectLaws[0] ?? "patent";
            const caseHref = `/subjects/${firstSubject}/cases/${c.caseId}`;
            return (
              <div key={c.caseId} className="group block">
                <Card className="hover:border-primary transition-colors">
                  <CardHeader className="px-4 pb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="default" className="text-xs">
                        <GavelIcon className="size-3" /> {COURT_LABELS[c.court]}
                      </Badge>
                      <Badge variant="outline" className="text-xs tabular-nums">
                        {c.caseNumber}
                      </Badge>
                      {c.caseType ? (
                        <Badge variant="secondary" className="text-xs">
                          {c.caseType}
                        </Badge>
                      ) : null}
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
                    <Link
                      to={caseHref}
                      viewTransition
                      className="hover:text-primary block font-medium leading-snug"
                    >
                      {c.summaryTitle ?? c.caseTitle}
                    </Link>
                    {c.exam1stYears.length + c.exam2ndYears.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {[...c.exam1stYears]
                          .sort((a, b) => a - b)
                          .map((y) => (
                            <ExamYearChip
                              key={`1-${y}`}
                              subjectSlug={firstSubject as LawSubjectSlug}
                              round="first"
                              year={y}
                              caseId={c.caseId}
                            />
                          ))}
                        {[...c.exam2ndYears]
                          .sort((a, b) => a - b)
                          .map((y) => (
                            <ExamYearChip
                              key={`2-${y}`}
                              subjectSlug={firstSubject as LawSubjectSlug}
                              round="second"
                              year={y}
                              caseId={c.caseId}
                            />
                        ))}
                      </div>
                    ) : null}
                    <Link
                      to={caseHref}
                      viewTransition
                      className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      판례 본문 보기 <ArrowRightIcon className="size-3" />
                    </Link>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs">
          <Button
            asChild={filters.page > 1}
            variant="outline"
            size="sm"
            disabled={filters.page <= 1}
            className="h-7"
          >
            {filters.page > 1 ? (
              <Link to={makeUrl({ page: String(filters.page - 1) })}>
                <ChevronLeftIcon className="size-3" /> 이전
              </Link>
            ) : (
              <span>
                <ChevronLeftIcon className="size-3" /> 이전
              </span>
            )}
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {filters.page} / {totalPages}
          </span>
          <Button
            asChild={filters.page < totalPages}
            variant="outline"
            size="sm"
            disabled={filters.page >= totalPages}
            className="h-7"
          >
            {filters.page < totalPages ? (
              <Link to={makeUrl({ page: String(filters.page + 1) })}>
                다음 <ChevronRightIcon className="size-3" />
              </Link>
            ) : (
              <span>
                다음 <ChevronRightIcon className="size-3" />
              </span>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
