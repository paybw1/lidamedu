// Phase 3 Stage 3 — 일일 기록 (/study/plan/log?date=YYYY-MM-DD).
// 선택지 = 기대 항목 파생(§3.2 — 기간 × 요일범위). ★노드 선택기 없음 — 노드는
// 계획 수립 시 1회만. 계획 외 학습 추가에서만 선택기 등장(미분류 허용, E1).
// 모바일 2탭: [계획대로 완료] 1탭 / 부분 기록 = 프리셋 1탭 + 저장 1탭.

import type { Route } from "./+types/study-plan-log";

import {
  CheckCircle2Icon,
  PlusIcon,
  Undo2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher, useLocation, useNavigate } from "react-router";

import { AreaEyebrow, StudentShell } from "~/core/components/student";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { getWeakNodes } from "~/features/subjects/lib/weak-nodes.server";
import { MinutesField } from "~/features/study-plans/components/minutes-field";
import { NodePicker } from "~/features/study-plans/components/node-picker";
import {
  DAY_SCOPE_LABEL,
  PLAN_ACTIVITY_LABEL,
  PLAN_ACTIVITY_TYPES,
  currentMonthPeriod,
  formatMinutes,
  type PlanActivityType,
} from "~/features/study-plans/labels";
import { PlanCalendar } from "~/features/study-plans/components/plan-calendar";
import {
  addDaysISO,
  buildCalendarDays,
  expectedItemsForDate,
  isWeekendDate,
} from "~/features/study-plans/lib/expected-items";
import {
  getActivePlan,
  listLevelBasedNodeSuggestions,
  listLogsForDate,
  listLogsForRange,
  listPlanItems,
  listRecentPlanNodes,
} from "~/features/study-plans/queries.server";

export const meta: Route.MetaFunction = () => [
  { title: "오늘 학습 기록 | 리담변리사학원" },
];

function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  return kst.toISOString().slice(0, 10);
}

