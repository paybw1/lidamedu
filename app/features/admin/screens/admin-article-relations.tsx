// 조문 단위 연관관계 일괄 편집 (feat-7-008). P5 WORKSPACE 패턴.
// /admin/relations/article/:lawCode/:articleNumber

import {
  GavelIcon,
  ListChecksIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { getArticleRelations } from "~/features/admin/queries/article-relations.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-article-relations";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d) return [{ title: "연관관계 편집 | Lidam Patent Attorney Academy" }];
  return [
    {
      title: `${d.relations?.article.displayLabel ?? "조문"} 연관관계 | Lidam Patent Attorney Academy`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const subjectParse = lawSubjectSlugSchema.safeParse(params.lawCode);
  if (!subjectParse.success) throw data("Unknown subject", { status: 404 });
  const lawCode = subjectParse.data;
  const articleNumber = params.articleNumber;
  if (!articleNumber) throw data("Missing articleNumber", { status: 404 });
  const relations = await getArticleRelations(client, lawCode, articleNumber);
  if (!relations) throw data("Article not found", { status: 404 });
  return { relations, role };
}

export default function AdminArticleRelations({
  loaderData,
}: Route.ComponentProps) {
  const { relations, role } = loaderData;
  const subject = LAW_SUBJECTS[relations.lawCode];

  return (
    <AdminShell
      cluster="relations"
      role={role}
      title={relations.article.displayLabel}
      desc={`${subject.name} · 관련 판례 ${relations.cases.length}건 · 관련 문제 ${relations.problems.length}건`}
      width={960}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 관련 판례 패널 */}
        <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
          <div className="border-border bg-muted/60 flex items-center gap-1.5 border-b px-4 py-3">
            <GavelIcon className="text-link size-4" />
            <h2 className="text-sm font-semibold">관련 판례</h2>
            <span className="text-muted-foreground ml-auto tabular-nums text-[11px]">
              {relations.cases.length}건
            </span>
          </div>
          <div className="p-3 space-y-2">
            <AddCaseLink
              lawCode={relations.lawCode}
              articleNumber={relations.article.articleNumber}
            />
            {relations.cases.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-xs">
                매핑된 판례가 없습니다.
              </p>
            ) : (
              relations.cases.map((c) => (
                <CaseRow
                  key={c.caseId}
                  lawCode={relations.lawCode}
                  articleNumber={relations.article.articleNumber}
                  caseId={c.caseId}
                  caseNumber={c.caseNumber}
                  caseTitle={c.caseTitle}
                  importance={c.importance}
                  decidedAt={c.decidedAt}
                  relationType={c.relationType}
                />
              ))
            )}
          </div>
        </div>

        {/* 관련 문제 패널 */}
        <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
          <div className="border-border bg-muted/60 flex items-center gap-1.5 border-b px-4 py-3">
            <ListChecksIcon className="text-link size-4" />
            <h2 className="text-sm font-semibold">관련 문제</h2>
            <span className="text-muted-foreground ml-auto tabular-nums text-[11px]">
              {relations.problems.length}건
            </span>
          </div>
          <div className="p-3 space-y-2">
            {relations.problems.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-xs">
                매핑된 문제가 없습니다.
              </p>
            ) : (
              relations.problems.map((p) => (
                <Link
                  key={`${p.problemId}-${p.via}`}
                  to={`/admin/problems/${p.problemId}`}
                  viewTransition
                  className="hover:bg-muted flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors"
                >
                  <Chip
                    tone={p.via === "primary" ? "blue" : "neutral"}
                    className="mt-0.5 shrink-0"
                  >
                    {p.via === "primary" ? "primary" : `판례 ${p.viaCaseNumber}`}
                  </Chip>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      {p.year ? (
                        <span className="font-medium tabular-nums">
                          {p.year}
                          {p.problemNumber ? `·${p.problemNumber}` : ""}
                        </span>
                      ) : null}
                      <Chip tone="neutral">{p.format}</Chip>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {p.bodySnippet}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

/* ── 판례 행 ──────────────────────────────────────────────────────────── */

function CaseRow({
  lawCode,
  articleNumber,
  caseId,
  caseNumber,
  caseTitle,
  importance,
  decidedAt,
  relationType,
}: {
  lawCode: string;
  articleNumber: string;
  caseId: string;
  caseNumber: string;
  caseTitle: string | null;
  importance: number;
  decidedAt: string | null;
  relationType: string | null;
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
  }, [
    fetcher.state,
    fetcher.data,
    navigate,
    location.pathname,
    location.search,
  ]);
  return (
    <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
      <Link
        to={`/subjects/${lawCode}/cases/${caseId}`}
        viewTransition
        className="hover:text-link flex-1 space-y-0.5"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-medium tabular-nums">{caseNumber}</span>
          {importance >= 3 ? <Chip tone="blue">중요</Chip> : null}
          {relationType ? (
            <Chip tone="neutral">{relationType}</Chip>
          ) : null}
        </div>
        {caseTitle ? (
          <p className="text-muted-foreground line-clamp-1">{caseTitle}</p>
        ) : null}
        {decidedAt ? (
          <p className="text-muted-foreground text-[10px] tabular-nums">{decidedAt}</p>
        ) : null}
      </Link>
      <fetcher.Form method="post" action="/api/admin/case-link">
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="caseId" value={caseId} />
        <input type="hidden" name="lawCode" value={lawCode} />
        <input type="hidden" name="articleNumber" value={articleNumber} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="h-6 text-rose-600 hover:text-rose-700"
          disabled={fetcher.state !== "idle"}
          onClick={(e) => {
            if (!confirm(`판례 ${caseNumber} 매핑을 제거하시겠습니까?`)) {
              e.preventDefault();
            }
          }}
        >
          <Trash2Icon className="size-3" />
        </Button>
      </fetcher.Form>
    </div>
  );
}

/* ── 판례 추가 검색 폼 ────────────────────────────────────────────────── */

function AddCaseLink({
  lawCode,
  articleNumber,
}: {
  lawCode: string;
  articleNumber: string;
}) {
  const [query, setQuery] = useState("");
  const searchFetcher = useFetcher<{
    results: {
      caseId: string;
      caseNumber: string;
      caseTitle: string | null;
      importance: number;
    }[];
  }>();
  const linkFetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      linkFetcher.state === "idle" &&
      linkFetcher.data &&
      "ok" in linkFetcher.data &&
      linkFetcher.data.ok
    ) {
      setQuery("");
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [
    linkFetcher.state,
    linkFetcher.data,
    navigate,
    location.pathname,
    location.search,
  ]);

  const results = searchFetcher.data?.results ?? [];

  return (
    <div className="rounded-lg border border-dashed p-2.5 space-y-2">
      <div className="grid gap-1.5 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="판례 번호·제목으로 검색 (2자 이상)"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={
            query.trim().length < 2 || searchFetcher.state !== "idle"
          }
          onClick={() => {
            searchFetcher.load(
              `/api/admin/article-relation-search?law=${lawCode}&q=${encodeURIComponent(query)}`,
            );
          }}
        >
          검색
        </Button>
      </div>
      {results.length > 0 ? (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {results.map((c) => (
            <linkFetcher.Form
              key={c.caseId}
              method="post"
              action="/api/admin/case-link"
              className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 transition-colors"
            >
              <input type="hidden" name="intent" value="add" />
              <input type="hidden" name="caseId" value={c.caseId} />
              <input type="hidden" name="lawCode" value={lawCode} />
              <input type="hidden" name="articleNumber" value={articleNumber} />
              <span className="flex-1 truncate text-xs">
                <span className="font-medium tabular-nums">{c.caseNumber}</span>
                {c.caseTitle ? (
                  <span className="text-muted-foreground ml-1.5">{c.caseTitle}</span>
                ) : null}
              </span>
              {c.importance >= 3 ? <Chip tone="blue">중요</Chip> : null}
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="h-6 text-[10px]"
                disabled={linkFetcher.state !== "idle"}
              >
                <PlusIcon className="size-2.5" /> 매핑
              </Button>
            </linkFetcher.Form>
          ))}
        </div>
      ) : null}
    </div>
  );
}
