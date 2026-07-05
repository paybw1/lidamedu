// 공통 — ③ 결론 + ④ 강약 자기채점.
// 모범 결론·권장 강약 reveal → 자동 채점 결과를 학생이 토글로 조정 가능.
// AI 강약 코칭 패널(단정 X, 보조).

import { CheckIcon, MinusIcon, SaveIcon, SparklesIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { Chip } from "~/features/community/components/community-ui";

import { recommendedEmphasis, scoreConclusionAttempt } from "../lib/conclusion-scoring";
import type {
  ConclusionAiAnalysis,
  ConclusionMatch,
  ConclusionsMap,
  EmphasisMap,
  EmphasisMatch,
  IssueEmphasis,
  MasterIssueWithConclusion,
} from "../lib/types";

interface Props {
  studentConclusions: ConclusionsMap | null;
  studentEmphasis: EmphasisMap | null;
  studentOutline: string;
  masterIssues: MasterIssueWithConclusion[];
  previousSelfCheck?: {
    conclusionMatches: Record<string, ConclusionMatch>;
    emphasisMatches: Record<string, EmphasisMatch>;
  } | null;
  savedAiAnalysis?: ConclusionAiAnalysis | null;
  selfCheckActionUrl: string;
  selfCheckIntent?: string;
  aiActionUrl?: string;
  hiddenFields: Record<string, string>;
  aiConfirmMessage?: string;
}

const EMPHASIS_LABEL: Record<IssueEmphasis, string> = {
  strong: "강",
  medium: "중",
  weak: "약",
};

const CONCLUSION_OPTIONS: ConclusionMatch[] = ["match", "partial", "wrong", "skip"];
const CONCLUSION_LABEL: Record<ConclusionMatch, string> = {
  match: "일치",
  partial: "부분",
  wrong: "어긋남",
  skip: "제외",
};
const EMPHASIS_MATCH_LABEL: Record<EmphasisMatch, string> = {
  aligned: "OK",
  under: "약함",
  over: "과함",
};

export function ConclusionSelfCheckStage({
  studentConclusions,
  studentEmphasis,
  studentOutline,
  masterIssues,
  previousSelfCheck = null,
  savedAiAnalysis = null,
  selfCheckActionUrl,
  selfCheckIntent = "self_check",
  aiActionUrl,
  hiddenFields,
  aiConfirmMessage,
}: Props) {
  // 자동 채점 — 학생 입력 ↔ 모범. 학생이 토글로 override.
  const auto = useMemo(
    () =>
      scoreConclusionAttempt(masterIssues, studentConclusions, studentEmphasis),
    [masterIssues, studentConclusions, studentEmphasis],
  );

  const [conclusionMatches, setConclusionMatches] = useState<
    Record<string, ConclusionMatch>
  >(previousSelfCheck?.conclusionMatches ?? auto.conclusionMatches);
  const [emphasisMatches, setEmphasisMatches] = useState<
    Record<string, EmphasisMatch>
  >(previousSelfCheck?.emphasisMatches ?? auto.emphasisMatches);

  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const aiFetcher = useFetcher<{
    ok?: true;
    error?: string;
    capBlocked?: boolean;
    result?: ConclusionAiAnalysis;
  }>();
  const revalidator = useRevalidator();

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    )
      revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);

  const aiResult: ConclusionAiAnalysis | null =
    (aiFetcher.data && "result" in aiFetcher.data && aiFetcher.data.result) ||
    savedAiAnalysis ||
    null;
  const aiBusy = aiFetcher.state !== "idle";
  const aiError: string | null =
    aiFetcher.data && "error" in aiFetcher.data
      ? (aiFetcher.data.error ?? null)
      : null;
  const aiCapBlocked =
    aiFetcher.data && "capBlocked" in aiFetcher.data
      ? !!aiFetcher.data.capBlocked
      : false;

  const runAi = () => {
    if (!aiActionUrl) return;
    if (
      !confirm(
        aiConfirmMessage ??
          "AI 강약 코칭을 받습니다. AI 사용 한도가 적용되며, 자기채점 결과는 그대로 유지됩니다. 계속하시겠습니까?",
      )
    )
      return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    aiFetcher.submit(fd, { method: "post", action: aiActionUrl });
  };

  const save = () => {
    const fd = new FormData();
    fd.set("intent", selfCheckIntent);
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    fd.set("conclusionMatches", JSON.stringify(conclusionMatches));
    fd.set("emphasisMatches", JSON.stringify(emphasisMatches));
    fetcher.submit(fd, { method: "post", action: selfCheckActionUrl });
  };

  return (
    <section className="space-y-4">
      {/* 내가 작성한 답안 목차 */}
      <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          내가 짠 답안 목차
        </p>
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {studentOutline || "(빈 답안)"}
        </p>
      </div>

      {aiActionUrl ? (
        <CoachingPanel
          aiResult={aiResult}
          aiBusy={aiBusy}
          aiError={aiError}
          capBlocked={aiCapBlocked}
          onRun={runAi}
        />
      ) : null}

      {/* 쟁점별 결론·강약 비교 */}
      <ul className="space-y-2">
        {masterIssues.map((iss) => {
          const studentConc = studentConclusions?.[iss.issueId];
          const studentEmph = studentEmphasis?.[iss.issueId];
          const recEmph = recommendedEmphasis(iss);
          const cm = conclusionMatches[iss.issueId] ?? "skip";
          const em = emphasisMatches[iss.issueId];
          const aiNote = aiResult?.notes.find(
            (n) => n.issueId === iss.issueId && n.kind === "emphasis",
          );
          return (
            <li
              key={iss.issueId}
              className="border-border bg-card space-y-2 rounded-xl border p-3"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip tone={iss.importance === "core" ? "primary" : "outline"}>
                  {iss.importance === "core" ? "핵심" : "부차"}
                </Chip>
                <p className="text-foreground text-sm font-bold">
                  {iss.label}
                </p>
                {iss.weight !== null ? (
                  <Chip tone="outline">weight {iss.weight}</Chip>
                ) : null}
              </div>

              {/* ③ 결론 비교 */}
              <div className="grid gap-1 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">내 결론: </span>
                  <span className="text-foreground font-bold">
                    {studentConc?.direction || "(미작성)"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">모범: </span>
                  <span className="text-foreground font-bold">
                    {iss.modelConclusionDirection || "(미설정)"}
                  </span>
                </div>
              </div>
              {iss.modelConclusionMd ? (
                <p className="text-muted-foreground text-[11px] italic leading-relaxed">
                  근거: {iss.modelConclusionMd}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground text-[10px] uppercase">
                  결론 채점:
                </span>
                {CONCLUSION_OPTIONS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      setConclusionMatches({ ...conclusionMatches, [iss.issueId]: v })
                    }
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-bold transition-colors",
                      cm === v
                        ? conclusionToneClass(v)
                        : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {CONCLUSION_LABEL[v]}
                  </button>
                ))}
              </div>

              {/* ④ 강약 비교 */}
              <div className="grid gap-1 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">내 강약: </span>
                  <span className="text-foreground font-bold">
                    {studentEmph ? EMPHASIS_LABEL[studentEmph] : "(미선택)"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">권장: </span>
                  <span className="text-foreground font-bold">
                    {EMPHASIS_LABEL[recEmph]}
                  </span>
                </div>
              </div>
              {em ? (
                <div className="flex items-center gap-1">
                  <Chip tone={emphasisTone(em)}>
                    강약: {EMPHASIS_MATCH_LABEL[em]}
                  </Chip>
                </div>
              ) : null}
              {aiNote ? (
                <p className="text-muted-foreground text-[11px] italic leading-relaxed">
                  AI 코칭: {aiNote.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        onClick={save}
        disabled={fetcher.state !== "idle"}
        className="rounded-full"
      >
        <SaveIcon className="size-4" /> 자기채점 저장
      </Button>
    </section>
  );
}

function conclusionToneClass(m: ConclusionMatch): string {
  if (m === "match") return "border-emerald-500 bg-emerald-500 text-white";
  if (m === "partial") return "border-amber-500 bg-amber-500 text-white";
  if (m === "wrong") return "border-rose-500 bg-rose-500 text-white";
  return "border-muted-foreground bg-muted text-muted-foreground";
}
function emphasisTone(
  m: EmphasisMatch,
): "emerald" | "coral" | "primary" | "outline" {
  if (m === "aligned") return "emerald";
  if (m === "under") return "coral";
  return "outline";
}

function CoachingPanel({
  aiResult,
  aiBusy,
  aiError,
  capBlocked,
  onRun,
}: {
  aiResult: ConclusionAiAnalysis | null;
  aiBusy: boolean;
  aiError: string | null;
  capBlocked: boolean;
  onRun: () => void;
}): ReactNode {
  if (capBlocked) {
    return (
      <div className="border-amber-300/40 bg-amber-50/30 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-2xl border p-3">
        <p className="text-foreground text-sm font-bold">
          오늘의 AI 보조 한도에 도달했습니다
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          자기채점은 그대로 진행할 수 있습니다.
        </p>
      </div>
    );
  }
  if (!aiResult) {
    return (
      <div className="border-primary/20 bg-primary/[0.03] rounded-2xl border p-3">
        <div className="flex items-start gap-2">
          <SparklesIcon className="text-link mt-0.5 size-4 shrink-0" />
          <div className="flex-1 text-xs leading-relaxed">
            <p className="text-foreground font-bold">AI 강약 코칭 (선택)</p>
            <p className="text-muted-foreground mt-0.5">
              AI가 내 강약과 권장 강약을 대조해 코칭 메모를 남깁니다.
              <em> AI는 단정하지 않으며, 최종 판단은 직접 해 주세요</em>.
            </p>
            {aiError ? (
              <p className="text-rose-600 dark:text-rose-300 mt-1">
                {aiError}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRun}
            disabled={aiBusy}
            className="rounded-full"
          >
            {aiBusy ? "분석 중…" : "AI 코칭 받기"}
          </Button>
        </div>
      </div>
    );
  }
  const overall = aiResult.notes.find((n) => n.kind === "overall");
  return (
    <div className="border-amber-300/40 bg-amber-50/30 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-2xl border p-3">
      <p className="text-foreground text-sm font-bold">AI 코칭</p>
      <p className="text-muted-foreground mt-0.5 text-[11px] italic">
        ※ 보조 의견이며, 자기채점 결과가 최종입니다.
      </p>
      {overall ? (
        <p className="text-foreground mt-1 text-xs leading-relaxed">
          {overall.note}
        </p>
      ) : null}
      <p className="text-muted-foreground mt-1 text-[11px]">
        쟁점별 메모는 아래 각 행에 표시됩니다.
      </p>
    </div>
  );
}
