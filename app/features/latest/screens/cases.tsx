// 최신 판례 — 모든 과목 통합. 검색·과목·중요·기출 필터 + 페이지네이션.
// 키트 lidam-latest/CasesScreen 디자인.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { Route } from "./+types/cases";

import {
  CalendarClockIcon,
  GavelIcon,
  PencilIcon,
  SearchXIcon,
} from "lucide-react";
import { Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import {
  LATEST_CASES_RECENCY_MONTHS_KEY,
  getLatestCasesRecencyMonths,
  setAppSetting,
} from "~/core/lib/app-settings.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { ExamYearChip } from "~/features/cases/components/exam-year-chip";
import { COURT_LABELS, type CaseListItem } from "~/features/cases/labels";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  CardCta,
  FeedCardLink,
  FilterCheckbox,
  FilterSelect,
  LatestEmpty,
  LatestFilterForm,
  LatestPagination,
  ListStack,
  MetaRow,
  NewBadge,
  Pill,
  isRecent,
  relativeKo,
} from "~/features/latest/components/latest-list";
import { LatestShell } from "~/features/latest/components/latest-shell";
import { getExamProblemsByCase } from "~/features/problems/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
  SECOND_EXAM_LAW_SLUGS,
} from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = () => [
  { title: "최근 판례 | Lidam Patent Attorney Academy" },
];

const LIST_COLUMNS =
  "case_id, court, decided_at, case_number, case_title, nickname, case_type, is_en_banc, importance, summary_title, summary_items, subject_laws, exam_1st_years, exam_2nd_years";

function extractFirstSummaryTitle(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (!first || typeof first !== "object") return null;
  const t = (first as Record<string, unknown>).title;
  if (typeof t !== "string") return null;
  const trimmed = t.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// feat-3-204: 오늘로부터 N개월 전 날짜 (YYYY-MM-DD) — 노출 기간 cutoff.
function monthsAgoDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

type ExamMode = "any" | "exam_1st" | "exam_2nd";

interface LatestCasesFilters {
  q: string;
  subject?: LawSubjectSlug;
  importantOnly: boolean;
  exam: ExamMode;
  /** feat-3-204: 운영자 설정 노출 기간 cutoff (YYYY-MM-DD). null = 제한 없음. */
  recencyCutoff: string | null;
  page: number;
  pageSize: number;
}

async function listLatestCases(
  client: SupabaseClient<Database>,
  filters: LatestCasesFilters,
): Promise<{ items: CaseListItem[]; total: number }> {
  const examProblemsByCase = await getExamProblemsByCase(client);
  let q = client
    .from("cases")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);
  if (filters.subject) q = q.contains("subject_laws", [filters.subject]);
  if (filters.importantOnly) q = q.gte("importance", 3);
  // feat-3-204: 운영자 설정 노출 기간 — 선고일이 cutoff 이후인 판례만.
  if (filters.recencyCutoff) q = q.gte("decided_at", filters.recencyCutoff);
  // feat-8-024: 1차 기출은 problem_case_links 연결 판례로 한정.
  if (filters.exam === "exam_1st")
    q = q.in("case_id", [...examProblemsByCase.keys()]);
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
  const {
    data: rows,
    error,
    count,
  } = await q.order("decided_at", { ascending: false }).range(from, to);
  if (error) throw error;
  const items: CaseListItem[] = (rows ?? []).map((r) => {
    const problems = examProblemsByCase.get(r.case_id) ?? [];
    const problemYears = new Set(problems.map((p) => p.year));
    const extraYears = (r.exam_1st_years ?? [])
      .filter((y: number) => !problemYears.has(y))
      .sort((a: number, b: number) => a - b);
    return {
      caseId: r.case_id,
      court: r.court,
      decidedAt: r.decided_at,
      caseNumber: r.case_number,
      caseTitle: r.case_title,
      nickname: r.nickname,
      caseType: r.case_type,
      isEnBanc: r.is_en_banc,
      importance: r.importance ?? 1,
      summaryTitle: r.summary_title,
      summaryFirstTitle: extractFirstSummaryTitle(r.summary_items),
      subjectLaws: r.subject_laws ?? [],
      exam1stProblems: problems,
      exam1stExtraYears: extraYears,
      exam2ndYears: r.exam_2nd_years ?? [],
    };
  });
  return { items, total: count ?? 0 };
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const role = await getStaffRole(client, user.id);
  const recencyMonths = await getLatestCasesRecencyMonths(client);

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject");
  const subject =
    subjectParam &&
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(subjectParam)
      ? (subjectParam as LawSubjectSlug)
      : undefined;
  const importantOnly = url.searchParams.get("important") === "1";
  const examRaw = url.searchParams.get("exam") ?? "any";
  const exam: ExamMode =
    examRaw === "exam_1st" || examRaw === "exam_2nd" ? examRaw : "any";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const filters: LatestCasesFilters = {
    q,
    subject,
    importantOnly,
    exam,
    recencyCutoff: recencyMonths > 0 ? monthsAgoDate(recencyMonths) : null,
    page,
    pageSize: 50,
  };
  const { items, total } = await listLatestCases(client, filters);
  return {
    cases: items,
    total,
    filters,
    isStaff: role !== null,
    recencyMonths,
  };
}

