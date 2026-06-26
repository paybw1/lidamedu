// 학습현황 진도 런처 — 과목 카드(런처형).
// 진도 불릿 + 핵심 지표 + 마지막 학습 지점(이어서 보기) + CTA + "자세히" 펼침.
// 합격자 비교(passerAvg)는 값이 null 이면 자동 숨김 — 데이터가 들어오면 그대로 표시된다.
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  GavelIcon,
  ListChecksIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";

export interface SubjectLastPoint {
  type: string; // 조문 | 판례 | 문제
  label: string;
  sub: string;
  path: string;
}

export interface LauncherSubject {
  slug: string;
  name: string;
  group: string;
  rounds: ("1" | "2")[];
  progressPct: number;
  /** 합격자 평균 진도(%) — null 이면 비교 UI 숨김(데이터 연동 시 표시). */
  passerAvg: number | null;
  articles: { visited: number; total: number };
  cases: { visited: number; total: number };
  attempts: number;
  accuracy: number;
  weak: number;
  bookmarks: number;
  postits: number;
  highlights: number;
  gs: { count: number; selfAvg: number } | null;
  /** 조문·판례·문제별 마지막 학습 지점(이어서 보기). 학습한 종류만 담긴다. */
  lastPoints: SubjectLastPoint[];
}

export interface LauncherScience {
  slug: string;
  name: string;
  emoji: string;
  progressPct: number;
  attempts: number;
  total: number;
  accuracy: number;
  taken: boolean;
  href: string;
  lastPoint: SubjectLastPoint | null;
}

// 정답률 색조 — 우수 → 취약 (emerald → lime → amber → orange → rose). 다크 대응.
function scoreTextTone(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 70) return "text-lime-600 dark:text-lime-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  if (pct >= 50) return "text-orange-600 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

const TYPE_ICON: Record<string, typeof FileTextIcon> = {
  조문: FileTextIcon,
  판례: GavelIcon,
  문제: ListChecksIcon,
};