/** 날짜가 속한 달의 [1일, 말일]. */
function monthRangeOf(dateISO: string): { monthStart: string; monthEnd: string } {
  const y = Number(dateISO.slice(0, 4));
  const m = Number(dateISO.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    monthStart: `${dateISO.slice(0, 8)}01`,
    monthEnd: `${dateISO.slice(0, 8)}${String(last).padStart(2, "0")}`,
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKST();

  const { periodStart } = currentMonthPeriod();
  // 기록 기준 계획 = 현재 승인본 (없으면 in-flight 라도 기대 항목 표시는 승인본만).
  const { data: approvedRow } = await client
    .from("study_plans")
    .select("plan_id")
    .eq("user_id", user.id)
    .eq("period_start", periodStart)
    .eq("status", "approved")
    .maybeSingle();
  const activePlan = approvedRow
    ? null
    : await getActivePlan(client, user.id, periodStart);
  const items = approvedRow ? await listPlanItems(client, approvedRow.plan_id) : [];
  const expected = expectedItemsForDate(items, date);

  // 미니 캘린더 — 보고 있는 날짜가 속한 달 전체의 달성 현황.
  const { monthStart, monthEnd } = monthRangeOf(date);
  const [logs, monthLogs, weak, recentNodes, levelNodes] = await Promise.all([
    listLogsForDate(client, user.id, date),
    listLogsForRange(client, user.id, monthStart, monthEnd),
    getWeakNodes(client, user.id, ["patent", "trademark", "design", "civil"], 5),
    listRecentPlanNodes(client, user.id),
    listLevelBasedNodeSuggestions(client, user.id),
  ]);

  return {
    date,
    today: todayKST(),
    monthStart,
    monthEnd,
    planItems: items.map((i) => ({
      itemId: i.itemId,
      dayScope: i.dayScope,
      startDate: i.startDate,
      endDate: i.endDate,
      dailyMinutes: i.dailyMinutes,
    })),
    monthLogs: monthLogs.map((l) => ({
      logId: l.logId,
      planItemId: l.planItemId,
      nodeId: l.nodeId,
      logDate: l.logDate,
      minutes: l.minutes,
      completion: l.completion,
      reversesLogId: l.reversesLogId,
    })),
    isWeekend: isWeekendDate(date),
    hasApprovedPlan: Boolean(approvedRow),
    inflightStatus: activePlan?.status ?? null,
    expected: expected.map((i) => ({
      itemId: i.itemId,
      title: i.title,
      activityType: i.activityType,
      dailyMinutes: i.dailyMinutes,
      dayScope: i.dayScope,
    })),
    logs,
    weakNodes: weak.map((w) => ({
      nodeId: w.nodeId,
      displayLabel: w.displayLabel,
      sub: `정답률 ${w.accuracyPct}%`,
    })),
    recentNodes,
    levelNodes,
  };
}

const API = "/api/study-plan";

export default function StudyPlanLog({ loaderData }: Route.ComponentProps) {
  const {
    date,
    today,
    monthStart,
    monthEnd,
    planItems,
    monthLogs,
    isWeekend,
    hasApprovedPlan,
    inflightStatus,
    expected,
    logs,
    weakNodes,
    recentNodes,
    levelNodes,
  } = loaderData;

  // 미니 캘린더 — 달성 현황 파생 + 월 이동 링크.
  const calendarDays = buildCalendarDays(planItems, monthLogs, monthStart, monthEnd, today);
  const prevMonthStart = `${addDaysISO(monthStart, -1).slice(0, 8)}01`;
  const nextMonthStart = addDaysISO(monthEnd, 1);

  // 항목별 유효(비취소) 기록 — 부호 합.
  const reversedIds = new Set(logs.map((l) => l.reversesLogId).filter(Boolean));
  const activeLogByItem = new Map(
    logs
      .filter((l) => l.minutes > 0 && l.planItemId && !reversedIds.has(l.logId))
      .map((l) => [l.planItemId as string, l]),
  );
  const extraLogs = logs.filter(
    (l) => l.minutes > 0 && !l.planItemId && !reversedIds.has(l.logId),
  );
  const totalMinutes = logs.reduce((s, l) => s + l.minutes, 0);

  return (
    <StudentShell width="narrow">
      <header className="mb-4">
        <AreaEyebrow area="manage" />
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            오늘 학습 기록
          </h1>
          <Link to="/study/plan" className="text-link text-xs hover:underline">
            월간 계획 →
          </Link>
        </div>
        <div className="bg-card mt-3 rounded-xl border p-3 shadow-sm">
          <PlanCalendar
            variant="mini"
            days={calendarDays}
            todayISO={today}
            selectedDate={date}
            dayHref={(d) => `?date=${d.date}`}
            prevHref={`?date=${prevMonthStart}`}
            nextHref={`?date=${nextMonthStart}`}
          />
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="font-medium tabular-nums">
            {date} ({isWeekend ? "주말" : "평일"})
          </span>
          {date !== today ? (
            <Link to={`?date=${today}`} className="text-link text-xs hover:underline">
              오늘로
            </Link>
          ) : null}
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            합계 {formatMinutes(totalMinutes)}
          </span>
        </div>
      </header>

      {!hasApprovedPlan ? (
        <p className="text-muted-foreground mb-4 rounded-lg border border-dashed px-3 py-2 text-xs">
          {inflightStatus === "submitted"
            ? "계획이 검토 중입니다 — 승인되면 계획 항목이 여기 나타납니다. 그 전에도 아래에서 학습을 기록할 수 있어요."
            : inflightStatus
              ? "계획이 아직 승인되지 않았습니다 — 아래 '계획에 없던 학습'으로 기록할 수 있어요."
              : "이번 달 승인된 계획이 없습니다 — 기록은 가능하며, 이 달 준수율은 평가에서 제외됩니다."}
        </p>
      ) : null}

      {/* 기대 항목 — 노드 선택기 없음 */}
      {expected.length > 0 ? (
        <ul className="space-y-2">
          {expected.map((item) => (
            <ExpectedItemCard
              key={item.itemId}
              date={date}
              item={item}
              log={activeLogByItem.get(item.itemId) ?? null}
            />
          ))}
        </ul>
      ) : hasApprovedPlan ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-xs">
          오늘({isWeekend ? "주말" : "평일"}) 해당하는 계획 항목이 없습니다.
        </p>
      ) : null}

      {/* 계획 외 기록 목록 */}
      {extraLogs.length > 0 ? (
        <div className="mt-4">
          <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
            계획 외 학습
          </p>
          <ul className="space-y-1.5">
            {extraLogs.map((l) => (
              <li
                key={l.logId}
                className="bg-card flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1">
                  {PLAN_ACTIVITY_LABEL[l.activityType]}
                  {l.nodeId ? null : (
                    <span className="text-muted-foreground"> · 미분류</span>
                  )}
                </span>
                <span className="tabular-nums">{formatMinutes(l.minutes)}</span>
                <ReverseButton logId={l.logId} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 계획 외 학습 추가 — 여기서만 노드 선택기(미분류 허용) */}
      <ExtraLogForm
        date={date}
        weakNodes={[...weakNodes, ...levelNodes]}
        recentNodes={recentNodes}
      />
    </StudentShell>
  );
}

type ExpectedItem = Awaited<ReturnType<typeof loader>>["expected"][number];
type LogRow = Awaited<ReturnType<typeof loader>>["logs"][number];

function useReload() {
  const navigate = useNavigate();
  const location = useLocation();
  return () =>
    navigate(location.pathname + location.search, {
      replace: true,
      preventScrollReset: true,
    });
}

function ExpectedItemCard({
  date,
  item,
  log,
}: {
  date: string;
  item: ExpectedItem;
  log: LogRow | null;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  const [partial, setPartial] = useState(false);
  const [minutes, setMinutes] = useState(String(Math.max(5, Math.round(item.dailyMinutes / 2))));
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      setPartial(false);
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const submit = (min: number, completion: "full" | "partial") => {
    const fd = new FormData();
    fd.set("intent", "add_log");
    fd.set("logDate", date);
    fd.set("planItemId", item.itemId);
    fd.set("activityType", item.activityType);
    fd.set("minutes", String(min));
    fd.set("completion", completion);
    fetcher.submit(fd, { method: "post", action: API });
  };

  return (
    <li
      className={cn(
        "bg-card rounded-xl border px-3 py-2.5 shadow-sm",
        log && "border-emerald-300 dark:border-emerald-800",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <p className="text-muted-foreground text-[11px]">
            {PLAN_ACTIVITY_LABEL[item.activityType]} · {DAY_SCOPE_LABEL[item.dayScope]} 목표{" "}
            {formatMinutes(item.dailyMinutes)}
          </p>
        </div>
        {log ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2Icon className="size-4" /> {formatMinutes(log.minutes)}
              {log.completion === "partial" ? " (부분)" : ""}
            </span>
            <ReverseButton logId={log.logId} />
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* 1탭 — 계획대로 완료 */}
            <Button
              size="sm"
              className="h-8"
              disabled={fetcher.state !== "idle"}
              onClick={() => submit(item.dailyMinutes, "full")}
            >
              완료 {formatMinutes(item.dailyMinutes)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setPartial((v) => !v)}
            >
              부분
            </Button>
          </div>
        )}
      </div>
      {partial && !log ? (
        <div className="mt-2 flex items-center gap-1.5">
          {[15, 30, 60, 90].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(String(m))}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
                minutes === String(m)
                  ? "border-primary bg-primary/10 text-link font-semibold"
                  : "border-border text-muted-foreground",
              )}
            >
              {formatMinutes(m)}
            </button>
          ))}
          <Input
            type="number"
            min={1}
            max={1440}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="h-7 w-20 text-xs tabular-nums"
          />
          <Button
            size="sm"
            className="h-7"
            disabled={fetcher.state !== "idle" || !Number(minutes)}
            onClick={() => submit(Number(minutes), "partial")}
          >
            기록
          </Button>
        </div>
      ) : null}
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="mt-1 text-[11px] text-rose-600">{fetcher.data.error}</p>
      ) : null}
    </li>
  );
}

