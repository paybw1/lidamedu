// 학습현황 "진도" 탭 — 과목 런처. 요약 띠 + 1·2차 토글 + 과목 카드 그리드 + 자연과학.
// 전체 현황을 한눈에 보면서 각 과목 학습으로 바로 진입하는 화면(과목 홈 위젯의 전 과목 허브).
import { ClockIcon, FlameIcon, TrendingUpIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/core/lib/utils";

import {
  type LauncherScience,
  type LauncherSubject,
  ScienceCard,
  SubjectCard,
} from "./progress-subject-card";

function RoundToggle({
  value,
  onChange,
}: {
  value: "1" | "2";
  onChange: (v: "1" | "2") => void;
}) {
  return (
    <div className="bg-muted inline-flex rounded-full p-1">
      {(["1", "2"] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          aria-pressed={value === r}
          className={cn(
            "h-8 rounded-full px-4 text-[13px] font-semibold transition",
            value === r
              ? "bg-card text-primary shadow-sm"
              : "text-ink-soft hover:text-foreground",
          )}
        >
          {r}차
        </button>
      ))}
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  iconClass,
  label,
  children,
  divider = true,
}: {
  icon: typeof TrendingUpIcon;
  iconClass?: string;
  label: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-[150px] flex-1 flex-col gap-2 px-5",
        divider && "sm:border-border/60 sm:border-r",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn("size-3.5", iconClass ?? "text-muted-foreground")} />
        <span className="text-ink-soft text-[11px] font-semibold">{label}</span>
      </div>
      {children}
    </div>
  );
}

function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
      <div
        className="bg-primary h-full rounded-full transition-[width] duration-700"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function SummaryBand({
  round,
  avg,
  streak,
  weekHours,
  weeklyGoalHours,
}: {
  round: "1" | "2";
  avg: number;
  streak: number;
  weekHours: number;
  weeklyGoalHours: number | null;
}) {
  const weekPct =
    weeklyGoalHours && weeklyGoalHours > 0
      ? Math.round((weekHours / weeklyGoalHours) * 100)
      : null;
  return (
    <div className="border-border/60 bg-muted/40 flex flex-wrap items-stretch gap-y-4 rounded-2xl border py-5">
      <SummaryStat
        icon={TrendingUpIcon}
        iconClass="text-primary"
        label={`${round}차 평균 진도`}
      >
        <div className="flex items-center gap-3">
          <span className="text-primary text-3xl font-extrabold tracking-tight tabular-nums">
            {avg}
            <span className="text-lg">%</span>
          </span>
          <div className="max-w-[120px] flex-1">
            <MiniBar pct={avg} />
          </div>
        </div>
      </SummaryStat>
      <SummaryStat
        icon={FlameIcon}
        iconClass="text-orange-500 dark:text-orange-400"
        label="연속 학습"
      >
        <div className="flex items-baseline gap-1.5">
          <span className="text-foreground text-3xl font-extrabold tracking-tight tabular-nums">
            {streak}
          </span>
          <span className="text-ink-soft text-[13px] font-semibold">일째</span>
        </div>
      </SummaryStat>
      <SummaryStat
        icon={ClockIcon}
        iconClass="text-primary"
        label="이번 주 학습"
        divider={false}
      >
        <div>
          <div className="mb-1.5 flex items-baseline gap-1.5">
            <span className="text-foreground text-3xl font-extrabold tracking-tight tabular-nums">
              {weekHours.toFixed(1)}
              <span className="text-lg">h</span>
            </span>
            {weeklyGoalHours && weeklyGoalHours > 0 ? (
              <span className="text-ink-soft text-xs font-medium">
                / 목표 {weeklyGoalHours}h
              </span>
            ) : null}
          </div>
          {weekPct != null ? <MiniBar pct={weekPct} /> : null}
        </div>
      </SummaryStat>
    </div>
  );
}

const GRID = "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]";

export function ProgressLauncher({
  examRound,
  subjects,
  science,
  streak,
  weekHours,
  weeklyGoalHours,
}: {
  examRound: "first" | "second" | null;
  subjects: LauncherSubject[];
  science: LauncherScience[];
  streak: number;
  weekHours: number;
  weeklyGoalHours: number | null;
}) {
  const [round, setRound] = useState<"1" | "2">(
    examRound === "second" ? "2" : "1",
  );
  const laws = subjects.filter((s) => s.rounds.includes(round));
  const showScience = round === "1";
  const avg = laws.length
    ? Math.round(laws.reduce((a, s) => a + s.progressPct, 0) / laws.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* 차수 토글 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <RoundToggle value={round} onChange={setRound} />
        <span className="text-muted-foreground text-xs font-medium">
          {round === "1" ? "법률 4과목 + 자연과학" : "법률 4과목"}
        </span>
      </div>

      <SummaryBand
        round={round}
        avg={avg}
        streak={streak}
        weekHours={weekHours}
        weeklyGoalHours={weeklyGoalHours}
      />

      {/* 법률 과목 */}
      <section>
        <div className="mb-3.5 flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            법률 과목
          </p>
          <span className="text-muted-foreground text-xs font-medium">
            {laws.length}과목
          </span>
        </div>
        <div className={GRID}>
          {laws.map((s) => (
            <SubjectCard key={s.slug} s={s} round={round} />
          ))}
        </div>
      </section>

      {/* 자연과학 (1차) */}
      {showScience && science.length > 0 ? (
        <section>
          <div className="mb-3.5 flex items-center gap-2">
            <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
              자연과학
            </p>
            <span className="bg-violet-500/12 inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold text-violet-600 dark:text-violet-400">
              1차 선택 4과목
            </span>
          </div>
          <div className={GRID}>
            {science.map((s) => (
              <ScienceCard key={s.slug} s={s} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
