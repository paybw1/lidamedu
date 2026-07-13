// 운영자 — 미배정 자료 패널 (D-10). P2 LIST 패턴.
// /admin/relations/gaps?law=patent → 미매핑 조문/판례/문제 일람 + 즉시 매핑 진입점.

import {
  GavelIcon,
  ListChecksIcon,
  NetworkIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getRelationGaps } from "~/features/admin/queries/relation-gaps.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  SECOND_EXAM_LAW_SLUGS,
  lawSubjectSlugSchema,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-relation-gaps";

export const meta: Route.MetaFunction = () => [
  { title: "미배정 자료 | 리담변리사학원" },
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
  const lawParam = url.searchParams.get("law") ?? "patent";
  const parsed = lawSubjectSlugSchema.safeParse(lawParam);
  const lawCode: LawSubjectSlug = parsed.success ? parsed.data : "patent";
  const gaps = await getRelationGaps(client, lawCode, 100);
  return { gaps, lawCode, role };
}

export default function AdminRelationGaps({
  loaderData,
}: Route.ComponentProps) {
  const { gaps, lawCode, role } = loaderData;
  const subject = LAW_SUBJECTS[lawCode];
  const totals =
    gaps.unmappedArticles.length +
    gaps.unmappedCases.length +
    gaps.unmappedProblems.length;

  return (
    <AdminShell
      cluster="checks"
      role={role}
      title="미배정 자료 점검"
      desc="체계도에 매핑되지 않은 조문, 조문 없는 판례·문제를 과목별로 점검합니다."
    >
      {/* 과목 필터 */}
      <div className="mb-4 space-y-2">
        <SubjectGroup label="1차 · 객관식" slugs={FIRST_EXAM_LAW_SLUGS} current={lawCode} />
        <SubjectGroup label="2차 · 주관식" slugs={SECOND_EXAM_LAW_SLUGS} current={lawCode} />
      </div>

      {/* 요약 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {subject.name} · 총{" "}
          <span className="text-foreground tabular-nums font-semibold">
            {totals.toLocaleString("ko-KR")}
          </span>
          건 미배정
        </span>
        {totals === 0 ? (
          <Chip tone="emerald">전체 배정 완료</Chip>
        ) : (
          <Chip tone="coral">{totals}건 미배정</Chip>
        )}
      </div>

      {/* 3열 패널 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <GapSection
          title="체계도 미매핑 조문"
          count={gaps.unmappedArticles.length}
          icon={NetworkIcon}
          empty="모든 조문이 체계도에 매핑되어 있습니다."
        >
          {gaps.unmappedArticles.map((a) => (
            <Link
              key={a.articleId}
              to={
                a.articleNumber
                  ? `/admin/relations/article/${lawCode}/${a.articleNumber}`
                  : `/admin/laws/${lawCode}/revisions`
              }
              viewTransition
              className="hover:bg-muted block rounded-lg border px-2.5 py-2 text-xs transition-colors"
            >
              <span className="font-medium">{a.displayLabel}</span>
            </Link>
          ))}
        </GapSection>

        <GapSection
          title="조문 매핑 없는 판례"
          count={gaps.unmappedCases.length}
          icon={GavelIcon}
          empty="모든 판례가 최소 1개 조문과 매핑되어 있습니다."
        >
          {gaps.unmappedCases.map((c) => (
            <Link
              key={c.caseId}
              to={`/subjects/${lawCode}/cases/${c.caseId}`}
              viewTransition
              className="hover:bg-muted block rounded-lg border px-2.5 py-2 text-xs transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-medium tabular-nums">{c.caseNumber}</span>
                {c.importance >= 3 ? (
                  <Chip tone="blue">중요</Chip>
                ) : null}
              </div>
              {c.caseTitle ? (
                <p className="text-muted-foreground mt-0.5 line-clamp-1">{c.caseTitle}</p>
              ) : null}
              {c.decidedAt ? (
                <p className="text-muted-foreground mt-0.5 text-[10px] tabular-nums">{c.decidedAt}</p>
              ) : null}
            </Link>
          ))}
        </GapSection>

        <GapSection
          title="조문 매핑 없는 문제"
          count={gaps.unmappedProblems.length}
          icon={ListChecksIcon}
          empty="모든 문제가 primary_article을 가집니다."
        >
          {gaps.unmappedProblems.map((p) => (
            <Link
              key={p.problemId}
              to={`/admin/problems/${p.problemId}`}
              viewTransition
              className="hover:bg-muted block rounded-lg border px-2.5 py-2 text-xs transition-colors"
            >
              <div className="flex items-center gap-1.5">
                {p.year ? (
                  <span className="font-medium tabular-nums">
                    {p.year}
                    {p.problemNumber ? `·${p.problemNumber}` : ""}
                  </span>
                ) : null}
                <Chip tone="neutral">{p.format}</Chip>
              </div>
              <p className="text-muted-foreground mt-0.5 line-clamp-2">{p.bodySnippet}</p>
            </Link>
          ))}
        </GapSection>
      </div>
    </AdminShell>
  );
}

/* ── 과목 선택 칩 행 ─────────────────────────────────────────────────── */

function SubjectGroup({
  label,
  slugs,
  current,
}: {
  label: string;
  slugs: readonly LawSubjectSlug[];
  current: LawSubjectSlug;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground w-[88px] shrink-0 text-[11px] font-semibold">
        {label}
      </span>
      {slugs.map((slug) => (
        <Link
          key={slug}
          to={`/admin/relations/gaps?law=${slug}`}
          viewTransition
          className={
            slug === current
              ? "bg-primary text-primary-foreground border-primary rounded-md border px-2.5 py-1 text-xs transition-colors"
              : "bg-background hover:bg-muted border-input text-muted-foreground rounded-md border px-2.5 py-1 text-xs transition-colors"
          }
        >
          {LAW_SUBJECTS[slug].name}
        </Link>
      ))}
    </div>
  );
}

/* ── 갭 섹션 카드 ────────────────────────────────────────────────────── */

function GapSection({
  title,
  count,
  icon: Icon,
  empty,
  children,
}: {
  title: string;
  count: number;
  icon: typeof NetworkIcon;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children)
    ? children.filter(Boolean)
    : children
      ? [children]
      : [];
  const isEmpty = items.length === 0;

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="border-border bg-muted/60 flex items-center justify-between border-b px-4 py-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="text-link size-4" />
          {title}
        </h2>
        <span
          className={
            count === 0
              ? "text-emerald-700 dark:text-emerald-300 tabular-nums text-[11px] font-semibold"
              : "text-rose-600 dark:text-rose-400 tabular-nums text-[11px] font-semibold"
          }
        >
          {count}건
        </span>
      </div>
      <div className="max-h-96 overflow-y-auto p-3">
        {isEmpty ? (
          <p className="text-muted-foreground py-6 text-center text-xs">{empty}</p>
        ) : (
          <div className="space-y-1">{children}</div>
        )}
      </div>
    </div>
  );
}