function ReverseButton({ logId }: { logId: string }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7"
      title="기록 취소 (취소 내역이 남습니다)"
      disabled={fetcher.state !== "idle"}
      onClick={() => {
        const fd = new FormData();
        fd.set("intent", "reverse_log");
        fd.set("logId", logId);
        fetcher.submit(fd, { method: "post", action: API });
      }}
    >
      <Undo2Icon className="size-3.5" />
    </Button>
  );
}

function ExtraLogForm({
  date,
  weakNodes,
  recentNodes,
}: {
  date: string;
  weakNodes: Array<{ nodeId: string; displayLabel: string; sub?: string | null }>;
  recentNodes: Array<{ nodeId: string; displayLabel: string }>;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  const [open, setOpen] = useState(false);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [nodeLabel, setNodeLabel] = useState<string | null>(null);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      setOpen(false);
      setNodeId(null);
      setNodeLabel(null);
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  if (!open) {
    return (
      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <PlusIcon className="size-3.5" /> 계획에 없던 학습 추가
        </Button>
      </div>
    );
  }
  return (
    <fetcher.Form
      method="post"
      action={API}
      className="bg-card mt-4 space-y-2 rounded-xl border p-3 shadow-sm"
    >
      <input type="hidden" name="intent" value="add_log" />
      <input type="hidden" name="logDate" value={date} />
      {nodeId ? <input type="hidden" name="nodeId" value={nodeId} /> : null}
      <p className="text-xs font-semibold">계획에 없던 학습</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-muted-foreground text-[11px]">활동</label>
          <select
            name="activityType"
            className="border-input bg-background mt-0.5 h-8 w-full rounded-md border px-1.5 text-xs"
          >
            {PLAN_ACTIVITY_TYPES.map((t: PlanActivityType) => (
              <option key={t} value={t}>
                {PLAN_ACTIVITY_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <MinutesField label="시간" name="minutes" defaultMinutes={30} required />
      </div>
      {/* 미분류 허용 — 노드는 선택 사항 (E1) */}
      <NodePicker
        weakNodes={weakNodes}
        recentNodes={recentNodes}
        value={nodeId}
        valueLabel={nodeLabel}
        onChange={(id, label) => {
          setNodeId(id);
          setNodeLabel(label);
        }}
      />
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="text-[11px] text-rose-600">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          기록
        </Button>
      </div>
    </fetcher.Form>
  );
}
