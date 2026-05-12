// 자연과학 객관식 문제 풀이 viewer.
// 최소 기능 — 문제 본문 + 선지 4지 + 정답 채점 + 이전/다음(세션 기반).
// 5.4.A.3 객관식 viewer 가 lawCode 종속적이라 분리. 추후 공통화 가능.

import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  PlayIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  getQuizSession,
  recordProblemAttempt,
} from "~/features/study/queries.server";
import {
  SCIENCE_SUBJECTS,
  normalizeScienceSlug,
} from "~/features/subjects/lib/science";
import { getScienceProblem } from "~/features/subjects/lib/science.server";

import type { Route } from "./+types/problem-viewer";

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "자연과학 문제 | Lidam Edu" }];
  return [
    {
      title: `${ld.subjectMeta.name} 문제${ld.position ? ` ${ld.position.cur}/${ld.position.total}` : ""} | Lidam Edu`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subject = normalizeScienceSlug(params.scienceSubject ?? "");
  if (!subject) throw data("Unknown science subject", { status: 404 });
  const problemId = params.problemId;
  if (!problemId) throw data("Missing problemId", { status: 404 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const problem = await getScienceProblem(client, problemId);
  if (!problem) throw data("Problem not found", { status: 404 });
  if (problem.scienceSubject !== subject) {
    throw data("Subject mismatch", { status: 404 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  let position:
    | { cur: number; total: number; prevId: string | null; nextId: string | null }
    | null = null;
  let sessionMode: "study" | "exam" = "study";
  if (sessionId) {
    const session = await getQuizSession(client, user.id, sessionId);
    if (session && session.scienceSubject === subject) {
      const ids = session.problemIds;
      const idx = ids.findIndex((id) => id === problemId);
      sessionMode = session.mode;
      position = {
        cur: idx + 1,
        total: ids.length,
        prevId: idx > 0 ? ids[idx - 1] : null,
        nextId: idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null,
      };
    }
  }

  return {
    scienceSubject: subject,
    subjectMeta: SCIENCE_SUBJECTS[subject],
    problem,
    sessionId,
    sessionMode,
    position,
  };
}

const attemptSchema = z.object({
  intent: z.literal("attempt"),
  problemId: z.string().uuid(),
  choiceId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const parsed = attemptSchema.safeParse({
    intent: fd.get("intent"),
    problemId: fd.get("problemId"),
    choiceId: fd.get("choiceId"),
    sessionId: fd.get("sessionId") || undefined,
  });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });

  const problem = await getScienceProblem(client, parsed.data.problemId);
  if (!problem) return data({ error: "Problem not found" }, { status: 404 });
  const choice = problem.choices.find((c) => c.choiceId === parsed.data.choiceId);
  if (!choice) return data({ error: "Choice not found" }, { status: 404 });

  await recordProblemAttempt(client, user.id, {
    problemId: parsed.data.problemId,
    selectedChoiceId: choice.choiceId,
    selectedChoiceIndex: choice.choiceIndex,
    isCorrect: choice.isCorrect,
    sessionId: parsed.data.sessionId ?? null,
  });

  return data({
    ok: true,
    isCorrect: choice.isCorrect,
  });
}

export default function ScienceProblemViewer({
  loaderData,
}: Route.ComponentProps) {
  const {
    scienceSubject,
    subjectMeta,
    problem,
    sessionId,
    sessionMode,
    position,
  } = loaderData;
  const attemptFetcher = useFetcher<typeof action>();
  const [selected, setSelected] = useState<string | null>(null);
  const aiData = attemptFetcher.data;
  const showResult =
    sessionMode === "study" &&
    !!aiData &&
    "ok" in aiData &&
    aiData.ok === true;
  const isCorrect =
    showResult && "isCorrect" in aiData && aiData.isCorrect === true;

  useEffect(() => {
    setSelected(null);
  }, [problem.problemId]);

  const sciencePath =
    scienceSubject === "earth_science" ? "earth-science" : scienceSubject;
  const sessionParam = sessionId ? `?session=${sessionId}` : "";
  const submit = () => {
    if (!selected) return;
    const fd = new FormData();
    fd.set("intent", "attempt");
    fd.set("problemId", problem.problemId);
    fd.set("choiceId", selected);
    if (sessionId) fd.set("sessionId", sessionId);
    attemptFetcher.submit(fd, { method: "post" });
  };

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to={`/subjects/science/${sciencePath}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" /> {subjectMeta.name}
        </Link>
        {position ? (
          <Badge variant="outline" className="text-[11px]">
            {position.cur} / {position.total}
          </Badge>
        ) : null}
        <Badge variant="secondary" className="text-[11px]">
          {sessionMode === "exam" ? "시험 모드" : "학습 모드"}
        </Badge>
      </header>

      <Card className="mb-4">
        <CardHeader>
          <div className="text-base font-semibold leading-snug">
            <span className="text-muted-foreground mr-2">{subjectMeta.emoji}</span>
            <MarkdownView text={problem.bodyMd} className="text-base" />
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-2 pt-4">
          {problem.choices.map((c) => {
            const sel = selected === c.choiceId;
            const revealed = showResult;
            const isThisCorrect = revealed && c.isCorrect;
            const isThisWrongSelected = revealed && sel && !c.isCorrect;
            return (
              <button
                key={c.choiceId}
                type="button"
                disabled={revealed}
                onClick={() => setSelected(c.choiceId)}
                data-testid={`science-choice-${c.choiceIndex}`}
                className={cn(
                  "w-full text-left rounded-md border px-3 py-2 text-sm transition",
                  !revealed && sel
                    ? "border-primary bg-primary/5"
                    : "border-input hover:bg-muted/40",
                  isThisCorrect &&
                    "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
                  isThisWrongSelected &&
                    "border-rose-500 bg-rose-50 dark:bg-rose-950/30",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground tabular-nums w-5">
                    {c.choiceIndex}
                  </span>
                  <div className="flex-1">
                    <MarkdownView text={c.bodyMd} />
                  </div>
                  {isThisCorrect ? (
                    <CircleCheckIcon className="text-emerald-600 size-4" />
                  ) : isThisWrongSelected ? (
                    <CircleXIcon className="text-rose-600 size-4" />
                  ) : null}
                </div>
                {revealed && c.explanationMd ? (
                  <div className="text-muted-foreground mt-1 leading-snug pl-7">
                    <MarkdownView text={c.explanationMd} className="text-[11px]" />
                  </div>
                ) : null}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {position?.prevId ? (
          <Button asChild variant="outline" size="sm">
            <Link
              to={`/subjects/science/${sciencePath}/problems/${position.prevId}${sessionParam}`}
            >
              <ChevronLeftIcon className="size-4" /> 이전
            </Link>
          </Button>
        ) : null}

        {!showResult ? (
          <Button
            type="button"
            onClick={submit}
            disabled={!selected || attemptFetcher.state !== "idle"}
            className="ml-auto"
            data-testid="science-submit"
          >
            {sessionMode === "exam" ? "답안 저장" : "제출"}
          </Button>
        ) : (
          <p
            className={cn(
              "ml-auto inline-flex items-center gap-1 text-sm font-semibold",
              isCorrect ? "text-emerald-700" : "text-rose-700",
            )}
          >
            {isCorrect ? (
              <>
                <CircleCheckIcon className="size-4" /> 정답
              </>
            ) : (
              <>
                <CircleXIcon className="size-4" /> 오답
              </>
            )}
          </p>
        )}

        {position?.nextId ? (
          <Button asChild size="sm">
            <Link
              to={`/subjects/science/${sciencePath}/problems/${position.nextId}${sessionParam}`}
            >
              다음 <ChevronRightIcon className="size-4" />
            </Link>
          </Button>
        ) : position && !position.nextId ? (
          <Button asChild size="sm">
            <Link to={`/subjects/science/${sciencePath}`}>
              <PlayIcon className="size-4" /> 끝
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
