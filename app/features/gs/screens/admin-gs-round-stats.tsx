// 회차 통계 — 학생별 총점·z-score·순위 + 4문제(또는 N문제) 각 분포(평균/표편/사분위).
// 패턴 P4 STATS. AdminShell cluster="gs".

import {
  BarChart3Icon,
  CrownIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Bar, Chip, IndexTable, TD, TR, type TableHeaderDef } from "~/features/admin/components/admin-ui";
import {
  getGsRound,
  getRoundQuestionStats,
  getRoundStudentStats,
} from "~/features/gs/queries.server";
import {
  type RoundSummaryRow,
  getRoundUsageSummary,
} from "~/features/gs/queries-usage.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-round-stats";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 통계 | Lidam Patent Attorney Academy`
      : "회차 통계 | Lidam Patent Attorney Academy",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const roundId = params.roundId;
  if (!roundId) throw data("Missing roundId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const [round, students, questions, usage] = await Promise.all([
    getGsRound(client, roundId),
    getRoundStudentStats(client, roundId),
    getRoundQuestionStats(client, roundId),
    getRoundUsageSummary(client, roundId),
  ]);
  if (!round) throw data("Round not found", { status: 404 });
  return { round, students, questions, usage, role };
}

const QUESTION_HEADERS: TableHeaderDef[] = [
  { label: "#", width: "3rem" },
  { label: "문제" },
  { label: "만점", width: "4.5rem", align: "right" },
  { label: "N", width: "3.5rem", align: "right" },
  { label: "평균", width: "5rem", align: "right" },
  { label: "중앙값", width: "5rem", align: "right" },
  { label: "표준편차", width: "6rem", align: "right" },
  { label: "분포", width: "12rem" },
];

const STUDENT_HEADERS: TableHeaderDef[] = [
  { label: "순위", width: "4.5rem" },
  { label: "학생" },
  { label: "총점", width: "7rem", align: "right" },
  { label: "백분위", width: "6rem", align: "right" },
  { label: "z-score", width: "8rem", align: "right" },
  { label: "편차", width: "10rem" },
];

export default function AdminGsRoundStats({
  loaderData,
}: Route.ComponentProps) {
  const { round, students, questions, usage, role } = loaderData;
  const totalMax = questions.reduce((s, q) => s + q.maxScore, 0);
  const cohortAvg =
    students.length > 0
      ? students.reduce((s, x) => s + x.totalScore, 0) / students.length
      : 0;
  const cohortStdev =
    students.length > 0
      ? Math.sqrt(
          students.reduce(
            (s, x) => s + Math.pow(x.totalScore - cohortAvg, 2),
            0,
          ) / students.length,
        )
      : 0;
  const cohortMax = students.length > 0 ? students[0].totalScore : 0;
  const cohortMin =
    students.length > 0 ? students[students.length - 1].totalScore : 0;

  const stdTone =
    cohortStdev / Math.max(totalMax, 1) >= 0.15 ? "coral" : "emerald";

  return (
    <AdminShell
      cluster="gs"
      role={role}
      title={round.title}
      desc={`${LAW_SUBJECTS[round.subject]?.name ?? round.subject}${round.roundNumber ? ` · ${round.roundNumber}회` : ""} — 회차별 통계`}
      headerRight={
        <Link
          to={`/admin/gs/${round.roundId}`}
          className="text-muted-foreground hover:text-foreground text-xs font-semibold"
        >
          ← 회차 편집
        </Link>
      }
    >
      {/* KPI 카드 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <SummaryCard label="응시·채점 완료" value={`${students.length}명`} />
        <SummaryCard
          label="평균 / 만점"
          value={`${cohortAvg.toFixed(1)} / ${totalMax}`}
        />
        <SummaryCard
          label="표준편차"
          value={`±${cohortStdev.toFixed(1)}`}
          hint={cohortStdev / Math.max(totalMax, 1) >= 0.15 ? "편차 큼" : "안정"}
          tone={stdTone}
        />
        <SummaryCard
          label="범위"
          value={`${cohortMin} ~ ${cohortMax}`}
        />
      </div>

      {/* §3 AI/OCR 사용량 — 본 회차에 기록된 호출만 (학생 수 곱 / 채점자 클릭 등 회차 전반). */}
      <UsageCard usage={usage} />

      {/* 문항별 분포 */}
      <div className="mb-6">
        <SectionTitle title="문항별 분포" />
        <p className="text-muted-foreground mb-2 text-[11px]">
          각 문항의 평균·중앙값·표준편차·사분위(Q1~Q3). 분포 막대는 25~75 백분위 범위입니다.
        </p>
        {questions.length === 0 ? (
          <EmptyMsg text="아직 채점된 답안이 없습니다." />
        ) : (
          <IndexTable minWidth={760} headers={QUESTION_HEADERS}>
            {questions.map((q) => (
              <TR key={q.questionId}>
                <TD mono soft>
                  {q.orderIndex + 1}
                </TD>
                <TD>
                  {q.title ?? (
                    <span className="text-muted-foreground italic">제목 없음</span>
                  )}
                </TD>
                <TD align="right" mono soft>
                  {q.maxScore}
                </TD>
                <TD align="right" mono soft>
                  {q.n}
                </TD>
                <TD align="right" mono>
                  {q.avg}
                </TD>
                <TD align="right" mono soft>
                  {q.median}
                </TD>
                <TD align="right" mono>
                  <span
                    className={
                      q.maxScore > 0 && q.stdev / q.maxScore >= 0.2
                        ? "text-amber-700 dark:text-amber-400"
                        : undefined
                    }
                  >
                    ±{q.stdev}
                  </span>
                </TD>
                <TD>
                  <DistributionBar
                    min={q.min}
                    max={q.max}
                    q1={q.q1}
                    q3={q.q3}
                    median={q.median}
                    maxScore={q.maxScore}
                  />
                </TD>
              </TR>
            ))}
          </IndexTable>
        )}
      </div>

      {/* 학생별 결과 */}
      <div>
        <SectionTitle title="학생별 결과" />
        <p className="text-muted-foreground mb-2 text-[11px]">
          총점, 백분위, z-score(편차 보정), 순위. 회차마다 난이도가 달라도 z-score 로 객관적 수준 비교가 가능합니다.
        </p>
        {students.length === 0 ? (
          <EmptyMsg text="아직 채점된 답안이 없습니다." />
        ) : (
          <IndexTable minWidth={680} headers={STUDENT_HEADERS}>
            {students.map((s) => (
              <TR key={s.userId}>
                <TD>
                  <RankChip rank={s.rank} />
                </TD>
                <TD>
                  <p className="font-medium">
                    {s.userName ?? (
                      <span className="text-muted-foreground italic">미설정</span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-[10px] tabular-nums">
                    {s.userId.slice(0, 8)}
                  </p>
                </TD>
                <TD align="right" mono>
                  {s.totalScore}
                </TD>
                <TD align="right" mono soft>
                  상위 {(100 - s.percentile).toFixed(0)}%
                </TD>
                <TD align="right">
                  <ZScoreChip z={s.zScore} />
                </TD>
                <TD>
                  <ZScoreBar z={s.zScore} />
                </TD>
              </TR>
            ))}
          </IndexTable>
        )}
      </div>
    </AdminShell>
  );
}

/* ── 로컬 서브컴포넌트 ──────────────────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "emerald" | "coral";
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-2xl font-extrabold tracking-tight tabular-nums",
          tone === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "coral"
              ? "text-rose-600 dark:text-rose-400"
              : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground mt-0.5 text-[11px]">{hint}</p>
      ) : null}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <p className="text-muted-foreground mb-2 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
      {title}
    </p>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return (
    <div className="border-border bg-card text-muted-foreground rounded-xl border py-12 text-center text-sm shadow-sm">
      {text}
    </div>
  );
}

function RankChip({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Chip tone="amber">
        <CrownIcon className="size-3" /> {rank}위
      </Chip>
    );
  }
  if (rank <= 3) {
    return <Chip tone="blue">{rank}위</Chip>;
  }
  return <Chip tone="neutral">{rank}위</Chip>;
}

function ZScoreChip({ z }: { z: number }) {
  const sign = z > 0 ? "+" : "";
  if (z >= 1) {
    return (
      <Chip tone="emerald">
        <TrendingUpIcon className="size-3" /> {sign}{z.toFixed(2)}σ
      </Chip>
    );
  }
  if (z <= -1) {
    return (
      <Chip tone="coral">
        <TrendingDownIcon className="size-3" /> {z.toFixed(2)}σ
      </Chip>
    );
  }
  return <Chip tone="neutral">{sign}{z.toFixed(2)}σ</Chip>;
}

// z-score 시각화 — 평균(0)을 가운데 두고 -2σ~+2σ 범위에 막대.
function ZScoreBar({ z }: { z: number }) {
  const clamped = Math.max(-2, Math.min(2, z));
  const widthPct = (Math.abs(clamped) / 2) * 50;
  const tone =
    z >= 1
      ? "bg-emerald-500"
      : z <= -1
        ? "bg-rose-500"
        : "bg-muted-foreground/40";
  return (
    <div className="relative h-2 w-32 rounded-full bg-muted">
      <div className="bg-foreground/30 absolute left-1/2 top-0 h-full w-px" />
      {z >= 0 ? (
        <div
          className={cn("absolute left-1/2 top-0 h-full rounded-r-full", tone)}
          style={{ width: `${widthPct}%` }}
        />
      ) : (
        <div
          className={cn("absolute right-1/2 top-0 h-full rounded-l-full", tone)}
          style={{ width: `${widthPct}%` }}
        />
      )}
    </div>
  );
}

// 문항별 분포 막대 — Q1~Q3 박스 + 중앙값 표시.
function DistributionBar({
  min,
  max,
  q1,
  q3,
  median,
  maxScore,
}: {
  min: number;
  max: number;
  q1: number;
  q3: number;
  median: number;
  maxScore: number;
}) {
  if (maxScore <= 0) return null;
  const pct = (v: number) =>
    (Math.max(0, Math.min(maxScore, v)) / maxScore) * 100;
  return (
    <div className="relative h-3 w-full rounded-full bg-muted">
      {/* min~max 범위 */}
      <div
        className="bg-muted-foreground/30 absolute top-0 h-full rounded-full"
        style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%` }}
      />
      {/* Q1~Q3 박스 */}
      <div
        className="bg-primary/40 absolute top-0 h-full rounded"
        style={{ left: `${pct(q1)}%`, width: `${pct(q3) - pct(q1)}%` }}
      />
      {/* median 점 */}
      <div
        className="bg-primary absolute top-1/2 size-2 -translate-y-1/2 rounded-full"
        style={{ left: `calc(${pct(median)}% - 4px)` }}
        title={`중앙값 ${median}`}
      />
    </div>
  );
}


