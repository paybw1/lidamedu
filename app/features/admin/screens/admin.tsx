// 운영자 메뉴 진입 (feat-7-001, 7-002)
// - staff (instructor/admin): 운영자 허브 — 9 클러스터의 단일 진입점
// - 학생: 권한 안내 + 가능한 액션 안내 화면
// - 비로그인: /login 으로 리다이렉트
import type { Route } from "./+types/admin";

import { ArrowRightIcon, ChevronRightIcon, LockIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { ADMIN_NAV, AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import {
  type StaffContentStats,
  getStaffContentStats,
} from "~/features/admin/queries/staff-content.server";
import {
  type SubjectCoverageRow,
  getSubjectCoverage,
} from "~/features/admin/queries/subject-coverage.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  isFirstExamSubject,
  isSecondExamSubject,
} from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = () => [
  { title: "운영자 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/admin");
  const role = await getStaffRole(client, user.id);
  const [contentStats, subjectCoverage] = role
    ? await Promise.all([
        getStaffContentStats(client, user.id),
        getSubjectCoverage(client),
      ])
    : [null, null];
  return {
    role,
    userEmail: user.email ?? null,
    contentStats,
    subjectCoverage,
  };
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { role, contentStats, subjectCoverage } = loaderData;

  if (!role) {
    return <StudentGuidance />;
  }

  return (
    <AdminShell
      cluster="hub"
      title="운영자 허브"
      desc="콘텐츠 제작·수강생 운영·시험 운영·데이터 분석을 한 곳에서."
      role={role}
    >
      {contentStats ? <ContentStatsRow stats={contentStats} /> : null}
      {subjectCoverage ? <SubjectCoverageCard rows={subjectCoverage} /> : null}
      <ClusterGrid />
    </AdminShell>
  );
}

/* ── 내 콘텐츠 현황 — 7타일 카운터 ─────────────────────────────────────── */

function ContentStatsRow({ stats }: { stats: StaffContentStats }) {
  const tiles: Array<{ label: string; value: number; hint: string }> = [
    { label: "내 판례", value: stats.cases, hint: "등록한 판례" },
    { label: "내 문제", value: stats.problems, hint: "등록한 객관식/주관식" },
    { label: "내 논문", value: stats.papers, hint: "등록한 논문" },
    {
      label: "도서 추록",
      value: stats.bookUpdates,
      hint: "등록한 추록/정오표",
    },
    {
      label: "조문 메모",
      value: stats.articleComments,
      hint: "작성한 메모",
    },
    {
      label: "조문 개정",
      value: stats.articleRevisions,
      hint: "참여한 개정 revision",
    },
    { label: "첨삭 완료", value: stats.subjectiveReviews, hint: "주관식 검토" },
  ];
  return (
    <section className="mb-6" data-testid="admin-hub-content-stats">
      <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        내 콘텐츠 현황
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map((t) => (
          <div
            key={t.label}
            title={t.hint}
            className="border-border bg-card rounded-xl border p-3.5 shadow-sm"
          >
            <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
              {t.label}
            </p>
            <p className="text-foreground mt-1.5 text-[22px] leading-none font-extrabold tracking-tight tabular-nums">
              {t.value.toLocaleString("ko-KR")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 과목 시드 진행률 — 1차 / 2차 ─────────────────────────────────────── */

type CoverageMetricKey = keyof Pick<
  SubjectCoverageRow,
  "articles" | "cases" | "problemsMc" | "problemsSubjective"
>;

const COVERAGE_METRIC_LABEL: Record<CoverageMetricKey, string> = {
  articles: "조문",
  cases: "판례",
  problemsMc: "객관식",
  problemsSubjective: "주관식",
};

// 시드 진행률 — 1차(객관식)/2차(주관식)로 분리. 민법은 1차 표에만, 민사소송법은
// 2차 표에만, 산업재산권법(특허·상표·디자인)은 양쪽 표에 노출된다.
function SubjectCoverageCard({ rows }: { rows: SubjectCoverageRow[] }) {
  const allKeys: CoverageMetricKey[] = [
    "articles",
    "cases",
    "problemsMc",
    "problemsSubjective",
  ];
  // 막대 기준 = 전 과목 통틀어 각 지표의 최댓값.
  const baseline = allKeys.reduce(
    (acc, k) => {
      acc[k] = Math.max(1, ...rows.map((r) => r[k]));
      return acc;
    },
    {} as Record<CoverageMetricKey, number>,
  );
  const firstRows = rows.filter((r) => isFirstExamSubject(r.lawCode));
  const secondRows = rows.filter((r) => isSecondExamSubject(r.lawCode));
  return (
    <section className="mb-6" data-testid="admin-hub-seed-coverage">
      <p className="text-muted-foreground mb-1 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        과목 시드 진행률
      </p>
      <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
        과목별 콘텐츠 수 — 최댓값(보통 특허법) 대비 막대로 격차 가시화. 비어있는
        셀은 시드 우선순위.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <SeedTable
          sectionLabel="1차 시드 진행률"
          mode="1차"
          metricKeys={["articles", "cases", "problemsMc"]}
          rows={firstRows}
          baseline={baseline}
        />
        <SeedTable
          sectionLabel="2차 시드 진행률"
          mode="2차"
          metricKeys={["articles", "cases", "problemsSubjective"]}
          rows={secondRows}
          baseline={baseline}
        />
      </div>
    </section>
  );
}

function SeedTable({
  sectionLabel,
  mode,
  metricKeys,
  rows,
  baseline,
}: {
  sectionLabel: string;
  mode: "1차" | "2차";
  metricKeys: CoverageMetricKey[];
  rows: SubjectCoverageRow[];
  baseline: Record<CoverageMetricKey, number>;
}) {
  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          {sectionLabel}
        </p>
        <Chip tone="blue">{mode}</Chip>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/60">
              <th className="text-muted-foreground px-3 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                과목
              </th>
              {metricKeys.map((k) => (
                <th
                  key={k}
                  className="text-muted-foreground px-3 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase"
                >
                  {COVERAGE_METRIC_LABEL[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = LAW_SUBJECTS[r.lawCode];
              return (
                <tr
                  key={r.lawCode}
                  className="border-border/60 border-t first:border-t-0"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      to={`/subjects/${r.lawCode}`}
                      className="text-foreground text-[13px] font-semibold hover:underline"
                      viewTransition
                    >
                      {meta?.name ?? r.displayLabel}
                    </Link>
                    <Link
                      to={`/admin/laws/${r.lawCode}/completeness`}
                      className="text-primary ml-2 text-[10.5px] font-medium hover:underline"
                      viewTransition
                    >
                      완성도 진단 →
                    </Link>
                  </td>
                  {metricKeys.map((k) => {
                    const value = r[k];
                    const ratio = baseline[k] ? value / baseline[k] : 0;
                    const widthPct = Math.round(ratio * 100);
                    const fill =
                      value === 0
                        ? "bg-rose-500"
                        : ratio < 0.1
                          ? "bg-amber-500"
                          : ratio < 0.5
                            ? "bg-sky-500"
                            : "bg-emerald-500";
                    return (
                      <td key={k} className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="bg-muted hidden h-1.5 w-16 overflow-hidden rounded-full sm:block">
                            <div
                              className={cn("h-full rounded-full", fill)}
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <span className="text-foreground min-w-[3ch] text-right font-mono text-xs font-bold tabular-nums">
                            {value.toLocaleString("ko-KR")}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── 9 클러스터 바로가기 ──────────────────────────────────────────────── */

// 허브 IA = 9 클러스터. hub 자기 자신은 제외하고 8개를 카드로 노출.
function ClusterGrid() {
  const clusters = ADMIN_NAV.filter((c) => c.id !== "hub");
  return (
    <section data-testid="admin-hub-clusters">
      <p className="text-muted-foreground mb-3 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        9 클러스터 바로가기
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clusters.map((c) => {
          const { Icon } = c;
          return (
            <Link
              key={c.id}
              to={c.screens[0].to}
              viewTransition
              className="group block"
            >
              <Card className="hover:border-primary h-full transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="bg-primary/10 text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="size-4" />
                    </span>
                    <h3 className="flex-1 text-sm font-bold tracking-tight">
                      {c.label}
                    </h3>
                    <ChevronRightIcon className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {c.screens.map((s) => (
                      <Chip key={s.to} tone="neutral">
                        {s.label}
                      </Chip>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ── 학생 권한 안내 ───────────────────────────────────────────────────── */

// 학생이 운영자 메뉴를 클릭했을 때 — 권한 안내 + 가능한 액션으로 유도.
// 비-staff 는 운영자 사이드바를 봐서는 안 되므로 AdminShell 을 쓰지 않는다.
function StudentGuidance() {
  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-12 md:px-10 md:py-16">
      <Card className="border-amber-300/60 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <LockIcon className="size-5 text-amber-600 dark:text-amber-400" />
            <h1 className="text-xl font-bold tracking-tight">
              운영자 전용 메뉴
            </h1>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            이 메뉴는 강사·원장이 학습 콘텐츠를 등록·수정·분석하는 도구입니다.
            수험생 계정에서는 접근할 수 없습니다.
          </p>
          <div className="space-y-2">
            <p className="font-semibold">대신 다음 활동을 추천합니다:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <Link
                  to="/dashboard"
                  viewTransition
                  className="text-primary hover:underline"
                >
                  대시보드
                </Link>
                에서 오늘의 학습 목표와 진척도 확인
              </li>
              <li>
                <Link
                  to="/subjects/patent"
                  viewTransition
                  className="text-primary hover:underline"
                >
                  특허법 학습
                </Link>{" "}
                또는{" "}
                <Link
                  to="/subjects/civil"
                  viewTransition
                  className="text-primary hover:underline"
                >
                  민법 학습
                </Link>{" "}
                으로 본격 학습 시작
              </li>
              <li>
                <Link
                  to="/latest/laws"
                  viewTransition
                  className="text-primary hover:underline"
                >
                  최신 정보 (법 개정 / 판례 / 문제 / 논문 / 도서 추록)
                </Link>{" "}
                탐색
              </li>
              <li>
                <Link
                  to="/goals"
                  viewTransition
                  className="text-primary hover:underline"
                >
                  학습 목표
                </Link>{" "}
                관리 — D-day 기준 권장 진도 확인
              </li>
            </ul>
          </div>
          <p className="text-muted-foreground text-xs">
            강사·원장 권한이 필요하다면 운영팀(contact@lidam.edu) 으로
            문의해주세요.
          </p>
          <div className="flex gap-2 pt-2">
            <Button asChild size="sm">
              <Link to="/dashboard">
                <ArrowRightIcon className="size-3.5" /> 대시보드로 이동
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/subjects/patent">특허법 학습 시작</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
