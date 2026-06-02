// 공통 — 채점 완료 단계. 결과 요약 + 빠뜨린 쟁점 + 재도전 버튼.
// "빠뜨린 쟁점의 근거 학습" 링크 렌더는 도메인 특화 → renderIssueRefs render prop.
// 채점 후 추가 노출(판례 전문 PDF, 관련 자료) 도 extraSlot 으로 주입.

import { RotateCcwIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Chip } from "~/features/community/components/community-ui";

import { computeIssueStats } from "../lib/scoring";
import type { AiAnalysis, MasterIssue, SelfCheck } from "../lib/types";

import { Stat } from "./stat";

interface DoneStageProps {
  studentDraft: string;
  masterIssues: MasterIssue[];
  selfCheck: SelfCheck | null;
  savedAiAnalysis?: AiAnalysis | null;
  /** 다시 풀기 reset URL. */
  resetActionUrl: string;
  resetIntent?: string;
  hiddenFields: Record<string, string>;
  /** "다시 풀기" 외 추가 버튼(예: "답안 작성 단계로"). */
  primaryAction?: ReactNode;
  /** 빠뜨린 쟁점 카드 안에 들어갈 "근거 학습" 링크 렌더. */
  renderIssueRefs?: (issue: MasterIssue) => ReactNode;
  /** 결과 위/아래에 끼울 추가 슬롯 (예: 판례 전문 공개 카드). */
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
}

export function DoneStage({
  studentDraft,
  masterIssues,
  selfCheck,
  savedAiAnalysis = null,
  resetActionUrl,
  resetIntent = "reset",
  hiddenFields,
  primaryAction,
  renderIssueRefs,
  topSlot,
  bottomSlot,
}: DoneStageProps) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const revalidator = useRevalidator();
  const stats = computeIssueStats(masterIssues, selfCheck);
  const sc: SelfCheck = selfCheck ?? { hits: [], missed: [], wrong: [] };
  const missedSet = new Set(sc.missed);

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const reset = () => {
    if (!confirm("이번 결과를 초기화하고 다시 풀이하시겠습니까?")) return;
    const fd = new FormData();
    fd.set("intent", resetIntent);
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    fetcher.submit(fd, { method: "post", action: resetActionUrl });
  };

  return (
    <section className="space-y-4">
      {topSlot}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="짚은 쟁점"
          value={stats.hits}
          total={stats.total}
          tone="emerald"
        />
        <Stat
          label="빠뜨린 쟁점"
          value={stats.missed}
          total={stats.total}
          tone="coral"
        />
        <Stat
          label="핵심 누락"
          value={stats.coreMissed}
          total={stats.coreTotal}
          tone="rose"
        />
      </div>

      {savedAiAnalysis ? (
        <div className="border-amber-300/40 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-2xl border p-3">
          <p className="text-foreground text-sm font-bold">AI 의견 (저장됨)</p>
          <p className="text-muted-foreground mt-0.5 text-[11px] italic">
            ※ 보조 의견. 자기채점이 최종.
          </p>
          <ul className="text-muted-foreground mt-2 list-disc pl-5 text-xs leading-relaxed">
            <li>AI 가 짚었다고 본: {savedAiAnalysis.hits.length}건</li>
            <li>
              AI 가 빠뜨렸다고 본:{" "}
              {
                savedAiAnalysis.missed.filter((m) => m.severity === "core")
                  .length
              }
              건 핵심 +{" "}
              {
                savedAiAnalysis.missed.filter((m) => m.severity === "side")
                  .length
              }
              건 부차
            </li>
            <li>AI 가 자작/외전으로 본: {savedAiAnalysis.extras.length}건</li>
          </ul>
        </div>
      ) : null}

      <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          내가 적은 쟁점
        </p>
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {studentDraft || "(빈 답안)"}
        </p>
      </div>

      <div>
        <p className="mb-2 font-bold tracking-tight">
          빠뜨린 쟁점 ({stats.missed}건)
        </p>
        {stats.missed === 0 ? (
          <p className="text-muted-foreground text-sm">
            🎉 모범 쟁점을 모두 짚었습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {masterIssues
              .filter((i) => missedSet.has(i.issueId))
              .map((iss) => (
                <li
                  key={iss.issueId}
                  className="border-rose-300/40 bg-rose-50/30 dark:border-rose-700/40 dark:bg-rose-950/20 rounded-xl border p-3"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip
                      tone={iss.importance === "core" ? "coral" : "outline"}
                    >
                      {iss.importance === "core" ? "핵심" : "부차"}
                    </Chip>
                    <p className="text-foreground text-sm font-bold">
                      {iss.label}
                    </p>
                    {iss.refHint ? (
                      <Chip tone="outline">{iss.refHint}</Chip>
                    ) : null}
                  </div>
                  {iss.descriptionMd ? (
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                      {iss.descriptionMd}
                    </p>
                  ) : null}
                  {renderIssueRefs ? renderIssueRefs(iss) : null}
                </li>
              ))}
          </ul>
        )}
      </div>

      {bottomSlot}

      <div className="flex flex-wrap gap-2">
        {primaryAction}
        <Button
          type="button"
          variant="outline"
          onClick={reset}
          className="rounded-full"
          disabled={fetcher.state !== "idle"}
        >
          <RotateCcwIcon className="size-4" /> 다시 풀기
        </Button>
      </div>
    </section>
  );
}