// 진도 불릿 — 내 진도 fill + 합격자 평균 마커(있을 때만).
function ProgressBullet({
  pct,
  marker,
}: {
  pct: number;
  marker: number | null;
}) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="bg-muted relative h-3.5 overflow-hidden rounded-full">
      <div
        className="bg-primary h-full rounded-full transition-[width] duration-700"
        style={{ width: `${p}%` }}
      />
      {marker != null ? (
        <div
          className="absolute -top-0.5 -bottom-0.5 w-[2.5px] rounded-sm bg-rose-500 dark:bg-rose-400"
          style={{ left: `${Math.max(0, Math.min(100, marker))}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "text-foreground text-lg leading-none font-extrabold tracking-tight tabular-nums",
          valueClass,
        )}
      >
        {value}
      </div>
      <div className="text-ink-soft mt-1 text-[11px] font-medium">{label}</div>
      {sub ? (
        <div className="text-muted-foreground mt-0.5 text-[10px]">{sub}</div>
      ) : null}
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/60 flex items-baseline justify-between border-b py-1.5">
      <span className="text-ink-soft text-xs font-medium">{label}</span>
      <span className="text-foreground text-[13px] font-bold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function RoundBadge({ r, active }: { r: "1" | "2"; active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-bold",
        active
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {r}차
    </span>
  );
}

// ─── 법률 과목 카드 ───
export function SubjectCard({
  s,
  round,
}: {
  s: LauncherSubject;
  round: "1" | "2";
}) {
  const [open, setOpen] = useState(false);
  const is2 = round === "2";

  // 빈 과목 — 진도 0%.
  if (s.progressPct === 0) {
    return (
      <article className="border-border bg-card flex flex-col rounded-2xl border p-5 shadow-sm">
        <h3 className="text-muted-foreground text-lg font-extrabold tracking-tight">
          {s.name}
        </h3>
        <div className="flex flex-1 flex-col justify-center py-2">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground text-3xl font-extrabold tracking-tight">
              0<span className="text-base">%</span>
            </span>
            <span className="text-ink-faint font-mono text-[9px] font-semibold tracking-[0.12em] uppercase">
              진도
            </span>
          </div>
          <div className="bg-muted mt-2.5 h-3.5 rounded-full" />
          <p className="text-foreground mt-4 text-sm font-semibold">
            아직 시작하지 않은 과목입니다
          </p>
          <p className="text-ink-soft mt-1 text-xs leading-relaxed">
            첫 조문을 열람하면 진도와 합격자 비교가 표시됩니다.
          </p>
        </div>
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="mt-4 w-full rounded-full"
        >
          <Link to={`/subjects/${s.slug}`} viewTransition>
            시작하기 <ArrowRightIcon className="size-3.5" />
          </Link>
        </Button>
      </article>
    );
  }

  const delta = s.passerAvg != null ? s.progressPct - s.passerAvg : null;

  return (
    <article className="border-border bg-card flex flex-col rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      {/* header */}
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-foreground text-xl font-extrabold tracking-tight">
            {s.name}
          </h3>
          {s.rounds.map((r) => (
            <RoundBadge key={r} r={r} active={r === round} />
          ))}
        </div>
        <span className="bg-muted/60 text-ink-soft border-border/60 mt-1.5 inline-flex h-[22px] items-center rounded-full border px-2 text-[11px] font-semibold">
          {s.group}
        </span>
      </div>

      {/* progress + 합격자 benchmark */}
      <div className="mb-4">
        <div className="mb-2.5 flex items-end justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-foreground text-3xl font-extrabold tracking-tight tabular-nums">
              {s.progressPct}
              <span className="text-ink-soft text-base">%</span>
            </span>
            <span className="text-muted-foreground font-mono text-[9px] font-semibold tracking-[0.12em] uppercase">
              진도
            </span>
          </div>
          {delta != null ? (
            <span
              className={cn(
                "inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold",
                delta >= 0
                  ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
              )}
            >
              합격자 {delta >= 0 ? "+" : "−"}
              {Math.abs(delta)}%p
            </span>
          ) : null}
        </div>
        <ProgressBullet pct={s.progressPct} marker={s.passerAvg} />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
            조문 {s.articles.visited.toLocaleString("ko-KR")}/
            {s.articles.total.toLocaleString("ko-KR")}
          </span>
          {s.passerAvg != null ? (
            <span className="text-ink-soft inline-flex items-center gap-1.5 text-[11px] font-medium tabular-nums">
              <span className="inline-block h-2.5 w-[2.5px] rounded-sm bg-rose-500 dark:bg-rose-400" />
              합격자 평균 {s.passerAvg}%
            </span>
          ) : null}
        </div>
      </div>

      {/* key metrics */}
      <div className="mb-4 grid grid-cols-4 gap-2.5">
        <MiniStat
          label="정답률"
          value={`${s.accuracy}%`}
          valueClass={scoreTextTone(s.accuracy)}
        />
        <MiniStat
          label="약점"
          value={s.weak > 0 ? `${s.weak}개` : "—"}
          valueClass={
            s.weak > 0
              ? "text-rose-600 dark:text-rose-400"
              : "text-muted-foreground"
          }
        />
        <MiniStat
          label="문제 시도"
          value={s.attempts.toLocaleString("ko-KR")}
        />
        {is2 && s.gs ? (
          <MiniStat
            label="답안"
            value={`${s.gs.count}편`}
            sub={`평균 ${s.gs.selfAvg}`}
          />
        ) : (
          <MiniStat
            label="판례 열람"
            value={`${s.cases.visited}`}
            sub={`/ ${s.cases.total.toLocaleString("ko-KR")}`}
          />
        )}
      </div>

      {/* 이어서 보기 — 조문·판례·문제별 마지막 학습 지점(각각 그 자리로 바로 이동) */}
      {s.lastPoints.length > 0 ? (
        <div className="mb-3.5 space-y-1.5">
          <div className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.1em] uppercase">
            이어서 보기
          </div>
          {s.lastPoints.map((p) => {
            const PIcon = TYPE_ICON[p.type] ?? FileTextIcon;
            return (
              <Link
                key={p.type}
                to={p.path}
                viewTransition
                prefetch="intent"
                className="border-border/60 bg-muted/40 hover:bg-muted flex items-center gap-2.5 rounded-xl border p-2.5 no-underline transition"
              >
                <span className="bg-primary/10 text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <PIcon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground text-[11px] font-bold">
                      {p.type}
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      {p.sub}
                    </span>
                  </div>
                  <div className="text-foreground/90 mt-0.5 truncate text-xs font-medium">
                    {p.label}
                  </div>
                </div>
                <ArrowRightIcon className="text-muted-foreground size-3.5 shrink-0" />
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* 과목 홈 */}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="w-full rounded-full"
      >
        <Link to={`/subjects/${s.slug}`} viewTransition>
          과목 홈 <ArrowRightIcon className="size-3.5" />
        </Link>
      </Button>

      {/* 자세히 expand */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-ink-soft mt-3 inline-flex w-full items-center justify-center gap-1 py-1 text-xs font-semibold"
      >
        {open ? "접기" : "자세히"}
        {open ? (
          <ChevronUpIcon className="size-3.5" />
        ) : (
          <ChevronDownIcon className="size-3.5" />
        )}
      </button>
      {open ? (
        <div className="mt-1">
          <div className="grid grid-cols-2 gap-x-5">
            <DetailMetric
              label="조문 열람"
              value={`${s.articles.visited} / ${s.articles.total}`}
            />
            <DetailMetric
              label="판례 열람"
              value={`${s.cases.visited} / ${s.cases.total}`}
            />
            <DetailMetric
              label="문제 시도"
              value={s.attempts.toLocaleString("ko-KR")}
            />
            <DetailMetric label="정답률" value={`${s.accuracy}%`} />
            <DetailMetric label="즐겨찾기" value={`${s.bookmarks}`} />
            <DetailMetric label="포스트잇" value={`${s.postits}`} />
            <DetailMetric label="하이라이트" value={`${s.highlights}`} />
            <DetailMetric
              label="약점 단원"
              value={s.weak > 0 ? `${s.weak}개` : "없음"}
            />
          </div>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="rounded-full"
            >
              <Link to={`/subjects/${s.slug}/quiz/setup`} viewTransition>
                <TargetIcon className="size-3.5" /> 맞춤 퀴즈
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link to={`/subjects/${s.slug}/ox`} viewTransition>
                <CheckSquareIcon className="size-3.5" /> 정오문제
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link to={`/study/wrong-note?subject=${s.slug}`} viewTransition>
                <AlertTriangleIcon className="size-3.5" /> 오답노트
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

// ─── 자연과학 과목 카드 ───
export function ScienceCard({ s }: { s: LauncherScience }) {
  if (!s.taken) {
    return (
      <article className="border-border bg-card flex flex-col rounded-2xl border p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <h3 className="text-muted-foreground text-lg font-extrabold tracking-tight">
            <span className="mr-1">{s.emoji}</span>
            {s.name}
          </h3>
          <span className="inline-flex h-5 items-center rounded-full bg-violet-500/12 px-1.5 text-[10px] font-bold text-violet-600 dark:text-violet-400">
            자연과학
          </span>
        </div>
        <div className="flex flex-1 flex-col justify-center py-2">
          <span className="text-muted-foreground text-3xl font-extrabold tracking-tight">
            0<span className="text-base">%</span>
          </span>
          <div className="bg-muted mt-2.5 h-3.5 rounded-full" />
          <p className="text-foreground mt-4 text-sm font-semibold">
            아직 시작하지 않은 과목입니다
          </p>
          <p className="text-ink-soft mt-1 text-xs leading-relaxed">
            첫 문제를 풀면 진도와 정답률이 표시됩니다.
          </p>
        </div>
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="mt-4 w-full rounded-full"
        >
          <Link to={s.href} viewTransition>
            시작하기 <ArrowRightIcon className="size-3.5" />
          </Link>
        </Button>
      </article>
    );
  }

  const lp = s.lastPoint;
  return (
    <article className="border-border bg-card flex flex-col rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-foreground text-xl font-extrabold tracking-tight">
          <span className="mr-1">{s.emoji}</span>
          {s.name}
        </h3>
        <span className="inline-flex h-5 items-center rounded-full bg-violet-500/12 px-1.5 text-[10px] font-bold text-violet-600 dark:text-violet-400">
          자연과학
        </span>
      </div>

      <div className="mb-4">
        <div className="mb-2.5 flex items-baseline gap-2">
          <span className="text-foreground text-3xl font-extrabold tracking-tight tabular-nums">
            {s.progressPct}
            <span className="text-ink-soft text-base">%</span>
          </span>
          <span className="text-muted-foreground font-mono text-[9px] font-semibold tracking-[0.12em] uppercase">
            진도
          </span>
        </div>
        <ProgressBullet pct={s.progressPct} marker={null} />
        <div className="text-muted-foreground mt-2 text-[11px] font-medium tabular-nums">
          풀이 {s.attempts.toLocaleString("ko-KR")} /{" "}
          {s.total.toLocaleString("ko-KR")}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <MiniStat
          label="정답률"
          value={`${s.accuracy}%`}
          valueClass={scoreTextTone(s.accuracy)}
        />
        <MiniStat
          label="문제 풀이"
          value={s.attempts.toLocaleString("ko-KR")}
        />
      </div>

      <Button asChild size="sm" className="mt-auto w-full rounded-full">
        <Link to={lp?.path ?? s.href} viewTransition>
          이어서 풀기 <ArrowRightIcon className="size-3.5" />
        </Link>
      </Button>
    </article>
  );
}
