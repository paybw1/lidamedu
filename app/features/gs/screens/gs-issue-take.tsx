// 학생 — 한 문항의 논점 추출 응시 + 자기채점.
// state 머신:
//   1) blank/in-progress: 사례 본문 + 학생 입력 textarea + autosave + "제출" 버튼
//      모범 논점은 절대 노출하지 않음.
//   2) submitted (자기채점 전): 학생 작성 표시 + 모범 논점 reveal + 짚음/빠뜨림 체크 UI
//   3) self-checked: 결과 요약 + 재도전 버튼
// (§3 에서 AI 분석 사이드패널 추가 예정)

import {
  ArrowLeftIcon,
  CheckIcon,
  PencilLineIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, data, useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import { Chip } from "~/features/community/components/community-ui";
import {
  type IssueRefLink,
  type QuestionIssue,
  getRefLinksForIssues,
  listApprovedIssuesForGsQuestion,
} from "~/features/gs/queries-issues.server";
import {
  type AiAnalysis as AiAnalysisResult,
  type IssueAttempt,
  type SelfCheck,
  getIssueQuestionForStudent,
} from "~/features/gs/queries-issue-attempts.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";
import { AiAdvisorPanel } from "~/features/gs/screens/gs-issue-take-ai-panel";

import type { Route } from "./+types/gs-issue-take";

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: d?.question?.title
      ? `${d.question.title} — 논점 추출 | Lidam`
      : "논점 추출 훈련 | Lidam",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const gsQuestionId = params.questionId;
  if (!gsQuestionId) throw data("Missing questionId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const ctx = await getIssueQuestionForStudent(client, user.id, gsQuestionId);
  if (!ctx) throw data("아직 모범 논점이 승인되지 않은 문항입니다.", { status: 404 });

  // 모범 논점은 응시 단계에선 노출 X. 제출 후에만 보여줌.
  // 보안: 응시 단계라도 fetch 자체는 가능. 학생 화면에서 "잠금" 처리.
  const masterIssues = await listApprovedIssuesForGsQuestion(client, gsQuestionId);
  // §4 — 빠뜨린 논점 deep link 용 ref lookup.
  const refLinks = await getRefLinksForIssues(client, masterIssues);

  // 판례 전문 PDF — 서버 게이트(UX). self-checked 단계에서만 URL Record 노출.
  // 그 외 단계엔 빈 Record → 클라가 받을 방법 없음. URL 은 정적 redirect 라우트라
  // 만료 무관(라우트가 매 클릭마다 fresh signed URL 발급 + 302).
  const phase: "blank" | "in-progress" | "submitted" | "self-checked" =
    !ctx.myAttempt
      ? "blank"
      : ctx.myAttempt.selfCheckedAt
        ? "self-checked"
        : ctx.myAttempt.submittedAt
          ? "submitted"
          : "in-progress";
  const casePdfUrls: Record<string, string> = {};
  if (phase === "self-checked") {
    const caseIds = Object.values(refLinks)
      .map((l) => l.case?.caseId)
      .filter((v): v is string => !!v);
    if (caseIds.length > 0) {
      const { data: rows } = await client
        .from("cases")
        .select("case_id, official_text_pdf_path")
        .in("case_id", caseIds);
      for (const r of rows ?? []) {
        if (!r.official_text_pdf_path) continue;
        casePdfUrls[r.case_id] = `/api/cases/${r.case_id}/official-text-pdf`;
      }
    }
  }

  return { ...ctx, masterIssues, refLinks, casePdfUrls };
}

type Phase = "blank" | "in-progress" | "submitted" | "self-checked";

function determinePhase(attempt: IssueAttempt | null): Phase {
  if (!attempt) return "blank";
  if (attempt.selfCheckedAt) return "self-checked";
  if (attempt.submittedAt) return "submitted";
  return "in-progress";
}

export default function GsIssueTake({ loaderData }: Route.ComponentProps) {
  const { question, round, myAttempt, masterIssues, refLinks, casePdfUrls } = loaderData;
  const phase = determinePhase(myAttempt);

  return (
    <MockExamShell
      category="gs"
      width="narrow"
      title={question.title ?? `Q${question.orderIndex + 1} — 논점 추출`}
      desc="사례를 읽고 떠오르는 핵심 논점을 한 줄씩 적어보세요. 모범 논점은 제출 후에 공개됩니다."
      backLink={{ to: "/gs/issues", label: "논점 훈련 목록" }}
      headerRight={
        <Chip tone="primary">
          {LAW_SUBJECTS[round.subject]?.name ?? round.subject}
        </Chip>
      }
    >
      {/* 사례 본문 — 모든 phase 에서 노출 */}
      <section className="border-border bg-card mb-4 rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          사례
        </p>
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {question.bodyMd}
        </p>
      </section>

      {phase === "blank" || phase === "in-progress" ? (
        <WriteStage attempt={myAttempt} gsQuestionId={question.questionId} />
      ) : phase === "submitted" ? (
        <SelfCheckStage
          attempt={myAttempt!}
          gsQuestionId={question.questionId}
          masterIssues={masterIssues}
        />
      ) : (
        <DoneStage
          attempt={myAttempt!}
          gsQuestionId={question.questionId}
          masterIssues={masterIssues}
          refLinks={refLinks}
          casePdfUrls={casePdfUrls}
          roundId={round.roundId}
        />
      )}
    </MockExamShell>
  );
}

/* ── ① 작성 단계 — 모범 논점 잠금 ─────────────────────────────────────── */

function WriteStage({
  attempt,
  gsQuestionId,
}: {
  attempt: IssueAttempt | null;
  gsQuestionId: string;
}) {
  const [text, setText] = useState(attempt?.studentIssuesMd ?? "");
  const autoFetcher = useFetcher<{ ok?: true; attemptId?: string; error?: string }>();
  const submitFetcher = useFetcher<{ ok?: true; error?: string }>();
  const revalidator = useRevalidator();
  const lastSavedRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 제출 성공 → 화면 reload (Phase 전환).
  useEffect(() => {
    if (
      submitFetcher.state === "idle" &&
      submitFetcher.data &&
      "ok" in submitFetcher.data &&
      submitFetcher.data.ok
    ) {
      revalidator.revalidate();
    }
  }, [submitFetcher.state, submitFetcher.data, revalidator]);

  // autosave (debounce 700ms).
  useEffect(() => {
    if (text === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("intent", "autosave");
      fd.set("gsQuestionId", gsQuestionId);
      fd.set("studentIssuesMd", text);
      autoFetcher.submit(fd, {
        method: "post",
        action: "/api/gs/issue-attempt",
      });
      lastSavedRef.current = text;
    }, 700);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, gsQuestionId]);

  const lineCount = useMemo(
    () => text.split(/\r?\n/).filter((l) => l.trim().length > 0).length,
    [text],
  );

  const submit = () => {
    if (text.trim().length < 2) {
      alert("최소 한 줄은 작성해주세요.");
      return;
    }
    if (
      !confirm(
        "제출 후에는 모범 논점이 공개되고 자기채점 단계로 넘어갑니다. 제출할까요?",
      )
    )
      return;
    const fd = new FormData();
    fd.set("intent", "submit");
    fd.set("gsQuestionId", gsQuestionId);
    fd.set("studentIssuesMd", text);
    submitFetcher.submit(fd, {
      method: "post",
      action: "/api/gs/issue-attempt",
    });
  };

  return (
    <section className="space-y-3">
      <div className="border-primary/20 bg-primary/[0.04] flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <PencilLineIcon className="text-link mt-0.5 size-4 shrink-0" />
        <p className="text-foreground">
          <strong>한 줄에 한 논점</strong>씩 적는 걸 권장합니다 (자유 형식도 OK).
          예: "신규성 위반 여부 · 제29조". 모범답안은 제출 전에 절대 보지 마세요.
        </p>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[200px] text-sm leading-relaxed"
        placeholder={`예:
신규성 위반 여부 — 제29조 제1항
진보성 판단 — 통상의 기술자
출원경과 금반언`}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-xs">
          줄 수: <strong className="text-foreground tabular-nums">{lineCount}</strong>
        </span>
        <span className="text-muted-foreground text-[11px]">
          {autoFetcher.state !== "idle"
            ? "저장 중…"
            : text === lastSavedRef.current
              ? "자동 저장됨"
              : "변경 — 곧 저장"}
        </span>
        <Button
          type="button"
          onClick={submit}
          className="ml-auto rounded-full"
          disabled={
            submitFetcher.state !== "idle" || text.trim().length < 2
          }
        >
          <SendIcon className="size-4" /> 제출 → 모범 논점 보기
        </Button>
      </div>
    </section>
  );
}

