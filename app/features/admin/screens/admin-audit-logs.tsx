// 감사 로그 뷰어 (feat-7-015) — admin 전용.
// /admin/audit-logs?action=...&entity_type=...&q=...&offset=...

import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

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
import { listAuditLogs } from "~/features/admin/queries/audit-log.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-audit-logs";

export const meta: Route.MetaFunction = () => [
  { title: "감사 로그 | Lidam Edu" },
];

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
  const action = (url.searchParams.get("action") ?? "").trim().slice(0, 100);
  const entityType = (url.searchParams.get("entity_type") ?? "")
    .trim()
    .slice(0, 50);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const offsetRaw = url.searchParams.get("offset");
  const offset =
    offsetRaw && /^\d+$/.test(offsetRaw) ? Number(offsetRaw) : 0;

  const { items, total } = await listAuditLogs(client, {
    action: action || undefined,
    entityType: entityType || undefined,
    q: q || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  return {
    items,
    total,
    filters: { action, entityType, q },
    offset,
  };
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return iso.slice(0, 10);
}

const ACTION_TONE: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  update: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  delete: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
};

function actionTone(action: string): string {
  const verb = action.split(".").pop() ?? "";
  return ACTION_TONE[verb] ?? "bg-muted text-foreground";
}

export default function AdminAuditLogs({ loaderData }: Route.ComponentProps) {
  const { items, total, filters, offset } = loaderData;
  const nextOffset = offset + PAGE_SIZE;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const hasNext = nextOffset < total;
  const hasPrev = offset > 0;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
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
        <h1 className="text-2xl font-bold tracking-tight">감사 로그</h1>
        <p className="text-muted-foreground text-sm">
          누가 · 언제 · 어떤 entity 에 · 무엇을 했는지. 전체 {total.toLocaleString("ko-KR")}건.
        </p>
      </header>

      <Form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-2"
      >
        <Input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="action / entity_type / entity_id 검색"
          className="h-9 max-w-sm"
        />
        <Input
          name="action"
          defaultValue={filters.action}
          placeholder="action (예: case.delete)"
          className="h-9 w-48"
        />
        <Input
          name="entity_type"
          defaultValue={filters.entityType}
          placeholder="entity_type (예: case)"
          className="h-9 w-40"
        />
        <Button type="submit" size="sm" className="h-9">
          적용
        </Button>
        {filters.q || filters.action || filters.entityType ? (
          <Link
            to="/admin/audit-logs"
            className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center px-2 text-xs"
          >
            초기화
          </Link>
        ) : null}
      </Form>

      {items.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            기록된 감사 로그가 없습니다.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[920px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">시각</TableHead>
                  <TableHead className="w-36">작성자</TableHead>
                  <TableHead className="w-40">action</TableHead>
                  <TableHead className="w-28">entity_type</TableHead>
                  <TableHead className="w-60">entity_id</TableHead>
                  <TableHead>metadata</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.logId}>
                    <TableCell
                      className="text-muted-foreground text-xs tabular-nums"
                      title={it.createdAt}
                    >
                      {formatRelative(it.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">
                        {it.actorName ?? "(이름 없음)"}
                      </span>
                      {it.actorRole ? (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          {it.actorRole}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] ${actionTone(it.action)}`}
                      >
                        {it.action}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {it.entityType}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] break-all">
                      {it.entityId}
                    </TableCell>
                    <TableCell className="text-[11px]">
                      {it.metadata ? (
                        <code className="bg-muted/40 block max-w-md truncate rounded px-2 py-0.5">
                          {JSON.stringify(it.metadata)}
                        </code>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-muted-foreground tabular-nums">
          {offset + 1} – {Math.min(total, offset + items.length)} / {total}
        </span>
        <div className="flex gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            className="h-8"
          >
            {hasPrev ? (
              <Link
                to={`?${new URLSearchParams({
                  ...(filters.q ? { q: filters.q } : {}),
                  ...(filters.action ? { action: filters.action } : {}),
                  ...(filters.entityType
                    ? { entity_type: filters.entityType }
                    : {}),
                  offset: String(prevOffset),
                }).toString()}`}
              >
                <ChevronLeftIcon className="size-3.5" /> 이전
              </Link>
            ) : (
              <span>
                <ChevronLeftIcon className="size-3.5" /> 이전
              </span>
            )}
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={!hasNext}
            className="h-8"
          >
            {hasNext ? (
              <Link
                to={`?${new URLSearchParams({
                  ...(filters.q ? { q: filters.q } : {}),
                  ...(filters.action ? { action: filters.action } : {}),
                  ...(filters.entityType
                    ? { entity_type: filters.entityType }
                    : {}),
                  offset: String(nextOffset),
                }).toString()}`}
              >
                다음 <ChevronRightIcon className="size-3.5" />
              </Link>
            ) : (
              <span>
                다음 <ChevronRightIcon className="size-3.5" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