// feat-3-204: 운영자가 수험생 노출 기간(개월)을 저장. staff 전용.
export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "권한이 없습니다." }, { status: 403 });

  const fd = await request.formData();
  const months = Number(fd.get("recencyMonths"));
  if (!Number.isInteger(months) || months < 0 || months > 120) {
    return data(
      { error: "0–120 사이의 정수 개월 수를 입력하세요." },
      { status: 400 },
    );
  }
  const res = await setAppSetting(
    client,
    LATEST_CASES_RECENCY_MONTHS_KEY,
    months,
    user.id,
  );
  if (!res.ok) return data({ error: res.error }, { status: 500 });
  return data({ ok: true as const, recencyMonths: months });
}

function lawName(slug: string): string {
  if (slug in LAW_SUBJECTS) {
    return LAW_SUBJECTS[slug as LawSubjectSlug].name;
  }
  return slug;
}

export default function LatestCases({ loaderData }: Route.ComponentProps) {
  const { cases, total, filters, isStaff, recencyMonths } = loaderData;
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

  const descParts = [`${total.toLocaleString("ko-KR")}건`];
  if (recencyMonths > 0) descParts.push(`최근 ${recencyMonths}개월`);
  if (filters.subject) descParts.push(LAW_SUBJECTS[filters.subject].name);
  if (filters.importantOnly) descParts.push("중요판례 ★3+");
  if (filters.exam === "exam_1st") descParts.push("1차 기출 보유");
  if (filters.exam === "exam_2nd") descParts.push("2차 기출 보유");
  if (filters.q) descParts.push(`"${filters.q}" 검색`);

  return (
    <LatestShell
      category="cases"
      width="feed"
      title="최근 판례"
      desc={`${descParts.join(" · ")} — 선고일 최신순으로 모은 전 과목 신규 판례입니다.`}
    >
      {isStaff ? <RecencyPanel recencyMonths={recencyMonths} /> : null}
      <LatestFilterForm
        search={{
          name: "q",
          placeholder: "사건번호·사건명·요지 검색",
          defaultValue: filters.q,
        }}
        hasActive={filterActive}
        resetTo="/latest/cases"
      >
        <FilterSelect
          name="subject"
          ariaLabel="과목"
          defaultValue={filters.subject ?? ""}
          options={[{ value: "", label: "전체 과목" }]}
          optionGroups={[
            {
              label: "1차 · 객관식",
              options: FIRST_EXAM_LAW_SLUGS.map((s) => ({
                value: s,
                label: LAW_SUBJECTS[s].name,
              })),
            },
            {
              label: "2차 · 주관식",
              options: SECOND_EXAM_LAW_SLUGS.map((s) => ({
                value: s,
                label: LAW_SUBJECTS[s].name,
              })),
            },
          ]}
        />
        <FilterSelect
          name="exam"
          ariaLabel="기출"
          defaultValue={filters.exam}
          options={[
            { value: "any", label: "기출 무관" },
            { value: "exam_1st", label: "1차 기출" },
            { value: "exam_2nd", label: "2차 기출" },
          ]}
        />
        <FilterCheckbox name="important" defaultChecked={filters.importantOnly}>
          중요만 ★3+
        </FilterCheckbox>
      </LatestFilterForm>

      {cases.length === 0 ? (
        <LatestEmpty
          icon={filterActive ? SearchXIcon : GavelIcon}
          tone={filterActive ? "subdued" : "neutral"}
          title={
            filterActive
              ? "조건에 맞는 판례가 없습니다"
              : "아직 등록된 판례가 없습니다"
          }
          body={
            filterActive
              ? "검색어나 필터를 바꿔 다시 찾아보세요."
              : "새 판례가 등록되면 이곳에 선고일 최신순으로 모입니다."
          }
        />
      ) : (
        <ListStack testid="latest-cases-list">
          {cases.map((c) => {
            // feat-3-205: 학습정보 자체 뷰어로 — 학습과목(/subjects)으로 보내지 않음.
            const caseHref = `/latest/cases/${c.caseId}`;
            // exam1stProblems → 중복 제거 연도 (카드 전체가 링크라 비-링크 칩 사용).
            const exam1stYears = [
              ...new Set(
                c.exam1stProblems
                  .map((p) => p.year)
                  .filter((y): y is number => y != null),
              ),
            ].sort((a, b) => a - b);
            return (
              <div key={c.caseId} className="relative">
                {isStaff ? (
                  <Link
                    to={`/admin/cases/edit/${c.caseId}`}
                    viewTransition
                    className="text-muted-foreground hover:text-link bg-card/80 absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold backdrop-blur-sm"
                  >
                    <PencilIcon className="size-3.5" /> 수정
                  </Link>
                ) : null}
                <FeedCardLink to={caseHref}>
                  <MetaRow right={`선고 ${c.decidedAt}`}>
                    <Pill tone="violet">
                      <GavelIcon className="size-3" />
                      {COURT_LABELS[c.court]}
                    </Pill>
                    <Pill tone="outline" className="font-mono">
                      {c.caseNumber}
                    </Pill>
                    {c.caseType ? <Pill>{c.caseType}</Pill> : null}
                    {c.isEnBanc ? <Pill tone="primary">전합</Pill> : null}
                    {c.subjectLaws.map((s) => (
                      <Pill key={s} tone="outline">
                        {lawName(s)}
                      </Pill>
                    ))}
                    {isRecent(c.decidedAt) ? <NewBadge /> : null}
                  </MetaRow>
                  <div className="text-[15px] leading-snug font-bold tracking-tight">
                    {c.summaryTitle ?? c.caseTitle}
                  </div>
                  {exam1stYears.length + c.exam2ndYears.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {exam1stYears.map((y) => (
                        <ExamYearChip key={`1-${y}`} round="first" year={y} />
                      ))}
                      {[...c.exam2ndYears]
                        .sort((a, b) => a - b)
                        .map((y) => (
                          <ExamYearChip
                            key={`2-${y}`}
                            round="second"
                            year={y}
                          />
                        ))}
                    </div>
                  ) : null}
                  <CardCta label="판례 본문 보기" />
                </FeedCardLink>
              </div>
            );
          })}
        </ListStack>
      )}

      <LatestPagination
        page={filters.page}
        totalPages={totalPages}
        makeUrl={makeUrl}
      />
    </LatestShell>
  );
}

