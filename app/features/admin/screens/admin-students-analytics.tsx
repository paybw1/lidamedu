// feat-7-041 — 전체 학습현황. 학원 전체 학생(활성 반 가로지른 distinct)의 집계·익명 통계.
// manager+ 전용(instructor 는 담당 반만). 개인 식별 없음 — 개인은 admin-student-detail.
// 무거운 약점/위험군은 기존 화면(반 통계·위험 수강생)으로 연결해 초기 로드를 가볍게 유지.

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  ChevronDownIcon,
  Loader2Icon,
  MessageSquareIcon,
  MinusIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Bar, Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  type AllStudentsOverview,
  type OverallWeakNode,
  type OverallWeaknessResult,
  type WeakNodeBreakdown,
  getAllStudentsOverview,
} from "~/features/admin/queries/all-students-overview.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";
import type { AccuracyBucket } from "~/features/admin/queries/student-progress.server";

import type { Route } from "./+types/admin-students-analytics";

export const meta: Route.MetaFunction = () => [
  { title: "전체 학습현황 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  // 전체 조망은 manager+ 전용 — instructor 는 담당 반만 본다(약관 제7조).
  if (!roleAtLeast(role, "manager")) {
    return { role, overview: null as AllStudentsOverview | null };
  }

  const overview = await getAllStudentsOverview();
  return { role, overview };
}

const BUCKET_TONE: Record<AccuracyBucket, string> = {
  "80+": "bg-emerald-500/80",
  "60-79": "bg-lime-500/80",
  "40-59": "bg-amber-500/80",
  "20-39": "bg-orange-500/80",
  "0-19": "bg-rose-500/80",
  none: "bg-muted-foreground/40",
};
const BUCKET_LABEL: Record<AccuracyBucket, string> = {
  "80+": "80% 이상",
  "60-79": "60–79%",
  "40-59": "40–59%",
  "20-39": "20–39%",
  "0-19": "0–19%",
  none: "데이터 부족",
};

function accuracyTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-lime-600 dark:text-lime-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function pct1(x: number | null): string {
  return x === null ? "—" : `${x}%`;
}
function ratePct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}

// 추세 델타 배지 — 양수 상승(에메랄드)·음수 하락(로즈)·0 보합·null 표본부족.
function DeltaBadge({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) {
    return <span className="text-muted-foreground/50 text-xs">—</span>;
  }
  if (value === 0) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-0.5 font-mono text-xs tabular-nums">
        <MinusIcon className="size-3" />0
      </span>
    );
  }
  const up = value > 0;
  const Icon = up ? TrendingUpIcon : TrendingDownIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs font-bold tabular-nums",
        up
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400",
      )}
    >
      <Icon className="size-3" />
      {up ? "+" : "−"}
      {Math.abs(value)}
      {unit}
    </span>
  );
}

export default function AdminStudentsAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { role, overview } = loaderData;

  return (
    <AdminShell
      cluster="analytics"
      role={role}
      title="전체 학습현황"
      desc="학원 전체 수강생(활성 반)의 학습 참여·성취를 한눈에. 집계·익명 — 개인별 상세는 반 통계·수강생 화면에서."
    >
      {overview === null ? (
        <ManagerOnlyNotice />
      ) : overview.studentCount === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <KpiBand o={overview} />
          <div className="grid gap-4 lg:grid-cols-2">
            <AccuracyDistribution o={overview} />
            <BySubject o={overview} />
          </div>
          <OverallWeakNodes />
          <CohortComparison o={overview} />
          <MonitoringLinks />
        </div>
      )}
    </AdminShell>
  );
}

/* ── ① KPI 밴드 ──────────────────────────────────────────────────────── */

