// 운영자 문제 통계 — 객관식 + 정오문제 풀이 시도 집계.
// SQL RPC (admin_problem_stats_rpcs 마이그레이션) 으로 server-side aggregation.
// P4 STATS 패턴 — AdminShell + SummaryCard + Bar + IndexTable.

import { CheckSquareIcon, ListChecksIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Form, Link, data } from "react-router";

import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getProblemSummary,
  listMcqHardestProblems,
  listMcqYearStats,
  listOxHardestRefs,
} from "~/features/admin/queries/problem-stats.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Bar,
  Chip,
  FilterGroup,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-problem-stats";

export const meta: Route.MetaFunction = () => [
  { title: "문제 통계 | Lidam Patent Attorney Academy" },
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
  const subjectParam = url.searchParams.get("subject") ?? "patent";
  const subject: LawSubjectSlug = LAW_SUBJECT_SLUGS.includes(
    subjectParam as never,
  )
    ? (subjectParam as LawSubjectSlug)
    : "patent";
  const minAttemptsParam = url.searchParams.get("min");
  const minAttempts =
    minAttemptsParam && Number.isFinite(Number(minAttemptsParam))
      ? Math.max(1, Number(minAttemptsParam))
      : 3;

  const [summary, mcqHardest, oxHardest, yearStats] = await Promise.all([
    getProblemSummary(client, subject),
    listMcqHardestProblems(client, subject, minAttempts, 20),
    listOxHardestRefs(client, subject, minAttempts, 20),
    listMcqYearStats(client, subject),
  ]);

  return { subject, minAttempts, summary, mcqHardest, oxHardest, yearStats, role };
}

