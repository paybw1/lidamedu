// 접속이력 관리 (admin 전용) — 로그인 이력: 회원·소속·접속단·구분·브라우저·기기·IP·로그등록일.
// 기록 지점: 카카오 로그인 완주(social/complete.tsx → recordLoginAccess).

import { HistoryIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { Form, Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  IndexTable,
  MemberLink,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-access-logs";

export const meta: Route.MetaFunction = () => [
  { title: "접속이력 관리 | 리담변리사학원" },
];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PAGE_SIZE = 50;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (role !== "admin") throw data("Forbidden — admin only", { status: 403 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 50);
  const days = Number(url.searchParams.get("days") ?? "30");
  const validDays = [7, 30, 90, 0].includes(days) ? days : 30;
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  let query = adminClient
    .from("user_access_logs")
    .select(
      "log_id, user_id, kind, client, browser, device, ip, created_at, profiles(member_no, name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (validDays > 0) {
    query = query.gte(
      "created_at",
      new Date(Date.now() - validDays * 24 * 60 * 60 * 1000).toISOString(),
    );
  }
  if (q) {
    // 이름 검색 — profiles 조인 필터.
    query = query.not("user_id", "is", null).ilike("profiles.name", `%${q.replace(/[%_]/g, "")}%`);
  }
  const { data: rows, count, error } = await query;
  if (error) throw error;

  // 소속(반) — 페이지 내 사용자만 배치 조회.
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))] as string[];
  const cohortsByUser = new Map<string, string[]>();
  if (userIds.length > 0) {
    const { data: members } = await adminClient
      .from("cohort_members")
      .select("profile_id, cohorts(name)")
      .in("profile_id", userIds);
    for (const m of members ?? []) {
      const name = m.cohorts?.name;
      if (!name) continue;
      if (!cohortsByUser.has(m.profile_id)) cohortsByUser.set(m.profile_id, []);
      cohortsByUser.get(m.profile_id)!.push(name);
    }
  }

  return {
    role,
    logs: (rows ?? []).map((r) => ({
      logId: r.log_id,
      userId: r.user_id,
      memberNo: r.profiles?.member_no ?? null,
      userName: r.profiles?.name ?? null,
      cohorts: r.user_id ? (cohortsByUser.get(r.user_id) ?? []) : [],
      kind: r.kind,
      client: r.client,
      browser: r.browser,
      device: r.device,
      ip: r.ip,
      createdAt: r.created_at,
    })),
    total: count ?? 0,
    page,
    filter: { q, days: validDays },
  };
}

function fmtDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}`;
}

export default function AdminAccessLogs({ loaderData }: Route.ComponentProps) {
  const { role, logs, total, page, filter } = loaderData;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageUrl = (p: number) => {
    const sp = new URLSearchParams();
    if (filter.q) sp.set("q", filter.q);
    if (filter.days !== 30) sp.set("days", String(filter.days));
    if (p !== 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <AdminShell
      cluster="students"
      role={role}
      title="접속이력 관리"
      desc="로그인 접속 이력입니다. 카카오 로그인 완료 시점에 기록됩니다 (도입 이전 접속은 없음)."
      headerRight={
        <Chip tone="solid">
          <HistoryIcon className="size-3" /> {total.toLocaleString("ko-KR")}건
        </Chip>
      }
    >
      <Form
        method="get"
        className="border-border bg-card mb-3 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
      >
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold">회원명 검색</span>
          <div className="relative">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <input
              type="search"
              name="q"
              defaultValue={filter.q}
              placeholder="회원명"
              className="border-input bg-background focus:border-primary h-9 w-full rounded-md border pr-3 pl-9 text-[13px] outline-none"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold">기간</span>
          <AdminSelect name="days" defaultValue={String(filter.days)}>
            <option value="7">최근 7일</option>
            <option value="30">최근 30일</option>
            <option value="90">최근 90일</option>
            <option value="0">전체</option>
          </AdminSelect>
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-9 self-end">
          적용
        </Button>
        {filter.q || filter.days !== 30 ? (
          <Link
            to="/admin/access-logs"
            className="text-link inline-flex items-center gap-1 self-end px-2 py-2 text-xs font-semibold"
          >
            <RefreshCwIcon className="size-3" /> 초기화
          </Link>
        ) : null}
      </Form>

      {logs.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-14 text-center text-sm shadow-sm">
          접속 이력이 없습니다.
        </div>
      ) : (
        <IndexTable
          minWidth={1080}
          headers={[
            { label: "No", align: "center", width: "3.5rem" },
            { label: "회원 (회원번호)", width: "12rem" },
            { label: "소속", width: "8rem" },
            { label: "접속단", align: "center", width: "5rem" },
            { label: "구분", align: "center", width: "5rem" },
            { label: "브라우저", width: "8rem" },
            { label: "기기", width: "7rem" },
            { label: "IP", width: "9rem" },
            { label: "로그등록일", align: "right", width: "11rem" },
          ]}
          footer={
            <div className="border-border/60 flex items-center justify-between border-t px-3 py-2">
              <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
                총 {total.toLocaleString("ko-KR")}건
              </span>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2 text-xs">
                  {page > 1 ? (
                    <Link to={pageUrl(page - 1)} className="text-link font-semibold hover:underline">
                      이전
                    </Link>
                  ) : null}
                  <span className="text-muted-foreground tabular-nums">
                    {page} / {totalPages}
                  </span>
                  {page < totalPages ? (
                    <Link to={pageUrl(page + 1)} className="text-link font-semibold hover:underline">
                      다음
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          }
        >
          {logs.map((l, i) => (
            <TR key={l.logId}>
              <TD align="center" soft mono>
                {(page - 1) * PAGE_SIZE + i + 1}
              </TD>
              <TD>
                {l.userId ? (
                  <MemberLink profileId={l.userId} name={l.userName} />
                ) : (
                  <span className="text-muted-foreground">(탈퇴 회원)</span>
                )}
                {l.memberNo != null ? (
                  <span className="text-muted-foreground ml-1 text-[11px]">#{l.memberNo}</span>
                ) : null}
              </TD>
              <TD soft>
                <span className="block max-w-[8rem] truncate" title={l.cohorts.join(", ")}>
                  {l.cohorts.length > 0 ? l.cohorts.join(", ") : "—"}
                </span>
              </TD>
              <TD align="center">
                <Chip tone={l.client === "모바일" ? "violet" : "blue"}>{l.client ?? "—"}</Chip>
              </TD>
              <TD align="center" soft>
                {l.kind === "login" ? "로그인" : l.kind}
              </TD>
              <TD soft>{l.browser ?? "—"}</TD>
              <TD soft>{l.device ?? "—"}</TD>
              <TD mono soft>
                {l.ip ?? "—"}
              </TD>
              <TD align="right" mono soft>
                {fmtDateTime(l.createdAt)}
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}
