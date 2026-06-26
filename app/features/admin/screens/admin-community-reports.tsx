// feat-6-007 모더레이션 큐 — /admin/community/reports.
// manager+ 신고 처리.

import {
  CheckCircle2Icon,
  ShieldAlertIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { Form, Link, data, useFetcher, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import {
  type ReportItem,
  type ReportStatus,
  getReportCounts,
  listReports,
} from "~/features/community/reports.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-community-reports";

export const meta: Route.MetaFunction = () => [
  { title: "커뮤니티 신고 큐 | 리담변리사학원" },
];

const STATUS_VALUES = ["pending", "resolved", "dismissed", "all"] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager")) {
    throw data("관리자 이상만 접근 가능", { status: 403 });
  }

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status") ?? "pending";
  const status: StatusFilter = (STATUS_VALUES as readonly string[]).includes(
    statusRaw,
  )
    ? (statusRaw as StatusFilter)
    : "pending";

  const [items, counts] = await Promise.all([
    listReports(status, 100),
    getReportCounts(),
  ]);
  return { items, counts, status, role };
}

export default function AdminCommunityReports({
  loaderData,
}: Route.ComponentProps) {
  const { items, counts, status, role } = loaderData;
  return (
    <AdminShell
      cluster="comms"
      role={role}
      title="커뮤니티 신고 큐"
      desc={`대기 ${counts.pending}건 · 오늘 처리 ${counts.resolvedToday}건`}
    >
      <StatusTabs current={status} pending={counts.pending} />
      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground space-y-2 py-12 text-center">
            <ShieldAlertIcon className="mx-auto size-8 opacity-30" />
            <p className="text-sm">
              {status === "pending"
                ? "대기 중인 신고가 없습니다."
                : "조건에 맞는 신고가 없습니다."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((it) => (
            <li key={it.reportId}>
              <ReportCard item={it} />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function StatusTabs({
  current,
  pending,
}: {
  current: StatusFilter;
  pending: number;
}) {
  const [params] = useSearchParams();
  function makeTo(s: StatusFilter): string {
    const p = new URLSearchParams(params);
    if (s === "pending") p.delete("status");
    else p.set("status", s);
    return `?${p.toString()}`;
  }
  const tabs: { value: StatusFilter; label: string }[] = [
    { value: "pending", label: `대기 (${pending})` },
    { value: "resolved", label: "처리됨" },
    { value: "dismissed", label: "기각" },
    { value: "all", label: "전체" },
  ];
  return (
    <div className="mb-4 flex items-center gap-2 text-xs">
      {tabs.map((t) => (
        <Link
          key={t.value}
          to={makeTo(t.value)}
          className={cn(
            "rounded-full px-3 py-1 font-semibold",
            current === t.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function ReportCard({ item }: { item: ReportItem }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [note, setNote] = useState("");
  const [alsoDelete, setAlsoDelete] = useState(false);
  const busy = fetcher.state !== "idle";
  const isPending = item.status === "pending";
  const targetUrl =
    item.targetType === "post"
      ? `/community/${item.targetBoard}/${item.targetId}`
      : item.targetBoard
        ? `/community/${item.targetBoard}/${item.targetId}`
        : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={item.targetType === "post" ? "blue" : "neutral"}>
              {item.targetType === "post" ? "게시글" : "댓글"}
            </Chip>
            {item.targetBoard ? (
              <Chip tone="neutral">{item.targetBoard}</Chip>
            ) : null}
            {item.targetDeleted ? (
              <Chip tone="coral">대상 삭제됨</Chip>
            ) : null}
            <Chip
              tone={
                item.status === "pending"
                  ? "amber"
                  : item.status === "resolved"
                    ? "emerald"
                    : "neutral"
              }
            >
              {item.status === "pending"
                ? "대기"
                : item.status === "resolved"
                  ? "처리됨"
                  : "기각"}
            </Chip>
          </div>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {new Date(item.createdAt).toLocaleString("ko-KR")}
          </p>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <p className="text-foreground text-sm font-semibold">
          {item.targetTitle ?? "(제목 없음)"}
        </p>
        {item.targetSnippet ? (
          <p className="text-muted-foreground mt-1 line-clamp-2 text-[12.5px] italic">
            “{item.targetSnippet}”
          </p>
        ) : null}
        <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 dark:bg-rose-950/30">
          <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
            신고 사유 — {item.reporterName ?? "(이름 없음)"}
          </p>
          <p className="text-foreground mt-1 text-[13px] leading-relaxed whitespace-pre-line">
            {item.reason}
          </p>
        </div>

        {isPending ? (
          <fetcher.Form
            method="post"
            action="/api/community/report-resolve"
            className="mt-3 space-y-2"
          >
            <input type="hidden" name="reportId" value={item.reportId} />
            <Textarea
              name="actionNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="처리 노트(선택)"
              rows={2}
              className="bg-background text-xs"
              maxLength={500}
              disabled={busy}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-[11px]">
                <input
                  type="checkbox"
                  checked={alsoDelete}
                  onChange={(e) => setAlsoDelete(e.target.checked)}
                  disabled={busy}
                />
                <input
                  type="hidden"
                  name="alsoDelete"
                  value={alsoDelete ? "true" : "false"}
                />
                <TrashIcon className="size-3" /> 함께 삭제
              </label>
              {targetUrl ? (
                <Link
                  to={targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link text-[11px] hover:underline"
                >
                  대상 열기 ↗
                </Link>
              ) : null}
              <div className="ml-auto flex gap-1">
                <Button
                  type="submit"
                  name="status"
                  value="dismissed"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                >
                  <XCircleIcon className="size-3.5" /> 기각
                </Button>
                <Button
                  type="submit"
                  name="status"
                  value="resolved"
                  size="sm"
                  disabled={busy}
                >
                  <CheckCircle2Icon className="size-3.5" /> 처리
                </Button>
              </div>
            </div>
            {fetcher.data?.ok === false ? (
              <p className="text-rose-600 dark:text-rose-400 text-[11px]">
                ✗ {fetcher.data.error}
              </p>
            ) : null}
          </fetcher.Form>
        ) : item.actionNote ? (
          <p className="text-muted-foreground mt-3 text-[11px]">
            처리 노트: {item.actionNote}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
