// 사용자 관리 (feat-7-012, 7-013). admin 전용.
// 목록: 이름·이메일·역할·가입일·마지막 로그인 + 검색·역할 필터 + 페이지네이션.
// 역할 변경: 인라인 select 로 즉시 적용. 본인 강등 차단.

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterXIcon,
  MailIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listAdminUsers,
  type AdminUserRow,
  type UserRole,
} from "~/features/admin/queries/users.server";

import type { Route } from "./+types/admin-users";

export const meta: Route.MetaFunction = () => [
  { title: "사용자 관리 | Lidam Patent Attorney Academy" },
];

const ROLE_OPTIONS: Array<{ value: UserRole | "all"; label: string }> = [
  { value: "all", label: "전체 역할" },
  { value: "student", label: "수험생" },
  { value: "instructor", label: "강사" },
  { value: "admin", label: "원장" },
];

interface Filters {
  q: string;
  role?: UserRole;
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
  if (role !== "admin") throw data("Forbidden — admin only", { status: 403 });

  const url = new URL(request.url);
  const roleRaw = url.searchParams.get("role");
  const roleFilter: UserRole | undefined =
    roleRaw === "student" || roleRaw === "instructor" || roleRaw === "admin"
      ? roleRaw
      : undefined;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const filters: Filters = { q, role: roleFilter, page, pageSize: 50 };

  const usersPage = await listAdminUsers({
    query: filters.q || undefined,
    role: filters.role,
    page: filters.page,
    pageSize: filters.pageSize,
  });

  return { ...usersPage, filters, currentUserId: user.id };
}

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
  const { items, total, filters, currentUserId } = loaderData;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const filterActive = !!filters.role || filters.q !== "";

  const makeUrl = (overrides: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    if (filters.q) sp.set("q", filters.q);
    if (filters.role) sp.set("role", filters.role);
    if (filters.page !== 1) sp.set("page", String(filters.page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) sp.delete(k);
      else sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `?${s}` : "";
  };

  const counts = {
    student: items.filter((i) => i.role === "student").length,
    instructor: items.filter((i) => i.role === "instructor").length,
    admin: items.filter((i) => i.role === "admin").length,
  };

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
          <ShieldCheckIcon className="size-3.5" /> 원장 전용
        </p>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <UsersIcon className="text-primary size-6" />
          사용자 관리
        </h1>
        <p className="text-muted-foreground text-sm">
          가입한 사용자 {total}명 · 현재 페이지 수험생 {counts.student} ·
          강사 {counts.instructor} · 원장 {counts.admin}
        </p>
      </header>

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
            placeholder="이름·이메일 검색"
            className="pl-9"
          />
        </div>
        <select
          name="role"
          defaultValue={filters.role ?? "all"}
          className="border-input bg-background h-9 rounded-md border px-2 text-xs"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value === "all" ? "" : o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" className="h-9">
          적용
        </Button>
      </Form>
      {filterActive ? (
        <div className="mb-4">
          <Button asChild type="button" size="sm" variant="ghost" className="h-7">
            <Link to="/admin/users">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            조건에 맞는 사용자가 없습니다.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead className="w-40">이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead className="w-32">역할</TableHead>
                  <TableHead className="w-28">가입일</TableHead>
                  <TableHead className="w-32">마지막 로그인</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((u, i) => (
                  <UserRow
                    key={u.profileId}
                    user={u}
                    index={(filters.page - 1) * filters.pageSize + i + 1}
                    isCurrentUser={u.profileId === currentUserId}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
          {totalPages > 1 ? (
            <CardContent className="border-t pt-3">
              <Pagination
                page={filters.page}
                totalPages={totalPages}
                makeUrl={makeUrl}
              />
            </CardContent>
          ) : null}
        </Card>
      )}
    </div>
  );
}

function UserRow({
  user,
  index,
  isCurrentUser,
}: {
  user: AdminUserRow;
  index: number;
  isCurrentUser: boolean;
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

  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <TableRow>
      <TableCell className="text-muted-foreground text-center text-xs tabular-nums">
        {index}
      </TableCell>
      <TableCell>
        <div className="inline-flex items-center gap-1.5">
          <UserIcon className="text-muted-foreground size-3.5" />
          <span className="text-sm font-medium">{user.name || "—"}</span>
          {isCurrentUser ? (
            <Badge variant="outline" className="text-[10px]">본인</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        <span className="inline-flex items-center gap-1">
          <MailIcon className="size-3" />
          {user.email ?? "(이메일 없음)"}
        </span>
        {user.emailConfirmedAt ? (
          <CheckCircle2Icon
            className="ml-1 inline-block size-3 text-emerald-600"
            aria-label="이메일 인증 완료"
          />
        ) : null}
      </TableCell>
      <TableCell>
        <fetcher.Form method="post" action="/api/admin/user-role">
          <input type="hidden" name="profileId" value={user.profileId} />
          <select
            name="role"
            defaultValue={user.role}
            disabled={isCurrentUser || fetcher.state !== "idle"}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="border-input bg-background h-7 rounded-md border px-2 text-xs disabled:opacity-50"
            title={isCurrentUser ? "본인 역할은 변경 불가" : "역할 변경"}
          >
            <option value="student">수험생</option>
            <option value="instructor">강사</option>
            <option value="admin">원장</option>
          </select>
          {err ? <p className="text-rose-600 text-[10px] mt-0.5">{err}</p> : null}
        </fetcher.Form>
      </TableCell>
      <TableCell className="text-muted-foreground text-xs tabular-nums">
        {user.createdAt.slice(0, 10)}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs tabular-nums">
        {user.lastSignInAt ? user.lastSignInAt.slice(0, 10) : "—"}
      </TableCell>
    </TableRow>
  );
}

function Pagination({
  page,
  totalPages,
  makeUrl,
}: {
  page: number;
  totalPages: number;
  makeUrl: (overrides: Record<string, string | null>) => string;
}) {
  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;
  return (
    <div className="flex items-center justify-center gap-2 text-xs">
      <Button
        asChild={prev != null}
        variant="outline"
        size="sm"
        disabled={prev == null}
        className="h-7"
      >
        {prev != null ? (
          <Link to={makeUrl({ page: String(prev) })}>
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
        asChild={next != null}
        variant="outline"
        size="sm"
        disabled={next == null}
        className="h-7"
      >
        {next != null ? (
          <Link to={makeUrl({ page: String(next) })}>
            다음 <ChevronRightIcon className="size-3" />
          </Link>
        ) : (
          <span>
            다음 <ChevronRightIcon className="size-3" />
          </span>
        )}
      </Button>
    </div>
  );
}
