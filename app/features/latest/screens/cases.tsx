// 최신 판례 — 모든 과목 통합. 검색·과목·중요·기출 필터 + 페이지네이션.
// 키트 lidam-latest/CasesScreen 디자인.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { Route } from "./+types/cases";

import { GavelIcon, SearchXIcon } from "lucide-react";
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { ExamYearChip } from "~/features/cases/components/exam-year-chip";
import { COURT_LABELS, type CaseListItem } from "~/features/cases/labels";
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
import { getExamYearsByCase } from "~/features/problems/queries.server";
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
  "case_id, court, decided_at, case_number, case_title, case_type, is_en_banc, importance, summary_title, summary_items, subject_laws, exam_2nd_years";

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
  const examYearsByCase = await getExamYearsByCase(client);
  let q = client
    .from("cases")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);
  if (filters.subject) q = q.contains("subject_laws", [filters.subject]);
  if (filters.importantOnly) q = q.gte("importance", 3);
  // feat-8-024: 1차 기출은 problem_case_links 연결 판례로 한정.
  if (filters.exam === "exam_1st")
    q = q.in("case_id", [...examYearsByCase.keys()]);
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
    exam1stYears: examYearsByCase.get(r.case_id) ?? [],
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

  const descParts = [`${total.toLocaleString("ko-KR")}건`];
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
            const firstSubject = c.subjectLaws[0] ?? "patent";
            const caseHref = `/subjects/${firstSubject}/cases/${c.caseId}`;
            return (
              <FeedCardLink key={c.caseId} to={caseHref}>
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
                {c.exam1stYears.length + c.exam2ndYears.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...c.exam1stYears]
                      .sort((a, b) => a - b)
                      .map((y) => (
                        <ExamYearChip key={`1-${y}`} round="first" year={y} />
                      ))}
                    {[...c.exam2ndYears]
                      .sort((a, b) => a - b)
                      .map((y) => (
                        <ExamYearChip key={`2-${y}`} round="second" year={y} />
                      ))}
                  </div>
                ) : null}
                <CardCta label="판례 본문 보기" />
              </FeedCardLink>
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
