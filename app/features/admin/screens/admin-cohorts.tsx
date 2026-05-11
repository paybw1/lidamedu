// 반/기수 일람 (feat-7-009). staff (instructor/admin) 접근.
// instructor 는 본인 소유 반만, admin 은 전부. 신규 반 인라인 폼.

import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CalendarRangeIcon,
  FilterXIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon,
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
import type { CohortListItem } from "~/features/cohorts/labels";
import { listCohorts } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-cohorts";

export const meta: Route.MetaFunction = () => [
  { title: "반 관리 | Lidam Edu" },
];

interface Filters {
  q: string;
  includeArchived: boolean;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const includeArchived = url.searchParams.get("archived") === "1";
  const filters: Filters = { q, includeArchived };

  const cohorts = await listCohorts(client, {
    // instructor 는 본인 소유만, admin 은 전부.
    ownerId: role === "admin" ? undefined : user.id,
    query: filters.q || undefined,
    includeArchived,
  });

  return { cohorts, filters, role };
}

export default function AdminCohorts({ loaderData }: Route.ComponentProps) {
  const { cohorts, filters, role } = loaderData;
  const [showAdd, setShowAdd] = useState(false);
  const filterActive = filters.q !== "" || filters.includeArchived;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 운영자
      </Link>
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          {role === "admin" ? "원장 · 강사" : "강사 · 본인 반만"}
        </p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BookOpenIcon className="text-primary size-6" />반 / 기수 관리
          </h1>
          {!showAdd ? (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <PlusIcon className="size-3.5" /> 반 추가
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          {cohorts.length}개 반 ·{" "}
          {role === "admin" ? "모든 강사의 반" : "본인 소유 반"}
          {filters.q ? ` · "${filters.q}" 검색` : ""}
          {filters.includeArchived ? " · 아카이브 포함" : ""}
        </p>
      </header>

      {showAdd ? (
        <div className="mb-4">
          <CohortForm mode="create" onClose={() => setShowAdd(false)} />
        </div>
      ) : null}

      <Form
        method="get"
        className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
      >
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="반 이름·설명 검색"
            className="pl-9"
          />
        </div>
        <label className="border-input flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={filters.includeArchived}
            className="size-3.5"
          />
          <ArchiveIcon className="size-3" /> 아카이브 포함
        </label>
        <Button type="submit" size="sm" className="h-9">
          적용
        </Button>
      </Form>
      {filterActive ? (
        <div className="mb-4">
          <Button asChild type="button" size="sm" variant="ghost" className="h-7">
            <Link to="/admin/cohorts">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        </div>
      ) : null}

      {cohorts.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            등록된 반이 없습니다. 상단 "반 추가" 버튼으로 시작하세요.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cohorts.map((c) => (
            <CohortCard key={c.cohortId} cohort={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CohortCard({ cohort }: { cohort: CohortListItem }) {
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

  return (
    <Card className="hover:border-primary transition-colors">
      <CardHeader className="px-4 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={cohort.isArchived ? "outline" : "default"} className="text-xs">
            {cohort.isArchived ? "아카이브" : "활성"}
          </Badge>
          {cohort.ownerName ? (
            <Badge variant="secondary" className="text-xs">
              담당 {cohort.ownerName}
            </Badge>
          ) : null}
          <span className="text-muted-foreground ml-auto inline-flex items-center gap-0.5 text-xs">
            <UsersIcon className="size-3" /> {cohort.memberCount}명
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 text-sm">
        <Link
          to={`/admin/cohorts/${cohort.cohortId}`}
          viewTransition
          className="hover:text-primary block font-medium leading-snug"
        >
          {cohort.name}
        </Link>
        {cohort.description ? (
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {cohort.description}
          </p>
        ) : null}
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums">
          <CalendarRangeIcon className="size-3" />
          {cohort.startsOn ?? "—"} ~ {cohort.endsOn ?? "—"}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button asChild size="sm" variant="outline" className="h-7">
            <Link to={`/admin/cohorts/${cohort.cohortId}`} viewTransition>
              <UsersIcon className="size-3" /> 멤버 관리
              <ArrowRightIcon className="size-3" />
            </Link>
          </Button>
          <delFetcher.Form method="post" action="/api/admin/cohort">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="cohortId" value={cohort.cohortId} />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="h-7 text-rose-600 hover:text-rose-700"
              disabled={delFetcher.state !== "idle"}
              onClick={(e) => {
                if (!confirm(`"${cohort.name}" 반을 삭제하시겠습니까?`)) {
                  e.preventDefault();
                }
              }}
            >
              <Trash2Icon className="size-3" /> 삭제
            </Button>
          </delFetcher.Form>
        </div>
      </CardContent>
    </Card>
  );
}

function CohortForm({
  mode,
  cohort,
  onClose,
}: {
  mode: "create" | "update";
  cohort?: CohortListItem;
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
      action="/api/admin/cohort"
      className="bg-card space-y-3 rounded-md border p-4"
    >
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="cohortId" value={cohort!.cohortId} />
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_120px_1fr]">
        <Field label="이름 *" full>
          <Input
            name="name"
            required
            maxLength={200}
            defaultValue={cohort?.name ?? ""}
            className="h-8 text-xs"
            placeholder="예: 2026년 1차 합격반"
          />
        </Field>
        <Field label="시작일">
          <Input
            name="startsOn"
            type="date"
            defaultValue={cohort?.startsOn ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="종료일">
          <Input
            name="endsOn"
            type="date"
            defaultValue={cohort?.endsOn ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="설명" full>
          <textarea
            name="description"
            maxLength={2000}
            defaultValue={cohort?.description ?? ""}
            rows={3}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
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
              <PencilIcon className="size-3.5" /> 저장
            </>
          )}
        </Button>
      </div>
    </fetcher.Form>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Label className="text-muted-foreground text-[11px] sm:self-center">
        {label}
      </Label>
      <div className={full ? "sm:col-span-3" : ""}>{children}</div>
    </>
  );
}
