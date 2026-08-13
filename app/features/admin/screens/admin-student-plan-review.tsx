// Phase 3 — 상담 화면: 진단 입력 → 과목별 수준 → 계획 검토(신호 2종) → 승인/반려.
// 한 화면 흐름 — "상담자가 종이 없이 상담 1회를 완주"가 완료 판정 기준.

import type { Route } from "./+types/admin-student-plan-review";

import { CheckIcon, Undo2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  ATTEMPT_TYPE_LABEL,
  DAY_SCOPE_LABEL,
  LECTURE_STAGE_LABEL,
  PLAN_ACTIVITY_LABEL,
  PLAN_LAW_CODES,
  PLAN_SCIENCE_CODES,
  PLAN_STATUS_LABEL,
  SCIENCE_TIER_LABEL,
  TIER_SOURCE_LABEL,
  currentMonthPeriod,
  overloadTone,
  type AttemptType,
  type LectureStage,
  type ScienceTier,
} from "~/features/study-plans/labels";
import {
  computeReviewSignals,
  countPlanVersions,
  getActivePlan,
  getStudentDiagnostics,
  listPlanItems,
  listSubjectStatus,
} from "~/features/study-plans/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";
import { SCIENCE_SUBJECTS } from "~/features/subjects/lib/science";

export const meta: Route.MetaFunction = ({ data: d }) => [
  { title: d ? `${d.student.name} 계획 상담 | 리담변리사학원` : "계획 상담 | 리담변리사학원" },
];

const LAW_NAME: Record<string, string> = Object.fromEntries(
  PLAN_LAW_CODES.map((c) => [
    c,
    c === "civil-procedure" ? "민사소송법" : (LAW_SUBJECTS[c as keyof typeof LAW_SUBJECTS]?.name ?? c),
  ]),
);
const SCIENCE_NAME: Record<string, string> = Object.fromEntries(
  PLAN_SCIENCE_CODES.map((c) => [c, SCIENCE_SUBJECTS[c]?.name ?? c]),
);

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.cohortId || !params.profileId) throw data("Missing params", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const cohort = await getCohortById(client, params.cohortId);
  if (!cohort) throw data("Cohort not found", { status: 404 });
  if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 접근 가능", { status: 403 });
  }
  const { data: student } = await client
    .from("profiles")
    .select("profile_id, name")
    .eq("profile_id", params.profileId)
    .maybeSingle();
  if (!student) throw data("Student not found", { status: 404 });

  const { periodStart, periodEnd } = currentMonthPeriod();
  const [diagnostics, subjectStatus, plan, versionCount] = await Promise.all([
    getStudentDiagnostics(client, params.profileId),
    listSubjectStatus(client, params.profileId),
    getActivePlan(client, params.profileId, periodStart),
    countPlanVersions(client, params.profileId, periodStart),
  ]);
  const items = plan ? await listPlanItems(client, plan.planId) : [];
  const signals =
    plan && items.length > 0
      ? await computeReviewSignals(client, params.profileId, items, diagnostics)
      : null;

  // 항목 노드 라벨.
  const nodeIds = [...new Set(items.map((i) => i.nodeId).filter((v): v is string => !!v))];
  const labelByNode = new Map<string, string>();
  if (nodeIds.length > 0) {
    const { data: nodes } = await client
      .from("systematic_nodes")
      .select("node_id, display_label")
      .in("node_id", nodeIds);
    for (const n of nodes ?? []) labelByNode.set(n.node_id, n.display_label);
  }

  return {
    cohort,
    role,
    student: { profileId: student.profile_id, name: student.name ?? "학생" },
    periodStart,
    periodEnd,
    diagnostics,
    subjectStatus,
    plan,
    versionCount,
    items: items.map((i) => ({
      ...i,
      nodeLabel: i.nodeId ? (labelByNode.get(i.nodeId) ?? null) : null,
    })),
    signals,
  };
}

const API = "/api/admin/study-plan";

function useReload() {
  const navigate = useNavigate();
  const location = useLocation();
  return () =>
    navigate(location.pathname + location.search, {
      replace: true,
      preventScrollReset: true,
    });
}

