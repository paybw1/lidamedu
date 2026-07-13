// 법령별 콘텐츠 완성도 진단 — 운영자가 어느 차원부터 채울지 결정하는 화면.
// 리스킨: AdminShell(cluster=laws, P4), Bar(의미색), SummaryCard, GapItem
import type { Route } from "./+types/admin-law-completeness";

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleSlash2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { useEffect } from "react";
import { Link, data, useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import {
  type LawCompletenessSnapshot,
  getLawCompleteness,
} from "~/features/admin/queries/law-completeness.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Bar, Chip } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  EXAM_LABEL,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = ({ data: d }) => {
  const name = d && "subject" in d ? d.subject.name : "법령";
  return [{ title: `${name} 완성도 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const lawCodeRaw = params.lawCode ?? "";
  if (!(LAW_SUBJECT_SLUGS as readonly string[]).includes(lawCodeRaw)) {
    throw data("Unknown law", { status: 404 });
  }
  const lawCode = lawCodeRaw as LawSubjectSlug;
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const snapshot = await getLawCompleteness(client, lawCode);
  return {
    snapshot,
    subject: LAW_SUBJECTS[lawCode],
    role,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "backfill_aa_refs") {
    const { data: rows, error } = await client.rpc(
      "backfill_article_article_links_from_body",
    );
    if (error) throw data(error.message, { status: 500 });
    const row = rows?.[0];
    return {
      ok: true as const,
      kind: "aa" as const,
      insertedCount: Number(row?.inserted_count ?? 0),
      totalExistingCount: Number(row?.total_existing_count ?? 0),
    };
  }
  if (intent === "backfill_ac_refs") {
    const { data: rows, error } = await client.rpc(
      "backfill_article_case_links_from_body",
    );
    if (error) throw data(error.message, { status: 500 });
    const row = rows?.[0];
    return {
      ok: true as const,
      kind: "ac" as const,
      insertedCount: Number(row?.inserted_count ?? 0),
      totalExistingCount: Number(row?.total_existing_count ?? 0),
    };
  }
  throw data("Unknown intent", { status: 400 });
}

/* ── Types ──────────────────────────────────────────────────────────── */

interface GapRow {
  label: string;
  covered: number;
  total: number;
  hint: string;
  cta?: { to: string; label: string };
}

type Tone = "ok" | "warn" | "danger" | "muted";

/* ── Page ──────────────────────────────────────────────────────────── */

export default function AdminLawCompleteness({
  loaderData,
}: Route.ComponentProps) {
  const { snapshot, subject, role } = loaderData;
  const articleGaps = buildArticleGaps(snapshot, subject.slug);
  const caseGaps = buildCaseGaps(snapshot, subject.slug);
  const problemGaps = buildProblemGaps(snapshot, subject.slug);

  const aaFetcher = useFetcher<typeof action>();
  const acFetcher = useFetcher<typeof action>();
  const busy = aaFetcher.state !== "idle" || acFetcher.state !== "idle";

  useEffect(() => {
    const r = aaFetcher.data;
    if (aaFetcher.state === "idle" && r?.ok && r.kind === "aa") {
      toast.success(
        `조문 inline ref 동기화 — 신규 ${r.insertedCount}건 (누계 ${r.totalExistingCount}건)`,
      );
    }
  }, [aaFetcher.state, aaFetcher.data]);

  useEffect(() => {
    const r = acFetcher.data;
    if (acFetcher.state === "idle" && r?.ok && r.kind === "ac") {
      toast.success(
        `판례 본문 ref 동기화 — 신규 ${r.insertedCount}건 (누계 ${r.totalExistingCount}건)`,
      );
    }
  }, [acFetcher.state, acFetcher.data]);

  return (
    <AdminShell
      cluster="checks"
      role={role}
      width={960}
      title={`${subject.name} 완성도`}
      desc={`실 조문(${EXAM_LABEL[subject.exam]} 시험) 기준 콘텐츠 갭 점검. 각 차원에서 미커버 항목을 채워 학습 자료를 완성하세요.`}
      headerRight={
        <div className="flex flex-wrap gap-2">
          <aaFetcher.Form method="post">
            <input type="hidden" name="intent" value="backfill_aa_refs" />
            <Button type="submit" size="sm" variant="outline" disabled={busy}>
              <RefreshCwIcon
                className={cn(
                  "size-3",
                  aaFetcher.state !== "idle" && "animate-spin",
                )}
              />
              조문 ref 동기화
            </Button>
          </aaFetcher.Form>
          <acFetcher.Form method="post">
            <input type="hidden" name="intent" value="backfill_ac_refs" />
            <Button type="submit" size="sm" variant="outline" disabled={busy}>
              <RefreshCwIcon
                className={cn(
                  "size-3",
                  acFetcher.state !== "idle" && "animate-spin",
                )}
              />
              판례 ref 동기화
            </Button>
          </acFetcher.Form>
        </div>
      }
    >
      {/* KPI 요약 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="실 조문"
          value={snapshot.totalArticles.toLocaleString("ko-KR")}
        />
        <SummaryCard
          label="판례"
          value={snapshot.totalCases.toLocaleString("ko-KR")}
        />
        <SummaryCard
          label="문제"
          value={(snapshot.totalMcq + snapshot.totalSubjective).toLocaleString("ko-KR")}
          subtle={`객관식 ${snapshot.totalMcq.toLocaleString("ko-KR")} · 주관식 ${snapshot.totalSubjective.toLocaleString("ko-KR")}`}
        />
      </div>

      <GapSection
        title="조문"
        totalLabel={`실 조문 ${snapshot.totalArticles.toLocaleString("ko-KR")}건`}
        gaps={articleGaps}
      />
      <GapSection
        title="판례"
        totalLabel={`판례 ${snapshot.totalCases.toLocaleString("ko-KR")}건`}
        gaps={caseGaps}
      />
      <GapSection
        title="문제"
        totalLabel={`객관식 ${snapshot.totalMcq.toLocaleString("ko-KR")}건 · 주관식 ${snapshot.totalSubjective.toLocaleString("ko-KR")}건`}
        gaps={problemGaps}
      />
    </AdminShell>
  );
}

/* ── Gap builders ────────────────────────────────────────────────────── */

function buildArticleGaps(
  s: LawCompletenessSnapshot,
  slug: LawSubjectSlug,
): GapRow[] {
  const total = s.totalArticles;
  return [
    {
      label: "현행 revision 본문",
      covered: total - s.articlesNoRevision,
      total,
      hint: "각 조문에 current revision(시행 중 본문)이 연결되어 있어야 함",
      cta: { to: `/admin/laws/${slug}/revisions`, label: "법 개정 워크스페이스" },
    },
    {
      label: "빈칸 자료",
      covered: total - s.articlesNoBlanks,
      total,
      hint: "조문 빈칸 채우기 학습 자료(article_blank_sets)가 1개 이상 존재",
      cta: { to: `/admin/blanks/law/${slug}`, label: "빈칸 자료 관리" },
    },
    {
      label: "메모",
      covered: total - s.articlesNoComments,
      total,
      hint: "조문에 staff 가 작성한 메모 1건 이상",
      cta: { to: `/subjects/${slug}`, label: "조문 뷰어에서 인라인 작성" },
    },
    {
      label: "관련 조문 연관",
      covered: total - s.articlesNoRelatedArticle,
      total,
      hint: "article_article_links 상 다른 조문과 명시적 연관 1건 이상",
      cta: { to: `/admin/relations/bulk`, label: "연관관계 일괄 등록" },
    },
    {
      label: "관련 판례 매핑",
      covered: total - s.articlesNoRelatedCase,
      total,
      hint: "조문에 매핑된 판례 1건 이상",
      cta: { to: `/admin/cases?law=${slug}`, label: "판례 매핑 관리" },
    },
    {
      label: "primary 문제 출제",
      covered: total - s.articlesNoProblem,
      total,
      hint: "이 조문이 primary_article 인 문제 1개 이상",
      cta: { to: `/admin/problems`, label: "객관식 문제 관리" },
    },
  ];
}

function buildCaseGaps(
  s: LawCompletenessSnapshot,
  slug: LawSubjectSlug,
): GapRow[] {
  const total = s.totalCases;
  return [
    {
      label: "요지 작성",
      covered: total - s.casesNoSummary,
      total,
      hint: "summary_body_md 필드가 비어있지 않음",
      cta: { to: `/admin/cases?law=${slug}`, label: "판례 편집" },
    },
    {
      label: "조문 매핑",
      covered: total - s.casesNoArticleLink,
      total,
      hint: "article_case_links 상 매핑된 조문 1개 이상",
      cta: { to: `/admin/relations/bulk`, label: "조문↔판례 일괄 매핑" },
    },
  ];
}

function buildProblemGaps(
  s: LawCompletenessSnapshot,
  slug: LawSubjectSlug,
): GapRow[] {
  const mc = s.totalMcq;
  return [
    {
      label: "객관식 해설 작성",
      covered: mc - s.mcqNoExplanation,
      total: mc,
      hint: "통합 해설·지문별 해설·박스 항목별 해설 중 하나 이상 작성",
      cta: { to: `/admin/problems`, label: "객관식 문제 관리" },
    },
    {
      label: "주관식 문제 출제",
      covered: s.totalSubjective,
      total: Math.max(s.totalSubjective, 1),
      hint: "변리사 2차 시험 대비 주관식 문제 수. 목표 미정 — 절대값 기준",
      cta: { to: `/admin/problems/new`, label: "문제 신규 출제" },
    },
  ];
}

/* ── GapSection ─────────────────────────────────────────────────────── */

function GapSection({
  title,
  totalLabel,
  gaps,
}: {
  title: string;
  totalLabel: string;
  gaps: GapRow[];
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
          {title}
        </p>
        <p className="text-muted-foreground text-[11px] tabular-nums">
          {totalLabel}
        </p>
      </div>
      <div className="border-border bg-card divide-border divide-y overflow-hidden rounded-xl border shadow-sm">
        {gaps.map((g) => (
          <GapItem key={g.label} {...g} />
        ))}
      </div>
    </section>
  );
}

/* ── GapItem ────────────────────────────────────────────────────────── */

function GapItem({ label, covered, total, hint, cta }: GapRow) {
  const ratio = total > 0 ? covered / total : 0;
  const pct = Math.round(ratio * 100);
  const gap = Math.max(0, total - covered);
  const tone: Tone =
    total === 0
      ? "muted"
      : ratio >= 0.95
        ? "ok"
        : ratio >= 0.5
          ? "warn"
          : "danger";

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <ToneIcon tone={tone} />
          <p className="text-[13px] font-semibold">{label}</p>
          <ToneChip tone={tone} pct={pct} />
        </div>
        <p className="text-muted-foreground text-[11px]">{hint}</p>
        <div className="flex items-center gap-2">
          <Bar
            value={pct}
            max={100}
            tone={
              tone === "ok"
                ? "emerald"
                : tone === "danger"
                  ? "coral"
                  : tone === "warn"
                    ? "amber"
                    : "primary"
            }
            className="max-w-[16rem] flex-1"
          />
          <span className="text-muted-foreground min-w-[8ch] text-right text-[11px] tabular-nums">
            {covered.toLocaleString("ko-KR")} / {total.toLocaleString("ko-KR")}
          </span>
        </div>
        {gap > 0 ? (
          <p className="text-muted-foreground text-[11px]">
            미커버 {gap.toLocaleString("ko-KR")}건
          </p>
        ) : null}
      </div>
      {cta ? (
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to={cta.to} viewTransition>
            {cta.label}
            <ArrowRightIcon className="ml-1 size-3" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "ok")
    return (
      <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
    );
  if (tone === "warn")
    return <AlertTriangleIcon className="size-4 text-amber-500" />;
  if (tone === "danger")
    return <AlertTriangleIcon className="size-4 text-rose-500" />;
  return <CircleSlash2Icon className="text-muted-foreground size-4" />;
}

function ToneChip({ tone, pct }: { tone: Tone; pct: number }) {
  if (tone === "muted") return null;
  return (
    <Chip
      tone={
        tone === "ok" ? "emerald" : tone === "warn" ? "amber" : "coral"
      }
    >
      {pct}%
    </Chip>
  );
}

/* ── SummaryCard ─────────────────────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">
        {value}
      </p>
      {subtle ? (
        <p className="text-muted-foreground mt-0.5 text-[11px]">{subtle}</p>
      ) : null}
    </div>
  );
}
