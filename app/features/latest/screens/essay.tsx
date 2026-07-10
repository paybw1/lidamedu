// 최신 2차 기출문제 — 등록일 최신순. 검색·과목·년도·출처 필터.
// 키트 lidam-latest/EssayScreen 디자인.

import { ImageIcon, PenLineIcon, PencilIcon, SearchXIcon } from "lucide-react";
import { Link, data, useLocation } from "react-router";

import { getStaffRole } from "~/features/laws/queries.server";
import {
  ORIGIN_LABEL,
  SUBJECTIVE_KIND_LABEL,
  type ProblemOrigin,
  type SubjectiveKind,
} from "~/features/problems/labels";
import { listRecentProblems } from "~/features/problems/queries.server";
import {
  CardCta,
  FeedCardLink,
  FilterSelect,
  LatestEmpty,
  LatestFilterForm,
  ListStack,
  MetaRow,
  NewBadge,
  Pill,
  isRecent,
  relativeKo,
} from "~/features/latest/components/latest-list";
import { LatestShell } from "~/features/latest/components/latest-shell";
import { PastExamRoundToggle } from "~/features/latest/components/past-exam-round-toggle";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/essay";

export const meta: Route.MetaFunction = () => [
  { title: "2차 기출문제 | 리담변리사학원" },
];

interface Filters {
  q: string;
  subject?: LawSubjectSlug;
  year?: number;
  origin?: ProblemOrigin;
  subjectiveKind?: SubjectiveKind;
  subjectiveKeyword?: string;
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
  const kindRaw = url.searchParams.get("kind");
  const subjectiveKind: SubjectiveKind | undefined =
    kindRaw === "case_based" || kindRaw === "theory" || kindRaw === "mixed"
      ? kindRaw
      : undefined;
  const keyword = (url.searchParams.get("keyword") ?? "").trim().slice(0, 50);
  const filters: Filters = {
    q,
    subject,
    year,
    origin,
    subjectiveKind,
    subjectiveKeyword: keyword || undefined,
  };

  const problems = await listRecentProblems(client, {
    limit: 100,
    formatFilter: "subjective",
    subject: filters.subject,
    year: filters.year,
    origin: filters.origin,
    query: filters.q || undefined,
    subjectiveKind: filters.subjectiveKind,
    subjectiveKeyword: filters.subjectiveKeyword,
  });
  const role = await getStaffRole(client, user.id);
  return { problems, filters, isStaff: role !== null };
}

function lawName(slug: string): string {
  if (slug in LAW_SUBJECTS) return LAW_SUBJECTS[slug as LawSubjectSlug].name;
  return slug;
}

