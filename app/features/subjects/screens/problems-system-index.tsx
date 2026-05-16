// 체계도 기반 문제 풀이 진입 — 최상위 노드 카드 그리드.
// 노드 클릭 → 첫 문제로 진입 (?node=<nodeId> 모드).

import {
  ArrowLeftIcon,
  BookOpenIcon,
  ChevronRightIcon,
  TimerIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getSystematicNodeProblemSequence,
  listSystematicTopNodes,
} from "~/features/problems/queries.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/problems-system-index";

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "체계별 풀이 | Lidam Patent Attorney Academy" }];
  return [{ title: `${ld.subject.name} 체계별 풀이 | Lidam Patent Attorney Academy` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) {
    throw data("Unknown subject", { status: 404 });
  }
  const lawCode = subjectParse.data;

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const nodes = await listSystematicTopNodes(client, lawCode);

  // 각 노드의 첫 문제 ID 미리 계산 — 클릭 즉시 풀이 모드로 진입.
  const firstProblemByNode = new Map<string, string>();
  await Promise.all(
    nodes
      .filter((n) => n.problemCount > 0)
      .map(async (n) => {
        const seq = await getSystematicNodeProblemSequence(client, n.nodeId);
        if (seq && seq.problems.length > 0) {
          firstProblemByNode.set(n.nodeId, seq.problems[0].problemId);
        }
      }),
  );

  return {
    subject: LAW_SUBJECTS[lawCode],
    nodes: nodes.map((n) => ({
      ...n,
      firstProblemId: firstProblemByNode.get(n.nodeId) ?? null,
    })),
  };
}

export default function ProblemsSystemIndex({
  loaderData,
}: Route.ComponentProps) {
  const { subject, nodes } = loaderData;
  const totalProblems = nodes.reduce((a, n) => a + n.problemCount, 0);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="mx-auto w-full max-w-screen-xl px-6 py-8 md:px-10 md:py-10 pb-20">
        {/* Back link */}
        <div className="mb-4">
          <Link
            to={`/subjects/${subject.slug}?tab=problems`}
            viewTransition
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <ArrowLeftIcon className="size-3.5" />
            {subject.name} hub
          </Link>
        </div>

        {/* Header */}
        <header className="mb-8">
          <p className="mb-2 font-mono text-[11px] font-bold tracking-[0.10em] uppercase text-primary">
            SYSTEMATIC INDEX · 체계별 풀이
          </p>
          <h1 className="text-[32px] font-extrabold tracking-tight text-foreground leading-tight">
            {subject.name} 체계별 풀이 ·{" "}
            <span className="text-primary tabular-nums">
              {totalProblems.toLocaleString("ko-KR")}
            </span>
            건
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            단원별로 묶은 풀이 트랙. 학습 모드는 즉시 해설, 시험 모드는 일괄 채점.
          </p>
        </header>

        {/* Node grid */}
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
            <BookOpenIcon className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              등록된 체계도 노드가 없습니다.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nodes.map((n) => {
              const disabled = n.problemCount === 0 || !n.firstProblemId;
              return (
                <NodeCard
                  key={n.nodeId}
                  node={n}
                  subjectSlug={subject.slug}
                  disabled={disabled}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NodeCard({
  node,
  subjectSlug,
  disabled,
}: {
  node: {
    nodeId: string;
    path: string;
    displayLabel: string;
    problemCount: number;
    firstProblemId: string | null;
  };
  subjectSlug: string;
  disabled: boolean;
}) {
  const breadcrumbParts = node.path.split(" > ");

  return (
    <div
      className={[
        "group relative flex flex-col rounded-xl border bg-card shadow-sm",
        "p-[18px] min-w-0 transition-[box-shadow,transform]",
        disabled
          ? "opacity-55 cursor-default"
          : "hover:shadow-md hover:-translate-y-0.5 cursor-default",
      ].join(" ")}
      aria-disabled={disabled || undefined}
      title={disabled ? "이 영역에는 등록된 문제가 없습니다" : undefined}
    >
      {/* Breadcrumb path */}
      <div className="mb-2 flex flex-wrap items-center gap-0.5 min-w-0">
        {breadcrumbParts.map((part, i) => (
          <span key={i} className="flex items-center gap-0.5">
            {i > 0 && (
              <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/50" />
            )}
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
              {part}
            </span>
          </span>
        ))}
      </div>

      {/* Node name */}
      <h2 className="mb-3 text-[16px] font-bold leading-[1.4] tracking-[-0.015em] text-foreground">
        {node.displayLabel}
      </h2>

      {/* Count + actions */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="tabular-nums">
          <span
            className={[
              "text-[22px] font-extrabold leading-none tracking-[-0.02em]",
              disabled ? "text-muted-foreground/50" : "text-primary",
            ].join(" ")}
          >
            {node.problemCount}
          </span>
          <span className="ml-1 text-[12px] font-medium text-muted-foreground">
            문제
          </span>
        </span>

        {!disabled && node.firstProblemId ? (
          <div className="flex shrink-0 gap-1.5">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-8 rounded-full px-3.5 text-[12px] font-semibold"
            >
              <Link
                to={`/subjects/${subjectSlug}/problems/${node.firstProblemId}?node=${node.nodeId}&mode=study`}
                viewTransition
              >
                학습
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="h-8 rounded-full px-3.5 text-[12px] font-semibold"
            >
              <Link
                to={`/subjects/${subjectSlug}/problems/${node.firstProblemId}?node=${node.nodeId}&mode=exam`}
                viewTransition
              >
                <TimerIcon className="size-3 shrink-0" />
                시험
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
