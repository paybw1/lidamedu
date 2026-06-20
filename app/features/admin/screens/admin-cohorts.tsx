// 반/기수 일람 (feat-7-009). staff (instructor/admin) 접근.
// instructor 는 본인 소유 반만, admin 은 전부. 신규 반 인라인 폼.

import {
  ArchiveIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CalendarRangeIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
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

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import type { CohortListItem } from "~/features/cohorts/labels";
import { listCohorts } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Chip,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";

import type { Route } from "./+types/admin-cohorts";

export const meta: Route.MetaFunction = () => [
  { title: "반 관리 | Lidam Patent Attorney Academy" },
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
    // manager 이상은 전부, instructor 는 본인 소유만.
    ownerId: roleAtLeast(role, "manager") ? undefined : user.id,
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
    <AdminShell
      cluster="cohorts"
      role={role}
      title="반 / 기수 관리"
      desc={
        roleAtLeast(role, "manager")
          ? "모든 강사의 반을 관리합니다."
          : "본인 소유 반만 표시됩니다."
      }
      headerRight={
        !showAdd ? (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <PlusIcon className="size-3.5" /> 반 추가
          </Button>
        ) : null
      }
    >
      {/* 신규 반 인라인 폼 — 행 위 카드로 펼침 */}
      {showAdd ? (
        <div className="mb-4">
          <CohortForm mode="create" onClose={() => setShowAdd(false)} />
        </div>
      ) : null}

      {/* 필터 바 — GET Form (uncontrolled) */}
      <Form
        method="get"
        className="border-border bg-card mb-3 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
      >
        <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <span className="text-muted-foreground text-[11px] font-semibold">검색</span>
          <div className="relative">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder="반 이름·설명 검색"
              aria-label="반 이름·설명 검색"
              className="border-input bg-background focus:border-primary h-9 w-full rounded-md border pr-3 pl-9 text-[13px] outline-none"
            />
          </div>
        </label>
        <label className="border-input flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs self-end">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={filters.includeArchived}
            className="size-3.5"
          />
          <ArchiveIcon className="size-3" /> 아카이브 포함
        </label>
        <Button type="submit" size="sm" variant="outline" className="self-end h-9">
          적용
        </Button>
        {filterActive ? (
          <Link
            to="/admin/cohorts"
            className="text-link self-end inline-flex items-center gap-1 px-2 py-2 text-xs font-semibold"
          >
            <RefreshCwIcon className="size-3" />
            초기화
          </Link>
        ) : null}
      </Form>

      {cohorts.length === 0 ? (
        <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border py-16 text-center shadow-sm">
          <BookOpenIcon className="text-muted-foreground/40 size-10" />
          <p className="text-muted-foreground text-sm">
            {filterActive
              ? "조건에 맞는 반이 없습니다."
              : '등록된 반이 없습니다. 상단 "반 추가"로 시작하세요.'}
          </p>
          {filterActive ? (
            <Link
              to="/admin/cohorts"
              className="text-link text-xs font-semibold hover:underline"
            >
              필터 초기화
            </Link>
          ) : null}
        </div>
      ) : (
        <IndexTable
          minWidth={680}
          headers={[
            { label: "반 이름" },
            { label: "담당 강사" },
            { label: "기간", align: "center", width: "13rem" },
            { label: "멤버", align: "center", width: "5rem" },
            { label: "상태", align: "center", width: "5rem" },
            { label: "", align: "right", width: "8rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {cohorts.length}개 반
            </div>
          }
        >
          {cohorts.map((c) => (
            <CohortRow key={c.cohortId} cohort={c} />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function CohortRow({ cohort }: { cohort: CohortListItem }) {
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
      <tr>
        <td colSpan={6} className="p-2">
          <CohortForm
            mode="update"
            cohort={cohort}
            onClose={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <TR>
      <TD>
        <Link
          to={`/admin/cohorts/${cohort.cohortId}`}
          viewTransition
          className="text-link font-semibold hover:underline"
        >
          {cohort.name}
        </Link>
        {cohort.description ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px]">
            {cohort.description}
          </p>
        ) : null}
      </TD>
      <TD soft>
        {cohort.ownerName ? cohort.ownerName : <span className="text-muted-foreground/50">—</span>}
      </TD>
      <TD align="center" mono soft>
        <span className="inline-flex items-center gap-1">
          <CalendarRangeIcon className="size-3" />
          {cohort.startsOn ?? "—"} ~ {cohort.endsOn ?? "—"}
        </span>
      </TD>
      <TD align="center" mono>
        <span className="inline-flex items-center gap-1">
          <UsersIcon className="size-3" />
          {cohort.memberCount}
        </span>
      </TD>
      <TD align="center">
        {cohort.isArchived ? (
          <Chip tone="neutral">
            <ArchiveIcon className="size-3" />
            아카이브
          </Chip>
        ) : (
          <Chip tone="emerald">활성</Chip>
        )}
      </TD>
      <TD align="right">
        <div className="flex items-center justify-end gap-1.5">
          <Button asChild size="sm" variant="ghost" className="h-7">
            <Link to={`/admin/cohorts/${cohort.cohortId}`} viewTransition>
              <ArrowRightIcon className="size-3" /> 상세
            </Link>
          </Button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="수정"
            title="반 정보 수정"
          >
            <PencilIcon className="size-3.5" />
          </button>
          <delFetcher.Form method="post" action="/api/admin/cohort">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="cohortId" value={cohort.cohortId} />
            <button
              type="submit"
              className="text-rose-500 hover:text-rose-700 p-1"
              disabled={delFetcher.state !== "idle"}
              aria-label="반 삭제"
              title="반 삭제 (되돌리기 불가)"
              onClick={(e) => {
                if (!confirm(`"${cohort.name}" 반을 삭제하시겠습니까?`)) {
                  e.preventDefault();
                }
              }}
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </delFetcher.Form>
        </div>
      </TD>
    </TR>
  );
}

/* ── 인라인 폼 (신규/수정 공용) ─────────────────────────────────────────── */

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
      className="bg-card border-border space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {mode === "create" ? "새 반 추가" : "반 정보 수정"}
      </p>
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="cohortId" value={cohort!.cohortId} />
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_120px_1fr]">
        <FormField label="이름 *" full>
          <Input
            name="name"
            required
            maxLength={200}
            defaultValue={cohort?.name ?? ""}
            className="h-8 text-xs"
            placeholder="예: 2026년 1차 합격반"
          />
        </FormField>
        <FormField label="시작일">
          <Input
            name="startsOn"
            type="date"
            defaultValue={cohort?.startsOn ?? ""}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="종료일">
          <Input
            name="endsOn"
            type="date"
            defaultValue={cohort?.endsOn ?? ""}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="설명" full>
          <textarea
            name="description"
            maxLength={2000}
            defaultValue={cohort?.description ?? ""}
            rows={3}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
          />
        </FormField>
        {mode === "update" ? (
          <FormField label="아카이브">
            <label className="border-input flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
              <input
                type="checkbox"
                name="isArchived"
                value="1"
                defaultChecked={cohort?.isArchived}
                className="size-3.5"
              />
              <ArchiveIcon className="size-3" /> 아카이브로 표시
            </label>
          </FormField>
        ) : null}
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

function FormField({
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
