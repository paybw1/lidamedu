// 체계도 기반 문제 풀이 진입 — 최상위 노드 카드 그리드.
// 노드 클릭 → 첫 문제로 진입 (?node=<nodeId> 모드).

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FolderTreeIcon,
  TimerIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
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
  if (!ld) return [{ title: "체계별 풀이 | Lidam Edu" }];
  return [{ title: `${ld.subject.name} 체계별 풀이 | Lidam Edu` }];
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
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/subjects/${subject.slug}?tab=problems`}
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {subject.name} 문제 색인
      </Link>

      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          체계도 기반
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {subject.name} 체계별 풀이
        </h1>
        <p className="text-muted-foreground text-sm">
          체계도 영역을 선택하면 그 안의 문제들을 순서대로 풀 수 있습니다 ·{" "}
          <span className="text-foreground font-bold">{totalProblems}</span>건
        </p>
      </header>

      {nodes.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          등록된 체계도 노드가 없습니다.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nodes.map((n) => {
            const disabled = n.problemCount === 0 || !n.firstProblemId;
            return disabled ? (
              <Card
                key={n.nodeId}
                className="opacity-50"
                aria-disabled="true"
                title="이 영역에는 등록된 문제가 없습니다"
              >
                <CardHeader>
                  <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                    {n.path}
                  </p>
                </CardHeader>
                <CardContent>
                  <h2 className="font-semibold">{n.displayLabel}</h2>
                  <p className="text-muted-foreground mt-2 text-xs">
                    문제{" "}
                    <span className="text-foreground font-bold">
                      {n.problemCount}
                    </span>
                    건
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card
                key={n.nodeId}
                className="hover:border-primary h-full transition-colors"
              >
                <CardHeader>
                  <p className="text-muted-foreground inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide uppercase">
                    <FolderTreeIcon className="size-3" /> {n.path}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <h2 className="font-semibold">{n.displayLabel}</h2>
                    <p className="text-muted-foreground mt-2 text-xs">
                      문제{" "}
                      <span className="text-foreground font-bold">
                        {n.problemCount}
                      </span>
                      건
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" className="h-8" variant="default">
                      <Link
                        to={`/subjects/${subject.slug}/problems/${n.firstProblemId}?node=${n.nodeId}&mode=study`}
                        viewTransition
                      >
                        학습 모드 <ArrowRightIcon className="size-3" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      className="h-8"
                      variant="outline"
                    >
                      <Link
                        to={`/subjects/${subject.slug}/problems/${n.firstProblemId}?node=${n.nodeId}&mode=exam`}
                        viewTransition
                      >
                        <TimerIcon className="size-3" /> 시험 모드
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
