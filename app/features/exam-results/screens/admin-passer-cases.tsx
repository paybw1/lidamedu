// feat-8-006 합격자 케이스 카드 (Phase B 첫 단계).
// /admin/analytics/passers — admin 전용.
// P4 STATS/ANALYTICS 패턴 — AdminShell cluster="analytics" 래핑.

import {
  CheckCircle2Icon,
  ClipboardCheckIcon,
  EyeOffIcon,
  FlaskConicalIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import { Form, Link, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  FilterBar,
  FilterGroup,
} from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";
import {
  computePasserAggregateStats,
  getPasserPoolStats,
  listPasserCases,
  type PasserAggregateStats,
  type PasserCase,
} from "~/features/exam-results/analytics.server";
import {
  cleanupSeedPassers,
  getSeedCount,
  seedPasserData,
} from "~/features/exam-results/seed.server";
import {
  EXAM_ROUND_LABEL,
  EXAM_VERIFICATION_STATUS_LABEL,
  type ExamRound,
} from "~/features/exam-results/labels";
import {
  EmptyConsentBanner,
  PasserAggView,
  StatsSection,
} from "./passer-cases-components";

import type { Route } from "./+types/admin-passer-cases";

export const meta: Route.MetaFunction = () => [
  { title: "합격자 분석 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager"))
    throw data("관리자 이상 권한이 필요합니다", { status: 403 });

  const url = new URL(request.url);
  const yearStr = url.searchParams.get("year");
  const filter = {
    year: yearStr ? Number(yearStr) : null,
    round: (url.searchParams.get("round") as ExamRound | null) || null,
    onlyVerified: url.searchParams.get("verified") === "1",
    onlyConsented: url.searchParams.get("consented") === "1",
  };
  const [cases, pool, seedCount] = await Promise.all([
    listPasserCases(filter),
    getPasserPoolStats(),
    getSeedCount(),
  ]);
  const stats = computePasserAggregateStats(cases);
  return { cases, pool, stats, seedCount, filter, role };
}

