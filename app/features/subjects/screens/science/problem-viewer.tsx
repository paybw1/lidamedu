// 자연과학 객관식 문제 풀이 viewer.
// 최소 기능 — 문제 본문 + 선지 4지 + 정답 채점 + 이전/다음(세션 기반).
// 5.4.A.3 객관식 viewer 가 lawCode 종속적이라 분리. 추후 공통화 가능.

import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  HeartIcon,
  LightbulbIcon,
  PencilIcon,
  PlayIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { BookmarkStars } from "~/features/annotations/components/bookmark-stars";
import { getBookmark } from "~/features/annotations/queries.server";
import { CommentsPanel } from "~/features/comments/components/comments-panel";
import { listComments } from "~/features/comments/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
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
import { parseScienceBody } from "~/features/subjects/lib/science-body";

import type { Route } from "./+types/problem-viewer";

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "자연과학 문제 | Lidam Patent Attorney Academy" }];
  return [
    {
      title: `${ld.subjectMeta.name} 문제${ld.position ? ` ${ld.position.cur}/${ld.position.total}` : ""} | Lidam Patent Attorney Academy`,
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

  const role = await getStaffRole(client, user.id);
  const [bookmark, comments] = await Promise.all([
    getBookmark(client, user.id, "problem", problem.problemId),
    listComments(client, "problem", problem.problemId),
  ]);

  return {
    scienceSubject: subject,
    subjectMeta: SCIENCE_SUBJECTS[subject],
    problem,
    sessionId,
    sessionMode,
    position,
    isStaff: role !== null,
    currentUserId: user.id,
    isAdmin: role === "admin",
    bookmark,
    comments,
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
    isStaff,
    currentUserId,
    isAdmin,
    bookmark,
    comments,
  } = loaderData;
  // 발문(stem) 과 <보기>(ㄱㄴㄷ) 분리 — 자연과학 보기는 bodyMd 텍스트라 박스·줄바꿈이 없음.
  const { stem, bogi } = parseScienceBody(problem.bodyMd);
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
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="mx-auto w-full max-w-screen-md px-5 py-8 md:px-10 md:py-10">

        {/* Header bar */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/subjects/science/${sciencePath}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
            >
              <ArrowLeftIcon className="size-4" /> {subjectMeta.name}
            </Link>
            {position ? (
              <span className="text-muted-foreground rounded-full border bg-muted px-2.5 py-0.5 font-mono text-[11px] tabular-nums">
                {position.cur} / {position.total}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {isStaff ? (
              <Link
                to={`/admin/problems/${problem.problemId}`}
                viewTransition
                className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-xs font-semibold"
              >
                <PencilIcon className="size-3.5" /> 수정
              </Link>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide",
                sessionMode === "exam"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-primary/10 text-primary",
              )}
            >
              {sessionMode === "exam" ? "시험 모드" : "학습 모드"}
            </span>
          </div>
        </header>

        {/* Problem card */}
        <div className="mb-4 rounded-xl border bg-card shadow-sm">
          {/* 출제 정보 — 기출 연도·과목·번호 */}
          {problem.year ? (
            <div className="flex flex-wrap items-center gap-2 border-b px-6 py-2.5 text-xs">
              <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-0.5 font-bold tabular-nums">
                {problem.year}년{problem.examRound === "first" ? " 1차" : ""} 기출
              </span>
              <span className="text-muted-foreground">
                {subjectMeta.name}
                {problem.problemNumber ? ` · ${problem.problemNumber}번` : ""}
              </span>
            </div>
          ) : null}
          {/* Problem body */}
          <div className="border-b px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-xl">{subjectMeta.emoji}</span>
              <div className="flex-1 text-base font-medium leading-relaxed">
                <MarkdownView text={stem} className="text-base leading-relaxed" />
                {bogi.length > 0 ? (
                  <div className="border-border/70 bg-muted/30 dark:bg-muted/10 mt-4 rounded-xl border-2 px-5 py-4">
                    <p className="text-muted-foreground mb-2 text-xs font-bold tracking-wide">
                      〈보기〉
                    </p>
                    <ul className="space-y-1.5">
                      {bogi.map((item, i) => (
                        <li
                          key={i}
                          className="text-foreground text-[15px] leading-[1.7]"
                        >
                          <MarkdownView
                            text={item}
                            className="text-[15px] leading-[1.7]"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Choice list */}
          <div className="space-y-2 px-6 py-5">
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
                    "w-full rounded-xl border px-4 py-3 text-left text-sm transition-all",
                    !revealed && !sel && "border-border hover:border-primary/40 hover:bg-primary/[0.03]",
                    !revealed && sel && "border-primary bg-primary/[0.06] shadow-sm",
                    isThisCorrect &&
                      "border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-950/30",
                    isThisWrongSelected &&
                      "border-rose-500 bg-rose-50 shadow-sm dark:bg-rose-950/30",
                    revealed && !isThisCorrect && !isThisWrongSelected && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                        !revealed && sel
                          ? "bg-primary text-primary-foreground"
                          : isThisCorrect
                            ? "bg-emerald-500 text-white"
                            : isThisWrongSelected
                              ? "bg-rose-500 text-white"
                              : "bg-muted text-muted-foreground",
                      )}
                    >
                      {c.choiceIndex}
                    </span>
                    <div className="flex-1">
                      <MarkdownView text={c.bodyMd} />
                    </div>
                    {isThisCorrect ? (
                      <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : isThisWrongSelected ? (
                      <CircleXIcon className="mt-0.5 size-4 shrink-0 text-rose-600" />
                    ) : null}
                  </div>
                  {revealed && c.explanationMd ? (
                    <div className="mt-2 rounded-lg bg-muted/60 px-3 py-2 pl-8 text-xs leading-relaxed text-muted-foreground">
                      <MarkdownView text={c.explanationMd} className="text-xs leading-relaxed" />
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action row */}
        <div className="flex flex-wrap items-center gap-2">
          {position?.prevId ? (
            <Button asChild variant="outline" size="sm" className="rounded-full">
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
              className="ml-auto rounded-full"
              data-testid="science-submit"
            >
              {sessionMode === "exam" ? "답안 저장" : "제출"}
            </Button>
          ) : (
            <p
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold",
                isCorrect
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400",
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
            <Button asChild size="sm" className="rounded-full">
              <Link
                to={`/subjects/science/${sciencePath}/problems/${position.nextId}${sessionParam}`}
              >
                다음 <ChevronRightIcon className="size-4" />
              </Link>
            </Button>
          ) : position && !position.nextId ? (
            <Button asChild size="sm" className="rounded-full">
              <Link to={`/subjects/science/${sciencePath}`}>
                <PlayIcon className="size-4" /> 완료
              </Link>
            </Button>
          ) : null}
        </div>

        {/* 문제 해설 — study 모드 제출 후 노출(문제 단위 explanation_md). 시험 모드는 showResult=false 라 미노출 */}
        {showResult && problem.explanationMd ? (
          <div
            className="mt-6 rounded-xl border bg-card p-5 shadow-sm"
            data-testid="science-explanation"
          >
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <LightbulbIcon className="size-4 text-amber-500" /> 해설
            </h2>
            <MarkdownView
              text={problem.explanationMd}
              className="text-sm leading-relaxed"
            />
          </div>
        ) : null}

        {/* 즐겨찾기 + 메모 — 본문이 이미지라 텍스트 선택형 포스트잇 대신 일반 메모(content_comments) 사용 */}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="bg-card rounded-xl border p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <HeartIcon className="size-4 text-rose-500" /> 즐겨찾기
            </h2>
            <BookmarkStars
              targetType="problem"
              targetId={problem.problemId}
              initial={bookmark}
            />
          </section>
          <section className="bg-card rounded-xl border p-4 shadow-sm">
            <CommentsPanel
              targetType="problem"
              targetId={problem.problemId}
              comments={comments}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              emptyHint="이 문제에 대한 메모를 남겨보세요."
            />
          </section>
        </div>
      </div>
    </div>
  );
}
