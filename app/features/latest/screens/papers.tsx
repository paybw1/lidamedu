// 논문 피드 (feat-3-503). 모든 사용자 read-only. staff 일 때 추가/수정/삭제 + 링크 관리.
// /latest/papers — 검색·과목·중요 필터 + 페이지네이션. 각 카드에 관련 조문/판례 chip.

import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FilterXIcon,
  GavelIcon,
  NetworkIcon,
  NewspaperIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Form,
  Link,
  data,
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import type {
  PaperRelatedArticleChip,
  PaperRelatedCaseChip,
  PaperWithLinks,
} from "~/features/papers/labels";
import { listPapersWithLinks } from "~/features/papers/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/papers";

export const meta: Route.MetaFunction = () => [
  { title: "논문 | Lidam Edu" },
];

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

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NewspaperIcon className="size-3.5" /> 최신 정보
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">논문 · 학술 자료</h1>
          {canEdit && !showAdd ? (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <PlusIcon className="size-3.5" /> 논문 추가
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          {total}건
          {filters.subject ? ` · ${lawName(filters.subject)}` : ""}
          {filters.year ? ` · ${filters.year}년` : ""}
          {filters.importantOnly ? " · 중요 (★3+)" : ""}
          {filters.q ? ` · "${filters.q}" 검색` : ""}
        </p>
      </header>

      {canEdit && showAdd ? (
        <div className="mb-4">
          <PaperForm mode="create" onClose={() => setShowAdd(false)} />
        </div>
      ) : null}

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
            placeholder="제목·저자·출처·초록 검색"
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
            <Link to="/latest/papers">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        </div>
      ) : null}

      {papers.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {canEdit
              ? "등록된 논문이 없습니다. 상단 '논문 추가' 버튼으로 시작하세요."
              : "등록된 논문이 없습니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="latest-papers-list">
          {papers.map((p) => (
            <PaperCard key={p.paperId} paper={p} canEdit={canEdit} />
          ))}
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
                <ChevronRightIcon className="size-3" /> 다음
              </span>
            )}
          </Button>
        </div>
      ) : null}
    </div>
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
      <PaperForm
        mode="update"
        paper={paper}
        onClose={() => setEditing(false)}
      />
    );
  }

  const meta: string[] = [];
  if (paper.authors) meta.push(paper.authors);
  if (paper.source) meta.push(paper.source);
  if (paper.publishedAt) meta.push(paper.publishedAt);

  return (
    <Card className="hover:border-primary transition-colors">
      <CardHeader className="px-4 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="default" className="text-xs">
            <NewspaperIcon className="size-3" /> 논문
          </Badge>
          {paper.importance >= 3 ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <StarIcon className="size-3" /> ★{paper.importance}
            </Badge>
          ) : null}
          {paper.subjectLaws.map((s) => (
            <Badge key={s} variant="outline" className="text-xs">
              {lawName(s)}
            </Badge>
          ))}
          {paper.publishedAt ? (
            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {paper.publishedAt}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 text-sm">
        <div className="flex items-start gap-2">
          <FileTextIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="flex-1 font-medium leading-snug">{paper.title}</p>
          {canEdit ? (
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditing(true)}
                aria-label="수정"
                className="size-7"
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
                  className="size-7 text-rose-600 hover:text-rose-700"
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
        {meta.length > 0 ? (
          <p className="text-muted-foreground text-xs">{meta.join(" · ")}</p>
        ) : null}
        {paper.abstract ? (
          <p className="text-muted-foreground line-clamp-3 text-xs leading-relaxed">
            {paper.abstract}
          </p>
        ) : null}
        {paper.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {paper.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                #{t}
              </Badge>
            ))}
          </div>
        ) : null}

        {paper.articles.length + paper.cases.length > 0 ? (
          <div className="bg-muted/40 space-y-1.5 rounded-md border p-2">
            {paper.articles.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground inline-flex items-center gap-0.5 text-[10px] font-semibold tracking-wide uppercase">
                  <NetworkIcon className="size-3" /> 관련 조문
                </span>
                {paper.articles.map((a) => (
                  <ArticleChip key={a.articleId} chip={a} />
                ))}
              </div>
            ) : null}
            {paper.cases.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground inline-flex items-center gap-0.5 text-[10px] font-semibold tracking-wide uppercase">
                  <GavelIcon className="size-3" /> 관련 판례
                </span>
                {paper.cases.map((c) => (
                  <CaseChip key={c.caseId} chip={c} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5 pt-1">
          {paper.url ? (
            <Button asChild size="sm" variant="outline" className="h-7">
              <a href={paper.url} target="_blank" rel="noreferrer">
                <ExternalLinkIcon className="size-3" /> 외부 링크
              </a>
            </Button>
          ) : null}
          {paper.pdfUrl ? (
            <Button asChild size="sm" variant="outline" className="h-7">
              <a href={paper.pdfUrl} target="_blank" rel="noreferrer">
                <FileTextIcon className="size-3" /> PDF 열기
              </a>
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setManagingLinks((v) => !v)}
            >
              <NetworkIcon className="size-3" />
              {managingLinks ? "링크 관리 닫기" : "링크 관리"}
            </Button>
          ) : null}
        </div>

        {canEdit && managingLinks ? (
          <PaperLinksEditor paper={paper} />
        ) : null}
      </CardContent>
    </Card>
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
      className="hover:bg-accent inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px]"
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
      className="hover:bg-accent inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
      title={label}
    >
      <span className="font-mono">{chip.caseNumber}</span>
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
    <div className="bg-muted/30 space-y-3 rounded-md border p-3">
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
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
            className="h-7"
            disabled={addArticleFetcher.state !== "idle" || !articleDraft.trim()}
          >
            <PlusIcon className="size-3" /> 조문 추가
          </Button>
          {aErr ? <span className="text-rose-600 text-xs">{aErr}</span> : null}
        </addArticleFetcher.Form>
      </div>

      <div className="space-y-1.5">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
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
            className="h-7"
            disabled={addCaseFetcher.state !== "idle" || !caseDraft.trim()}
          >
            <PlusIcon className="size-3" /> 판례 추가
          </Button>
          {cErr ? <span className="text-rose-600 text-xs">{cErr}</span> : null}
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
      <span className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px]">
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

// 추가/수정 폼.
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
    <fetcher.Form
      method="post"
      action="/api/admin/paper"
      className="bg-card space-y-3 rounded-md border p-4"
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
            className="h-8 text-xs font-mono"
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
        <p className="text-rose-600 text-xs">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
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