// feat-3-204: 운영자 전용 — 수험생 노출 기간(롤링 개월) 설정 패널.
function RecencyPanel({ recencyMonths }: { recencyMonths: number }) {
  const fetcher = useFetcher<{
    ok?: true;
    recencyMonths?: number;
    error?: string;
  }>();
  const result = fetcher.state === "idle" ? (fetcher.data ?? null) : null;
  const saved = result != null && "ok" in result && result.ok === true;
  const error = result && "error" in result ? result.error : null;
  const windowActive = recencyMonths > 0;

  return (
    <div className="border-border bg-muted/30 mb-3 rounded-xl border border-dashed p-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <CalendarClockIcon className="text-link size-4 shrink-0" />
        <span className="text-sm font-bold tracking-tight">
          수험생 노출 기간
          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
            · 운영자 설정
          </span>
        </span>
        <fetcher.Form
          method="post"
          className="ml-auto flex items-center gap-1.5"
        >
          <span className="text-muted-foreground text-[11px]">최근</span>
          <Input
            name="recencyMonths"
            type="number"
            min={0}
            max={120}
            required
            defaultValue={recencyMonths}
            className="h-8 w-20 text-xs"
            aria-label="수험생 노출 기간 (개월)"
          />
          <span className="text-muted-foreground text-[11px]">개월</span>
          <Button
            type="submit"
            size="sm"
            className="h-8 rounded-full"
            disabled={fetcher.state !== "idle"}
          >
            저장
          </Button>
        </fetcher.Form>
      </div>
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        {windowActive
          ? `이 페이지에서는 수험생·운영자 모두 선고일이 최근 ${recencyMonths}개월 이내인 판례만 봅니다. 0 으로 저장하면 제한이 풀립니다.`
          : "현재 기간 제한이 없어 전체 판례가 노출됩니다. 1 이상으로 저장하면 최근 판례만 노출됩니다."}{" "}
        전체 판례 관리는{" "}
        <Link to="/admin/cases" className="text-link font-semibold">
          운영자 판례 관리
        </Link>
        에서 합니다.
      </p>
      {saved ? (
        <p className="mt-1 text-[11px] font-semibold text-emerald-600">
          저장되었습니다.
        </p>
      ) : null}
      {error ? (
        <p className="mt-1 text-[11px] text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}