export default function AdminProblemStats({
  loaderData,
}: Route.ComponentProps) {
  const { subject, minAttempts, summary, mcqHardest, oxHardest, yearStats, role } =
    loaderData;

  return (
    <AdminShell
      cluster="problems"
      role={role}
      width={1280}
      title="문제 통계"
      desc="객관식 문제와 정오문제 풀이 시도를 집계합니다. 가장 어려운 문제(낮은 정답률) 위주로 노출되어 출제·해설 보강 우선순위를 파악할 수 있습니다."
    >
      {/* 필터 바 */}
      <div className="border-border bg-card mb-5 flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-sm">
        <Form method="get" className="flex flex-wrap items-center gap-3">
          <FilterGroup label="과목">
            <AdminSelect name="subject" defaultValue={subject}>
              <optgroup label="1차 · 객관식">
                {FIRST_EXAM_LAW_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s].name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="2차 · 주관식">
                {SECOND_EXAM_LAW_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s].name}
                  </option>
                ))}
              </optgroup>
            </AdminSelect>
          </FilterGroup>
          <FilterGroup label="최소 시도 수">
            <input
              type="number"
              name="min"
              min={1}
              defaultValue={minAttempts}
              className="border-input bg-background focus:border-primary h-9 w-20 rounded-md border px-3 text-[13px] tabular-nums outline-none"
            />
          </FilterGroup>
          <button
            type="submit"
            className="border-input bg-background hover:bg-muted h-9 rounded-md border px-4 text-[13px] font-medium transition-colors"
          >
            적용
          </button>
        </Form>
        <span className="text-muted-foreground ml-auto text-xs">
          {LAW_SUBJECTS[subject].name} · 시도{" "}
          <span className="tabular-nums">{minAttempts}</span>회 이상만 집계
        </span>
      </div>

      {/* 요약 KPI — MCQ + OX */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <KpiCard
          title="객관식"
          icon={<ListChecksIcon className="size-3.5" />}
          stats={[
            { label: "문제 수", value: summary.mcq.problemCount },
            { label: "응시자", value: summary.mcq.uniqueUsers, suffix: "명" },
            { label: "시도", value: summary.mcq.attemptCount, suffix: "회" },
            {
              label: "평균 정답률",
              value: `${summary.mcq.accuracy}%`,
              tone: accuracyTone(summary.mcq.accuracy),
            },
          ]}
        />
        <KpiCard
          title="정오문제"
          icon={<CheckSquareIcon className="size-3.5" />}
          stats={[
            {
              label: "후보 / 노출",
              value: `${summary.ox.refTotal} / ${summary.ox.refActive}`,
            },
            { label: "응시자", value: summary.ox.uniqueUsers, suffix: "명" },
            { label: "시도", value: summary.ox.attemptCount, suffix: "회" },
            {
              label: "평균 정답률",
              value: `${summary.ox.accuracy}%`,
              tone: accuracyTone(summary.ox.accuracy),
            },
          ]}
        />
      </div>

      {/* 연도별 정답률 (MCQ) */}
      {yearStats.length > 0 ? (
        <div className="mb-5 space-y-2">
          <TableTitle title="연도별 정답률 (객관식)" />
          <IndexTable
            minWidth={520}
            headers={[
              { label: "연도", width: "6rem" },
              { label: "문제 수", align: "right", width: "6rem" },
              { label: "시도", align: "right", width: "6rem" },
              { label: "정답률", align: "right", width: "6rem" },
              { label: "분포" },
            ]}
          >
            {yearStats.map((y) => (
              <TR key={y.year}>
                <TD mono>{y.year}</TD>
                <TD align="right" mono soft>
                  {y.problemCount}
                </TD>
                <TD align="right" mono soft>
                  {y.attempts}
                </TD>
                <TD align="right">
                  <span
                    className={cn(
                      "font-mono text-[12px] font-bold tabular-nums",
                      accuracyClass(y.accuracy),
                    )}
                  >
                    {y.accuracy}%
                  </span>
                </TD>
                <TD>
                  <Bar value={y.accuracy} tone="auto" className="w-24" />
                </TD>
              </TR>
            ))}
          </IndexTable>
        </div>
      ) : null}

      {/* MCQ 어려운 문제 TOP */}
      <div className="mb-5 space-y-2">
        <div className="flex items-center justify-between">
          <TableTitle title="가장 어려운 객관식 문제" />
          <Chip tone="neutral">
            정답률 오름차순 · TOP {mcqHardest.length}
          </Chip>
        </div>
        {mcqHardest.length === 0 ? (
          <EmptyState text="집계 가능한 시도가 부족합니다. 최소 시도 수를 낮춰 보세요." />
        ) : (
          <IndexTable
            minWidth={640}
            headers={[
              { label: "출처/연도", width: "7rem" },
              { label: "본문" },
              { label: "조문", width: "11rem" },
              { label: "시도", align: "right", width: "5rem" },
              { label: "응시자", align: "right", width: "5rem" },
              { label: "정답률", align: "right", width: "7rem" },
            ]}
          >
            {mcqHardest.map((p) => (
              <TR key={p.problemId}>
                <TD>
                  <p className="font-mono text-[13px] font-semibold tabular-nums">
                    {p.year ?? "—"}
                    {p.problemNumber ? ` · ${p.problemNumber}번` : ""}
                  </p>
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
                    {p.origin}
                  </p>
                </TD>
                <TD>
                  <Link
                    to={`/admin/problems/${p.problemId}`}
                    className="font-serif text-sm leading-snug hover:underline"
                  >
                    {p.bodySnippet}
                  </Link>
                </TD>
                <TD>
                  {p.primaryArticleNumber ? (
                    <Link
                      to={`/subjects/${subject}/articles/${p.primaryArticleNumber}`}
                      className="text-primary text-xs hover:underline"
                    >
                      {p.primaryArticleLabel ?? p.primaryArticleNumber}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">—</span>
                  )}
                </TD>
                <TD align="right" mono soft>
                  {p.attempts}
                </TD>
                <TD align="right" mono soft>
                  {p.uniqueUsers}
                </TD>
                <TD align="right">
                  <AccuracyCell accuracy={p.accuracy} />
                </TD>
              </TR>
            ))}
          </IndexTable>
        )}
      </div>

      {/* OX 어려운 지문 TOP */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <TableTitle title="가장 어려운 정오 지문" />
          <Chip tone="neutral">
            정답률 오름차순 · TOP {oxHardest.length}
          </Chip>
        </div>
        {oxHardest.length === 0 ? (
          <EmptyState text="집계 가능한 정오문제 시도가 부족합니다." />
        ) : (
          <IndexTable
            minWidth={680}
            headers={[
              { label: "출처/연도", width: "7rem" },
              { label: "유형", width: "5rem" },
              { label: "지문" },
              { label: "정답", width: "4rem", align: "center" },
              { label: "조문", width: "11rem" },
              { label: "시도", align: "right", width: "5rem" },
              { label: "정답률", align: "right", width: "7rem" },
            ]}
          >
            {oxHardest.map((it) => (
              <TR key={`${it.refType}:${it.refId}`}>
                <TD>
                  <p className="font-mono text-[13px] font-semibold tabular-nums">
                    {it.year ?? "—"}
                    {it.problemNumber ? ` · ${it.problemNumber}번` : ""}
                  </p>
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
                    {it.origin}
                  </p>
                </TD>
                <TD>
                  <Chip tone="neutral">
                    {it.refType === "choice" ? "보기" : "박스"}
                  </Chip>
                </TD>
                <TD>
                  <Link
                    to={`/admin/problems/${it.problemId}`}
                    className="font-serif text-sm leading-snug hover:underline"
                  >
                    {it.bodySnippet}
                  </Link>
                </TD>
                <TD align="center">
                  <span
                    className={cn(
                      "font-mono text-[13px] font-bold",
                      it.oxTruth === "O"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400",
                    )}
                  >
                    {it.oxTruth}
                  </span>
                </TD>
                <TD>
                  {it.relatedArticleNumber ? (
                    <Link
                      to={`/subjects/${subject}/articles/${it.relatedArticleNumber}`}
                      className="text-primary text-xs hover:underline"
                    >
                      {it.relatedArticleLabel ?? it.relatedArticleNumber}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">—</span>
                  )}
                </TD>
                <TD align="right" mono soft>
                  {it.attempts}
                </TD>
                <TD align="right">
                  <AccuracyCell accuracy={it.accuracy} />
                </TD>
              </TR>
            ))}
          </IndexTable>
        )}
      </div>
    </AdminShell>
  );
}

