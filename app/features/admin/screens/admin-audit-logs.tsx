// 감사 로그 뷰어 (feat-7-015) — admin 전용.
// /admin/audit-logs?action=...&entity_type=...&q=...&offset=...

import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  type AuditAnomalyItem,
  listAuditAnomalies,
  listAuditLogs,
} from "~/features/admin/queries/audit-log.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";

import type { Route } from "./+types/admin-audit-logs";

export const meta: Route.MetaFunction = () => [
  { title: "감사 로그 | 리담변리사학원" },
];

const PAGE_SIZE = 50;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager")) throw data("Forbidden — 관리자 이상만 접근 가능", { status: 403 });

  const url = new URL(request.url);
  const action = (url.searchParams.get("action") ?? "").trim().slice(0, 100);
  const entityType = (url.searchParams.get("entity_type") ?? "")
    .trim()
    .slice(0, 50);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const offsetRaw = url.searchParams.get("offset");
  const offset =
    offsetRaw && /^\d+$/.test(offsetRaw) ? Number(offsetRaw) : 0;

  const [{ items, total }, anomalies] = await Promise.all([
    listAuditLogs(client, {
      action: action || undefined,
      entityType: entityType || undefined,
      q: q || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    listAuditAnomalies(client, 24),
  ]);

  return {
    items,
    total,
    anomalies,
    filters: { action, entityType, q },
    offset,
    role,
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

function actionChipTone(action: string): "emerald" | "amber" | "coral" | "neutral" {
  const verb = action.split(".").pop() ?? "";
  if (verb === "create") return "emerald";
  if (verb === "update") return "amber";
  if (verb === "delete") return "coral";
  return "neutral";
}

export default function AdminAuditLogs({ loaderData }: Route.ComponentProps) {
  const { items, total, anomalies, filters, offset, role } = loaderData;
  const nextOffset = offset + PAGE_SIZE;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const hasNext = nextOffset < total;
  const hasPrev = offset > 0;
  const filterActive = !!(filters.q || filters.action || filters.entityType);

  function paginationParams(extra: Record<string, string>) {
    const p: Record<string, string> = {};
    if (filters.q) p.q = filters.q;
    if (filters.action) p.action = filters.action;
    if (filters.entityType) p.entity_type = filters.entityType;
    return new URLSearchParams({ ...p, ...extra }).toString();
  }

  return (
    <AdminShell
      cluster="comms"
      role={role}
      title="감사 로그"
      desc={`누가 · 언제 · 어떤 대상에 · 무엇을 했는지. 전체 ${total.toLocaleString("ko-KR")}건.`}
    >
      {/* 원장 전용 배지 */}
      <div className="mb-4 flex items-center gap-1.5">
        <ShieldCheckIcon className="text-link size-4" aria-hidden />
        <Chip tone="blue">원장 전용</Chip>
      </div>

      {/* 이상 신호 패널 — 최근 24시간 */}
      <AnomalyPanel anomalies={anomalies} />

      {/* 필터 바 */}
      <Form
        method="get"
        className="border-border bg-card mb-3 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
      >
        <FilterInput
          name="q"
          label="통합 검색"
          defaultValue={filters.q}
          placeholder="action / entity_type / entity_id"
          className="min-w-[200px] flex-1 basis-[240px] sm:max-w-[300px]"
        />
        <FilterInput
          name="action"
          label="action"
          defaultValue={filters.action}
          placeholder="예: case.delete"
          className="w-48"
        />
        <FilterInput
          name="entity_type"
          label="entity_type"
          defaultValue={filters.entityType}
          placeholder="예: case"
          className="w-36"
        />
        <Button type="submit" size="sm" variant="outline">
          적용
        </Button>
        {filterActive ? (
          <Link
            to="/admin/audit-logs"
            className="text-link inline-flex items-center gap-1 px-1 text-xs font-semibold"
          >
            <RefreshCwIcon className="size-3" /> 초기화
          </Link>
        ) : null}
      </Form>

      {/* 빈 상태 */}
      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-16 text-center shadow-sm">
          <ShieldCheckIcon className="size-8 opacity-30" />
          <p className="text-sm font-medium">
            {filterActive
              ? "조건에 맞는 로그가 없습니다."
              : "기록된 감사 로그가 없습니다."}
          </p>
        </div>
      ) : (
        <>
          <IndexTable
            minWidth={920}
            headers={[
              { label: "시각", width: "7rem" },
              { label: "작성자", width: "9rem" },
              { label: "action", width: "11rem" },
              { label: "entity_type", width: "8rem" },
              { label: "entity_id", width: "14rem" },
              { label: "metadata" },
            ]}
            footer={
              <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
                {offset + 1} – {Math.min(total, offset + items.length)} / {total.toLocaleString("ko-KR")}건
              </div>
            }
          >
            {items.map((it) => (
              <TR key={it.logId}>
                <TD mono soft>
                  <span title={it.createdAt}>{formatRelative(it.createdAt)}</span>
                </TD>
                <TD>
                  <span className="font-medium">{it.actorName ?? "(이름 없음)"}</span>
                  {it.actorRole ? (
                    <span className="text-muted-foreground ml-1 font-mono text-[10px]">
                      {it.actorRole}
                    </span>
                  ) : null}
                </TD>
                <TD>
                  <Chip tone={actionChipTone(it.action)} className="font-mono">
                    {it.action}
                  </Chip>
                </TD>
                <TD mono soft>
                  {it.entityType}
                </TD>
                <TD mono soft className="break-all text-[11px]">
                  {it.entityId}
                </TD>
                <TD>
                  {it.metadata ? (
                    <code className="bg-muted/40 block max-w-xs truncate rounded px-2 py-0.5 font-mono text-[11px]">
                      {JSON.stringify(it.metadata)}
                    </code>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TD>
              </TR>
            ))}
          </IndexTable>

          {/* 페이지네이션 */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              asChild={hasPrev}
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              className="h-8"
            >
              {hasPrev ? (
                <Link to={`?${paginationParams({ offset: String(prevOffset) })}`}>
                  <ChevronLeftIcon className="size-3.5" /> 이전
                </Link>
              ) : (
                <span>
                  <ChevronLeftIcon className="size-3.5" /> 이전
                </span>
              )}
            </Button>
            <Button
              asChild={hasNext}
              variant="outline"
              size="sm"
              disabled={!hasNext}
              className="h-8"
            >
              {hasNext ? (
                <Link to={`?${paginationParams({ offset: String(nextOffset) })}`}>
                  다음 <ChevronRightIcon className="size-3.5" />
                </Link>
              ) : (
                <span>
                  다음 <ChevronRightIcon className="size-3.5" />
                </span>
              )}
            </Button>
          </div>
        </>
      )}
    </AdminShell>
  );
}

/* ── 이상 신호 패널 ───────────────────────────────────────────────────── */

function anomalyTone(severity: AuditAnomalyItem["severity"]): {
  bg: string;
  border: string;
  text: string;
  label: string;
} {
  if (severity === "high")
    return {
      bg: "bg-rose-50 dark:bg-rose-950/30",
      border: "border-rose-300/60 dark:border-rose-700/40",
      text: "text-rose-700 dark:text-rose-300",
      label: "심각",
    };
  if (severity === "medium")
    return {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-300/60 dark:border-amber-700/40",
      text: "text-amber-700 dark:text-amber-300",
      label: "주의",
    };
  return {
    bg: "bg-sky-50 dark:bg-sky-950/30",
    border: "border-sky-300/60 dark:border-sky-700/40",
    text: "text-sky-700 dark:text-sky-300",
    label: "관찰",
  };
}

function anomalyTypeLabel(type: AuditAnomalyItem["anomalyType"]): string {
  if (type === "bulk_delete") return "다건 삭제 burst";
  return "권한 변경";
}

function AnomalyPanel({ anomalies }: { anomalies: AuditAnomalyItem[] }) {
  if (anomalies.length === 0) {
    return (
      <div className="border-border bg-muted/30 mb-4 flex items-center gap-2 rounded-xl border border-dashed p-3 text-xs">
        <ShieldCheckIcon className="size-3.5 text-emerald-600" aria-hidden />
        <span className="text-muted-foreground">
          최근 24시간 이상 신호 없음.
        </span>
      </div>
    );
  }
  const highCount = anomalies.filter((a) => a.severity === "high").length;
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangleIcon className="size-3.5 text-rose-600" aria-hidden />
        <p className="text-foreground text-xs font-bold">
          이상 신호 — 최근 24시간 {anomalies.length}건
          {highCount > 0 ? (
            <span className="text-rose-600 dark:text-rose-300">
              {" "}
              · 심각 {highCount}건
            </span>
          ) : null}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {anomalies.slice(0, 9).map((a) => {
          const tone = anomalyTone(a.severity);
          return (
            <div
              key={a.sampleLogId}
              className={cn(
                "rounded-xl border p-3 shadow-sm",
                tone.bg,
                tone.border,
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "font-mono text-[10px] font-bold tracking-[0.06em] uppercase",
                    tone.text,
                  )}
                >
                  {anomalyTypeLabel(a.anomalyType)}
                </span>
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold",
                    tone.bg,
                    tone.text,
                  )}
                >
                  {tone.label}
                </span>
              </div>
              <p className="text-foreground mt-1.5 text-[13px] font-semibold">
                {a.actorName ?? "(이름 없음)"} · {a.entityType}
              </p>
              <p className="text-muted-foreground mt-0.5 font-mono text-[11px] tabular-nums">
                {new Date(a.bucketStart).toLocaleString("ko-KR")}
              </p>
              {a.anomalyType === "bulk_delete" ? (
                <p className="text-foreground mt-1 text-[12px]">
                  1시간 윈도우{" "}
                  <span className="font-bold">{a.eventCount}건</span> 삭제
                </p>
              ) : (
                <p className="text-foreground mt-1 text-[12px]">
                  대상 profile_id:{" "}
                  <code className="bg-muted/40 rounded px-1 font-mono text-[10px]">
                    {String(
                      (a.detail?.subject_profile_id as string | undefined) ?? "",
                    ).slice(0, 8)}
                    …
                  </code>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── 로컬 서브컴포넌트 ────────────────────────────────────────────────── */

function FilterInput({
  name,
  label,
  defaultValue,
  placeholder,
  className,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </span>
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={label}
        className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] outline-none"
      />
    </label>
  );
}
