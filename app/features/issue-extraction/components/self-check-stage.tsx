// 공통 — 자기채점 단계. 모범 쟁점 reveal + hit/miss 체크 + AI 보조 패널.
// AI 분석은 별도 endpoint 호출(action URL props). cap blocked 시 self-check 만 가능.

import { CheckIcon, SaveIcon, SparklesIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import { Chip } from "~/features/community/components/community-ui";

import type { AiAnalysis, MasterIssue } from "../lib/types";

interface SelfCheckStageProps {
  /** 학생이 제출한 작성문(read-only 표시). */
  studentDraft: string;
  /** 모범 쟁점 목록 — phase=submitted/self-checked 단계에서만 노출. */
  masterIssues: MasterIssue[];
  /** 이전 자기채점 결과 (재진입 시 기본 선택). null 이면 빈 상태. */
  previousSelfCheck?: { hits: string[]; missed: string[]; wrong: string[] } | null;
  /** AI 분석 결과(저장돼 있으면 표시). */
  savedAiAnalysis?: AiAnalysis | null;
  /** 자기채점 저장 URL. */
  selfCheckActionUrl: string;
  selfCheckIntent?: string;
  /** AI 분석 호출 URL. 없으면 AI 버튼 자체를 숨김. */
  aiActionUrl?: string;
  hiddenFields: Record<string, string>;
  /** AI 호출 confirm 메시지(도메인 컨텍스트). */
  aiConfirmMessage?: string;
}

export function SelfCheckStage({
  studentDraft,
  masterIssues,
  previousSelfCheck = null,
  savedAiAnalysis = null,
  selfCheckActionUrl,
  selfCheckIntent = "self_check",
  aiActionUrl,
  hiddenFields,
  aiConfirmMessage,
}: SelfCheckStageProps) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const aiFetcher = useFetcher<{
    ok?: true;
    error?: string;
    capBlocked?: boolean;
    result?: AiAnalysis;
  }>();
  const revalidator = useRevalidator();

  const [hits, setHits] = useState<Set<string>>(
    new Set(previousSelfCheck?.hits ?? []),
  );
  const [missed, setMissed] = useState<Set<string>>(
    new Set(previousSelfCheck?.missed ?? []),
  );
  const [wrong, setWrong] = useState(
    (previousSelfCheck?.wrong ?? []).join("\n"),
  );

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

  // AI 분석 결과 — 방금 호출 우선, 없으면 저장된 것.
  const aiResult: AiAnalysis | null =
    (aiFetcher.data && "result" in aiFetcher.data && aiFetcher.data.result) ||
    savedAiAnalysis ||
    null;
  const aiMissedIds = new Set(aiResult?.missed.map((m) => m.issueId) ?? []);
  const aiBusy = aiFetcher.state !== "idle";
  const aiError: string | null =
    aiFetcher.data && "error" in aiFetcher.data
      ? (aiFetcher.data.error ?? null)
      : null;
  const aiCapBlocked =
    aiFetcher.data && "capBlocked" in aiFetcher.data
      ? aiFetcher.data.capBlocked
      : false;

  const runAi = () => {
    if (!aiActionUrl) return;
    if (
      !confirm(
        aiConfirmMessage ??
          "AI 의견을 받습니다. AI 사용 한도가 적용되며, 자기채점 결과는 그대로 유지됩니다. 계속하시겠습니까?",
      )
    )
      return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    aiFetcher.submit(fd, { method: "post", action: aiActionUrl });
  };

  const markHit = (id: string) => {
    const h = new Set(hits);
    const m = new Set(missed);
    if (h.has(id)) h.delete(id);
    else {
      h.add(id);
      m.delete(id);
    }
    setHits(h);
    setMissed(m);
  };
  const markMissed = (id: string) => {
    const h = new Set(hits);
    const m = new Set(missed);
    if (m.has(id)) m.delete(id);
    else {
      m.add(id);
      h.delete(id);
    }
    setHits(h);
    setMissed(m);
  };

  const submitSelfCheck = () => {
    const fd = new FormData();
    fd.set("intent", selfCheckIntent);
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    fd.set("hits", JSON.stringify([...hits]));
    fd.set("missed", JSON.stringify([...missed]));
    fd.set(
      "wrong",
      JSON.stringify(
        wrong
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      ),
    );
    fetcher.submit(fd, { method: "post", action: selfCheckActionUrl });
  };

  const total = masterIssues.length;
  const decided = hits.size + missed.size;

  return (
    <section className="space-y-4">
      {/* 내 작성 (read-only) */}
      <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          내가 적은 쟁점
        </p>
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {studentDraft || "(빈 답안)"}
        </p>
      </div>

      {/* AI 의견 패널 — 보조 (단정하지 않음). */}
      {aiActionUrl ? (
        <AiAdvisorPanel
          aiResult={aiResult}
          aiBusy={aiBusy}
          aiError={aiError}
          capBlocked={!!aiCapBlocked}
          masterIssues={masterIssues}
          onRun={runAi}
        />
      ) : null}

      {/* 모범 쟁점 reveal + 짚음/빠뜨림 체크 */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="font-bold tracking-tight">
            모범 쟁점 — 짚었는지 / 빠뜨렸는지 체크
          </p>
          <span className="text-muted-foreground text-xs tabular-nums">
            결정 {decided}/{total}
          </span>
        </div>
        <ul className="space-y-2">
          {masterIssues.map((iss) => {
            const aiHit = aiResult?.hits.find((h) => h.issueId === iss.issueId);
            const aiMissed = aiMissedIds.has(iss.issueId);
            return (
              <li
                key={iss.issueId}
                className={cn(
                  "border-border bg-card rounded-xl border p-3",
                  hits.has(iss.issueId)
                    ? "border-emerald-400/60 bg-emerald-50/30 dark:bg-emerald-950/20"
                    : missed.has(iss.issueId)
                      ? "border-rose-400/60 bg-rose-50/30 dark:bg-rose-950/20"
                      : "",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip
                        tone={iss.importance === "core" ? "primary" : "outline"}
                      >
                        {iss.importance === "core" ? "핵심" : "부차"}
                      </Chip>
                      <p className="text-foreground text-sm font-bold">
                        {iss.label}
                      </p>
                      {iss.refHint ? (
                        <Chip tone="outline">{iss.refHint}</Chip>
                      ) : null}
                      {aiHit ? (
                        <Chip tone="emerald">AI: 짚었을 가능성</Chip>
                      ) : aiMissed ? (
                        <Chip tone="coral">AI: 빠뜨렸을 가능성</Chip>
                      ) : null}
                    </div>
                    {iss.descriptionMd ? (
                      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                        {iss.descriptionMd}
                      </p>
                    ) : null}
                    {aiHit?.evidence ? (
                      <p className="text-muted-foreground mt-1 text-[11px] italic">
                        AI 근거: "{aiHit.evidence}" — 최종 판단은 직접 내려
                        주세요.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      size="sm"
                      variant={hits.has(iss.issueId) ? "default" : "outline"}
                      onClick={() => markHit(iss.issueId)}
                      className="h-7 rounded-full"
                    >
                      <CheckIcon className="size-3" /> 짚음
                    </Button>
                    <Button
                      size="sm"
                      variant={missed.has(iss.issueId) ? "default" : "outline"}
                      onClick={() => markMissed(iss.issueId)}
                      className={cn(
                        "h-7 rounded-full",
                        missed.has(iss.issueId)
                          ? "bg-rose-600 hover:bg-rose-700"
                          : "text-muted-foreground",
                      )}
                    >
                      <XIcon className="size-3" /> 빠뜨림
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 자작 잘못 쟁점 */}
      <div>
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          잘못 넣은 쟁점 (자유 입력 — 모범에 없는 쟁점)
        </p>
        <Textarea
          value={wrong}
          onChange={(e) => setWrong(e.target.value)}
          className="min-h-[80px] text-xs"
          placeholder="모범에 없는 쟁점을 적었다면 한 줄에 하나씩"
        />
      </div>

      <Button
        type="button"
        onClick={submitSelfCheck}
        className="rounded-full"
        disabled={fetcher.state !== "idle"}
      >
        <SaveIcon className="size-4" /> 자기채점 저장
      </Button>
    </section>
  );
}

/* AI 보조 패널 — 내장. cap blocked / busy / error / idle / result 5상태. */
function AiAdvisorPanel({
  aiResult,
  aiBusy,
  aiError,
  capBlocked,
  masterIssues,
  onRun,
}: {
  aiResult: AiAnalysis | null;
  aiBusy: boolean;
  aiError: string | null;
  capBlocked: boolean;
  masterIssues: MasterIssue[];
  onRun: () => void;
}) {
  if (capBlocked) {
    return (
      <div className="border-amber-300/40 bg-amber-50/30 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-2xl border p-3">
        <p className="text-foreground text-sm font-bold">
          오늘의 AI 보조 한도에 도달했습니다
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          자기채점은 그대로 진행할 수 있습니다. 강사 직접 채점도 받을 수
          있습니다.
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
            <p className="text-foreground font-bold">AI 의견 받기 (선택)</p>
            <p className="text-muted-foreground mt-0.5">
              AI가 모범 쟁점과 내 작성을 비교해 "짚음/빠뜨림" 가능성을
              알려줍니다. <em>AI는 단정하지 않으며, 최종 판단은 직접 해
              주세요</em>.
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
            {aiBusy ? "분석 중…" : "AI 의견 받기"}
          </Button>
        </div>
      </div>
    );
  }
  // 결과가 있으면 요약. 상세는 모범 쟁점 리스트에 chip 형태로 이미 표시됨.
  const coreMissed = aiResult.missed.filter((m) => m.severity === "core").length;
  const sideMissed = aiResult.missed.filter((m) => m.severity === "side").length;
  return (
    <div className="border-amber-300/40 bg-amber-50/30 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-2xl border p-3">
      <p className="text-foreground text-sm font-bold">AI 의견</p>
      <p className="text-muted-foreground mt-0.5 text-[11px] italic">
        ※ 보조 의견이며, 자기채점 결과가 최종입니다.
      </p>
      <ul className="text-muted-foreground mt-2 list-disc pl-5 text-xs leading-relaxed">
        <li>
          AI가 짚었다고 본 쟁점: {aiResult.hits.length}건 /{" "}
          {masterIssues.length}건
        </li>
        <li>
          AI가 빠뜨렸다고 본 쟁점: 핵심 {coreMissed}건 + 부차 {sideMissed}건
        </li>
        <li>AI가 모범에 없다고 본 쟁점: {aiResult.extras.length}건</li>
      </ul>
    </div>
  );
}