function KpiBand({ o }: { o: AllStudentsOverview }) {
  const tiles: Array<{
    label: string;
    value: string;
    hint: string;
    tone?: string;
  }> = [
    { label: "수강생", value: o.studentCount.toLocaleString("ko-KR"), hint: `활성 반 ${o.cohortCount}개 가로지른 실인원` },
    {
      label: "7일 활성",
      value: `${o.active7dCount.toLocaleString("ko-KR")} · ${ratePct(o.active7dRate)}`,
      hint: "최근 7일 문제풀이·빈칸 활동 학생",
    },
    {
      label: "평균 정답률",
      value: pct1(o.avgAccuracyPct),
      hint: "학생 단위 평균(시도 5+ 학생만)",
      tone: accuracyTone(o.avgAccuracyPct),
    },
    { label: "평균 문제풀이", value: o.avgProblemsAttempted.toLocaleString("ko-KR"), hint: "학생당 푼 문항 수(distinct)" },
    { label: "평균 조문열람", value: o.avgArticlesViewed.toLocaleString("ko-KR"), hint: "학생당 열람 조문 수(distinct)" },
    { label: "활성 반", value: o.cohortCount.toLocaleString("ko-KR"), hint: "비-보관 반 수" },
  ];
  return (
    <section data-testid="students-analytics-kpi">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div
            key={t.label}
            title={t.hint}
            className="border-border bg-card rounded-xl border p-3.5 shadow-sm"
          >
            <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
              {t.label}
            </p>
            <p
              className={cn(
                "mt-1.5 text-[20px] leading-none font-extrabold tracking-tight tabular-nums",
                t.tone ?? "text-foreground",
              )}
            >
              {t.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── ③ 정답률 분포 ───────────────────────────────────────────────────── */

function AccuracyDistribution({ o }: { o: AllStudentsOverview }) {
  const max = Math.max(1, ...o.accuracyDistribution.map((d) => d.count));
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TargetIcon className="text-link size-4" />
          <h2 className="text-sm font-bold tracking-tight">정답률 분포</h2>
        </div>
        <p className="text-muted-foreground text-xs">
          학생을 정답률 구간으로 분류(시도 5+ 기준, 미만은 데이터 부족).
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {o.accuracyDistribution.map((d) => (
          <div key={d.bucket} className="flex items-center gap-2.5">
            <span className="text-muted-foreground w-[72px] shrink-0 text-right text-[11px] font-semibold">
              {BUCKET_LABEL[d.bucket]}
            </span>
            <div className="bg-muted h-4 flex-1 overflow-hidden rounded">
              <div
                className={cn("h-full rounded", BUCKET_TONE[d.bucket])}
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
            <span className="text-foreground w-8 shrink-0 text-right font-mono text-xs font-bold tabular-nums">
              {d.count}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ── ④ 과목별 평균 ───────────────────────────────────────────────────── */

function BySubject({ o }: { o: AllStudentsOverview }) {
  const active = o.bySubject.filter((s) => s.avgProblemsAttempted > 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BookOpenIcon className="text-link size-4" />
          <h2 className="text-sm font-bold tracking-tight">과목별 평균 정답률</h2>
        </div>
        <p className="text-muted-foreground text-xs">
          과목별 학생 평균 정답률 — 풀이 활동이 있는 과목만.
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {active.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-xs">
            아직 과목별 풀이 데이터가 없습니다.
          </p>
        ) : (
          active.map((s) => (
            <div key={s.lawCode} className="flex items-center gap-2.5">
              <span className="w-[68px] shrink-0 text-[12px] font-semibold">
                {s.name}
              </span>
              <Bar
                value={s.avgAccuracyPct ?? 0}
                tone="auto"
                className="h-2.5 flex-1"
              />
              <span
                className={cn(
                  "w-10 shrink-0 text-right font-mono text-xs font-bold tabular-nums",
                  accuracyTone(s.avgAccuracyPct),
                )}
              >
                {pct1(s.avgAccuracyPct)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/* ── ⑥ 전체 공통 약점 단원 (지연 로드) ───────────────────────────────── */

function OverallWeakNodes() {
  const fetcher = useFetcher<OverallWeaknessResult>();
  useEffect(() => {
    // 무거운 집계라 마운트 후 1회만 on-demand 로드(가드: idle + 미수신).
    if (fetcher.state === "idle" && fetcher.data === undefined) {
      fetcher.load("/admin/analytics/students/weak-nodes");
    }
  }, [fetcher]);

  const loading = fetcher.state !== "idle" || fetcher.data === undefined;
  const result = fetcher.data;
  const maxScore = Math.max(
    1,
    ...(result?.nodes ?? []).map((n) => n.weaknessScore),
  );

  return (
    <section data-testid="students-analytics-weak-nodes">
      <div className="mb-2">
        <h2 className="text-sm font-bold tracking-tight">전체 공통 약점 단원</h2>
        <p className="text-muted-foreground text-xs">
          학원 전체 수강생이 함께 어려워하는 단원 — 과목 가로질러 약점 점수 상위.
          {result
            ? ` 같은 단원을 ${result.threshold}명 이상 시도했을 때만 집계.`
            : null}
        </p>
      </div>
      {loading ? (
        <Card>
          <CardContent className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-xs">
            <Loader2Icon className="size-4 animate-spin" />
            공통 약점 분석 중…
          </CardContent>
        </Card>
      ) : !result || result.nodes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-foreground text-sm font-semibold">
              아직 공통 약점으로 잡힌 단원이 없습니다
            </p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs leading-relaxed">
              한 단원을 {result?.threshold ?? 3}명 이상의 수강생이 풀어야 공통
              약점으로 집계됩니다. 풀이 데이터가 더 쌓이면 표시됩니다.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border-border bg-card divide-border/60 divide-y overflow-hidden rounded-xl border shadow-sm">
          {result.nodes.map((n, i) => (
            <WeakNodeRow key={`${n.lawCode}:${n.nodeId}`} node={n} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

// 약점 단원 한 행 — 펼치면 그 단원이 약한 반·학생을 지연 로드(역추적).
function WeakNodeRow({ node, index }: { node: OverallWeakNode; index: number }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<WeakNodeBreakdown>();
  const detailUrl = `/admin/analytics/students/weak-nodes/${node.lawCode}/${node.nodeId}`;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && fetcher.state === "idle" && fetcher.data === undefined) {
      fetcher.load(detailUrl);
    }
  }

  const loading = open && (fetcher.state !== "idle" || fetcher.data === undefined);
  const detail = fetcher.data;

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="hover:bg-muted/40 flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors"
      >
        <span className="text-muted-foreground w-4 shrink-0 text-right font-mono text-xs font-bold tabular-nums">
          {index + 1}
        </span>
        <Chip tone="neutral" className="shrink-0">
          {node.lawName}
        </Chip>
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-[13px] font-semibold">
            {node.displayLabel}
          </p>
          <p className="text-muted-foreground text-[11px]">
            {node.distinctStudents}명 · {node.attempts}회 풀이
          </p>
        </div>
        <div className="hidden w-28 shrink-0 sm:block">
          <Bar value={node.accuracyPct} tone="auto" className="h-2" />
        </div>
        <span
          className={cn(
            "w-10 shrink-0 text-right font-mono text-xs font-bold tabular-nums",
            accuracyTone(node.accuracyPct),
          )}
        >
          {node.accuracyPct}%
        </span>
        <ChevronDownIcon
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {open ? (
        <div className="bg-muted/30 border-border/60 border-t px-3.5 py-3">
          {loading ? (
            <p className="text-muted-foreground flex items-center gap-2 py-2 text-xs">
              <Loader2Icon className="size-3.5 animate-spin" />
              약한 반·학생 분석 중…
            </p>
          ) : !detail || !detail.found ? (
            <p className="text-muted-foreground py-2 text-xs">
              이 단원을 푼 학생 데이터가 없습니다.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <WeakNodeCohorts rows={detail.cohorts} />
              <WeakNodeStudents rows={detail.students} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function WeakNodeCohorts({
  rows,
}: {
  rows: WeakNodeBreakdown["cohorts"];
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-1.5 font-mono text-[10px] font-bold tracking-[0.08em] uppercase">
        약한 반
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">해당 없음</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((c) => (
            <li key={c.cohortId} className="flex items-center gap-2 text-[13px]">
              <Link
                to={`/admin/cohorts/${c.cohortId}/stats`}
                className="text-foreground min-w-0 flex-1 truncate font-medium hover:underline"
                viewTransition
              >
                {c.name}
              </Link>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {c.distinctStudents}명
              </span>
              <span
                className={cn(
                  "w-9 text-right font-mono text-xs font-bold tabular-nums",
                  accuracyTone(c.accuracyPct),
                )}
              >
                {c.accuracyPct}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WeakNodeStudents({
  rows,
}: {
  rows: WeakNodeBreakdown["students"];
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-1.5 font-mono text-[10px] font-bold tracking-[0.08em] uppercase">
        약한 학생 (정답률 낮은 순)
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">해당 없음</p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 8).map((s) => (
            <li key={s.profileId} className="flex items-center gap-2 text-[13px]">
              <Link
                to={`/admin/students/${s.profileId}`}
                className="text-foreground min-w-0 flex-1 truncate font-medium hover:underline"
                viewTransition
              >
                {s.name || "(이름없음)"}
              </Link>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {s.attempts}회
              </span>
              <span
                className={cn(
                  "w-9 text-right font-mono text-xs font-bold tabular-nums",
                  accuracyTone(s.accuracyPct),
                )}
              >
                {s.accuracyPct}%
              </span>
              <Link
                to={`/admin/students/${s.profileId}#notes`}
                className="text-link inline-flex shrink-0"
                aria-label={`${s.name} 상담`}
                title="상담 메모"
                viewTransition
              >
                <MessageSquareIcon className="size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── ⑤ 반별 비교 ─────────────────────────────────────────────────────── */

function CohortComparison({ o }: { o: AllStudentsOverview }) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-tight">반별 비교</h2>
          <p className="text-muted-foreground text-xs">
            정답률 낮은(가장 지원이 필요한) 반이 위로. 추세는 최근 2주 vs 직전
            2주(활동은 1주). 반 이름을 누르면 상세 통계.
          </p>
        </div>
      </div>
      <IndexTable
        testid="students-analytics-cohorts"
        headers={[
          { label: "반", align: "left" },
          { label: "인원", align: "right" },
          { label: "7일 활성", align: "right" },
          { label: "평균 정답률", align: "right" },
          { label: "정답률 추세", align: "right" },
          { label: "활동 추세", align: "right" },
          { label: "평균 문제풀이", align: "right" },
          { label: "", align: "right", width: "44px" },
        ]}
      >
        {o.cohorts.map((c) => (
          <TR key={c.cohortId}>
            <TD>
              <Link
                to={`/admin/cohorts/${c.cohortId}/stats`}
                className="text-foreground font-semibold hover:underline"
                viewTransition
              >
                {c.name}
              </Link>
            </TD>
            <TD align="right" mono>
              {c.memberCount}
            </TD>
            <TD align="right" mono soft>
              {c.active7dCount} · {ratePct(c.active7dRate)}
            </TD>
            <TD align="right" className={cn("font-mono font-bold", accuracyTone(c.avgAccuracyPct))}>
              {pct1(c.avgAccuracyPct)}
            </TD>
            <TD align="right">
              <DeltaBadge value={c.accuracyDeltaPct} unit="%p" />
            </TD>
            <TD align="right">
              <DeltaBadge value={c.activeDelta} unit="명" />
            </TD>
            <TD align="right" mono soft>
              {c.avgProblemsAttempted}
            </TD>
            <TD align="right">
              <Link
                to={`/admin/cohorts/${c.cohortId}/stats`}
                className="text-link inline-flex"
                aria-label={`${c.name} 상세 통계`}
                viewTransition
              >
                <ArrowRightIcon className="size-4" />
              </Link>
            </TD>
          </TR>
        ))}
      </IndexTable>
    </section>
  );
}

/* ── 위험군·약점 모니터링 연결(무거운 집계는 전용 화면에서) ──────────── */

function MonitoringLinks() {
  const links = [
    {
      to: "/admin/cohorts/at-risk",
      Icon: AlertTriangleIcon,
      title: "위험 수강생",
      desc: "7일 무접속·정답률 급락 등 추세 신호로 본 위험군 큐",
    },
    {
      to: "/admin/cohorts",
      Icon: UsersIcon,
      title: "반별 약점 단원",
      desc: "반 상세 통계에서 공통 약점 단원·SRS 현황 확인",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((l) => (
        <Link key={l.to} to={l.to} viewTransition className="group block">
          <Card className="hover:border-primary h-full transition-colors">
            <CardContent className="flex items-center gap-3 py-4">
              <span className="bg-primary/10 text-link inline-flex size-9 shrink-0 items-center justify-center rounded-lg">
                <l.Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold tracking-tight">{l.title}</p>
                <p className="text-muted-foreground text-xs">{l.desc}</p>
              </div>
              <ArrowRightIcon className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/* ── 상태 화면 ───────────────────────────────────────────────────────── */

function ManagerOnlyNotice() {
  return (
    <Card className="border-amber-300/60 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20">
      <CardContent className="space-y-3 py-6 text-sm leading-relaxed">
        <div className="flex items-center gap-2">
          <TrendingUpIcon className="size-5 text-amber-600 dark:text-amber-400" />
          <h2 className="text-base font-bold">관리자·원장 전용 화면</h2>
        </div>
        <p className="text-muted-foreground">
          전체 학습현황(반을 가로지른 집계)은 관리자·원장만 볼 수 있습니다. 강사는
          담당 반의 통계·위험군을 확인하세요.
        </p>
        <div className="flex gap-2 pt-1">
          <Link
            to="/admin/cohorts"
            viewTransition
            className="text-link inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            담당 반 목록 <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <UsersIcon className="text-muted-foreground/40 mx-auto size-8" />
        <p className="text-foreground mt-3 text-sm font-semibold">
          집계할 수강생이 없습니다
        </p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs leading-relaxed">
          활성 반에 배정된 수강생의 학습 활동이 쌓이면 전체 통계가 표시됩니다.
        </p>
        <Link
          to="/admin/cohorts"
          viewTransition
          className="text-link mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          반 관리로 이동 <ArrowRightIcon className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
