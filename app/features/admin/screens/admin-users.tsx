// 사용자 관리 (feat-7-012, 7-013). admin 전용.
// 목록: 이름·이메일·역할·가입일·마지막 로그인 + 검색·역할 필터 + 페이지네이션.
// 역할 변경: 인라인 select → 위험 동작(코랄) + confirm.

import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MailIcon,
  RefreshCwIcon,
  SearchIcon,
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

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Chip,
  AdminSelect,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { ROLE_LABEL, isStaffRole } from "~/core/lib/roles";
import {
  listAdminUsers,
  type AdminUserRow,
  type UserRole,
} from "~/features/admin/queries/users.server";

import type { Route } from "./+types/admin-users";

export const meta: Route.MetaFunction = () => [
  { title: "사용자 관리 | 리담변리사학원" },
];

const ROLE_OPTIONS: Array<{ value: UserRole | "all"; label: string }> = [
  { value: "all", label: "전체 역할" },
  { value: "student", label: "수험생" },
  { value: "instructor", label: "강사" },
  { value: "manager", label: "관리자" },
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
  // admin 항상 + 관리자 관리에서 '수강생 관리 접근'이 배정된 스태프.
  const canAccess = await hasDutyAccess("student_admin_access", user.id, role);
  if (!canAccess) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const roleRaw = url.searchParams.get("role");
  const roleFilter: UserRole | undefined =
    roleRaw === "student" || roleRaw === "instructor" || roleRaw === "manager" || roleRaw === "admin"
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

  return {
    ...usersPage,
    filters,
    currentUserId: user.id,
    role,
    isAdmin: role === "admin",
  };
}

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
  const { items, total, filters, currentUserId, role, isAdmin } = loaderData;
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

  return (
    <AdminShell
      cluster="students"
      role={role}
      title="사용자 관리"
      desc={`가입한 사용자 ${total}명을 검색·필터하고 이용 승인을 관리합니다.${isAdmin ? " 역할 변경은 원장 전용." : ""}`}
      headerRight={
        <div className="flex items-center gap-2">
          <Chip tone="solid">
            <UsersIcon className="size-3" />
            {total}명
          </Chip>
        </div>
      }
    >
      {/* 필터 바 — admin-problems-list 패턴 (uncontrolled GET Form) */}
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
              placeholder="이름·이메일·닉네임·전화·주소 검색"
              aria-label="이름·이메일·닉네임·전화·주소 검색"
              className="border-input bg-background focus:border-primary h-9 w-full rounded-md border pr-3 pl-9 text-[13px] outline-none"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold">역할</span>
          <AdminSelect name="role" defaultValue={filters.role ?? ""}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value === "all" ? "" : o.value}>
                {o.label}
              </option>
            ))}
          </AdminSelect>
        </label>
        <Button type="submit" size="sm" variant="outline" className="self-end h-9">
          적용
        </Button>
        {filterActive ? (
          <Link
            to="/admin/users"
            className="text-link self-end inline-flex items-center gap-1 px-2 py-2 text-xs font-semibold"
          >
            <RefreshCwIcon className="size-3" />
            초기화
          </Link>
        ) : null}
      </Form>

      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-16 text-center text-sm shadow-sm">
          <UsersIcon className="size-8 opacity-30" />
          <p>조건에 맞는 사용자가 없습니다.</p>
          {filterActive ? (
            <Link
              to="/admin/users"
              className="text-link text-xs font-semibold hover:underline"
            >
              필터 초기화
            </Link>
          ) : null}
        </div>
      ) : (
        // 가로 스크롤 방지 — 이메일은 회원명 아래 줄, 소속·수강/가입·접속은 병합해
        // 일반 노트북 폭(사이드바 포함)에 맞춘다.
        <IndexTable
          minWidth={960}
          headers={[
            { label: "회원번호", align: "center", width: "4.5rem" },
            { label: "회원명 (회원아이디)" },
            { label: "휴대전화", width: "8.5rem" },
            { label: "소속·수강", width: "9rem" },
            { label: "실결제금액", align: "right", width: "6.5rem" },
            { label: "가입 · 접속", align: "right", width: "6.5rem" },
            { label: "상태", width: "11rem" },
          ]}
          footer={
            <div className="border-border/60 flex items-center justify-between border-t px-3 py-2">
              <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
                총 {total}명
              </span>
              {totalPages > 1 ? (
                <Pagination
                  page={filters.page}
                  totalPages={totalPages}
                  makeUrl={makeUrl}
                />
              ) : null}
            </div>
          }
        >
          {items.map((u) => (
            <UserRow
              key={u.profileId}
              user={u}
              isCurrentUser={u.profileId === currentUserId}
              isAdmin={isAdmin}
            />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function UserRow({
  user,
  isCurrentUser,
  isAdmin,
}: {
  user: AdminUserRow;
  isCurrentUser: boolean;
  isAdmin: boolean;
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

  // 회원아이디 = 이메일 로컬파트 (카카오 단일 로그인).
  const loginId = user.email ? user.email.split("@")[0] : null;

  return (
    <TR>
      <TD align="center" mono>
        {user.memberNo ?? "—"}
      </TD>
      <TD>
        <div className="flex items-center gap-2">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="size-6 shrink-0 rounded-full object-cover"
            />
          ) : (
            <UserIcon className="text-muted-foreground size-3.5 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{user.name || "—"}</span>
              {loginId ? (
                <span className="text-muted-foreground text-[11px]">({loginId})</span>
              ) : null}
              {isCurrentUser ? <Chip tone="outline">본인</Chip> : null}
            </div>
            {/* 이메일은 별도 컬럼 대신 이름 아래 줄 — 가로 폭 절약. */}
            <span className="text-muted-foreground flex items-center gap-1 truncate text-[11px]">
              <MailIcon className="size-3 shrink-0" />
              <span className="truncate">{user.email ?? "(이메일 없음)"}</span>
              {user.emailConfirmedAt ? (
                <CheckCircle2Icon
                  className="size-3 shrink-0 text-emerald-600"
                  aria-label="이메일 인증 완료"
                />
              ) : null}
            </span>
            {user.nickname && user.nickname !== user.name ? (
              <span className="text-muted-foreground block truncate text-[11px]">
                {user.nickname}
              </span>
            ) : null}
          </div>
        </div>
      </TD>
      <TD soft mono>
        {user.phoneE164 ?? "—"}
      </TD>
      <TD soft>
        {user.cohortNames.length > 0 ? (
          <span className="flex items-center gap-1">
            <Chip tone="violet">종합반</Chip>
            <span
              className="block max-w-[5rem] truncate text-[11px]"
              title={user.cohortNames.join(", ")}
            >
              {user.cohortNames.join(", ")}
            </span>
          </span>
        ) : user.activePlanNames.length > 0 ? (
          <span
            className="block max-w-[8.5rem] truncate text-[12px]"
            title={user.activePlanNames.join(", ")}
          >
            {user.activePlanNames.join(", ")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TD>
      <TD align="right" mono>
        {user.netPaidKrw > 0 ? `₩${user.netPaidKrw.toLocaleString("ko-KR")}` : "—"}
      </TD>
      <TD align="right" mono soft>
        <span className="block leading-tight">{user.createdAt.slice(0, 10)}</span>
        <span
          className="text-muted-foreground/70 block text-[10px] leading-tight"
          title="마지막 접속일"
        >
          {user.lastSignInAt ? user.lastSignInAt.slice(0, 10) : "접속 없음"}
        </span>
      </TD>
      <TD>
        <div className="flex flex-col gap-1">
          <AccessApprovalCell user={user} />
          {/* 역할 변경은 원장 전용 — 접근 duty 로 들어온 스태프에겐 숨김 */}
          {isAdmin ? (
          <fetcher.Form method="post" action="/api/admin/user-role">
            <input type="hidden" name="profileId" value={user.profileId} />
            {/* 역할 변경은 위험 동작 — 코랄 계열 select + confirm */}
            <select
              name="role"
              defaultValue={user.role}
              disabled={isCurrentUser || fetcher.state !== "idle"}
              onChange={(e) => {
                const next = e.currentTarget.value;
                if (
                  confirm(
                    `역할을 "${ROLE_LABEL[next as UserRole]}"으로 변경하시겠습니까? (되돌리기 가능)`,
                  )
                ) {
                  e.currentTarget.form?.requestSubmit();
                } else {
                  // 원복
                  e.currentTarget.value = user.role;
                }
              }}
              className={`border-input bg-background h-6 rounded-md border px-1.5 text-[11px] disabled:opacity-50 ${isCurrentUser ? "" : "focus:border-rose-400"}`}
              title={isCurrentUser ? "본인 역할은 변경 불가" : "역할 변경 (위험 동작)"}
              aria-label={`${user.name || "사용자"} 역할`}
            >
              <option value="student">수험생</option>
              <option value="instructor">강사</option>
              <option value="manager">관리자</option>
              <option value="admin">원장</option>
            </select>
            {err ? (
              <p className="text-rose-600 mt-0.5 text-[10px]">{err}</p>
            ) : null}
          </fetcher.Form>
          ) : null}
        </div>
      </TD>
    </TR>
  );
}

// 서비스 접근 승인/해제 셀 — 승인 게이트(requireAccessApproval) 대상은 학생만이므로
// staff 행은 "면제"로 표시. 해제는 위험 동작이라 confirm.
function AccessApprovalCell({ user }: { user: AdminUserRow }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  if (isStaffRole(user.role)) {
    return <Chip tone="outline">면제</Chip>;
  }

  const approved = !!user.accessApprovedAt;
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/user-access"
      onSubmit={(e) => {
        if (
          approved &&
          !confirm(
            `${user.name || "이 사용자"}의 이용 승인을 해제하시겠습니까? 해제 즉시 서비스를 이용할 수 없습니다.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="profileId" value={user.profileId} />
      <input type="hidden" name="approved" value={approved ? "0" : "1"} />
      <div className="flex items-center gap-1.5">
        {approved ? (
          <>
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {user.accessApprovedAt!.slice(0, 10)}
            </span>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={fetcher.state !== "idle"}
              className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-700 dark:text-rose-400"
            >
              해제
            </Button>
          </>
        ) : (
          <Button
            type="submit"
            size="sm"
            disabled={fetcher.state !== "idle"}
            className="h-6 px-2 text-[11px]"
          >
            승인
          </Button>
        )}
      </div>
      {err ? <p className="text-rose-600 mt-0.5 text-[10px]">{err}</p> : null}
    </fetcher.Form>
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
    <div className="flex items-center gap-2 text-xs">
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
