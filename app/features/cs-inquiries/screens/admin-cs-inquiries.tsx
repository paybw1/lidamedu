// feat-6-011 고객센터 — 운영자 문의 관리(/admin/cs-inquiries). staff 게이트. 상세·답변은 /support/:id.
import { LockIcon } from "lucide-react";
import { Link, data, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import {
  CS_CATEGORY_LABEL,
  CS_STATUS_LABEL,
  type CsStatus,
} from "../labels";
import { listInquiries } from "../queries.server";

import type { Route } from "./+types/admin-cs-inquiries";

export function meta() {
  return [{ title: "고객센터 문의 | 운영관리" }];
}

const STATUS_TABS: Array<{ value: CsStatus | "all"; label: string }> = [
  { value: "all", label: "전체" },
  { value: "open", label: "답변 대기" },
  { value: "answered", label: "답변 완료" },
  { value: "closed", label: "종료" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status = (["open", "answered", "closed"] as const).find(
    (s) => s === statusParam,
  );
  const rows = await listInquiries(client, { status: status ?? null });

  // 작성자 이름 — profiles RLS 는 staff 에게도 본인만 → adminClient 로 조회.
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean))];
  const nameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profs } = await adminClient
      .from("profiles")
      .select("profile_id, name")
      .in("profile_id", authorIds as string[]);
    for (const p of profs ?? []) nameById.set(p.profile_id, p.name ?? "회원");
  }
  const openCount = (await listInquiries(client, { status: "open" })).length;

  return {
    role,
    activeStatus: status ?? ("all" as const),
    openCount,
    rows: rows.map((r) => ({
      ...r,
      authorName: r.authorId ? (nameById.get(r.authorId) ?? "회원") : "(탈퇴)",
    })),
  };
}

const STATUS_VARIANT: Record<CsStatus, "default" | "secondary" | "outline"> = {
  open: "outline",
  answered: "default",
  closed: "secondary",
};

export default function AdminCsInquiries({ loaderData }: Route.ComponentProps) {
  const { role, activeStatus, openCount, rows } = loaderData;
  return (
    <AdminShell
      cluster="comms"
      role={role}
      title="고객센터 문의"
      desc="학생·회원의 문의를 확인하고 답변합니다. 문의를 열면 답변을 등록할 수 있습니다."
      headerRight={
        <Chip tone={openCount > 0 ? "amber" : "neutral"}>
          답변 대기 {openCount}
        </Chip>
      }
    >
      <div className="p-5 md:p-8">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => {
            const active = t.value === activeStatus;
            const to =
              t.value === "all"
                ? "/admin/cs-inquiries"
                : `/admin/cs-inquiries?status=${t.value}`;
            return (
              <Link
                key={t.value}
                to={to}
                className={
                  active
                    ? "bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-semibold"
                    : "border-border text-muted-foreground hover:bg-muted rounded-full border px-3 py-1 text-xs"
                }
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
            문의가 없습니다.
          </div>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {rows.map((it) => (
              <li key={it.inquiryId}>
                <Link
                  to={`/lecture/support/${it.inquiryId}`}
                  className="hover:bg-muted/40 flex items-center gap-3 px-4 py-3"
                >
                  <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
                    #{it.displayNo}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {it.isPrivate ? (
                        <LockIcon className="text-muted-foreground size-3 shrink-0" />
                      ) : null}
                      <span className="truncate text-sm font-medium">
                        {it.title}
                      </span>
                    </span>
                    <span className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
                      <span>{it.authorName}</span>
                      <span>·</span>
                      <span>{CS_CATEGORY_LABEL[it.category]}</span>
                      <span>·</span>
                      <span>{it.createdAt.slice(0, 10)}</span>
                      {it.replyCount > 0 ? <span>· 답글 {it.replyCount}</span> : null}
                    </span>
                  </span>
                  <Badge
                    variant={STATUS_VARIANT[it.status]}
                    className="shrink-0 text-[11px]"
                  >
                    {CS_STATUS_LABEL[it.status]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
