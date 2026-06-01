// feat-7-035 수강생 위험군 통합 큐 — 모든 cohort 의 at-risk 학생을 한 화면에서.
// feat-8-014 단일 cohort getAtRiskStudents 의 cross-cohort 확장.
// 강사 (instructor) 는 자기 cohort 만, manager+ 는 전체.

import {
  AlertCircleIcon,
  MessageSquareIcon,
  SendIcon,
  UserCheckIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Form, Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { getCrossCohortAtRisk } from "~/features/admin/queries/at-risk-cross-cohort.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-at-risk";

export const meta: Route.MetaFunction = () => [
  { title: "수강생 위험군 | Lidam" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const cohortFilter = url.searchParams.get("cohort") ?? undefined;
  const riskFilter = url.searchParams.get("risk") as
    | "high"
    | "medium"
    | "low"
    | null;

  const summary = await getCrossCohortAtRisk(client, {
    callerRole: role,
    callerId: user.id,
    cohortId: cohortFilter,
    riskLevel: riskFilter ?? undefined,
  });

  return { role, summary, filters: { cohort: cohortFilter, risk: riskFilter } };
}

function riskTone(level: "high" | "medium" | "low"): {
  bg: string;
  text: string;
  label: string;
} {
  if (level === "high")
    return {
      bg: "bg-rose-50 dark:bg-rose-950/30",
      text: "text-rose-700 dark:text-rose-300",
      label: "고위험",
    };
  if (level === "medium")
    return {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      text: "text-amber-700 dark:text-amber-300",
      label: "주의",
    };
  return {
    bg: "bg-sky-50 dark:bg-sky-950/30",
    text: "text-sky-700 dark:text-sky-300",
    label: "관찰",
  };
}

export default function AdminAtRisk({ loaderData }: Route.ComponentProps) {
  const { role, summary, filters } = loaderData;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(
    "최근 학습이 뜸하네요. 짧게라도 매일 들여다보면 다시 페이스를 찾을 수 있어요. 함께해요!",
  );
  const fetcher = useFetcher<{ ok: boolean; sent?: number; error?: string }>();
  const sending = fetcher.state !== "idle";

  // 발송 성공 시 선택 해제.
  useEffect(() => {
    if (fetcher.data?.ok) {
      setSelected(new Set());
    }
  }, [fetcher.data]);

  const allIds = useMemo(
    () => summary.students.map((s) => s.profileId),
    [summary.students],
  );
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }

  return (
    <AdminShell
      cluster="students"
      role={role}
      title="위험 수강생 (7일 무접속)"
      desc="모든 활성 반의 위험 학생을 한 화면에서. 학생을 선택해 일괄 격려 메시지를 발송하세요."
      width={1280}
    >
      {/* KPI Row */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile
          label="고위험"
          value={summary.highRiskCount}
          tone="rose"
        />
        <KpiTile
          label="주의"
          value={summary.mediumRiskCount}
          tone="amber"
        />
        <KpiTile
          label="관찰"
          value={summary.lowRiskCount}
          tone="sky"
        />
        <KpiTile
          label="합격자 표본"
          value={summary.baselineSampleSize ?? 0}
          tone="neutral"
          hint="baseline 표본 (분석 동의 합격자)"
        />
      </div>

      {/* Filter bar */}
      <Form
        method="get"
        className="border-border bg-card mb-4 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold">반</span>
          <select
            name="cohort"
            defaultValue={filters.cohort ?? ""}
            className="border-input bg-background focus:border-primary h-9 w-56 rounded-md border px-2 text-[13px] outline-none"
          >
            <option value="">전체</option>
            {summary.cohorts.map((c) => (
              <option key={c.cohortId} value={c.cohortId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold">위험 레벨</span>
          <select
            name="risk"
            defaultValue={filters.risk ?? ""}
            className="border-input bg-background focus:border-primary h-9 w-36 rounded-md border px-2 text-[13px] outline-none"
          >
            <option value="">전체</option>
            <option value="high">고위험</option>
            <option value="medium">주의</option>
            <option value="low">관찰</option>
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline">
          적용
        </Button>
      </Form>

      {/* Bulk notify */}
      {selected.size > 0 ? (
        <fetcher.Form
          method="post"
          action="/api/admin/at-risk-notify"
          className="border-primary/50 bg-primary/5 mb-4 rounded-xl border p-4"
        >
          <input type="hidden" name="intent" value="send-encouragement" />
          <input
            type="hidden"
            name="profileIds"
            value={Array.from(selected).join(",")}
          />
          <div className="mb-2 flex items-center gap-2">
            <SendIcon className="text-primary size-4" aria-hidden />
            <p className="text-sm font-bold">
              일괄 격려 메시지 — {selected.size}명 대상
            </p>
          </div>
          <Textarea
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={300}
            className="bg-background"
            disabled={sending}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-[11px]">
              인박스(대시보드) 알림으로 발송됩니다. (카카오 알림톡·이메일은 v1.1)
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelected(new Set())}
                disabled={sending}
              >
                선택 해제
              </Button>
              <Button type="submit" size="sm" disabled={sending}>
                <SendIcon className="size-3.5" /> 발송
              </Button>
            </div>
          </div>
          {fetcher.data?.ok ? (
            <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              ✓ {fetcher.data.sent}명에게 발송 완료
            </p>
          ) : null}
          {fetcher.data?.ok === false ? (
            <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
              ✗ {fetcher.data.error}
            </p>
          ) : null}
        </fetcher.Form>
      ) : null}

      {/* Student table */}
      {summary.students.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-16 text-center shadow-sm">
          <UserCheckIcon className="size-8 opacity-30" />
          <p className="text-sm font-medium">위험 신호가 감지된 학생이 없습니다.</p>
        </div>
      ) : (
        <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/60">
                  <th className="px-2 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="모두 선택"
                    />
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                    학생
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                    반
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                    risk
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                    정답률
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                    풀이수
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                    무접속
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                    위험 사유
                  </th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {summary.students.map((s) => {
                  const tone = riskTone(s.riskLevel);
                  const checked = selected.has(s.profileId);
                  return (
                    <tr
                      key={s.profileId}
                      className="border-border/60 border-t first:border-t-0"
                    >
                      <td className="px-2 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(s.profileId)}
                          aria-label={`${s.name} 선택`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          to={`/admin/students/${s.profileId}#notes`}
                          className="text-foreground text-[13px] font-semibold hover:underline"
                          viewTransition
                        >
                          {s.name}
                        </Link>
                        <p className="text-muted-foreground mt-0.5 text-[11px]">
                          {s.email ?? ""}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          to={`/admin/cohorts/${s.cohortId}`}
                          className="text-muted-foreground text-[12px] hover:underline"
                          viewTransition
                        >
                          {s.cohortName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={cn(
                            "inline-flex h-5 items-center rounded-full px-2 font-mono text-[10px] font-bold tabular-nums",
                            tone.bg,
                            tone.text,
                          )}
                        >
                          {tone.label} {Math.round(s.riskScore * 100)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                        {s.accuracyPct === null
                          ? "—"
                          : `${s.accuracyPct}%`}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                        {s.problemsAttempted.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                        {s.daysSinceActive === null
                          ? "—"
                          : `${s.daysSinceActive}d`}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {s.reasons.slice(0, 3).map((r, i) => (
                            <Chip key={`${s.profileId}-${i}`} tone="neutral">
                              {r}
                            </Chip>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link
                            to={`/admin/students/${s.profileId}#notes`}
                            viewTransition
                          >
                            <MessageSquareIcon className="size-3.5" /> 노트
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
        <AlertCircleIcon
          className="mr-1 inline size-3 text-amber-600"
          aria-hidden
        />
        risk score = 정답률 격차 0.5 + 풀이 격차 0.3 + 비활성 0.2 (합격자 평균
        기준). 같은 학생이 여러 반에 있으면 가장 높은 risk 만 노출.
      </p>
    </AdminShell>
  );
}

function KpiTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "rose" | "amber" | "sky" | "neutral";
  hint?: string;
}) {
  const cls =
    tone === "rose"
      ? "border-rose-300/60 bg-rose-50/60 dark:border-rose-700/40 dark:bg-rose-950/30"
      : tone === "amber"
        ? "border-amber-300/60 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-950/30"
        : tone === "sky"
          ? "border-sky-300/60 bg-sky-50/60 dark:border-sky-700/40 dark:bg-sky-950/30"
          : "border-border bg-card";
  const labelCls =
    tone === "rose"
      ? "text-rose-700 dark:text-rose-300"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "sky"
          ? "text-sky-700 dark:text-sky-300"
          : "text-muted-foreground";
  return (
    <div title={hint} className={cn("rounded-xl border p-3.5 shadow-sm", cls)}>
      <p
        className={cn(
          "font-mono text-[10px] font-bold tracking-[0.06em] uppercase",
          labelCls,
        )}
      >
        {label}
      </p>
      <p className="text-foreground mt-1.5 text-[22px] leading-none font-extrabold tracking-tight tabular-nums">
        {value.toLocaleString("ko-KR")}
      </p>
    </div>
  );
}
