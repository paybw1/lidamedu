// 운영자 case ↔ article 매핑 도구.
// 매핑 0건 우선 + 검색 + 페이지네이션. 각 case 카드에 article_number 추가/삭제 폼.

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GavelIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { Form, Link, data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { COURT_LABELS, type CaseCourt } from "~/features/cases/labels";
import {
  listCasesForMapper,
  type CaseMapperRow,
} from "~/features/admin/queries/case-mapper.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-cases";

export const meta: Route.MetaFunction = () => [
  { title: "판례 매핑 관리 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const lawCodeRaw = url.searchParams.get("law") ?? "patent";
  const lawCode = (LAW_SUBJECT_SLUGS as readonly string[]).includes(lawCodeRaw)
    ? (lawCodeRaw as LawSubjectSlug)
    : "patent";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const onlyUnmapped = url.searchParams.get("only_unmapped") !== "0";
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const result = await listCasesForMapper(client, {
    lawCode,
    query: q || undefined,
    onlyUnmapped,
    page,
    pageSize: 30,
  });
  return { ...result, lawCode, q, onlyUnmapped, role };
}

export default function AdminCases({ loaderData }: Route.ComponentProps) {
  const {
    items,
    total,
    unmappedTotal,
    page,
    pageSize,
    lawCode,
    q,
    onlyUnmapped,
  } = loaderData;
  const subjectName = LAW_SUBJECTS[lawCode].name;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const baseSp = new URLSearchParams();
  baseSp.set("law", lawCode);
  if (q) baseSp.set("q", q);
  if (!onlyUnmapped) baseSp.set("only_unmapped", "0");
  const makePage = (n: number) => {
    const sp = new URLSearchParams(baseSp);
    if (n !== 1) sp.set("page", String(n));
    return `?${sp.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 운영자 메뉴
      </Link>
      <header className="mb-5 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <GavelIcon className="size-3.5" /> 판례 매핑 관리
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {subjectName} 판례 ↔ 조문 매핑
        </h1>
        <p className="text-muted-foreground text-sm">
          관련 조문이 자동 추출되지 않은 판례를 수동 매핑합니다. 매핑은 즉시
          반영되어 조문 viewer / case viewer 양측에서 보입니다.
        </p>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="현재 결과" value={String(total)} />
        <KpiCard label="매핑 0건 case" value={String(unmappedTotal)} warn={unmappedTotal > 0} />
        <KpiCard label="페이지" value={`${page}/${totalPages}`} />
      </div>

      <Form method="get" className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input type="hidden" name="law" value={lawCode} />
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="사건번호·사건명·요지 검색"
            className="pl-9"
          />
        </div>
        <label className="border-input flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
          <input
            type="checkbox"
            name="only_unmapped"
            value="1"
            defaultChecked={onlyUnmapped}
            className="size-3.5"
          />
          매핑 0건만
        </label>
        <select
          name="law"
          defaultValue={lawCode}
          className="border-input bg-background h-9 rounded-md border px-2 text-xs"
        >
          {LAW_SUBJECT_SLUGS.map((s) => (
            <option key={s} value={s}>
              {LAW_SUBJECTS[s].name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" className="h-9">
          적용
        </Button>
      </Form>

      {items.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            조건에 해당하는 판례가 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <CaseMapperCard key={c.caseId} item={c} lawCode={lawCode} />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs">
          <Button
            asChild={page > 1}
            variant="outline"
            size="sm"
            disabled={page <= 1}
            className="h-7"
          >
            {page > 1 ? (
              <Link to={makePage(page - 1)}>
                <ChevronLeftIcon className="size-3" /> 이전
              </Link>
            ) : (
              <span>
                <ChevronLeftIcon className="size-3" /> 이전
              </span>
            )}
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            asChild={page < totalPages}
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            className="h-7"
          >
            {page < totalPages ? (
              <Link to={makePage(page + 1)}>
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

function KpiCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <p
          className={
            "mt-1 text-2xl font-bold tabular-nums " +
            (warn ? "text-amber-600 dark:text-amber-400" : "")
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function CaseMapperCard({
  item,
  lawCode,
}: {
  item: CaseMapperRow;
  lawCode: LawSubjectSlug;
}) {
  const addFetcher = useFetcher<{ ok?: true; error?: string }>();
  const [draft, setDraft] = useState("");
  const isSaving = addFetcher.state !== "idle";
  const hasError = addFetcher.data && "error" in addFetcher.data;

  return (
    <Card>
      <CardHeader className="px-4 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-xs">
            {COURT_LABELS[item.court as CaseCourt] ?? item.court}
          </Badge>
          <Badge variant="outline" className="text-xs tabular-nums font-mono">
            {item.caseNumber}
          </Badge>
          {item.caseType ? (
            <Badge variant="secondary" className="text-xs">
              {item.caseType}
            </Badge>
          ) : null}
          {item.importance >= 3 ? (
            <Badge className="bg-amber-500 text-white text-xs">★3</Badge>
          ) : null}
          {item.linkCount === 0 ? (
            <Badge variant="destructive" className="text-xs">
              미매핑
            </Badge>
          ) : (
            <Badge className="bg-emerald-600 text-white text-xs">
              <CheckCircle2Icon className="size-3" /> {item.linkCount}건
            </Badge>
          )}
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {item.decidedAt}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        <Link
          to={`/subjects/${lawCode}/cases/${item.caseId}`}
          viewTransition
          className="hover:text-primary block text-sm font-medium"
        >
          {item.summaryTitle ?? item.caseTitle}
        </Link>

        {item.articleNumbers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {item.articleNumbers.map((n) => (
              <ArticleChip
                key={n}
                articleNumber={n}
                caseId={item.caseId}
                lawCode={lawCode}
              />
            ))}
          </div>
        ) : null}

        <addFetcher.Form
          method="post"
          action="/api/admin/case-link"
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            const trimmed = draft.trim();
            if (!trimmed) {
              e.preventDefault();
              return;
            }
          }}
          // 성공 시 draft 비우기.
          onChange={() => {
            if (addFetcher.data && "ok" in addFetcher.data) {
              // ignore — managed by useEffect not used here for brevity
            }
          }}
        >
          <input type="hidden" name="intent" value="add" />
          <input type="hidden" name="caseId" value={item.caseId} />
          <input type="hidden" name="lawCode" value={lawCode} />
          <Input
            name="articleNumber"
            placeholder='조문 번호 — 예: 29 / 29의2'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8 w-40 text-xs"
            disabled={isSaving}
          />
          <Button type="submit" size="sm" className="h-8" disabled={isSaving || !draft.trim()}>
            <PlusIcon className="size-3.5" /> 매핑 추가
          </Button>
          {hasError ? (
            <span className="text-rose-600 text-xs">
              {(addFetcher.data as { error: string }).error}
            </span>
          ) : null}
          {addFetcher.data && "ok" in addFetcher.data ? (
            <span className="text-emerald-600 text-xs">
              저장됨 — 새로고침으로 갱신
            </span>
          ) : null}
        </addFetcher.Form>
      </CardContent>
    </Card>
  );
}

function ArticleChip({
  articleNumber,
  caseId,
  lawCode,
}: {
  articleNumber: string;
  caseId: string;
  lawCode: LawSubjectSlug;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const removed = fetcher.data && "ok" in fetcher.data && fetcher.data.ok;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs " +
        (removed ? "opacity-50 line-through" : "")
      }
    >
      <Link
        to={`/subjects/${lawCode}/articles/${articleNumber}`}
        viewTransition
        className="hover:text-primary"
      >
        제{articleNumber}조
      </Link>
      <fetcher.Form method="post" action="/api/admin/case-link">
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="caseId" value={caseId} />
        <input type="hidden" name="lawCode" value={lawCode} />
        <input type="hidden" name="articleNumber" value={articleNumber} />
        <button
          type="submit"
          aria-label="매핑 삭제"
          className="text-muted-foreground hover:text-rose-600"
          disabled={fetcher.state !== "idle"}
        >
          <XIcon className="size-3" />
        </button>
      </fetcher.Form>
    </span>
  );
}
