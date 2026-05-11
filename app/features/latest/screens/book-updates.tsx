// 도서 추록/정오표 피드 (feat-3-603). 모든 사용자 read-only, staff CRUD inline.
// /latest/book-updates — 검색·과목·kind·중요 필터 + 페이지네이션.

import {
  ArrowRightIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FilterXIcon,
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
import {
  BOOK_UPDATE_KIND_LABELS,
  type BookUpdateItem,
  type BookUpdateKind,
} from "~/features/book-updates/labels";
import { listBookUpdates } from "~/features/book-updates/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/book-updates";

export const meta: Route.MetaFunction = () => [
  { title: "도서 추록·정오표 | Lidam Edu" },
];

const KIND_OPTIONS: Array<{ value: BookUpdateKind | "all"; label: string }> = [
  { value: "all", label: "전체" },
  { value: "supplement", label: "추록" },
  { value: "errata", label: "정오표" },
  { value: "other", label: "기타" },
];

interface BookUpdateFilters {
  q: string;
  subject?: LawSubjectSlug;
  kind?: BookUpdateKind;
  importantOnly: boolean;
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
  const kindParam = url.searchParams.get("kind");
  const kind: BookUpdateKind | undefined =
    kindParam === "supplement" ||
    kindParam === "errata" ||
    kindParam === "other"
      ? kindParam
      : undefined;
  const importantOnly = url.searchParams.get("important") === "1";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const filters: BookUpdateFilters = {
    q,
    subject,
    kind,
    importantOnly,
    page,
    pageSize: 20,
  };

  const { items, total } = await listBookUpdates(client, {
    query: filters.q || undefined,
    subject: filters.subject,
    kind: filters.kind,
    importantOnly: filters.importantOnly,
    page: filters.page,
    pageSize: filters.pageSize,
  });

  return { items, total, filters, canEdit: role !== null };
}

const KIND_BADGE_VARIANT: Record<BookUpdateKind, "default" | "secondary" | "outline"> = {
  supplement: "default",
  errata: "secondary",
  other: "outline",
};

export default function LatestBookUpdates({
  loaderData,
}: Route.ComponentProps) {
  const { items, total, filters, canEdit } = loaderData;
  const [showAdd, setShowAdd] = useState(false);
  const filterActive =
    !!filters.subject ||
    !!filters.kind ||
    filters.importantOnly ||
    filters.q !== "";
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  const makeUrl = (overrides: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    if (filters.subject) sp.set("subject", filters.subject);
    if (filters.kind) sp.set("kind", filters.kind);
    if (filters.importantOnly) sp.set("important", "1");
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
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BookOpenIcon className="text-primary size-6" />
            도서 추록 · 정오표
          </h1>
          {canEdit && !showAdd ? (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <PlusIcon className="size-3.5" /> 자료 추가
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          {total}건
          {filters.kind ? ` · ${BOOK_UPDATE_KIND_LABELS[filters.kind]}` : ""}
          {filters.subject ? ` · ${LAW_SUBJECTS[filters.subject].name}` : ""}
          {filters.importantOnly ? " · 중요 (★3+)" : ""}
          {filters.q ? ` · "${filters.q}" 검색` : ""}
        </p>
      </header>

      {canEdit && showAdd ? (
        <div className="mb-4">
          <BookUpdateForm mode="create" onClose={() => setShowAdd(false)} />
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
            placeholder="책 제목·자료 제목·출판사·내용 검색"
            className="pl-9"
          />
        </div>
        <select
          name="kind"
          defaultValue={filters.kind ?? "all"}
          className="border-input bg-background h-9 rounded-md border px-2 text-xs"
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value === "all" ? "" : o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
            <Link to="/latest/book-updates">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {canEdit
              ? "등록된 자료가 없습니다. 상단 '자료 추가' 버튼으로 시작하세요."
              : "등록된 자료가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="latest-book-updates-list">
          {items.map((it) => (
            <BookUpdateCard key={it.updateId} item={it} canEdit={canEdit} />
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

function BookUpdateCard({
  item,
  canEdit,
}: {
  item: BookUpdateItem;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
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
      <BookUpdateForm mode="update" item={item} onClose={() => setEditing(false)} />
    );
  }

  return (
    <Card className="hover:border-primary transition-colors">
      <CardHeader className="px-4 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={KIND_BADGE_VARIANT[item.kind]} className="text-xs">
            <BookOpenIcon className="size-3" />
            {BOOK_UPDATE_KIND_LABELS[item.kind]}
          </Badge>
          {item.importance >= 3 ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <StarIcon className="size-3" /> ★{item.importance}
            </Badge>
          ) : null}
          {item.subjectLaws.map((s) => (
            <Badge key={s} variant="outline" className="text-xs">
              {LAW_SUBJECTS[s].name}
            </Badge>
          ))}
          {item.publishedAt ? (
            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {item.publishedAt}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 text-sm">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-medium leading-snug">{item.title}</p>
            <p className="text-muted-foreground text-xs">
              <span className="font-medium">{item.bookTitle}</span>
              {item.edition ? ` · ${item.edition}` : ""}
              {item.publisher ? ` · ${item.publisher}` : ""}
            </p>
          </div>
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
              <delFetcher.Form method="post" action="/api/admin/book-update">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="updateId" value={item.updateId} />
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  aria-label="삭제"
                  className="size-7 text-rose-600 hover:text-rose-700"
                  disabled={delFetcher.state !== "idle"}
                  onClick={(e) => {
                    if (!confirm(`"${item.title}" 자료를 삭제하시겠습니까?`)) {
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
        {item.description ? (
          <p className="text-muted-foreground line-clamp-3 whitespace-pre-line text-xs leading-relaxed">
            {item.description}
          </p>
        ) : null}
        {item.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                #{t}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {item.url ? (
            <Button asChild size="sm" variant="outline" className="h-7">
              <a href={item.url} target="_blank" rel="noreferrer">
                <ExternalLinkIcon className="size-3" /> 외부 링크
              </a>
            </Button>
          ) : null}
          {item.pdfUrl ? (
            <Button asChild size="sm" variant="outline" className="h-7">
              <a href={item.pdfUrl} target="_blank" rel="noreferrer">
                <FileTextIcon className="size-3" /> PDF 열기
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function BookUpdateForm({
  mode,
  item,
  onClose,
}: {
  mode: "create" | "update";
  item?: BookUpdateItem;
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
      action="/api/admin/book-update"
      className="bg-card space-y-3 rounded-md border p-4"
    >
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="updateId" value={item!.updateId} />
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr]">
        <Field label="유형 *">
          <select
            name="kind"
            defaultValue={item?.kind ?? "supplement"}
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
          >
            <option value="supplement">추록</option>
            <option value="errata">정오표</option>
            <option value="other">기타</option>
          </select>
        </Field>
        <Field label="책 제목 *">
          <Input
            name="bookTitle"
            required
            maxLength={500}
            defaultValue={item?.bookTitle ?? ""}
            className="h-8 text-xs"
            placeholder="예: 변리사 1차 특허법 핵심정리"
          />
        </Field>
        <Field label="출판사">
          <Input
            name="publisher"
            maxLength={200}
            defaultValue={item?.publisher ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="판/쇄">
          <Input
            name="edition"
            maxLength={100}
            defaultValue={item?.edition ?? ""}
            className="h-8 text-xs"
            placeholder="예: 제3판 2쇄"
          />
        </Field>
        <Field label="자료 제목 *">
          <Input
            name="title"
            required
            maxLength={500}
            defaultValue={item?.title ?? ""}
            className="h-8 text-xs"
            placeholder="예: 2024년 1월 개정사항 반영 추록"
          />
        </Field>
        <Field label="발행일">
          <Input
            name="publishedAt"
            type="date"
            defaultValue={item?.publishedAt ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="중요도">
          <select
            name="importance"
            defaultValue={item?.importance ?? 1}
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
            defaultValue={item?.subjectLaws.join(",") ?? ""}
            className="h-8 text-xs font-mono"
            placeholder="예: patent,trademark — 콤마 구분"
          />
        </Field>
        <Field label="태그">
          <Input
            name="tags"
            defaultValue={item?.tags.join(",") ?? ""}
            className="h-8 text-xs"
            placeholder="콤마 구분 (최대 20)"
          />
        </Field>
        <Field label="외부 링크">
          <Input
            name="url"
            type="url"
            maxLength={2000}
            defaultValue={item?.url ?? ""}
            className="h-8 text-xs"
            placeholder="https://"
          />
        </Field>
        <Field label="PDF URL">
          <Input
            name="pdfUrl"
            type="url"
            maxLength={2000}
            defaultValue={item?.pdfUrl ?? ""}
            className="h-8 text-xs"
            placeholder="Supabase Storage 또는 외부 PDF URL"
          />
        </Field>
        <Field label="내용/설명">
          <textarea
            name="description"
            maxLength={5000}
            defaultValue={item?.description ?? ""}
            rows={5}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
            placeholder="추록/정오표 내용 (정오표라면 페이지·잘못된 표기·올바른 표기를 정리)"
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
