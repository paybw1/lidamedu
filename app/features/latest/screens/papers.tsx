// 논문 피드 (feat-3-503). 모든 사용자 read-only. staff 일 때 추가/수정/삭제 + 링크 관리.
// /latest/papers — 검색·과목·중요 필터 + 페이지네이션. 각 카드에 관련 조문/판례 chip.
// 키트 lidam-latest/PapersScreen 디자인.

import {
  ArrowRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GavelIcon,
  NetworkIcon,
  PencilIcon,
  PlusIcon,
  SearchXIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  data,
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  FeedCard,
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
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import type {
  PaperRelatedArticleChip,
  PaperRelatedCaseChip,
  PaperWithLinks,
} from "~/features/papers/labels";
import { listPapersWithLinks } from "~/features/papers/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/papers";

export const meta: Route.MetaFunction = () => [{ title: "논문 | Lidam Patent Attorney Academy" }];

interface PaperFilters {
  q: string;
  subject?: LawSubjectSlug;
  importantOnly: boolean;
  year?: number;
  page: number;
  pageSize: number;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const role = await getStaffRole(client, user.id);

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject");
  const subject =
    subjectParam &&
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(subjectParam)
      ? (subjectParam as LawSubjectSlug)
      : undefined;
  const importantOnly = url.searchParams.get("important") === "1";
  const yearRaw = url.searchParams.get("year");
  const year =
    yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : undefined;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const filters: PaperFilters = {
    q,
    subject,
    importantOnly,
    year,
    page,
    pageSize: 20,
  };

  const { items, total } = await listPapersWithLinks(client, {
    query: filters.q || undefined,
    subject: filters.subject,
    importantOnly: filters.importantOnly,
    year: filters.year,
    page: filters.page,
    pageSize: filters.pageSize,
  });

  return {
    papers: items,
    total,
    filters,
    canEdit: role !== null,
  };
}

function lawName(slug: LawSubjectSlug): string {
  return LAW_SUBJECTS[slug].name;
}

export default function LatestPapers({ loaderData }: Route.ComponentProps) {
  const { papers, total, filters, canEdit } = loaderData;
  const [showAdd, setShowAdd] = useState(false);
  const filterActive =
    !!filters.subject ||
    filters.importantOnly ||
    !!filters.year ||
    filters.q !== "";
  // 빠른 year 옵션 — 최근 12년.
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 13 }, (_, i) => currentYear - i);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  const makeUrl = (overrides: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    if (filters.subject) sp.set("subject", filters.subject);
    if (filters.importantOnly) sp.set("important", "1");
    if (filters.year) sp.set("year", String(filters.year));
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
  if (filters.subject) descParts.push(lawName(filters.subject));
  if (filters.year) descParts.push(`${filters.year}년`);
  if (filters.importantOnly) descParts.push("중요 ★3+");
  if (filters.q) descParts.push(`"${filters.q}" 검색`);

  return (
    <LatestShell
      category="papers"
      width="feed"
      title="논문 · 학술 자료"
      desc={`${descParts.join(" · ")} — 발행일 최신순으로 모은 논문·학술 자료입니다.`}
      headerRight={
        canEdit && !showAdd ? (
          <Button
            size="sm"
            className="h-9 rounded-full"
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon className="size-3.5" /> 논문 추가
          </Button>
        ) : undefined
      }
    >
      {canEdit && showAdd ? (
        <div className="mb-3.5">
          <PaperForm mode="create" onClose={() => setShowAdd(false)} />
        </div>
      ) : null}

      <LatestFilterForm
        search={{
          name: "q",
          placeholder: "제목·저자·출처·초록 검색",
          defaultValue: filters.q,
        }}
        hasActive={filterActive}
        resetTo="/latest/papers"
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
        <FilterCheckbox name="important" defaultChecked={filters.importantOnly}>
          중요만 ★3+
        </FilterCheckbox>
      </LatestFilterForm>

      {papers.length === 0 ? (
        <LatestEmpty
          icon={filterActive ? SearchXIcon : FileTextIcon}
          tone={filterActive ? "subdued" : "neutral"}
          title={
            filterActive
              ? "조건에 맞는 논문이 없습니다"
              : "아직 등록된 논문이 없습니다"
          }
          body={
            filterActive
              ? "검색어나 필터를 바꿔 다시 찾아보세요."
              : canEdit
                ? "상단 '논문 추가' 버튼으로 첫 자료를 등록하세요."
                : "새 논문·학술 자료가 등록되면 이곳에 모입니다."
          }
        />
      ) : (
        <ListStack testid="latest-papers-list">
          {papers.map((p) => (
            <PaperCard key={p.paperId} paper={p} canEdit={canEdit} />
          ))}
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

function PaperCard({
  paper,
  canEdit,
}: {
  paper: PaperWithLinks;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [managingLinks, setManagingLinks] = useState(false);
  const delFetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      delFetcher.state === "idle" &&
      delFetcher.data &&
      "ok" in delFetcher.data &&
      delFetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [delFetcher.state, delFetcher.data, navigate, location.pathname, location.search]);

  if (editing) {
    return (
      <PaperForm mode="update" paper={paper} onClose={() => setEditing(false)} />
    );
  }

  const metaParts: string[] = [];
  if (paper.authors) metaParts.push(paper.authors);
  if (paper.source) metaParts.push(paper.source);
  if (paper.publishedAt) metaParts.push(paper.publishedAt);

  return (
    <FeedCard>
      <MetaRow
        right={paper.publishedAt ? relativeKo(paper.publishedAt) : undefined}
      >
        <Pill tone="sky">
          <FileTextIcon className="size-3" /> 논문
        </Pill>
        {paper.importance >= 3 ? (
          <Pill tone="amber">★ {paper.importance}</Pill>
        ) : null}
        {paper.subjectLaws.map((s) => (
          <Pill key={s} tone="outline">
            {lawName(s)}
          </Pill>
        ))}
        {isRecent(paper.publishedAt) ? <NewBadge /> : null}
      </MetaRow>

      <div className="flex items-start gap-2">
        <p className="flex-1 text-[15px] leading-snug font-bold tracking-tight">
          {paper.title}
        </p>
        {canEdit ? (
          <div className="flex shrink-0 gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setEditing(true)}
              aria-label="수정"
              className="size-8 rounded-full"
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <delFetcher.Form method="post" action="/api/admin/paper">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="paperId" value={paper.paperId} />
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                aria-label="삭제"
                className="size-8 rounded-full text-rose-600 hover:text-rose-700"
                disabled={delFetcher.state !== "idle"}
                onClick={(e) => {
                  if (!confirm(`"${paper.title}" 논문을 삭제하시겠습니까?`)) {
                    e.preventDefault();
                  }
                }}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </delFetcher.Form>
          </div>
        ) : null}
      </div>

      {metaParts.length > 0 ? (
        <p className="text-muted-foreground mt-1 text-xs">
          {metaParts.join(" · ")}
        </p>
      ) : null}
      {paper.abstract ? (
        <p className="text-foreground/80 mt-1.5 line-clamp-3 text-[13px] leading-relaxed">
          {paper.abstract}
        </p>
      ) : null}
      {paper.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {paper.tags.map((t) => (
            <Pill key={t} tone="neutral">
              #{t}
            </Pill>
          ))}
        </div>
      ) : null}

      {paper.articles.length + paper.cases.length > 0 ? (
        <div className="bg-muted/50 mt-2.5 space-y-1.5 rounded-xl p-2.5">
          {paper.articles.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase">
                <NetworkIcon className="size-3" /> 관련 조문
              </span>
              {paper.articles.map((a) => (
                <ArticleChip key={a.articleId} chip={a} />
              ))}
            </div>
          ) : null}
          {paper.cases.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold tracking-[0.04em] uppercase">
                <GavelIcon className="size-3" /> 관련 판례
              </span>
              {paper.cases.map((c) => (
                <CaseChip key={c.caseId} chip={c} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {paper.url ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 rounded-full"
          >
            <a href={paper.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="size-3" /> 외부 링크
            </a>
          </Button>
        ) : null}
        {paper.pdfUrl ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 rounded-full"
          >
            <a href={paper.pdfUrl} target="_blank" rel="noreferrer">
              <FileTextIcon className="size-3" /> PDF 열기
            </a>
          </Button>
        ) : null}
        {paper.pdfPath ? <PdfDownloadButton paperId={paper.paperId} /> : null}
        {canEdit ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-full"
            onClick={() => setManagingLinks((v) => !v)}
          >
            <NetworkIcon className="size-3" />
            {managingLinks ? "링크 관리 닫기" : "링크 관리"}
          </Button>
        ) : null}
      </div>

      {canEdit && managingLinks ? <PaperLinksEditor paper={paper} /> : null}
    </FeedCard>
  );
}

function ArticleChip({ chip }: { chip: PaperRelatedArticleChip }) {
  const href = chip.articleNumber
    ? `/subjects/${chip.lawCode}/articles/${chip.articleNumber}`
    : `/subjects/${chip.lawCode}/chapters/${chip.articleId}`;
  return (
    <Link
      to={href}
      viewTransition
      className="border-border bg-background hover:border-primary/40 hover:text-primary inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors"
    >
      {chip.displayLabel}
    </Link>
  );
}

function CaseChip({ chip }: { chip: PaperRelatedCaseChip }) {
  const subj = chip.primarySubject ?? "patent";
  const label = chip.summaryTitle ?? chip.caseTitle;
  return (
    <Link
      to={`/subjects/${subj}/cases/${chip.caseId}`}
      viewTransition
      className="border-border bg-background hover:border-primary/40 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors"
      title={label}
    >
      <span className="font-mono font-medium">{chip.caseNumber}</span>
      <span className="text-muted-foreground max-w-[200px] truncate">
        {label}
      </span>
    </Link>
  );
}

// 링크 추가/삭제 UI — staff 만 노출.
function PaperLinksEditor({ paper }: { paper: PaperWithLinks }) {
  const [articleDraft, setArticleDraft] = useState("");
  const [articleLaw, setArticleLaw] = useState<LawSubjectSlug>(
    paper.subjectLaws[0] ?? "patent",
  );
  const [caseDraft, setCaseDraft] = useState("");
  const addArticleFetcher = useFetcher<{ ok?: true; error?: string }>();
  const addCaseFetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const revalidate = () => {
    navigate(location.pathname + location.search, {
      replace: true,
      preventScrollReset: true,
    });
  };
  useEffect(() => {
    if (
      addArticleFetcher.state === "idle" &&
      addArticleFetcher.data &&
      "ok" in addArticleFetcher.data &&
      addArticleFetcher.data.ok
    ) {
      setArticleDraft("");
      revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addArticleFetcher.state, addArticleFetcher.data]);
  useEffect(() => {
    if (
      addCaseFetcher.state === "idle" &&
      addCaseFetcher.data &&
      "ok" in addCaseFetcher.data &&
      addCaseFetcher.data.ok
    ) {
      setCaseDraft("");
      revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addCaseFetcher.state, addCaseFetcher.data]);

  const aErr =
    addArticleFetcher.data && "error" in addArticleFetcher.data
      ? addArticleFetcher.data.error
      : null;
  const cErr =
    addCaseFetcher.data && "error" in addCaseFetcher.data
      ? addCaseFetcher.data.error
      : null;

  return (
    <div className="bg-muted/50 mt-2.5 space-y-3 rounded-xl p-3">
      <div className="space-y-1.5">
        <p className="text-muted-foreground font-mono text-[10px] font-semibold tracking-[0.04em] uppercase">
          관련 조문
        </p>
        <div className="flex flex-wrap gap-1.5">
          {paper.articles.map((a) => (
            <RemoveChip
              key={a.articleId}
              kind="article"
              paperId={paper.paperId}
              targetId={a.articleId}
              label={a.displayLabel}
            />
          ))}
        </div>
        <addArticleFetcher.Form
          method="post"
          action="/api/admin/paper-link"
          className="flex flex-wrap items-center gap-1.5"
        >
          <input type="hidden" name="intent" value="add_article" />
          <input type="hidden" name="paperId" value={paper.paperId} />
          <select
            name="lawCode"
            value={articleLaw}
            onChange={(e) => setArticleLaw(e.target.value as LawSubjectSlug)}
            className="border-input bg-background h-7 rounded-md border px-2 text-xs"
          >
            {LAW_SUBJECT_SLUGS.map((s) => (
              <option key={s} value={s}>
                {LAW_SUBJECTS[s].name}
              </option>
            ))}
          </select>
          <Input
            name="articleNumber"
            value={articleDraft}
            onChange={(e) => setArticleDraft(e.target.value)}
            placeholder="조문 — 예: 29 / 29의2"
            className="h-7 w-40 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            className="h-7 rounded-full"
            disabled={addArticleFetcher.state !== "idle" || !articleDraft.trim()}
          >
            <PlusIcon className="size-3" /> 조문 추가
          </Button>
          {aErr ? <span className="text-xs text-rose-600">{aErr}</span> : null}
        </addArticleFetcher.Form>
      </div>

      <div className="space-y-1.5">
        <p className="text-muted-foreground font-mono text-[10px] font-semibold tracking-[0.04em] uppercase">
          관련 판례
        </p>
        <div className="flex flex-wrap gap-1.5">
          {paper.cases.map((c) => (
            <RemoveChip
              key={c.caseId}
              kind="case"
              paperId={paper.paperId}
              targetId={c.caseId}
              label={`${c.caseNumber} ${c.summaryTitle ?? c.caseTitle}`}
            />
          ))}
        </div>
        <addCaseFetcher.Form
          method="post"
          action="/api/admin/paper-link"
          className="flex flex-wrap items-center gap-1.5"
        >
          <input type="hidden" name="intent" value="add_case" />
          <input type="hidden" name="paperId" value={paper.paperId} />
          <Input
            name="caseNumber"
            value={caseDraft}
            onChange={(e) => setCaseDraft(e.target.value)}
            placeholder="사건번호 — 예: 2022후10524"
            className="h-7 w-44 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            className="h-7 rounded-full"
            disabled={addCaseFetcher.state !== "idle" || !caseDraft.trim()}
          >
            <PlusIcon className="size-3" /> 판례 추가
          </Button>
          {cErr ? <span className="text-xs text-rose-600">{cErr}</span> : null}
        </addCaseFetcher.Form>
      </div>
    </div>
  );
}

function RemoveChip({
  kind,
  paperId,
  targetId,
  label,
}: {
  kind: "article" | "case";
  paperId: string;
  targetId: string;
  label: string;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  const intent = kind === "article" ? "remove_article" : "remove_case";
  const idField = kind === "article" ? "articleId" : "caseId";
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/paper-link"
      className="inline-flex"
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="paperId" value={paperId} />
      <input type="hidden" name={idField} value={targetId} />
      <span className="border-border bg-background inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
        <span className="max-w-[280px] truncate">{label}</span>
        <button
          type="submit"
          aria-label="삭제"
          className="text-muted-foreground hover:text-rose-600"
          disabled={fetcher.state !== "idle"}
        >
          <XIcon className="size-3" />
        </button>
      </span>
    </fetcher.Form>
  );
}

// 추가/수정 폼 — 카드 위에 펼침 (brief §5.8).
function PaperForm({
  mode,
  paper,
  onClose,
}: {
  mode: "create" | "update";
  paper?: PaperWithLinks;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data;

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, onClose, navigate, location.pathname, location.search]);

  return (
    <>
    <fetcher.Form
      method="post"
      action="/api/admin/paper"
      className="border-border bg-card space-y-3 rounded-2xl border p-4 shadow-sm"
    >
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="paperId" value={paper!.paperId} />
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr]">
        <Field label="제목 *">
          <Input
            name="title"
            required
            maxLength={500}
            defaultValue={paper?.title ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="저자">
          <Input
            name="authors"
            maxLength={500}
            defaultValue={paper?.authors ?? ""}
            className="h-8 text-xs"
            placeholder="예: 홍길동 / 홍길동 외 2인"
          />
        </Field>
        <Field label="출처">
          <Input
            name="source"
            maxLength={500}
            defaultValue={paper?.source ?? ""}
            className="h-8 text-xs"
            placeholder="예: 산업재산권 학회 vol.32 (2024)"
          />
        </Field>
        <Field label="발행일">
          <Input
            name="publishedAt"
            type="date"
            defaultValue={paper?.publishedAt ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="중요도">
          <select
            name="importance"
            defaultValue={paper?.importance ?? 1}
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
          >
            <option value="1">1 — 일반</option>
            <option value="2">2 — 중요</option>
            <option value="3">3 — 핵심</option>
          </select>
        </Field>
        <Field label="과목">
          <Input
            name="subjectLaws"
            defaultValue={paper?.subjectLaws.join(",") ?? ""}
            className="h-8 font-mono text-xs"
            placeholder="예: patent,trademark — 콤마 구분"
          />
        </Field>
        <Field label="태그">
          <Input
            name="tags"
            defaultValue={paper?.tags.join(",") ?? ""}
            className="h-8 text-xs"
            placeholder="콤마 구분 (최대 20)"
          />
        </Field>
        <Field label="외부 링크">
          <Input
            name="url"
            type="url"
            maxLength={2000}
            defaultValue={paper?.url ?? ""}
            className="h-8 text-xs"
            placeholder="https://"
          />
        </Field>
        <Field label="PDF URL">
          <Input
            name="pdfUrl"
            type="url"
            maxLength={2000}
            defaultValue={paper?.pdfUrl ?? ""}
            className="h-8 text-xs"
            placeholder="Supabase Storage 또는 외부 PDF URL"
          />
        </Field>
        <Field label="초록">
          <textarea
            name="abstract"
            maxLength={5000}
            defaultValue={paper?.abstract ?? ""}
            rows={4}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
            placeholder="초록/요약"
          />
        </Field>
      </div>
      {hasError ? (
        <p className="text-xs text-rose-600">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button
          type="submit"
          size="sm"
          className="rounded-full"
          disabled={isSaving}
        >
          {mode === "create" ? (
            <>
              <PlusIcon className="size-3.5" /> 추가
            </>
          ) : (
            <>
              <ArrowRightIcon className="size-3.5" /> 저장
            </>
          )}
        </Button>
      </div>
    </fetcher.Form>
    {/* feat-3-504 — PDF 첨부는 form 중첩 회피 위해 fetcher.Form 형제로 렌더. */}
    {mode === "update" && paper ? (
      <PdfAttachSection paperId={paper.paperId} currentPath={paper.pdfPath} />
    ) : null}
    </>
  );
}

function PdfAttachSection({
  paperId,
  currentPath,
}: {
  paperId: string;
  currentPath: string | null;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const submitting = fetcher.state !== "idle";
  return (
    <div className="border-border/60 mt-4 rounded-xl border-dashed border bg-muted/20 p-3">
      <p className="text-foreground text-xs font-semibold">
        <FileTextIcon className="mr-1 inline size-3" /> PDF 첨부 (Supabase Storage)
      </p>
      <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
        외부 링크 대신 PDF 를 직접 업로드합니다(최대 20MB). 학생은 "첨부 PDF"
        버튼으로 5분 signed URL 로 열람.
      </p>
      {currentPath ? (
        <div className="text-muted-foreground mt-2 text-[11px]">
          현재 파일: <code className="text-foreground">{currentPath}</code>
        </div>
      ) : null}
      <fetcher.Form
        method="post"
        encType="multipart/form-data"
        action="/api/admin/paper-pdf"
        className="mt-2 flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="paperId" value={paperId} />
        <input
          type="file"
          name="file"
          accept="application/pdf"
          required
          className="text-xs"
        />
        <Button
          type="submit"
          name="intent"
          value="upload"
          size="sm"
          disabled={submitting}
          className="h-7 rounded-full px-3 text-xs"
        >
          업로드
        </Button>
        {currentPath ? (
          <Button
            type="submit"
            name="intent"
            value="delete"
            size="sm"
            variant="ghost"
            disabled={submitting}
            className="h-7 rounded-full px-3 text-xs text-rose-600 hover:text-rose-700"
            onClick={(e) => {
              if (!confirm("첨부 PDF 를 삭제할까요?")) e.preventDefault();
            }}
          >
            삭제
          </Button>
        ) : null}
        {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
          <span className="text-xs text-rose-600">{fetcher.data.error}</span>
        ) : null}
        {fetcher.data && "ok" in fetcher.data && fetcher.data.ok ? (
          <span className="text-xs text-emerald-600">완료</span>
        ) : null}
      </fetcher.Form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Label className="text-muted-foreground text-[11px] sm:self-center">
        {label}
      </Label>
      {children}
    </>
  );
}

// feat-3-504 — pdf_path 가 있는 논문은 signed URL fetch 해서 새 탭 열기.
function PdfDownloadButton({ paperId }: { paperId: string }) {
  const [loading, setLoading] = useState(false);
  async function handle() {
    if (loading) return;
    setLoading(true);
    try {
      const resp = await fetch(`/papers/signed-url?paperId=${paperId}`);
      const json = (await resp.json()) as { url?: string; error?: string };
      if (json.url) {
        window.open(json.url, "_blank", "noopener,noreferrer");
      } else {
        alert(json.error ?? "PDF 를 불러올 수 없습니다");
      }
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button
      type="button"
      onClick={handle}
      disabled={loading}
      size="sm"
      variant="outline"
      className="h-8 rounded-full"
    >
      <FileTextIcon className="size-3" />
      {loading ? "여는 중…" : "첨부 PDF"}
    </Button>
  );
}