/* ── 로컬 서브컴포넌트 ─────────────────────────────────────────────────── */

function TableTitle({ title }: { title: string }) {
  return (
    <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
      {title}
    </p>
  );
}

function AccuracyCell({ accuracy }: { accuracy: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Bar value={accuracy} tone="auto" className="w-14" />
      <span
        className={cn(
          "font-mono text-[12px] font-bold tabular-nums",
          accuracyClass(accuracy),
        )}
      >
        {accuracy}%
      </span>
    </div>
  );
}

function KpiCard({
  title,
  icon,
  stats,
}: {
  title: string;
  icon: ReactNode;
  stats: Array<{
    label: string;
    value: string | number;
    suffix?: string;
    tone?: "ok" | "warn" | "bad";
  }>;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {icon}
        {title}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
              {s.label}
            </p>
            <p
              className={cn(
                "mt-1 text-xl font-extrabold tabular-nums tracking-tight",
                s.tone === "ok"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : s.tone === "warn"
                    ? "text-amber-600 dark:text-amber-400"
                    : s.tone === "bad"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-foreground",
              )}
            >
              {s.value}
              {s.suffix ? (
                <span className="text-muted-foreground ml-1 text-sm font-normal">
                  {s.suffix}
                </span>
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border-border bg-card text-muted-foreground rounded-xl border py-12 text-center text-sm shadow-sm">
      {text}
    </div>
  );
}

function accuracyTone(accuracy: number): "ok" | "warn" | "bad" {
  if (accuracy < 40) return "bad";
  if (accuracy < 70) return "warn";
  return "ok";
}

function accuracyClass(accuracy: number): string {
  if (accuracy < 40) return "text-rose-600 dark:text-rose-400";
  if (accuracy < 70) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}
