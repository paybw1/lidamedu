// Phase 3 — 학생 월간 계획 작성 (/study/plan).
// 항목 추가 → 노드 부착(약점·최근 기본 진입) → 실시간 과욕 지수 → 제출.
// 반 공통 과제는 표시만(F3 — 복제 금지). 승인 후 항목 불변(수정 = 새 버전).

import type { Route } from "./+types/study-plan";

import {
  CalendarIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { data, useFetcher, useLocation, useNavigate } from "react-router";

import { AreaEyebrow, StudentShell } from "~/core/components/student";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { getWeakNodes } from "~/features/subjects/lib/weak-nodes.server";
import { MinutesField } from "~/features/study-plans/components/minutes-field";
import { NodePicker } from "~/features/study-plans/components/node-picker";
import { SubjectColorBar } from "~/features/study-plans/components/subject-color-bar";
import { SubjectSelect } from "~/features/study-plans/components/subject-select";
import {
  PlanCalendar,
  type CalendarHighlight,
} from "~/features/study-plans/components/plan-calendar";
import { buildCalendarDays } from "~/features/study-plans/lib/expected-items";
import { StudyStatsCard } from "~/features/study-plans/components/study-stats/study-stats-card";
import {
  DAY_SCOPE_LABEL,
  PLAN_ACTIVITY_LABEL,
  PLAN_ACTIVITY_TYPES,
  PLAN_STATUS_LABEL,
  computeOverloadIndex,
  currentMonthPeriod,
  formatMinutes,
  overloadTone,
  type DayScope,
  type PlanActivityType,
} from "~/features/study-plans/labels";
import {
  countPlanVersions,
  getActivePlan,
  getPeriodCompliance,
  getStudentDiagnostics,
  listLevelBasedNodeSuggestions,
  listLogsForRange,
  listPeriodAssignments,
  listPlanItems,
  listRecentPlanNodes,
  listSubjectColors,
  attachDerivedSubjects,
} from "~/features/study-plans/queries.server";

export const meta: Route.MetaFunction = () => [
  { title: "월간 계획 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  // 소속 반 — 최근 가입 1개 (종합반 전용 화면).
  const { data: membership } = await client
    .from("cohort_members")
    .select("cohort_id")
    .eq("profile_id", user.id)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cohortId = membership?.cohort_id ?? null;

  const { periodStart, periodEnd } = currentMonthPeriod();
  const [plan, diagnostics] = await Promise.all([
    getActivePlan(client, user.id, periodStart),
    getStudentDiagnostics(client, user.id),
  ]);
  const [items, versionCount, recentNodes, weak, assignments, lessonRows] =
    await Promise.all([
      plan ? listPlanItems(client, plan.planId) : Promise.resolve([]),
      countPlanVersions(client, user.id, periodStart),
      listRecentPlanNodes(client, user.id),
      getWeakNodes(client, user.id, ["patent", "trademark", "design", "civil"], 5),
      cohortId
        ? listPeriodAssignments(client, cohortId, user.id, periodStart, periodEnd)
        : Promise.resolve([]),
      // 강의 참조 선택지 — resolver(lesson_node_links) 입력. RLS 로 안 보이면 빈 목록.
      client
        .from("course_lessons")
        .select("lesson_id, title")
        .order("title")
        .limit(300)
        .then((r) => r.data ?? []),
    ]);

  // 항목 노드 라벨 보강 (표시용).
  const nodeIds = [...new Set(items.map((i) => i.nodeId).filter((v): v is string => !!v))];
  const labelByNode = new Map<string, string>();
  if (nodeIds.length > 0) {
    const { data: nodes } = await client
      .from("systematic_nodes")
      .select("node_id, display_label")
      .in("node_id", nodeIds);
    for (const n of nodes ?? []) labelByNode.set(n.node_id, n.display_label);
  }

  // Stage 3 — 신규 학생 빈 상태 폴백(승인 §1-1 권장안): 약점·최근이 모두 비면
  // 과목별 수준(진단 직후 최신) 기반 상위 노드 제안.
  const levelNodes =
    weak.length === 0 && recentNodes.length === 0
      ? await listLevelBasedNodeSuggestions(client, user.id)
      : [];

  // Stage 3 — 지표(승인 2.2: 현재 승인본 기준). 승인본이 있을 때만.
  const todayISO = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const compliance =
    plan?.status === "approved" || plan?.status === "submitted"
      ? await getPeriodCompliance(client, user.id, periodStart, todayISO)
      : null;

  // 캘린더 달성 점 — 승인본이 있을 때만 (초안 단계 '미기록' 소음 방지).
  const monthLogs =
    plan?.status === "approved"
      ? (await listLogsForRange(client, user.id, periodStart, periodEnd)).map(
          (l) => ({
            logId: l.logId,
            planItemId: l.planItemId,
            nodeId: l.nodeId,
            logDate: l.logDate,
            minutes: l.minutes,
            completion: l.completion,
            reversesLogId: l.reversesLogId,
          }),
        )
      : [];

  // 공부 통계(feat-7-048) — 계획 상태와 무관하게 이 달 기록 전부. 과거 로그는
  // 과목 컬럼이 비어 있어 조회 시점에 파생한다(원장은 append-only).
  const [statLogs, colorOverrides] = await Promise.all([
    listLogsForRange(client, user.id, periodStart, periodEnd).then((rows) =>
      attachDerivedSubjects(client, rows),
    ),
    listSubjectColors(client, user.id),
  ]);

  return {
    statLogs,
    colorOverrides,
    todayISO,
    monthLogs,
    cohortId,
    periodStart,
    periodEnd,
    plan,
    items: items.map((i) => ({
      ...i,
      nodeLabel: i.nodeId ? (labelByNode.get(i.nodeId) ?? null) : null,
    })),
    versionCount,
    // 상담자가 손댄 계획인지 — 계획을 대신 쓴 경우(authored_by)와 학생 제출본의
    // 항목만 손본 경우(items.updated_by) 둘 다 배지를 붙인다(feat-7-048).
    staffEdited:
      plan?.authoredBy != null || items.some((i) => i.updatedBy != null),
    diagnostics: diagnostics
      ? {
          weekdayMinutes: diagnostics.weekdayMinutes,
          weekendMinutes: diagnostics.weekendMinutes,
        }
      : null,
    weakNodes: weak.map((w) => ({
      nodeId: w.nodeId,
      displayLabel: w.displayLabel,
      sub: `정답률 ${w.accuracyPct}%`,
    })),
    recentNodes,
    levelNodes,
    assignments,
    lessons: lessonRows.map((l) => ({ lessonId: l.lesson_id, title: l.title })),
    compliance: compliance?.noPlan
      ? null
      : compliance
        ? {
            totalExpectedMinutes: compliance.metrics!.totalExpectedMinutes,
            totalActualMinutes: compliance.metrics!.totalActualMinutes,
            unclassifiedRatio: compliance.metrics!.unclassifiedRatio,
            items: compliance.metrics!.items.map((m) => ({
              ...m,
              title: compliance.itemTitles.get(m.itemId) ?? "",
            })),
          }
        : null,
  };
}

const API = "/api/study-plan";

type LoaderItem = Awaited<ReturnType<typeof loader>>["items"][number];

function useReload() {
  const navigate = useNavigate();
  const location = useLocation();
  return () =>
    navigate(location.pathname + location.search, {
      replace: true,
      preventScrollReset: true,
    });
}

export default function StudyPlanScreen({ loaderData }: Route.ComponentProps) {
  const {
    cohortId,
    periodStart,
    periodEnd,
    plan,
    items,
    versionCount,
    staffEdited,
    diagnostics,
    weakNodes,
    recentNodes,
    levelNodes,
    assignments,
    lessons,
    compliance,
    todayISO,
    monthLogs,
    statLogs,
    colorOverrides,
  } = loaderData;
  // 빈 상태 폴백 — 약점·최근이 모두 비면 수준 기반 제안이 추천 자리를 채운다.
  const pickerWeakNodes = weakNodes.length > 0 ? weakNodes : levelNodes;
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const editable =
    plan !== null && (plan.status === "draft" || plan.status === "revision_requested");

  // 과욕 지수 — 작성 중 실시간 (제출 후 경고는 늦다).
  const overload = useMemo(
    () =>
      computeOverloadIndex(
        items.map((i) => ({ dailyMinutes: i.dailyMinutes, dayScope: i.dayScope })),
        diagnostics?.weekdayMinutes ?? null,
        diagnostics?.weekendMinutes ?? null,
      ),
    [items, diagnostics],
  );

  // 캘린더 — 날짜별 기대 부하(파생) + 승인 상태면 달성 점.
  // itemId 포함 — 터치(탭 토글)에서 같은 항목 재탭 = 해제 판정용.
  const [calendarTab, setCalendarTab] = useState<"stats" | "load">("stats");
  // 이 달 계획·기록에 등장한 과목 — 색 지정 대상(미분류 제외).
  const usedSubjects = useMemo(() => {
    const seen = new Map<string, { kind: string; code: string }>();
    for (const i of items) {
      if (i.subjectKind && i.subjectCode) {
        seen.set(`${i.subjectKind}:${i.subjectCode}`, {
          kind: i.subjectKind,
          code: i.subjectCode,
        });
      }
    }
    for (const l of statLogs) {
      if (l.subjectKind && l.subjectCode) {
        seen.set(`${l.subjectKind}:${l.subjectCode}`, {
          kind: l.subjectKind,
          code: l.subjectCode,
        });
      }
    }
    return [...seen.values()];
  }, [items, statLogs]);
  const [calendarHighlight, setCalendarHighlight] = useState<
    (CalendarHighlight & { itemId: string }) | null
  >(null);
  // 항목 편집·삭제로 목록이 바뀌면 하이라이트의 기간이 낡을 수 있어 초기화.
  useEffect(() => setCalendarHighlight(null), [items]);
  const calendarDays = useMemo(
    () =>
      buildCalendarDays(
        items.map((i) => ({
          itemId: i.itemId,
          dayScope: i.dayScope,
          startDate: i.startDate,
          endDate: i.endDate,
          dailyMinutes: i.dailyMinutes,
        })),
        monthLogs,
        periodStart,
        periodEnd,
        todayISO,
      ),
    [items, monthLogs, periodStart, periodEnd, todayISO],
  );
  const overloadedDates = useMemo(() => {
    const set = new Set<string>();
    if (!diagnostics) return set;
    for (const d of calendarDays) {
      const avail = d.weekend
        ? diagnostics.weekendMinutes
        : diagnostics.weekdayMinutes;
      if (avail && avail > 0 && d.expectedMinutes > avail) set.add(d.date);
    }
    return set;
  }, [calendarDays, diagnostics]);

  const post = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fetcher.submit(fd, { method: "post", action: API });
  };

  return (
    <StudentShell width="wide">
      <header className="mb-5">
        <AreaEyebrow area="manage" />
        <h1 className="text-foreground mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          월간 계획
        </h1>
        <p className="text-ink-soft mt-2 text-sm">
          {periodStart} ~ {periodEnd} · 계획을 세우고 제출하면 상담 선생님이
          검토합니다.
        </p>
      </header>

      {!cohortId ? (
        <p className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          종합반 수강생 전용 기능입니다.
        </p>
      ) : !plan ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <CalendarIcon className="text-muted-foreground mx-auto mb-2 size-7 opacity-40" />
          <p className="text-muted-foreground mb-4 text-sm">
            이번 달 계획이 아직 없습니다.
          </p>
          <Button
            onClick={() => post({ intent: "create_plan", cohortId })}
            disabled={fetcher.state !== "idle"}
          >
            <PlusIcon className="size-4" /> 이번 달 계획 시작
          </Button>
          {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
            <p className="mt-2 text-xs text-rose-600">{fetcher.data.error}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 상태 바 */}
          <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 shadow-sm">
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold",
                plan.status === "approved"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : plan.status === "submitted"
                    ? "bg-primary/10 text-link"
                    : plan.status === "revision_requested"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-muted text-foreground/80",
              )}
            >
              {PLAN_STATUS_LABEL[plan.status]}
            </span>
            <span className="text-muted-foreground text-xs">
              v{plan.version}
              {versionCount > 1 ? ` · 이 달 계획 ${versionCount}회 변경` : ""}
            </span>
            {/* 상담 중에 선생님이 대신 손본 계획임을 밝힌다(feat-7-048 D9). */}
            {staffEdited ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                상담자가 수정함
              </span>
            ) : null}
            {plan.status === "revision_requested" && plan.reviewComment ? (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                보완 요청: {plan.reviewComment}
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {editable ? (
                <Button
                  size="sm"
                  onClick={() => {
                    if (confirm("계획을 제출하시겠습니까? 제출 후에는 검토 완료까지 수정할 수 없습니다.")) {
                      post({ intent: "submit_plan", planId: plan.planId });
                    }
                  }}
                  disabled={items.length === 0 || fetcher.state !== "idle"}
                >
                  <SendIcon className="size-3.5" /> 제출
                </Button>
              ) : null}
              {/* Stage 3 — 제출 회수 (상담자 검토 전까지). */}
              {plan.status === "submitted" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (confirm("제출을 회수하고 다시 수정하시겠습니까?")) {
                      post({ intent: "withdraw_plan", planId: plan.planId });
                    }
                  }}
                  disabled={fetcher.state !== "idle"}
                >
                  <PencilIcon className="size-3.5" /> 회수하고 수정
                </Button>
              ) : null}
              {plan.status === "approved" ? (
                <>
                  <Button asChild size="sm">
                    <a href="/study/plan/log">오늘 기록 →</a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm("승인된 계획을 수정하려면 새 버전을 만들어 다시 승인받아야 합니다. 진행할까요?")) {
                        post({ intent: "create_revision", planId: plan.planId });
                      }
                    }}
                    disabled={fetcher.state !== "idle"}
                  >
                    <PencilIcon className="size-3.5" /> 계획 수정 (새 버전)
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
            <p className="text-xs text-rose-600">{fetcher.data.error}</p>
          ) : null}

          {/* 과욕 지수 — 실시간 */}
          <OverloadBanner
            weekdayPlanned={overload.weekdayPlanned}
            weekendPlanned={overload.weekendPlanned}
            weekdayRatio={overload.weekdayRatio}
            weekendRatio={overload.weekendRatio}
            hasDiagnostics={diagnostics !== null}
          />

          {/* 공부 통계 — 요구서 Ⅱ "메인 달력을 공부통계로".
              계획 부하 미리보기(Phase 3)는 없애지 않고 옆 탭으로 남긴다. */}
          <section className="bg-card rounded-xl border p-3 shadow-sm sm:p-4">
            <div className="bg-muted/60 mb-3 inline-flex rounded-lg p-0.5">
              {(["stats", "load"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCalendarTab(t)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    calendarTab === t
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {t === "stats" ? "공부 통계" : "계획 부하"}
                </button>
              ))}
            </div>
            {calendarTab === "stats" ? (
              <StudyStatsCard
                logs={statLogs}
                monthAnchor={periodStart}
                todayISO={todayISO}
                colorOverrides={colorOverrides}
                dayHref={(d) => `/study/plan/log?date=${d}`}
              />
            ) : (
              <>
                <PlanCalendar
                  variant="full"
                  days={calendarDays}
                  todayISO={todayISO}
                  showStatus={plan.status === "approved"}
                  highlight={calendarHighlight}
                  overloadedDates={overloadedDates}
                  dayHref={
                    plan.status === "approved"
                      ? (d) => `/study/plan/log?date=${d.date}`
                      : undefined
                  }
                />
                <p className="text-muted-foreground mt-2 text-[11px]">
                  {plan.status === "approved"
                    ? "날짜를 누르면 그 날의 기록 화면으로 이동합니다."
                    : "항목에 마우스를 올리면 적용 기간이 파랗게 표시됩니다. 붉은 날은 계획 합계가 가용시간을 넘는 날입니다."}
                </p>
              </>
            )}
          </section>

          {/* 항목 목록 */}
          <section className="bg-card rounded-xl border shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-bold tracking-tight">
                계획 항목 <span className="text-muted-foreground font-normal">({items.length})</span>
              </h2>
              {!editable ? (
                <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                  <LockIcon className="size-3" />
                  {plan.status === "approved" ? "승인됨 — 수정은 새 버전으로" : "검토 중"}
                </span>
              ) : null}
            </div>
            {usedSubjects.length > 0 ? (
              <div className="border-b px-4 py-2">
                <SubjectColorBar
                  subjects={usedSubjects}
                  colorOverrides={colorOverrides}
                  onSaved={reload}
                />
              </div>
            ) : null}
            {items.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-xs">
                아래에서 첫 항목을 추가하세요.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {items.map((it) => (
                  <ItemRow key={it.itemId} item={it} editable={editable} planId={plan.planId} colorOverrides={colorOverrides} weakNodes={pickerWeakNodes} recentNodes={recentNodes} lessons={lessons} highlighted={calendarHighlight?.itemId === it.itemId} onHighlight={setCalendarHighlight} />
                ))}
              </ul>
            )}
            {editable ? (
              <ItemForm planId={plan.planId} periodStart={periodStart} periodEnd={periodEnd} colorOverrides={colorOverrides} weakNodes={pickerWeakNodes} recentNodes={recentNodes} lessons={lessons} />
            ) : null}
          </section>

          {/* Stage 3 — 지표 (승인 2.2: 현재 승인본 기준) */}
          {compliance && plan.status === "approved" ? (
            <section className="bg-card rounded-xl border shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-bold tracking-tight">이번 달 달성 현황</h2>
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  전체 {formatMinutes(compliance.totalActualMinutes)} / 기대{" "}
                  {formatMinutes(compliance.totalExpectedMinutes)}
                  {compliance.unclassifiedRatio !== null
                    ? ` · 미분류 ${Math.round(compliance.unclassifiedRatio * 100)}%`
                    : ""}
                </span>
              </div>
              <ul className="divide-border divide-y">
                {compliance.items.map((m) => {
                  const pct =
                    m.timeRatio === null ? null : Math.min(100, Math.round(m.timeRatio * 100));
                  return (
                    <li key={m.itemId} className="px-4 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate">{m.title}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatMinutes(m.actualMinutes)} / {formatMinutes(m.expectedMinutes)} · 완료{" "}
                          {m.fullDays}/{m.expectedDays}일
                        </span>
                      </div>
                      {pct !== null ? (
                        <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* F3 — 반 공통 과제 표시 (읽기 전용, 복제 없음) */}
          {assignments.length > 0 ? (
            <section className="bg-card rounded-xl border shadow-sm">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-bold tracking-tight">
                  이 기간 반 공통 과제{" "}
                  <span className="text-muted-foreground font-normal">
                    ({assignments.length}) — 계획과 별도로 자동 배정됩니다
                  </span>
                </h2>
              </div>
              <ul className="divide-border divide-y">
                {assignments.map((a) => (
                  <li key={a.assignmentId} className="flex items-center gap-2 px-4 py-2 text-xs">
                    <LockIcon className="text-muted-foreground size-3" />
                    <span className="min-w-0 flex-1 truncate">{a.title}</span>
                    <span className="text-muted-foreground tabular-nums">
                      마감 {a.dueAt.slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </StudentShell>
  );
}

function OverloadBanner({
  weekdayPlanned,
  weekendPlanned,
  weekdayRatio,
  weekendRatio,
  hasDiagnostics,
}: {
  weekdayPlanned: number;
  weekendPlanned: number;
  weekdayRatio: number | null;
  weekendRatio: number | null;
  hasDiagnostics: boolean;
}) {
  if (!hasDiagnostics) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
        가용시간 진단이 아직 입력되지 않았습니다 — 상담 시 선생님이 입력하면
        계획 대비 여유가 표시됩니다. (현재 계획: 평일 {formatMinutes(weekdayPlanned)} · 주말{" "}
        {formatMinutes(weekendPlanned)})
      </p>
    );
  }
  const row = (label: string, planned: number, ratio: number | null) => {
    const tone = overloadTone(ratio);
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
          tone === "warn"
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
            : tone === "caution"
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        )}
      >
        {label} {formatMinutes(planned)}
        {ratio !== null ? ` (가용의 ${Math.round(ratio * 100)}%)` : ""}
      </span>
    );
  };
  const warn =
    (weekdayRatio !== null && weekdayRatio >= 1) ||
    (weekendRatio !== null && weekendRatio >= 1);
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        warn
          ? "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20"
          : "bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {row("평일", weekdayPlanned, weekdayRatio)}
        {row("주말", weekendPlanned, weekendRatio)}
        {warn ? (
          <span className="text-xs font-medium text-rose-700 dark:text-rose-300">
            계획 합계가 선언한 가용시간을 넘습니다 — 지키기 어려운 계획은 승인
            단계에서 조정될 수 있어요.
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface LessonOption {
  lessonId: string;
  title: string;
}

function ItemRow({
  item,
  editable,
  planId,
  colorOverrides,
  weakNodes,
  recentNodes,
  lessons,
  highlighted,
  onHighlight,
}: {
  item: LoaderItem;
  editable: boolean;
  planId: string;
  colorOverrides: Record<string, string>;
  weakNodes: Array<{ nodeId: string; displayLabel: string; sub?: string | null }>;
  recentNodes: Array<{ nodeId: string; displayLabel: string }>;
  lessons: LessonOption[];
  highlighted: boolean;
  onHighlight: (h: (CalendarHighlight & { itemId: string }) | null) => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  const [editing, setEditing] = useState(false);
  // 터치 판별 — 탭은 토글, 마우스는 hover 만 (탭이 mouseenter 를 흉내내는 충돌 방지).
  const lastPointerType = useRef<string>("mouse");
  const itemHighlight = () => ({
    itemId: item.itemId,
    start: item.startDate,
    end: item.endDate,
    scope: item.dayScope,
  });
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      setEditing(false);
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  if (editing) {
    return (
      <li className="px-4 py-3">
        <ItemFields
          planId={planId}
          intent="update_item"
          itemId={item.itemId}
          defaults={item}
          colorOverrides={colorOverrides}
          weakNodes={weakNodes}
          recentNodes={recentNodes}
          lessons={lessons}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 text-xs transition-colors",
        highlighted && "bg-primary/5",
      )}
      onPointerDown={(e) => {
        lastPointerType.current = e.pointerType;
      }}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onHighlight(itemHighlight());
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onHighlight(null);
      }}
      onClick={() => {
        if (lastPointerType.current !== "mouse")
          onHighlight(highlighted ? null : itemHighlight());
      }}
    >
      {item.priority !== null ? (
        <span className="bg-muted text-foreground/70 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums">
          {item.priority}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.title}</p>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
          <span>{PLAN_ACTIVITY_LABEL[item.activityType]}</span>
          <span>
            {DAY_SCOPE_LABEL[item.dayScope]} 하루 {formatMinutes(item.dailyMinutes)}
          </span>
          <span className="tabular-nums">
            {item.startDate.slice(5)} ~ {item.endDate.slice(5)}
          </span>
          {item.nodeId ? (
            <span className="text-link">{item.nodeLabel ?? "단원 연결됨"}</span>
          ) : item.lessonId ? (
            <span className="text-amber-700 dark:text-amber-400">노드 미연결(강의)</span>
          ) : (
            <span>노드 미연결</span>
          )}
        </p>
      </div>
      {editable ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="icon" variant="ghost" className="size-6" onClick={() => setEditing(true)}>
            <PencilIcon className="size-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-rose-600"
            disabled={fetcher.state !== "idle"}
            onClick={() => {
              if (confirm("이 항목을 삭제할까요?")) {
                const fd = new FormData();
                fd.set("intent", "delete_item");
                fd.set("itemId", item.itemId);
                fetcher.submit(fd, { method: "post", action: API });
              }
            }}
          >
            <Trash2Icon className="size-3" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function ItemForm({
  planId,
  periodStart,
  periodEnd,
  colorOverrides,
  weakNodes,
  recentNodes,
  lessons,
}: {
  planId: string;
  periodStart: string;
  periodEnd: string;
  colorOverrides: Record<string, string>;
  weakNodes: Array<{ nodeId: string; displayLabel: string; sub?: string | null }>;
  recentNodes: Array<{ nodeId: string; displayLabel: string }>;
  lessons: LessonOption[];
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="border-t px-4 py-3">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <PlusIcon className="size-3.5" /> 항목 추가
        </Button>
      </div>
    );
  }
  return (
    <div className="border-t px-4 py-3">
      <ItemFields
        planId={planId}
        intent="add_item"
        defaults={{
          title: "",
          activityType: "lecture",
          dailyMinutes: 60,
          dayScope: "weekday",
          startDate: periodStart,
          endDate: periodEnd,
          priority: null,
          nodeId: null,
          nodeLabel: null,
          lessonId: null,
          subjectKind: null,
          subjectCode: null,
        }}
        colorOverrides={colorOverrides}
        weakNodes={weakNodes}
        recentNodes={recentNodes}
        lessons={lessons}
        onCancel={() => setOpen(false)}
        onSaved={() => setOpen(false)}
      />
    </div>
  );
}

function ItemFields({
  planId,
  intent,
  itemId,
  defaults,
  colorOverrides,
  weakNodes,
  recentNodes,
  lessons,
  onCancel,
  onSaved,
}: {
  planId: string;
  intent: "add_item" | "update_item";
  itemId?: string;
  defaults: {
    title: string;
    activityType: PlanActivityType;
    dailyMinutes: number;
    dayScope: DayScope;
    startDate: string;
    endDate: string;
    priority: number | null;
    nodeId: string | null;
    nodeLabel?: string | null;
    lessonId: string | null;
    subjectKind?: string | null;
    subjectCode?: string | null;
  };
  colorOverrides: Record<string, string>;
  weakNodes: Array<{ nodeId: string; displayLabel: string; sub?: string | null }>;
  recentNodes: Array<{ nodeId: string; displayLabel: string }>;
  lessons: LessonOption[];
  onCancel: () => void;
  onSaved?: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  const [nodeId, setNodeId] = useState<string | null>(defaults.nodeId);
  const [nodeLabel, setNodeLabel] = useState<string | null>(defaults.nodeLabel ?? null);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      onSaved?.();
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post" action={API} className="space-y-2">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="planId" value={planId} />
      {itemId ? <input type="hidden" name="itemId" value={itemId} /> : null}
      {nodeId ? <input type="hidden" name="nodeId" value={nodeId} /> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_130px_90px]">
        <div>
          <label className="text-muted-foreground text-[11px]">
            제목 (분량은 자유 기술 — 예: 민법 기본강의 4강)
          </label>
          <Input name="title" defaultValue={defaults.title} required maxLength={200} className="mt-0.5 h-8 text-xs" />
        </div>
        <div>
          <label className="text-muted-foreground text-[11px]">활동</label>
          <select
            name="activityType"
            defaultValue={defaults.activityType}
            className="border-input bg-background mt-0.5 h-8 w-full rounded-md border px-1.5 text-xs"
          >
            {PLAN_ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {PLAN_ACTIVITY_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-muted-foreground text-[11px]">우선순위</label>
          <Input
            name="priority"
            type="number"
            min={1}
            max={99}
            defaultValue={defaults.priority ?? ""}
            className="mt-0.5 h-8 text-xs tabular-nums"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MinutesField
          label="하루 목표"
          name="dailyMinutes"
          defaultMinutes={defaults.dailyMinutes}
          required
        />
        <div>
          <label className="text-muted-foreground text-[11px]">요일</label>
          <select
            name="dayScope"
            defaultValue={defaults.dayScope}
            className="border-input bg-background mt-0.5 h-8 w-full rounded-md border px-1.5 text-xs"
          >
            {(Object.keys(DAY_SCOPE_LABEL) as DayScope[]).map((s) => (
              <option key={s} value={s}>
                {DAY_SCOPE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-muted-foreground text-[11px]">시작</label>
          <Input name="startDate" type="date" required defaultValue={defaults.startDate} className="mt-0.5 h-8 text-xs" />
        </div>
        <div>
          <label className="text-muted-foreground text-[11px]">종료</label>
          <Input name="endDate" type="date" required defaultValue={defaults.endDate} className="mt-0.5 h-8 text-xs" />
        </div>
      </div>
      <SubjectSelect
        defaultKind={defaults.subjectKind}
        defaultCode={defaults.subjectCode}
        colorOverrides={colorOverrides}
        hint="(자연과학·기타는 직접 고르세요)"
      />
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
      {lessons.length > 0 ? (
        <div>
          <label className="text-muted-foreground text-[11px]">
            강의 연결 (선택 — 단원 미선택 시 강의↔단원 매핑으로 자동 연결,
            매핑이 없으면 "노드 미연결"로 표시됩니다)
          </label>
          <select
            name="lessonId"
            defaultValue={defaults.lessonId ?? ""}
            className="border-input bg-background mt-0.5 h-8 w-full rounded-md border px-1.5 text-xs"
          >
            <option value="">연결 안 함</option>
            {lessons.map((l) => (
              <option key={l.lessonId} value={l.lessonId}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          {intent === "add_item" ? "추가" : "저장"}
        </Button>
      </div>
    </fetcher.Form>
  );
}