/* ── ② 자기채점 단계 — 모범 논점 reveal ───────────────────────────────── */

function SelfCheckStage({
  attempt,
  gsQuestionId,
  masterIssues,
}: {
  attempt: IssueAttempt;
  gsQuestionId: string;
  masterIssues: QuestionIssue[];
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const aiFetcher = useFetcher<{
    ok?: true;
    error?: string;
    capBlocked?: boolean;
    result?: AiAnalysisResult;
  }>();
  const revalidator = useRevalidator();
  // hits/missed default 는 비어 있음. AI 분석 결과가 있으면 학생이 그걸 참고해 결정.
  const [hits, setHits] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState("");

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

  // AI 분석 결과는 attempt.aiAnalysis 또는 방금 호출 결과.
  const aiResult: AiAnalysisResult | null =
    (aiFetcher.data &&
      "result" in aiFetcher.data &&
      aiFetcher.data.result) ||
    attempt.aiAnalysis ||
    null;
  const aiMissedIds = new Set(
    aiResult?.missed.map((m) => m.issueId) ?? [],
  );

  const runAi = () => {
    if (
      !confirm(
        "AI 의견을 받습니다. (Claude 호출 — GS 비용 가드 적용). 학생이 자기채점한 결과는 그대로 유지됩니다.",
      )
    )
      return;
    const fd = new FormData();
    fd.set("gsQuestionId", gsQuestionId);
    aiFetcher.submit(fd, {
      method: "post",
      action: "/api/gs/issue-analyze",
    });
  };
  const aiBusy = aiFetcher.state !== "idle";
  const aiError =
    aiFetcher.data && "error" in aiFetcher.data
      ? aiFetcher.data.error
      : null;

  // 각 모범 논점에 대해 hit/miss 3-way (default = 미정).
  const markHit = (id: string) => {
    const h = new Set(hits);
    const m = new Set(missed);
    if (h.has(id)) {
      h.delete(id);
    } else {
      h.add(id);
      m.delete(id);
    }
    setHits(h);
    setMissed(m);
  };
  const markMissed = (id: string) => {
    const h = new Set(hits);
    const m = new Set(missed);
    if (m.has(id)) {
      m.delete(id);
    } else {
      m.add(id);
      h.delete(id);
    }
    setHits(h);
    setMissed(m);
  };

  const submitSelfCheck = () => {
    const fd = new FormData();
    fd.set("intent", "self_check");
    fd.set("gsQuestionId", gsQuestionId);
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
    fetcher.submit(fd, { method: "post", action: "/api/gs/issue-attempt" });
  };

  const total = masterIssues.length;
  const decided = hits.size + missed.size;

  return (
    <section className="space-y-4">
      {/* 내 작성 (read-only) */}
      <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          내가 적은 논점
        </p>
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {attempt.studentIssuesMd || "(빈 답안)"}
        </p>
      </div>

      {/* AI 의견 받기 패널 — 자기채점 보조 */}
      <AiAdvisorPanel
        aiResult={aiResult}
        aiBusy={aiBusy}
        aiError={aiError}
        capBlocked={
          aiFetcher.data &&
          "capBlocked" in aiFetcher.data &&
          aiFetcher.data.capBlocked
            ? true
            : false
        }
        masterIssues={masterIssues}
        onRun={runAi}
      />

      {/* 모범 논점 reveal + 짚음/빠뜨림 체크 */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="font-bold tracking-tight">
            모범 논점 — 짚었는지 / 빠뜨렸는지 체크
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
                    <Chip tone={iss.importance === "core" ? "primary" : "outline"}>
                      {iss.importance === "core" ? "핵심" : "부차"}
                    </Chip>
                    <p className="text-foreground text-sm font-bold">{iss.label}</p>
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
                      AI 근거: "{aiHit.evidence}" — 사람 판단으로 최종 결정하세요.
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

      {/* 잘못 넣은 자작 논점 */}
      <div>
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          잘못 넣은 논점 (자유 입력 — 모범에 없는 논점)
        </p>
        <Textarea
          value={wrong}
          onChange={(e) => setWrong(e.target.value)}
          className="min-h-[80px] text-xs"
          placeholder="모범에 없는 논점을 적었다면 한 줄에 하나씩"
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

/* ── ③ 완료 단계 — 결과 요약 + 재도전 ─────────────────────────────────── */

function DoneStage({
  attempt,
  gsQuestionId,
  masterIssues,
  refLinks,
  casePdfUrls,
  roundId,
}: {
  attempt: IssueAttempt;
  gsQuestionId: string;
  masterIssues: QuestionIssue[];
  refLinks: Record<string, IssueRefLink>;
  /** caseId → signed URL (1h). 서버에서 self-checked 단계에만 채워서 보냄. */
  casePdfUrls: Record<string, string>;
  roundId: string;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const revalidator = useRevalidator();
  const sc: SelfCheck = attempt.selfCheck ?? {
    hits: [],
    missed: [],
    wrong: [],
  };

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
    fd.set("intent", "reset");
    fd.set("gsQuestionId", gsQuestionId);
    fetcher.submit(fd, { method: "post", action: "/api/gs/issue-attempt" });
  };

  const coreTotal = masterIssues.filter((i) => i.importance === "core").length;
  const coreHits = masterIssues.filter(
    (i) => i.importance === "core" && sc.hits.includes(i.issueId),
  ).length;
  const coreMissed = coreTotal - coreHits;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="짚은 논점"
          value={sc.hits.length}
          total={masterIssues.length}
          tone="emerald"
        />
        <Stat
          label="빠뜨린 논점"
          value={sc.missed.length}
          total={masterIssues.length}
          tone="coral"
        />
        <Stat label="핵심 누락" value={coreMissed} total={coreTotal} tone="rose" />
      </div>

      {/* AI 의견이 저장돼 있으면 같이 표시 (자기채점과 별개로 참고) */}
      {attempt.aiAnalysis ? (
        <div className="border-amber-300/40 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-2xl border p-3">
          <p className="text-foreground text-sm font-bold">
            AI 의견 (제출 시 받음)
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px] italic">
            ※ 보조 의견. 자기채점이 최종.
          </p>
          <ul className="text-muted-foreground mt-2 list-disc pl-5 text-xs leading-relaxed">
            <li>AI 가 짚었다고 본: {attempt.aiAnalysis.hits.length}건</li>
            <li>
              AI 가 빠뜨렸다고 본:{" "}
              {
                attempt.aiAnalysis.missed.filter((m) => m.severity === "core")
                  .length
              }
              건 핵심 +{" "}
              {
                attempt.aiAnalysis.missed.filter((m) => m.severity === "side")
                  .length
              }
              건 부차
            </li>
            <li>AI 가 자작/외전으로 본: {attempt.aiAnalysis.extras.length}건</li>
          </ul>
        </div>
      ) : null}

      <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          내가 적은 논점
        </p>
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {attempt.studentIssuesMd || "(빈 답안)"}
        </p>
      </div>

      <div>
        <p className="mb-2 font-bold tracking-tight">
          빠뜨린 논점 ({sc.missed.length}건)
        </p>
        {sc.missed.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            🎉 모범 논점을 모두 짚었습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {masterIssues
              .filter((i) => sc.missed.includes(i.issueId))
              .map((iss) => {
                const link = refLinks[iss.issueId];
                return (
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
                  {link?.article || link?.case ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground text-[11px]">
                        근거 학습 →
                      </span>
                      {link.article ? (
                        <Link
                          to={`/subjects/${link.article.lawCode}/articles/${link.article.articleNumber}`}
                          viewTransition
                          prefetch="intent"
                          className="text-link hover:underline text-xs font-semibold"
                        >
                          {link.article.displayLabel ??
                            `${link.article.lawCode} 제${link.article.articleNumber}조`}
                        </Link>
                      ) : null}
                      {link.case && link.case.lawCode ? (
                        <Link
                          to={`/subjects/${link.case.lawCode}/cases/${link.case.caseId}`}
                          viewTransition
                          prefetch="intent"
                          className="text-link hover:underline text-xs font-semibold"
                        >
                          {link.case.caseTitle ?? "판례"}
                        </Link>
                      ) : null}
                      {link.case && casePdfUrls[link.case.caseId] ? (
                        <a
                          href={casePdfUrls[link.case.caseId]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link hover:underline text-xs font-semibold"
                        >
                          📄 전문 PDF
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </li>
                );
              })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild className="rounded-full">
          <Link to={`/gs/${roundId}/take`}>
            답안 작성 단계로 → <ArrowLeftIcon className="size-4 rotate-180" />
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={reset}
          className="rounded-full"
          disabled={fetcher.state !== "idle"}
        >
          <RotateCcwIcon className="size-4" /> 다시 풀기
        </Button>
        <Button asChild variant="ghost" className="rounded-full">
          <Link to="/gs/issues">목록으로</Link>
        </Button>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "emerald" | "coral" | "rose";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "coral"
        ? "text-amber-700 dark:text-amber-300"
        : "text-rose-600 dark:text-rose-300";
  return (
    <div className="border-border bg-card rounded-xl border p-3 shadow-sm">
      <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        {label}
      </p>
      <p className={cn("text-foreground mt-1 text-2xl font-extrabold tabular-nums", color)}>
        {value}
        <span className="text-muted-foreground ml-1 text-xs font-medium">
          / {total}
        </span>
      </p>
    </div>
  );
}