export default function AdminStudentPlanReview({ loaderData }: Route.ComponentProps) {
  const {
    cohort,
    role,
    student,
    periodStart,
    periodEnd,
    diagnostics,
    subjectStatus,
    plan,
    versionCount,
    items,
    signals,
  } = loaderData;
  const base = `/admin/cohorts/${cohort.cohortId}`;

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      width={1100}
      title={`${student.name} — 계획 상담`}
      desc={`${cohort.name} · ${periodStart} ~ ${periodEnd}`}
    >
      <Link
        to={`${base}/plans`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← 계획 현황으로
      </Link>

      <div className="grid items-start gap-4 lg:grid-cols-[380px_1fr]">
        {/* 좌: 진단 + 과목별 수준 */}
        <div className="space-y-4">
          <DiagnosticsForm
            cohortId={cohort.cohortId}
            userId={student.profileId}
            diagnostics={diagnostics}
          />
          <SubjectStatusPanel userId={student.profileId} cohortId={cohort.cohortId} rows={subjectStatus} />
        </div>

        {/* 우: 계획 검토·승인 */}
        <PlanReviewPanel
          cohortId={cohort.cohortId}
          plan={plan}
          versionCount={versionCount}
          items={items}
          signals={signals}
          hasDiagnostics={diagnostics !== null}
        />
      </div>
    </AdminShell>
  );
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

function DiagnosticsForm({
  cohortId,
  userId,
  diagnostics,
}: {
  cohortId: string;
  userId: string;
  diagnostics: LoaderData["diagnostics"];
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <section className="bg-card rounded-xl border shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-bold tracking-tight">초기 진단</h2>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          가용시간은 과욕 지수의 분모가 됩니다 — 계획 검토 전에 입력하세요.
        </p>
      </div>
      <fetcher.Form method="post" action={API} className="space-y-2.5 p-4">
        <input type="hidden" name="intent" value="save_diagnostics" />
        <input type="hidden" name="cohortId" value={cohortId} />
        <input type="hidden" name="userId" value={userId} />
        <div>
          <label className="text-muted-foreground text-[11px]">응시 구분</label>
          <div className="mt-1 flex gap-3">
            {(Object.keys(ATTEMPT_TYPE_LABEL) as AttemptType[]).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-xs">
                <input
                  type="radio"
                  name="attemptType"
                  value={t}
                  defaultChecked={(diagnostics?.attemptType ?? "first") === t}
                />
                {ATTEMPT_TYPE_LABEL[t]}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-muted-foreground text-[11px]">평일 가용(분/일)</label>
            <Input
              name="weekdayMinutes"
              type="number"
              min={0}
              max={1440}
              required
              defaultValue={diagnostics?.weekdayMinutes ?? ""}
              className="mt-0.5 h-8 text-xs tabular-nums"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-[11px]">주말 가용(분/일)</label>
            <Input
              name="weekendMinutes"
              type="number"
              min={0}
              max={1440}
              required
              defaultValue={diagnostics?.weekendMinutes ?? ""}
              className="mt-0.5 h-8 text-xs tabular-nums"
            />
          </div>
        </div>
        <div>
          <label className="text-muted-foreground text-[11px]">메모</label>
          <textarea
            name="note"
            defaultValue={diagnostics?.note ?? ""}
            rows={2}
            maxLength={2000}
            className="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1 text-xs"
          />
        </div>
        {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
          <p className="text-xs text-rose-600">{fetcher.data.error}</p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
            진단 저장
          </Button>
        </div>
      </fetcher.Form>
    </section>
  );
}

function SubjectStatusPanel({
  userId,
  cohortId,
  rows,
}: {
  userId: string;
  cohortId: string;
  rows: LoaderData["subjectStatus"];
}) {
  const byKey = new Map(rows.map((r) => [`${r.subjectKind}|${r.subjectCode}`, r]));
  return (
    <section className="bg-card rounded-xl border shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-bold tracking-tight">과목별 수준</h2>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          자연과학 상/중/하는 진단 테스트에서 자동 반영됩니다(수기 수정 시 출처가
          수기로 전환).
        </p>
      </div>
      <div className="divide-border divide-y">
        {PLAN_LAW_CODES.map((code) => (
          <SubjectRow
            key={code}
            userId={userId}
            cohortId={cohortId}
            subjectKind="law"
            subjectCode={code}
            name={LAW_NAME[code]}
            row={byKey.get(`law|${code}`) ?? null}
          />
        ))}
        {PLAN_SCIENCE_CODES.map((code) => (
          <SubjectRow
            key={code}
            userId={userId}
            cohortId={cohortId}
            subjectKind="science"
            subjectCode={code}
            name={SCIENCE_NAME[code]}
            row={byKey.get(`science|${code}`) ?? null}
          />
        ))}
      </div>
    </section>
  );
}

function SubjectRow({
  userId,
  cohortId,
  subjectKind,
  subjectCode,
  name,
  row,
}: {
  userId: string;
  cohortId: string;
  subjectKind: "law" | "science";
  subjectCode: string;
  name: string;
  row: LoaderData["subjectStatus"][number] | null;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post" action={API} className="space-y-1.5 px-4 py-2.5">
      <input type="hidden" name="intent" value="save_subject_status" />
      <input type="hidden" name="cohortId" value={cohortId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="subjectKind" value={subjectKind} />
      <input type="hidden" name="subjectCode" value={subjectCode} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-xs font-semibold">{name}</span>
        {subjectKind === "law" ? (
          <select
            name="lectureStage"
            defaultValue={row?.lectureStage ?? ""}
            className="border-input bg-background h-7 rounded-md border px-1.5 text-[11px]"
          >
            <option value="">수준 —</option>
            {(Object.keys(LECTURE_STAGE_LABEL) as LectureStage[]).map((s) => (
              <option key={s} value={s}>
                {LECTURE_STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <>
            <select
              name="scienceTier"
              defaultValue={row?.scienceTier ?? ""}
              className="border-input bg-background h-7 rounded-md border px-1.5 text-[11px]"
            >
              <option value="">상중하 —</option>
              {(Object.keys(SCIENCE_TIER_LABEL) as ScienceTier[]).map((t) => (
                <option key={t} value={t}>
                  {SCIENCE_TIER_LABEL[t]}
                </option>
              ))}
            </select>
            {row?.scienceScore !== null && row?.scienceScore !== undefined ? (
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {row.scienceScore}/{row.scienceTotal}
              </span>
            ) : null}
          </>
        )}
        {row?.tierSource ? (
          <Chip
            tone={
              row.tierSource === "diagnostic_retracted"
                ? "coral"
                : row.tierSource === "diagnostic_test"
                  ? "emerald"
                  : "neutral"
            }
          >
            {TIER_SOURCE_LABEL[row.tierSource]}
          </Chip>
        ) : null}
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2 text-[11px]"
          disabled={fetcher.state !== "idle"}
        >
          저장
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          name="completedLectures"
          placeholder="기존 수강 (재시생)"
          defaultValue={row?.completedLectures ?? ""}
          maxLength={500}
          className="h-7 text-[11px]"
        />
        <Input
          name="direction"
          placeholder="진행 방향 (예: 중급강의 예정)"
          defaultValue={row?.direction ?? ""}
          maxLength={500}
          className="h-7 text-[11px]"
        />
      </div>
      {row?.tierSource === "diagnostic_retracted" ? (
        <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
          ⚠ 진단 시험 결과가 철회되었습니다 — 수준을 재확인하고 수기로
          정정하세요.
        </p>
      ) : null}
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="text-[11px] text-rose-600">{fetcher.data.error}</p>
      ) : null}
    </fetcher.Form>
  );
}

function PlanReviewPanel({
  cohortId,
  plan,
  versionCount,
  items,
  signals,
  hasDiagnostics,
}: {
  cohortId: string;
  plan: LoaderData["plan"];
  versionCount: number;
  items: LoaderData["items"];
  signals: LoaderData["signals"];
  hasDiagnostics: boolean;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  const [comment, setComment] = useState("");
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      setComment("");
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  void cohortId;

  if (!plan) {
    return (
      <section className="bg-card rounded-xl border shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-bold tracking-tight">이번 달 계획</h2>
        </div>
        <p className="text-muted-foreground py-10 text-center text-xs">
          학생이 아직 계획을 만들지 않았습니다 — 준수율은 이 달에 대해 평가
          제외(no_plan)로 처리됩니다.
        </p>
      </section>
    );
  }

  const post = (intent: "approve_plan" | "reject_plan") => {
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("planId", plan.planId);
    fd.set("comment", comment);
    fetcher.submit(fd, { method: "post", action: API });
  };

  const wk = signals?.overload.weekdayRatio ?? null;
  const we = signals?.overload.weekendRatio ?? null;

  return (
    <section className="bg-card rounded-xl border shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-bold tracking-tight">이번 달 계획</h2>
        <Chip
          tone={
            plan.status === "submitted"
              ? "blue"
              : plan.status === "approved"
                ? "emerald"
                : plan.status === "revision_requested"
                  ? "amber"
                  : "neutral"
          }
        >
          {PLAN_STATUS_LABEL[plan.status]}
        </Chip>
        <span className="text-muted-foreground text-[11px]">
          v{plan.version}
          {versionCount > 1 ? ` · 이 달 ${versionCount}회 변경` : ""}
        </span>
      </div>

      {/* 자동 검토 신호 */}
      {signals ? (
        <div className="space-y-2 border-b px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-muted-foreground font-semibold tracking-wide uppercase">
              과욕 지수
            </span>
            {!hasDiagnostics ? (
              <span className="text-amber-700 dark:text-amber-400">
                진단 미입력 — 좌측에서 가용시간을 먼저 입력하세요
              </span>
            ) : (
              <>
                <SignalChip label="평일" planned={signals.overload.weekdayPlanned} ratio={wk} />
                <SignalChip label="주말" planned={signals.overload.weekendPlanned} ratio={we} />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-muted-foreground font-semibold tracking-wide uppercase">
              약점 회피
            </span>
            {signals.weakness.avoidanceRatio === null ? (
              <span className="text-muted-foreground">약점 표본 부족 — 신호 없음</span>
            ) : (
              <>
                <Chip tone={signals.weakness.avoidanceRatio >= 0.8 ? "coral" : signals.weakness.avoidanceRatio >= 0.5 ? "amber" : "emerald"}>
                  상위 약점 {signals.weakness.topWeakNodes.length}개 중{" "}
                  {signals.weakness.avoidedCount}개 미포함
                </Chip>
                {signals.weakness.topWeakNodes
                  .filter((n) => !items.some((i) => i.nodeId === n.nodeId))
                  .map((n) => (
                    <span key={n.nodeId} className="text-muted-foreground">
                      {n.displayLabel}({n.accuracyPct}%)
                    </span>
                  ))}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* 항목 표 */}
      {items.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-xs">항목이 없습니다.</p>
      ) : (
        <ul className="divide-border divide-y">
          {items.map((it) => (
            <li key={it.itemId} className="flex items-center gap-2 px-4 py-2 text-xs">
              {it.priority !== null ? (
                <span className="bg-muted inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums">
                  {it.priority}
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{it.title}</p>
                <p className="text-muted-foreground text-[11px]">
                  {PLAN_ACTIVITY_LABEL[it.activityType]} · {DAY_SCOPE_LABEL[it.dayScope]}{" "}
                  하루 {it.dailyMinutes}분 · {it.startDate.slice(5)}~{it.endDate.slice(5)}
                  {it.nodeId ? (
                    <span className="text-link"> · {it.nodeLabel ?? "단원"}</span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400"> · 노드 미연결</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 승인/반려 */}
      {plan.status === "submitted" ? (
        <div className="space-y-2 border-t px-4 py-3">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="코멘트 (반려 시 필수)"
            maxLength={1000}
            className="h-8 text-xs"
          />
          {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
            <p className="text-xs text-rose-600">{fetcher.data.error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={fetcher.state !== "idle"}
              onClick={() => post("reject_plan")}
            >
              <Undo2Icon className="size-3.5" /> 보완 요청
            </Button>
            <Button
              size="sm"
              disabled={fetcher.state !== "idle"}
              onClick={() => {
                if (confirm("승인하시겠습니까? 승인 후 항목은 잠기고, 수정은 새 버전으로만 가능합니다.")) {
                  post("approve_plan");
                }
              }}
            >
              <CheckIcon className="size-3.5" /> 승인
            </Button>
          </div>
        </div>
      ) : plan.status === "approved" ? (
        <p className="text-muted-foreground border-t px-4 py-3 text-[11px]">
          {plan.reviewedAt ? `승인 ${plan.reviewedAt.slice(0, 10)}` : "승인됨"} ·
          가용시간 스냅샷 평일 {plan.plannedWeekdayMinutes ?? "—"}분 / 주말{" "}
          {plan.plannedWeekendMinutes ?? "—"}분
        </p>
      ) : null}
    </section>
  );
}

function SignalChip({
  label,
  planned,
  ratio,
}: {
  label: string;
  planned: number;
  ratio: number | null;
}) {
  const tone = overloadTone(ratio);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-semibold",
        tone === "warn"
          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
          : tone === "caution"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {label} {planned}분{ratio !== null ? ` (${Math.round(ratio * 100)}%)` : ""}
    </span>
  );
}
