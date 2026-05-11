// 연속 학습 워커 진행 상황 헤더 — case-viewer / problem-viewer 공용.
// URL ?flow=... & ?step=N 이 있으면 표시. 이전/다음 버튼으로 큐 순회.

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  parseFlow,
  stepHref,
  type FlowStepType,
} from "~/features/study/lib/learning-flow";

const TYPE_KO: Record<FlowStepType, string> = {
  article: "조문",
  case: "판례",
  problem: "문제",
};

export function FlowNav({
  subjectSlug,
  currentType,
  currentId,
}: {
  subjectSlug: string;
  currentType: FlowStepType;
  currentId: string;
}) {
  const [searchParams] = useSearchParams();
  const flowRaw = searchParams.get("flow");
  if (!flowRaw) return null;
  const steps = parseFlow(flowRaw);
  if (steps.length === 0) return null;

  // step query param 우선, fallback 으로 매칭.
  const stepParam = Number(searchParams.get("step") ?? "0");
  let idx = stepParam > 0 ? stepParam - 1 : -1;
  if (idx < 0 || idx >= steps.length || steps[idx].type !== currentType || steps[idx].id !== currentId) {
    idx = steps.findIndex((s) => s.type === currentType && s.id === currentId);
  }
  if (idx < 0) return null;

  const total = steps.length;
  const prev = idx > 0 ? steps[idx - 1] : null;
  const next = idx < total - 1 ? steps[idx + 1] : null;

  const prevHref = prev
    ? stepHref(subjectSlug, prev, {
        flow: flowRaw,
        step: String(idx),
      })
    : null;
  const nextHref = next
    ? stepHref(subjectSlug, next, {
        flow: flowRaw,
        step: String(idx + 2),
      })
    : null;
  // 흐름 종료 후 자유 학습으로 돌아갈 수 있게 — 현재 페이지에서 flow 제거.
  const exitParams = new URLSearchParams(searchParams);
  exitParams.delete("flow");
  exitParams.delete("step");
  const exitQuery = exitParams.toString();
  const exitHref =
    currentType === "article"
      ? `/subjects/${subjectSlug}/articles/${currentId}${exitQuery ? `?${exitQuery}` : ""}`
      : currentType === "case"
        ? `/subjects/${subjectSlug}/cases/${currentId}${exitQuery ? `?${exitQuery}` : ""}`
        : `/subjects/${subjectSlug}/problems/${currentId}${exitQuery ? `?${exitQuery}` : ""}`;

  return (
    <div className="bg-primary/5 border-primary/30 mb-3 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
      <Badge variant="default" className="gap-1">
        <WorkflowIcon className="size-3" /> 흐름 학습
      </Badge>
      <span className="text-xs tabular-nums">
        {idx + 1} / {total} · 현재 {TYPE_KO[currentType]}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          asChild={prevHref !== null}
          size="sm"
          variant="outline"
          className="h-7"
          disabled={prevHref === null}
        >
          {prevHref ? (
            <Link to={prevHref} viewTransition>
              <ChevronLeftIcon className="size-3.5" />{" "}
              {prev ? TYPE_KO[prev.type] : ""}
            </Link>
          ) : (
            <span>
              <ChevronLeftIcon className="size-3.5" />
            </span>
          )}
        </Button>
        <Button
          asChild={nextHref !== null}
          size="sm"
          className="h-7"
          disabled={nextHref === null}
        >
          {nextHref ? (
            <Link to={nextHref} viewTransition>
              {next ? TYPE_KO[next.type] : ""}{" "}
              <ChevronRightIcon className="size-3.5" />
            </Link>
          ) : (
            <span>
              종료 <ChevronRightIcon className="size-3.5" />
            </span>
          )}
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-7">
          <Link to={exitHref}>
            <XIcon className="size-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
