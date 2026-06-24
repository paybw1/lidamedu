// 도서 추록/정오표 피드 (feat-3-603). 모든 사용자 read-only, staff CRUD inline.
// /latest/book-updates — 검색·과목·kind·중요 필터 + 페이지네이션.
// 키트 lidam-latest/BooksScreen 디자인.

import {
  ArrowRightIcon,
  BookIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PencilIcon,
  PlusIcon,
  SearchXIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
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
import {
  BOOK_UPDATE_KIND_LABELS,
  type BookUpdateItem,
  type BookUpdateKind,
} from "~/features/book-updates/labels";
import { listBookUpdates } from "~/features/book-updates/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/book-updates";

export const meta: Route.MetaFunction = () => [
  { title: "추록·정오표 | 리담변리사학원" },
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
  const kindParam = url.searchParams.get("kind");
  const kind: BookUpdateKind | undefined =
    kindParam === "supplement" ||
    kindParam === "errata" ||
    kindParam === "other"
      ? kindParam
      : undefined;
  const importantOnly = url.searchParams.get("important") === "1";
  const yearRaw = url.searchParams.get("year");
  const year =
    yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : undefined;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const filters: BookUpdateFilters = {
    q,
    subject,
    kind,
    importantOnly,
    year,
    page,
    pageSize: 20,
  };

  const { items, total } = await listBookUpdates(client, {
    query: filters.q || undefined,
    subject: filters.subject,
    kind: filters.kind,
    importantOnly: filters.importantOnly,
    year: filters.year,
    page: filters.page,
    pageSize: filters.pageSize,
  });

  return { items, total, filters, canEdit: role !== null };
}

const KIND_TONE: Record<BookUpdateKind, "primary" | "amber" | "outline"> = {
  supplement: "primary",
  errata: "amber",
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
    !!filters.year ||
    filters.q !== "";
  // 빠른 year 옵션 — 최근 12년.
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 13 }, (_, i) => currentYear - i);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  const makeUrl = (overrides: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    if (filters.subject) sp.set("subject", filters.subject);
    if (filters.kind) sp.set("kind", filters.kind);
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
  if (filters.kind) descParts.push(BOOK_UPDATE_KIND_LABELS[filters.kind]);
  if (filters.subject) descParts.push(LAW_SUBJECTS[filters.subject].name);
  if (filters.year) descParts.push(`${filters.year}년`);
  if (filters.importantOnly) descParts.push("중요 ★3+");
  if (filters.q) descParts.push(`"${filters.q}" 검색`);

  return (
    <LatestShell
      category="books"
      width="feed"
      title="추록 · 정오표"
      desc={`${descParts.join(" · ")} — 발행일 최신순으로 모은 도서 추록·정오표입니다.`}
      headerRight={
        canEdit && !showAdd ? (
          <Button
            size="sm"
            className="h-9 rounded-full"
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon className="size-3.5" /> 자료 추가
          </Button>
        ) : undefined
      }
    >
      {canEdit && showAdd ? (
        <div className="mb-3.5">
          <BookUpdateForm mode="create" onClose={() => setShowAdd(false)} />
        </div>
      ) : null}

      <LatestFilterForm
        search={{
          name: "q",
          placeholder: "책 제목·자료 제목·출판사·내용 검색",
          defaultValue: filters.q,
        }}
        hasActive={filterActive}
        resetTo="/latest/book-updates"
      >
        <FilterSelect
          name="kind"
          ariaLabel="유형"
          defaultValue={filters.kind ?? ""}
          options={KIND_OPTIONS.map((o) => ({
            value: o.value === "all" ? "" : o.value,
            label: o.label,
          }))}
        />
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

      {items.length === 0 ? (
        <LatestEmpty
          icon={filterActive ? SearchXIcon : BookIcon}
          tone={filterActive ? "subdued" : "neutral"}
          title={
            filterActive
              ? "조건에 맞는 자료가 없습니다"
              : "아직 등록된 자료가 없습니다"
          }
          body={
            filterActive
              ? "검색어나 필터를 바꿔 다시 찾아보세요."
              : canEdit
                ? "상단 '자료 추가' 버튼으로 첫 추록·정오표를 등록하세요."
                : "도서 추록·정오표가 등록되면 이곳에 모입니다."
          }
        />
      ) : (
        <ListStack testid="latest-book-updates-list">
          {items.map((it) => (
            <BookUpdateCard key={it.updateId} item={it} canEdit={canEdit} />
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
      <BookUpdateForm
        mode="update"
        item={item}
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <FeedCard>
      <MetaRow
        right={item.publishedAt ? relativeKo(item.publishedAt) : undefined}
      >
        <Pill tone={KIND_TONE[item.kind]}>
          <BookIcon className="size-3" />
          {BOOK_UPDATE_KIND_LABELS[item.kind]}
        </Pill>
        {item.importance >= 3 ? (
          <Pill tone="amber">★ {item.importance}</Pill>
        ) : null}
        {item.subjectLaws.map((s) => (
          <Pill key={s} tone="outline">
            {LAW_SUBJECTS[s].name}
          </Pill>
        ))}
        {isRecent(item.publishedAt) ? <NewBadge /> : null}
      </MetaRow>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-bold tracking-tight">
            {item.title}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            <span className="text-foreground/80 font-semibold">
              {item.bookTitle}
            </span>
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
              className="size-8 rounded-full"
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
                className="size-8 rounded-full text-rose-600 hover:text-rose-700"
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
        <p className="text-foreground/80 mt-1.5 line-clamp-3 text-[13px] leading-relaxed whitespace-pre-line">
          {item.description}
        </p>
      ) : null}
      {item.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.tags.map((t) => (
            <Pill key={t} tone="neutral">
              #{t}
            </Pill>
          ))}
        </div>
      ) : null}
      {item.url || item.pdfUrl ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {item.url ? (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-8 rounded-full"
            >
              <a href={item.url} target="_blank" rel="noreferrer">
                <ExternalLinkIcon className="size-3" /> 외부 링크
              </a>
            </Button>
          ) : null}
          {item.pdfUrl ? (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-8 rounded-full"
            >
              <a href={item.pdfUrl} target="_blank" rel="noreferrer">
                <FileTextIcon className="size-3" /> PDF 열기
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </FeedCard>
  );
}

// 추가/수정 폼 — 카드 위에 펼침 (brief §5.8).
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
      className="border-border bg-card space-y-3 rounded-2xl border p-4 shadow-sm"
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
            className="h-8 font-mono text-xs"
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