const seedSchema = z.object({
  intent: z.literal("seed"),
  count: z.coerce.number().int().min(1).max(20),
  status: z.enum(["passed", "failed"]).default("passed"),
});
const cleanupSchema = z.object({
  intent: z.literal("cleanup-seed"),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager"))
    return data({ error: "관리자 이상 권한이 필요합니다" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "seed") {
    const parsed = seedSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    const res = await seedPasserData(parsed.data.count, parsed.data.status);
    const groupLabel =
      parsed.data.status === "passed" ? "합격자" : "비합격자";
    return data({
      ok: true,
      message: `${groupLabel} ${res.created}건 시드 완료${res.errors.length > 0 ? ` (오류 ${res.errors.length})` : ""}`,
      errors: res.errors,
    });
  }
  if (intent === "cleanup-seed") {
    const parsed = cleanupSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    const res = await cleanupSeedPassers();
    return data({
      ok: true,
      message: `${res.deleted}건 삭제${res.errors.length > 0 ? ` (오류 ${res.errors.length})` : ""}`,
      errors: res.errors,
    });
  }
  return data(
    { error: `알 수 없는 intent: ${intent}` },
    { status: 400 },
  );
}

/* ── KPI 카드 ───────────────────────────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  subtle,
  tone,
}: {
  label: string;
  value: string;
  subtle?: string;
  tone?: "emerald" | "blue" | "violet" | "amber";
}) {
  const toneMap: Record<NonNullable<typeof tone>, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-primary",
    violet: "text-violet-700 dark:text-violet-300",
    amber: "text-amber-700 dark:text-amber-400",
  };
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-2xl font-extrabold tracking-tight tabular-nums",
          tone ? toneMap[tone] : "text-foreground",
        )}
      >
        {value}
      </p>
      {subtle ? (
        <p className="text-muted-foreground mt-0.5 text-[11px]">{subtle}</p>
      ) : null}
    </div>
  );
}

/* ── 메인 컴포넌트 ────────────────────────────────────────────────────────── */

export default function AdminPasserCases({
  loaderData,
}: Route.ComponentProps) {
  const { cases, pool, stats, seedCount, filter, role } = loaderData;
  const totalCount = cases.length;
  const withAggCount = cases.filter((c) => c.aggregates !== null).length;
  const hasFilter =
    !!filter.year ||
    !!filter.round ||
    filter.onlyVerified ||
    filter.onlyConsented;

  return (
    <AdminShell
      cluster="analytics"
      role={role}
      title="합격자 케이스"
      desc="한 명 한 명의 합격자가 어떻게 공부했는지 살펴봅니다. 분석 동의를 받은 학생만 학습 로그 집계를 표시합니다."
      headerRight={
        <Chip tone="emerald">
          <TrophyIcon className="size-3" /> 합격 {pool.passerCount}
        </Chip>
      }
    >
      {/* KPI 타일 */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="합격 총수"
          value={String(pool.passerCount)}
          tone="emerald"
        />
        <SummaryCard
          label="인증 합격"
          value={String(pool.verifiedPasserCount)}
          tone="blue"
        />
        <SummaryCard
          label="분석 동의 합격"
          value={String(pool.consentedPasserCount)}
          tone="violet"
        />
        <SummaryCard
          label="현재 표시"
          value={String(totalCount)}
          tone="amber"
          subtle={
            withAggCount > 0
              ? `집계 ${withAggCount}/${totalCount}명`
              : undefined
          }
        />
      </div>

      {/* 시드 도구 */}
      <SeedToolBox seedCount={seedCount} />

      {/* 연도·차수별 분포 */}
      {pool.byYearRound.length > 0 ? (
        <div className="border-border bg-card mb-4 rounded-xl border p-4 shadow-sm">
          <p className="text-muted-foreground mb-2 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
            연도·차수별 분포
          </p>
          <div className="flex flex-wrap gap-2">
            {pool.byYearRound.map((g) => (
              <div
                key={`${g.examYear}-${g.examRound}`}
                className="border-border bg-muted/30 rounded-lg border px-2.5 py-1.5 text-[11px] tabular-nums"
              >
                <span className="font-semibold">
                  {g.examYear} {EXAM_ROUND_LABEL[g.examRound]}
                </span>
                <span className="text-muted-foreground ml-1">
                  {g.count}명 · 인증 {g.verified}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 분포 통계 */}
      {stats.sampleSize > 0 ? (
        <StatsSection stats={stats} />
      ) : (
        <EmptyConsentBanner />
      )}

      {/* 필터 바 */}
      <Form method="get">
        <FilterBar
          hasActive={hasFilter}
          onReset={() => {
            window.location.href = "/admin/analytics/passers";
          }}
        >
          <FilterGroup label="연도">
            <input
              type="number"
              name="year"
              defaultValue={filter.year ?? ""}
              placeholder="2026"
              aria-label="연도"
              className="border-input bg-background focus:border-primary h-9 w-24 rounded-md border px-3 text-[13px] tabular-nums outline-none"
            />
          </FilterGroup>
          <FilterGroup label="차수">
            <AdminSelect name="round" defaultValue={filter.round ?? ""}>
              <option value="">전체</option>
              <option value="first">1차</option>
              <option value="second">2차</option>
            </AdminSelect>
          </FilterGroup>
          <FilterGroup label="옵션">
            <label className="inline-flex items-center gap-1 text-[13px]">
              <input
                type="checkbox"
                name="verified"
                value="1"
                defaultChecked={filter.onlyVerified}
                className="accent-primary"
              />
              <span className="text-foreground/80">인증만</span>
            </label>
            <label className="inline-flex items-center gap-1 text-[13px]">
              <input
                type="checkbox"
                name="consented"
                value="1"
                defaultChecked={filter.onlyConsented}
                className="accent-primary"
              />
              <span className="text-foreground/80">분석 동의자만</span>
            </label>
          </FilterGroup>
          <Button type="submit" size="sm" className="rounded-full">
            필터
          </Button>
        </FilterBar>
      </Form>

      {totalCount > 0 ? (
        <p className="text-muted-foreground mb-3 text-[11px]">
          학습 로그 집계는 응시 전년도 1월 1일 ~ 응시 연도 12월 31일 구간.
          {withAggCount > 0 ? (
            <span className="ml-1">
              현재 {withAggCount}/{totalCount}명에 대해 집계 표시.
            </span>
          ) : null}
        </p>
      ) : null}

      {/* 카드 목록 */}
      {cases.length === 0 ? (
        <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border p-14 text-center shadow-sm">
          <UsersIcon className="text-muted-foreground/60 size-8" />
          <p className="text-sm font-semibold">
            {hasFilter
              ? "조건에 맞는 합격자가 없습니다"
              : "합격자 케이스가 아직 없습니다"}
          </p>
          <p className="text-muted-foreground text-xs">
            {hasFilter
              ? "필터를 초기화하거나 조건을 바꿔보세요."
              : "결과 인증·입력이 모이면 여기에 표시됩니다."}
          </p>
          <Link
            to="/admin/exam-results"
            className="text-primary mt-1 text-xs underline"
          >
            합격 결과 운영 화면 →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cases.map((c) => (
            <PasserCard key={c.resultId} item={c} />
          ))}
        </div>
      )}
    </AdminShell>
  );
}

/* ── 시드 도구 ──────────────────────────────────────────────────────────── */

function SeedToolBox({ seedCount }: { seedCount: number }) {
  const seedFetcher = useFetcher<{
    ok?: boolean;
    message?: string;
    errors?: string[];
    error?: string;
  }>();
  const cleanupFetcher = useFetcher<{
    ok?: boolean;
    message?: string;
    errors?: string[];
    error?: string;
  }>();
  const busy =
    seedFetcher.state !== "idle" || cleanupFetcher.state !== "idle";
  return (
    <div className="mb-4 rounded-xl border border-dashed border-violet-300 bg-violet-50/30 p-4 dark:border-violet-700 dark:bg-violet-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConicalIcon className="size-4 text-violet-700 dark:text-violet-300" />
          <div>
            <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
              시연·QA 시드 데이터
            </p>
            <p className="text-[11px] text-violet-700/70 dark:text-violet-400/70">
              실제 합격자가 모이기 전 데모용. 현재 시드 프로필{" "}
              {seedCount.toLocaleString("ko-KR")}건.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <seedFetcher.Form method="post" className="flex items-center gap-1">
            <input type="hidden" name="intent" value="seed" />
            <input type="hidden" name="status" value="passed" />
            <Input
              type="number"
              name="count"
              defaultValue={5}
              min={1}
              max={20}
              className="h-7 w-16 text-xs tabular-nums"
            />
            <Button
              type="submit"
              size="sm"
              disabled={busy}
              className="h-7 rounded-full px-2 text-xs"
            >
              합격자 시드
            </Button>
          </seedFetcher.Form>
          <seedFetcher.Form method="post" className="flex items-center gap-1">
            <input type="hidden" name="intent" value="seed" />
            <input type="hidden" name="status" value="failed" />
            <Input
              type="number"
              name="count"
              defaultValue={5}
              min={1}
              max={20}
              className="h-7 w-16 text-xs tabular-nums"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={busy}
              className="h-7 rounded-full px-2 text-xs"
            >
              비합격자 시드
            </Button>
          </seedFetcher.Form>
          <cleanupFetcher.Form method="post">
            <input type="hidden" name="intent" value="cleanup-seed" />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={busy || seedCount === 0}
              className="h-7 rounded-full px-2 text-xs text-rose-600 hover:text-rose-700"
              onClick={(e) => {
                if (
                  !confirm(
                    `시드 프로필 ${seedCount}명을 모두 삭제하시겠습니까?`,
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <Trash2Icon className="mr-1 size-3" />
              전체 삭제
            </Button>
          </cleanupFetcher.Form>
        </div>
      </div>
      {seedFetcher.data?.message ? (
        <p className="mt-2 text-[11px] text-violet-900 dark:text-violet-200">
          ✓ {seedFetcher.data.message}
        </p>
      ) : null}
      {seedFetcher.data?.error ? (
        <p className="mt-2 text-[11px] text-rose-700">
          ✗ {seedFetcher.data.error}
        </p>
      ) : null}
      {cleanupFetcher.data?.message ? (
        <p className="mt-2 text-[11px] text-violet-900 dark:text-violet-200">
          ✓ {cleanupFetcher.data.message}
        </p>
      ) : null}
      {cleanupFetcher.data?.error ? (
        <p className="mt-2 text-[11px] text-rose-700">
          ✗ {cleanupFetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}

/* ── PasserCard ─────────────────────────────────────────────────────────── */

function PasserCard({ item }: { item: PasserCase }) {
  const verified = item.verificationStatus === "verified";
  const consented = item.poolConsentAt !== null;
  const agg = item.aggregates;
  return (
    <div
      data-testid={`passer-card-${item.resultId}`}
      className="border-border bg-card overflow-hidden rounded-xl border shadow-sm"
    >
      <div className="border-border/60 border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">
              <Link
                to={`/admin/students/${item.userId}`}
                className="hover:underline"
              >
                {item.userName}
              </Link>
              <span className="text-muted-foreground ml-2 text-xs tabular-nums">
                {item.examYear} {EXAM_ROUND_LABEL[item.examRound]} · 합격
              </span>
            </p>
            {item.userEmail ? (
              <p className="text-muted-foreground text-[11px]">
                {item.userEmail}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {verified ? (
              <Chip tone="emerald">
                <ShieldCheckIcon className="size-3" /> 인증
              </Chip>
            ) : (
              <Chip tone="neutral">
                {EXAM_VERIFICATION_STATUS_LABEL[item.verificationStatus]}
              </Chip>
            )}
            {consented ? (
              <Chip tone="violet">
                <CheckCircle2Icon className="size-3" /> 동의
              </Chip>
            ) : (
              <Chip tone="neutral">
                <EyeOffIcon className="size-3" /> 미동의
              </Chip>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {item.selfReportedTotalScore !== null ? (
          <div className="text-xs">
            <span className="text-muted-foreground">자가 점수: </span>
            <span className="font-semibold tabular-nums">
              {item.selfReportedTotalScore}
            </span>
          </div>
        ) : null}

        {item.studySummaryMd ? (
          <div className="rounded-lg border-l-2 border-emerald-300 bg-emerald-50/40 p-3 dark:bg-emerald-950/20">
            <p className="mb-1 font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-emerald-800 dark:text-emerald-300">
              <ClipboardCheckIcon className="mr-1 inline size-3" />
              본인 학습 요약
            </p>
            <p className="text-xs leading-relaxed whitespace-pre-line">
              {item.studySummaryMd}
            </p>
          </div>
        ) : null}

        <Separator />

        {!consented ? (
          <p className="text-muted-foreground text-[11px]">
            <EyeOffIcon className="mr-1 inline size-3" />
            분석 활용 미동의 — 학습 로그 집계는 표시하지 않습니다.
          </p>
        ) : !agg ? (
          <p className="text-muted-foreground text-[11px]">
            학습 로그를 집계하지 못했습니다.
          </p>
        ) : (
          <PasserAggView agg={agg} />
        )}
      </div>
    </div>
  );
}