export default function LatestEssay({ loaderData }: Route.ComponentProps) {
  const { problems, filters, isStaff } = loaderData;
  // 현재 필터(검색 쿼리)를 뷰어에 넘겨, 뷰어 "목록으로"가 필터된 목록으로 복귀하게 함.
  const location = useLocation();
  const backQs = location.search
    ? `?back=${encodeURIComponent(location.search)}`
    : "";
  const filterActive =
    !!filters.subject ||
    !!filters.year ||
    !!filters.origin ||
    !!filters.subjectiveKind ||
    !!filters.subjectiveKeyword ||
    filters.q !== "";

  // 빠른 year 옵션 — 최근 10년.
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - i);

  const descParts = [`${problems.length.toLocaleString("ko-KR")}건`];
  if (filters.subject) descParts.push(LAW_SUBJECTS[filters.subject].name);
  if (filters.year) descParts.push(`${filters.year}년`);
  if (filters.origin)
    descParts.push(ORIGIN_LABEL[filters.origin] ?? filters.origin);
  if (filters.q) descParts.push(`"${filters.q}" 검색`);

  return (
    <LatestShell
      category="essay"
      width="index"
      title="2차 기출문제"
      desc={`${descParts.join(" · ")} — 최근 시험부터, 문제 순서대로 정리한 2차 기출문제입니다.`}
    >
      <PastExamRoundToggle active="second" />

      <LatestFilterForm
        search={{
          name: "q",
          placeholder: "본문 검색",
          defaultValue: filters.q,
        }}
        hasActive={filterActive}
        resetTo="/latest/essay"
      >
        <FilterSelect
          name="subject"
          ariaLabel="과목"
          defaultValue={filters.subject ?? ""}
          options={[
            { value: "", label: "전체 과목" },
            ...SECOND_EXAM_LAW_SLUGS.map((s) => ({
              value: s,
              label: LAW_SUBJECTS[s].name,
            })),
          ]}
        />
        <FilterSelect
          name="year"
          ariaLabel="년도"
          defaultValue={filters.year ? String(filters.year) : ""}
          options={[
            { value: "", label: "전체 년도" },
            ...yearOptions.map((y) => ({
              value: String(y),
              label: `${y}년`,
            })),
          ]}
        />
        <input
          type="search"
          name="keyword"
          defaultValue={filters.subjectiveKeyword ?? ""}
          placeholder="키워드 (정확 일치)"
          aria-label="키워드"
          className="border-input bg-background focus:border-primary h-9 w-36 rounded-full border px-3.5 text-xs outline-none"
        />
      </LatestFilterForm>

      {problems.length === 0 ? (
        <LatestEmpty
          icon={filterActive ? SearchXIcon : PenLineIcon}
          tone={filterActive ? "subdued" : "neutral"}
          title={
            filterActive
              ? "조건에 맞는 2차 기출문제가 없습니다"
              : "아직 등록된 2차 기출문제가 없습니다"
          }
          body={
            filterActive
              ? "검색어나 필터를 바꿔 다시 찾아보세요."
              : "새 2차 기출문제가 등록되면 이곳에 등록일 최신순으로 모입니다."
          }
        />
      ) : (
        <ListStack testid="latest-essay-list">
          {problems.map((p) => (
            <div key={p.problemId} className="relative">
              {isStaff ? (
                <Link
                  to={`/admin/problems/${p.problemId}`}
                  viewTransition
                  className="text-muted-foreground hover:text-link bg-card/80 absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold backdrop-blur-sm"
                >
                  <PencilIcon className="size-3.5" /> 수정
                </Link>
              ) : null}
              <FeedCardLink to={`/latest/essay/${p.problemId}${backQs}`}>
                <MetaRow right={relativeKo(p.createdAt)}>
                  <Pill tone="rose">
                    <PenLineIcon className="size-3" />
                    {lawName(p.lawCode)}
                  </Pill>
                  <Pill>
                    {ORIGIN_LABEL[p.origin as ProblemOrigin] ?? p.origin}
                  </Pill>
                  {p.year ? (
                    <Pill tone="outline" className="font-mono">
                      {p.year}
                      {p.problemNumber ? ` · ${p.problemNumber}번` : ""}
                    </Pill>
                  ) : null}
                  {p.subjectiveKind ? (
                    <Pill tone="primary">
                      {SUBJECTIVE_KIND_LABEL[p.subjectiveKind]}
                    </Pill>
                  ) : null}
                  {p.imageCount > 0 ? (
                    <Pill tone="outline">
                      <ImageIcon className="size-3" /> 그림 {p.imageCount}
                    </Pill>
                  ) : null}
                  {isRecent(p.createdAt) ? <NewBadge /> : null}
                </MetaRow>
                {p.subjectiveTopic ? (
                  <p className="text-[15px] leading-snug font-bold tracking-tight">
                    {p.subjectiveTopic}
                  </p>
                ) : null}
                <p className="text-foreground/80 mt-1 line-clamp-2 text-[13px] leading-relaxed">
                  {p.snippetParts.map((part, i) =>
                    part.t === "img" ? (
                      <img
                        key={i}
                        src={part.v}
                        alt="문제 도형"
                        className="border-border mx-0.5 inline-block h-6 rounded border bg-white px-0.5 align-text-bottom"
                      />
                    ) : (
                      <span key={i}>{part.v}</span>
                    ),
                  )}
                </p>
                <CardCta label="지금 풀어보기" />
              </FeedCardLink>
            </div>
          ))}
        </ListStack>
      )}
    </LatestShell>
  );
}
