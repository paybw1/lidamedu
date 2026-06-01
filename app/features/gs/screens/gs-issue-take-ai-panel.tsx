// AI 의견 패널 — gs-issue-take SelfCheckStage 에서 사용.
// 별도 파일로 분리해 메인 화면 파일 길이 제어.
// "AI 단정 X — 보조" 톤 명시.

import { AlertTriangleIcon, SparklesIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { Chip } from "~/features/community/components/community-ui";
import type { QuestionIssue } from "~/features/gs/queries-issues.server";
import type { AiAnalysis } from "~/features/gs/queries-issue-attempts.server";

export function AiAdvisorPanel({
  aiResult,
  aiBusy,
  aiError,
  capBlocked,
  masterIssues,
  onRun,
}: {
  aiResult: AiAnalysis | null;
  aiBusy: boolean;
  aiError: string | null | undefined;
  capBlocked: boolean;
  masterIssues: QuestionIssue[];
  onRun: () => void;
}) {
  if (!aiResult) {
    return (
      <div className="border-amber-300/40 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-2xl border p-3">
        <div className="flex items-start gap-2">
          <SparklesIcon className="text-amber-700 dark:text-amber-300 mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm font-bold">
              AI 의견 받기 (선택)
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              AI 가 모범 논점과 의미 매칭해 "짚은 것 / 빠뜨렸을 가능성 / 자작"
              을 제안합니다. <strong>AI 는 단정하지 않으며</strong>, 최종 판단은
              자기채점으로 직접 하세요.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={onRun}
                disabled={aiBusy}
                className="rounded-full"
              >
                <SparklesIcon className="size-3.5" />
                {aiBusy ? "분석 중…" : "AI 의견 요청"}
              </Button>
              {capBlocked ? (
                <span className="text-rose-600 inline-flex items-center gap-1 text-xs">
                  <AlertTriangleIcon className="size-3" />
                  {aiError ?? "오늘 AI 한도 도달 — 자기채점으로 진행하세요."}
                </span>
              ) : aiError ? (
                <span className="text-rose-600 inline-flex items-center gap-1 text-xs">
                  <AlertTriangleIcon className="size-3" /> {aiError}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 결과 표시 — 짚었을 가능성 / 빠뜨렸을 가능성 / extras.
  const hitLabels = aiResult.hits
    .map((h) => masterIssues.find((m) => m.issueId === h.issueId)?.label)
    .filter((s): s is string => !!s);
  const missedCore = aiResult.missed.filter((m) => m.severity === "core");
  const missedSide = aiResult.missed.filter((m) => m.severity === "side");

  return (
    <div className="border-amber-300/40 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-2xl border p-3">
      <div className="flex items-start gap-2">
        <SparklesIcon className="text-amber-700 dark:text-amber-300 mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-bold">AI 의견</p>
          <p className="text-muted-foreground mt-0.5 text-[11px] italic">
            ※ AI 보조 의견입니다. 최종 결정은 자기채점으로 직접 하세요.
          </p>

          <div className="mt-2 space-y-1.5 text-xs">
            <p>
              <Chip tone="emerald">짚었을 가능성 {hitLabels.length}건</Chip>
              {hitLabels.length > 0 ? (
                <span className="text-muted-foreground ml-1.5">
                  {hitLabels.slice(0, 5).join(" · ")}
                  {hitLabels.length > 5 ? " …" : ""}
                </span>
              ) : null}
            </p>
            {missedCore.length > 0 ? (
              <p className="text-rose-600">
                <Chip tone="coral">핵심 빠뜨렸을 가능성 {missedCore.length}건</Chip>
                <span className="text-muted-foreground ml-1.5">
                  카드에서 "AI: 빠뜨렸을 가능성" 표시 — 확인해보세요.
                </span>
              </p>
            ) : null}
            {missedSide.length > 0 ? (
              <p>
                <Chip tone="outline">부차 빠뜨렸을 가능성 {missedSide.length}건</Chip>
              </p>
            ) : null}
            {aiResult.extras.length > 0 ? (
              <div>
                <Chip tone="neutral">자작/외전 {aiResult.extras.length}건</Chip>
                <ul className="text-muted-foreground ml-1.5 mt-0.5 list-disc pl-5">
                  {aiResult.extras.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  ↑ 모범에 없는 내용이라고 AI 가 봤지만, 실제 정답에 가까울 수도
                  있습니다. 강의노트로 다시 확인.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
