// 공통 — ③④ 결과 단계. 결과 요약 + 모범 강약 비교 + ⑤ GS 답안작성 진입.

import { ArrowRightIcon, RotateCcwIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Chip } from "~/features/community/components/community-ui";

import { recommendedEmphasis, scoreConclusionAttempt } from "../lib/conclusion-scoring";
import type {
  ConclusionAiAnalysis,
  ConclusionSelfCheck,
  ConclusionsMap,
  EmphasisMap,
  IssueEmphasis,
  MasterIssueWithConclusion,
} from "../lib/types";

import { Stat } from "./stat";

interface Props {
  masterIssues: MasterIssueWithConclusion[];
  studentConclusions: ConclusionsMap | null;
  studentEmphasis: EmphasisMap | null;
  studentOutline: string;
  selfCheck: ConclusionSelfCheck | null;
  savedAiAnalysis?: ConclusionAiAnalysis | null;
  resetActionUrl: string;
  resetIntent?: string;
  hiddenFields: Record<string, string>;
  /** ⑤ GS 답안작성 진입 — linked_gs_round_id 있을 때만. */
  gsTakeHref?: string | null;
  topSlot?: ReactNode;
  bottomSlot?: ReactNode;
}

const EMPHASIS_LABEL: Record<IssueEmphasis, string> = {
  strong: "강",
  medium: "중",
  weak: "약",
};

export function ConclusionDoneStage({
  masterIssues,
  studentConclusions,
  studentEmphasis,
  studentOutline,
  selfCheck,
  savedAiAnalysis = null,
  resetActionUrl,
  resetIntent = "reset",
  hiddenFields,
  gsTakeHref = null,
  topSlot,
  bottomSlot,
}: Props) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const revalidator = useRevalidator();
  const scoring = scoreConclusionAttempt(
    masterIssues,
    studentConclusions,
    studentEmphasis,
  );

  // self_check override 적용 (학생이 토글로 조정했으면 그걸 우선).
  const cm = selfCheck?.conclusionMatches ?? scoring.conclusionMatches;
  const em = selfCheck?.emphasisMatches ?? scoring.emphasisMatches;
  const matchCount = Object.values(cm).filter((v) => v === "match").length;
  const wrongCount = Object.values(cm).filter((v) => v === "wrong").length;
  const coreUnderCount = masterIssues.filter(
    (i) => i.importance === "core" && em[i.issueId] === "under",
  ).length;
  const sideOverCount = masterIssues.filter(
    (i) => i.importance === "side" && em[i.issueId] === "over",
  ).length;

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    )
      revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);

  const reset = () => {
    if (!confirm("이번 결과를 초기화하고 다시 풀이하시겠습니까?")) return;
    const fd = new FormData();
    fd.set("intent", resetIntent);
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    fetcher.submit(fd, { method: "post", action: resetActionUrl });
  };

  const overall = savedAiAnalysis?.notes.find((n) => n.kind === "overall");

  return (
    <section className="space-y-4">
      {topSlot}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="결론 일치"
          value={matchCount}
          total={masterIssues.length}
          tone="emerald"
        />
        <Stat
          label="핵심 강조 부족"
          value={coreUnderCount}
          total={masterIssues.filter((i) => i.importance === "core").length}
          tone="rose"
        />
        <Stat
          label="부차 과강조"
          value={sideOverCount}
          total={masterIssues.filter((i) => i.importance === "side").length}
          tone="coral"
        />
      </div>

      {overall ? (
        <div className="border-amber-300/40 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-2xl border p-3">
          <p className="text-foreground text-sm font-bold">AI 종합 코칭</p>
          <p className="text-muted-foreground mt-0.5 text-[11px] italic">
            ※ 보조 의견이며, 자기채점 결과가 최종입니다.
          </p>
          <p className="text-foreground mt-1 text-xs leading-relaxed">
            {overall.note}
          </p>
        </div>
      ) : null}

      {/* 쟁점별 비교 카드 — 결론 + 강약 + AI 쟁점별 코칭 메모. */}
      <ul className="space-y-2">
        {masterIssues.map((iss) => {
          const c = studentConclusions?.[iss.issueId];
          const e = studentEmphasis?.[iss.issueId];
          const rec = recommendedEmphasis(iss);
          const isCoreUnder =
            iss.importance === "core" && em[iss.issueId] === "under";
          // AI 쟁점별 코칭 — emphasis · conclusion 두 종류 노출.
          const aiNotesForIssue = (savedAiAnalysis?.notes ?? []).filter(
            (n) =>
              n.issueId === iss.issueId &&
              (n.kind === "emphasis" || n.kind === "conclusion"),
          );
          return (
            <li
              key={iss.issueId}
              className={
                isCoreUnder
                  ? "border-rose-300/40 bg-rose-50/30 dark:border-rose-700/40 dark:bg-rose-950/20 rounded-xl border p-3"
                  : "border-border bg-card rounded-xl border p-3"
              }
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip tone={iss.importance === "core" ? "primary" : "outline"}>
                  {iss.importance === "core" ? "핵심" : "부차"}
                </Chip>
                <p className="text-foreground text-sm font-bold">
                  {iss.label}
                </p>
                {isCoreUnder ? (
                  <Chip tone="coral">핵심인데 약함 — 더 강조하세요</Chip>
                ) : null}
              </div>
              <div className="text-muted-foreground mt-1 grid gap-0.5 text-xs sm:grid-cols-2">
                <div>
                  결론 — 내: <strong className="text-foreground">{c?.direction || "(미작성)"}</strong>{" "}
                  / 모범:{" "}
                  <strong className="text-foreground">
                    {iss.modelConclusionDirection || "(미설정)"}
                  </strong>
                </div>
                <div>
                  강약 — 내:{" "}
                  <strong className="text-foreground">
                    {e ? EMPHASIS_LABEL[e] : "(미선택)"}
                  </strong>{" "}
                  / 권장:{" "}
                  <strong className="text-foreground">{EMPHASIS_LABEL[rec]}</strong>
                </div>
              </div>
              {aiNotesForIssue.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {aiNotesForIssue.map((n, i) => (
                    <li
                      key={i}
                      className="text-muted-foreground border-amber-300/40 bg-amber-50/30 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-md border px-2 py-1 text-[11px] italic leading-relaxed"
                    >
                      AI {n.kind === "emphasis" ? "강약" : "결론"} 코칭: {n.note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          내가 짠 답안 목차
        </p>
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {studentOutline || "(빈 답안)"}
        </p>
      </div>

      {bottomSlot}

      <div className="flex flex-wrap gap-2">
        {gsTakeHref ? (
          <Button asChild className="rounded-full">
            <a href={gsTakeHref}>
              답안 작성으로 <ArrowRightIcon className="size-4" />
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={reset}
          disabled={fetcher.state !== "idle"}
          className="rounded-full"
        >
          <RotateCcwIcon className="size-4" /> 다시 풀기
        </Button>
      </div>
    </section>
  );
}