/* ── §3 AI/OCR 사용량 카드 ────────────────────────────────────────── */

function UsageCard({ usage }: { usage: RoundSummaryRow[] }) {
  const totalAiCost = usage
    .filter((u) => u.kind !== "ocr")
    .reduce((s, u) => s + u.costUsd, 0);
  const totalOcrCost = usage
    .filter((u) => u.kind === "ocr")
    .reduce((s, u) => s + u.costUsd, 0);
  const aiCalls = usage
    .filter((u) => u.kind !== "ocr")
    .reduce((s, u) => s + u.calls, 0);
  const ocrCalls = usage
    .filter((u) => u.kind === "ocr")
    .reduce((s, u) => s + u.calls, 0);
  const aiSkippedCap = usage
    .filter((u) => u.kind !== "ocr")
    .reduce((s, u) => s + u.skippedCap, 0);
  const ocrSkippedCap = usage
    .filter((u) => u.kind === "ocr")
    .reduce((s, u) => s + u.skippedCap, 0);
  if (
    aiCalls === 0 &&
    ocrCalls === 0 &&
    aiSkippedCap === 0 &&
    ocrSkippedCap === 0
  ) {
    return null;
  }
  return (
    <section className="mb-6">
      <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        AI · OCR 사용량 (이 회차)
      </p>
      <div className="border-border bg-card grid gap-3 rounded-xl border p-4 shadow-sm sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground text-xs font-semibold">AI 채점 · 초안</p>
          <p className="text-foreground mt-1 text-xl font-extrabold tabular-nums">
            ${totalAiCost.toFixed(totalAiCost >= 1 ? 2 : 4)}{" "}
            <span className="text-muted-foreground text-xs font-medium">
              / {aiCalls.toLocaleString("ko-KR")}회
            </span>
          </p>
          {aiSkippedCap > 0 ? (
            <p className="text-rose-600 mt-1 text-xs">
              cap 도달로 skip {aiSkippedCap}회
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-semibold">OCR (Vision)</p>
          <p className="text-foreground mt-1 text-xl font-extrabold tabular-nums">
            ${totalOcrCost.toFixed(totalOcrCost >= 1 ? 2 : 4)}{" "}
            <span className="text-muted-foreground text-xs font-medium">
              / {ocrCalls.toLocaleString("ko-KR")}회
            </span>
          </p>
          {ocrSkippedCap > 0 ? (
            <p className="text-rose-600 mt-1 text-xs">
              cap 도달로 skip {ocrSkippedCap}회 (페이지 저장은 정상)
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
