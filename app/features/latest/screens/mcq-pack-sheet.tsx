// MCQ 팩 응시 시험지 (sheet) view — 한 페이지에 모든 문제 표시.
// /api/mcq-pack/start 가 session 을 만든 뒤 여기로 redirect.
// 학습 모드: 답안 선택 → "채점하기" 로 전체 정오/해설 인라인 노출 → 결과 페이지 이동.
// 시험 모드: 답안 선택만 가능, 채점 결과 비공개. 타이머 만료 / "제출" 클릭 시 결과 페이지 이동.
// 키트 lidam-latest/McqSheetScreen 디자인.

import {
  BookOpenCheckIcon,
  BookmarkIcon,
  CheckCircle2Icon,
  CircleXIcon,
  FlagIcon,
  LayoutGridIcon,
  TimerIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { Pill } from "~/features/latest/components/latest-list";
import { McqAreaShell } from "~/features/mcq-packs/components/mcq-area-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  type ProblemDetail,
} from "~/features/problems/labels";
import {
  deriveDisplayBoxItemOx,
  deriveDisplayChoiceOx,
  stripLeadingOxMark,
} from "~/features/problems/lib/auto-ox";
import { getProblemDetailsByIds } from "~/features/problems/queries.server";
import {
  MCQ_PACK_KIND_LABELS,
  MCQ_PACK_SUBJECT_LABELS,
  isMockKind,
} from "~/features/mcq-packs/labels";
import { getPackById } from "~/features/mcq-packs/queries.server";
import { computePerQuestionTimeMs } from "~/features/study/lib/study-volume";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import { requireFeature } from "~/features/subscriptions/queries.server";
import {
  getQuizSession,
  getSessionAttemptsMap,
  getSessionFlagSet,
  type QuizMode,
  type SessionAttemptEntry,
} from "~/features/study/queries.server";

import type { Route } from "./+types/mcq-pack-sheet";

// 이미지 기반 문항(자연과학 기출 등)은 본문을 Markdown 이미지(![](url))로, 표 기반
// 문항은 HTML <table> 또는 GFM 파이프표로 저장한다. 이미지/표 마크업이 있을 때만
// MarkdownView 로 렌더하고, 그 외 텍스트 문항은 whitespace-pre-line 경로를 유지한다.
// 파이프표 감지 = 구분선 `|---|` (\|[\s:]*-{3,}).
const MD_IMAGE_RE = /!\[[^\]]*\]\([^)]*\)|<(img|table|div)\b|\|[\s:]*-{3,}/i;
// 종합해설 마크다운 서식 감지 — **굵게**·헤더·별표 감싼 줄(민법 해설 "*관련 조문·판례*").
const MD_FORMAT_RE = /\*\*[^*\n]+\*\*|(?:^|\n)#{1,6}\s+\S|(?:^|\n)\*[^*\n]+\*(?=\n|$)/;

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.pack) return [{ title: "응시 | 리담변리사학원" }];
  return [{ title: `${d.pack.title} 응시 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.packId || !params.sessionId) {
    throw data("Missing id", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const pack = await getPackById(client, params.packId);
  if (!pack) throw data("Pack not found", { status: 404 });
  // feat-8-008: 모의고사 종류 팩은 area_mock_exams 게이트 (회원3 / staff 면제).
  if (isMockKind(pack.kind)) {
    await requireFeature(client, user.id, "area_mock_exams");
  }

  const session = await getQuizSession(client, user.id, params.sessionId);
  if (!session) throw data("Session not found", { status: 404 });

  const [problems, attemptsMap, flagIds] = await Promise.all([
    getProblemDetailsByIds(client, session.problemIds),
    getSessionAttemptsMap(client, user.id, params.sessionId),
    getSessionFlagSet(client, user.id, params.sessionId),
  ]);
  // Map → plain object (loader 직렬화).
  const attempts: Record<string, SessionAttemptEntry> = {};
  for (const [k, v] of attemptsMap) attempts[k] = v;

  return {
    pack,
    session,
    problems,
    attempts,
    flagIds,
  };
}

interface SelectedChoiceState {
  // problemId → selected choiceIndex (1..N).
  [problemId: string]: number;
}

function useExamTimer(
  startedAtIso: string | null,
  timeLimitSec: number | null,
  onExpire: () => void,
): string | null {
  const expiredRef = useRef(false);
  const [, force] = useState(0);
  useEffect(() => {
    if (!startedAtIso || !timeLimitSec) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [startedAtIso, timeLimitSec]);
  return useMemo(() => {
    if (!startedAtIso || !timeLimitSec) return null;
    const elapsed = Math.floor(
      (Date.now() - new Date(startedAtIso).getTime()) / 1000,
    );
    const remain = Math.max(0, timeLimitSec - elapsed);
    if (remain === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire();
    }
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [startedAtIso, timeLimitSec, onExpire]);
}

export default function McqPackSheet({ loaderData }: Route.ComponentProps) {
  const { pack, session, problems, attempts, flagIds } = loaderData;
  const mode: QuizMode = session.mode;
  const isExam = mode === "exam";
  // 기존 응답 복원.
  const initialSelected = useMemo<SelectedChoiceState>(() => {
    const init: SelectedChoiceState = {};
    for (const [pid, att] of Object.entries(attempts)) {
      if (att.selectedChoiceIndex !== null) init[pid] = att.selectedChoiceIndex;
    }
    return init;
  }, [attempts]);

  const [selected, setSelected] = useState<SelectedChoiceState>(initialSelected);

  // feat §A — 다시 볼 문제 플래그(북마크). 서버 mirror, 재진입 시 flagIds 복원.
  const [flagged, setFlagged] = useState<Set<string>>(
    () => new Set(flagIds ?? []),
  );
  const flagFetcher = useFetcher();
  const toggleFlag = (problemId: string) => {
    const isOn = flagged.has(problemId);
    const next = new Set(flagged);
    if (isOn) next.delete(problemId);
    else next.add(problemId);
    setFlagged(next);
    const fd = new FormData();
    fd.set("sessionId", session.sessionId);
    fd.set("problemId", problemId);
    fd.set("next", isOn ? "false" : "true");
    flagFetcher.submit(fd, {
      method: "post",
      action: "/api/study/quiz-flag",
    });
  };

  // feat §A — 미응답 확인 모달 상태.
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  // 문항 네비게이터 sheet 상태.
  const [navOpen, setNavOpen] = useState(false);
  const jumpTo = (idx: number) => {
    const el = document.getElementById(`p-${idx + 1}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setNavOpen(false);
  };
  // 학습 모드 채점 결과 — 새로고침 후에도 살아남도록 localStorage 보존.
  // 이미 완료된 세션은 항상 채점 상태로 노출 (정답·해설 공개).
  const gradedStorageKey = `lidam:sheet:graded:${session.sessionId}`;
  const [graded, setGraded] = useState<boolean>(() => {
    if (session.completedAt) return true;
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(gradedStorageKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (graded) window.localStorage.setItem(gradedStorageKey, "1");
      else window.localStorage.removeItem(gradedStorageKey);
    } catch {
      // ignore quota / privacy errors
    }
  }, [graded, gradedStorageKey]);
  // B1 — 문항별 시간: 직전 조작 시각부터의 경과를 기록한다(실제 조작 순서 기준 —
  // OMR 시트는 순서대로 풀지 않는다). 시트 진입 시각은 첫 조작의 시작점으로만 쓴다.
  // ★구버그: 진입 시각 고정 → 조작마다 "진입 후 누적"이 문항별로 중복 기록(과대계상).
  const lastActionAtRef = useRef<number>(Date.now());
  // 이미 답한 문항의 수정은 최초 응답까지의 시간을 유지 — 수정 attempt 는 0ms
  // (수정에 추가 시간을 붙이지 않는다). 시계는 조작마다 리셋해 다음 문항에
  // 수정 체류시간이 전가되지 않게 한다.
  const answeredRef = useRef<Set<string>>(new Set(Object.keys(initialSelected)));
  const attemptFetcher = useFetcher();
  const completeFetcher = useFetcher();
  // problemId:choiceIndex 형태로 중복 기록 방지 — 새로고침 시에도 기존 응답으로 채워둠.
  const recordedRef = useRef<Set<string>>(
    new Set(
      Object.entries(initialSelected).map(([pid, ci]) => `${pid}:${ci}`),
    ),
  );

  const totalAnswered = Object.keys(selected).length;
  const totalProblems = problems.length;

  const recordAttempt = (problem: ProblemDetail, choiceIndex: number) => {
    const choice = problem.choices.find((c) => c.choiceIndex === choiceIndex);
    if (!choice) return;
    const key = `${problem.problemId}:${choiceIndex}`;
    if (recordedRef.current.has(key)) return;
    recordedRef.current.add(key);
    const now = Date.now();
    const timeSpentMs = computePerQuestionTimeMs(
      now,
      lastActionAtRef.current,
      answeredRef.current.has(problem.problemId),
    );
    lastActionAtRef.current = now; // 이번 제출 시점 = 다음 문항의 시작시각
    answeredRef.current.add(problem.problemId);
    const fd = new FormData();
    fd.set("problemId", problem.problemId);
    fd.set("selectedChoiceId", choice.choiceId);
    fd.set("selectedChoiceIndex", String(choiceIndex));
    fd.set("isCorrect", choice.isCorrect ? "true" : "false");
    fd.set("mode", mode);
    fd.set("timeSpentMs", String(timeSpentMs));
    fd.set("sessionId", session.sessionId);
    attemptFetcher.submit(fd, {
      method: "post",
      action: "/api/problems/attempt",
    });
  };

  const onSelect = (problem: ProblemDetail, choiceIndex: number) => {
    if (graded && !isExam) return; // 학습 모드 채점 후엔 잠금.
    setSelected((prev) => ({ ...prev, [problem.problemId]: choiceIndex }));
    recordAttempt(problem, choiceIndex);
  };

  const completeSession = () => {
    // 세션 종료 시 임시 grading 플래그 정리.
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(gradedStorageKey);
      } catch {
        // ignore
      }
    }
    const fd = new FormData();
    fd.set("sessionId", session.sessionId);
    fd.set(
      "redirectTo",
      `/latest/mcq/${pack.packId}/result/${session.sessionId}`,
    );
    completeFetcher.submit(fd, {
      method: "post",
      action: "/api/study/session-complete",
    });
  };

  const onGrade = () => {
    setGraded(true);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const timerText = useExamTimer(
    isExam ? session.startedAt : null,
    isExam ? session.timeLimitSec : null,
    () => {
      if (!session.completedAt) completeSession();
    },
  );

  // 채점 결과 통계 (학습 모드 채점 후 헤더에 노출).
  const correctCount = graded
    ? problems.reduce((acc, p) => {
        const sel = selected[p.problemId];
        if (sel === undefined) return acc;
        const c = p.choices.find((c) => c.choiceIndex === sel);
        return acc + (c?.isCorrect ? 1 : 0);
      }, 0)
    : 0;

  const metaParts: string[] = [`문항 ${totalProblems}`];
  if (pack.durationMin) metaParts.push(`제한 ${pack.durationMin}분`);
  if (pack.publishedAt) metaParts.push(`출제일 ${pack.publishedAt}`);

  return (
    <McqAreaShell
      isMock={isMockKind(pack.kind)}
      width="narrow"
      backLink={{
        to: `/latest/mcq/${pack.packId}`,
        label: "문제집으로 돌아가기",
      }}
      title={pack.title}
      desc={metaParts.join(" · ")}
    >
      <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
        <Pill tone="outline">
          {MCQ_PACK_SUBJECT_LABELS[pack.subjectScope]}
        </Pill>
        <Pill>{MCQ_PACK_KIND_LABELS[pack.kind]}</Pill>
        <Pill tone={isExam ? "rose" : "primary"}>
          {isExam ? "시험 모드" : "학습 모드"}
        </Pill>
      </div>

      {/* 응시 progress + 타이머 + 끝내기 — 스크롤 시 sticky 로 항상 노출. */}
      <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-2 z-10 mb-4 rounded-2xl border px-3.5 py-2.5 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums"
            data-testid="sheet-progress"
          >
            <CheckCircle2Icon className="size-4 text-emerald-600" />
            응답 {totalAnswered} / {totalProblems}
          </span>
          {flagged.size > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              data-testid="sheet-flag-count"
            >
              <BookmarkIcon className="size-3 fill-current" />
              다시 볼 문항 {flagged.size}
            </span>
          ) : null}
          {graded && !isExam ? (
            <Pill tone="emerald">
              채점 완료 · {correctCount}/{totalProblems}
            </Pill>
          ) : null}
          {timerText ? (
            <span
              className="border-border inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs font-semibold tabular-nums"
              data-testid="exam-timer"
            >
              <TimerIcon className="size-3" />
              {timerText}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-full"
            onClick={() => setNavOpen((v) => !v)}
            data-testid="sheet-nav-toggle"
          >
            <LayoutGridIcon className="size-3.5" /> 네비
          </Button>
          <div className="ml-auto inline-flex gap-2">
            {!isExam && !graded ? (
              <Button
                size="sm"
                className="h-9 rounded-full"
                onClick={onGrade}
                disabled={totalAnswered === 0}
                data-testid="sheet-grade"
              >
                <BookOpenCheckIcon className="size-3.5" /> 채점하기
              </Button>
            ) : null}
            {session.completedAt ? (
              <Button asChild size="sm" className="h-9 rounded-full">
                <Link
                  to={`/latest/mcq/${pack.packId}/result/${session.sessionId}`}
                >
                  결과 보기
                </Link>
              </Button>
            ) : (
              <Button
                size="sm"
                variant={graded || isExam ? "default" : "outline"}
                className="h-9 rounded-full"
                onClick={() => {
                  // feat §A — 미응답 있으면 모달로 안내, 없으면 단순 confirm.
                  const skipped = problems.length - Object.keys(selected).length;
                  if (skipped > 0) {
                    setConfirmFinishOpen(true);
                  } else {
                    const ok = confirm(
                      isExam
                        ? "시험을 끝내고 결과를 확인하시겠습니까?"
                        : "응시를 종료하고 결과 통계를 확인하시겠습니까?",
                    );
                    if (ok) completeSession();
                  }
                }}
                disabled={completeFetcher.state !== "idle"}
                data-testid="sheet-finish"
              >
                <FlagIcon className="size-3.5" />{" "}
                {isExam ? "시험 끝내기" : "결과 보기"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* feat §A — 문항 네비게이터 그리드. toggle 노출. */}
      {navOpen ? (
        <div
          className="border-border bg-card mb-4 rounded-2xl border p-3 shadow-sm"
          data-testid="sheet-nav-grid"
        >
          <div className="text-muted-foreground mb-2 flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1">
              <span className="bg-emerald-500 inline-block size-2 rounded-full" />
              응답
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="border-border inline-block size-2 rounded-full border bg-background" />
              미응답
            </span>
            <span className="inline-flex items-center gap-1">
              <BookmarkIcon className="size-2.5 fill-amber-500 text-amber-500" />
              다시 볼 문제
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {problems.map((p, idx) => {
              const answered = selected[p.problemId] !== undefined;
              const flag = flagged.has(p.problemId);
              return (
                <button
                  key={p.problemId}
                  type="button"
                  onClick={() => jumpTo(idx)}
                  className={cn(
                    "relative inline-flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold tabular-nums transition-colors",
                    answered
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border bg-background text-muted-foreground hover:border-primary",
                  )}
                  data-testid={`sheet-nav-cell-${idx + 1}`}
                  aria-label={`${idx + 1}번 문항${answered ? " (응답)" : " (미응답)"}${flag ? " (다시 볼 문제)" : ""}`}
                >
                  {idx + 1}
                  {flag ? (
                    <BookmarkIcon
                      className="absolute -top-1 -right-1 size-3 fill-amber-500 text-amber-500"
                      strokeWidth={0}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <ol className="space-y-5">
        {problems.map((problem, idx) => (
          <li key={problem.problemId} id={`p-${idx + 1}`}>
            <ProblemBlock
              problem={problem}
              index={idx + 1}
              selectedChoice={selected[problem.problemId] ?? null}
              graded={graded}
              isExam={isExam}
              flagged={flagged.has(problem.problemId)}
              onSelect={(ci) => onSelect(problem, ci)}
              onToggleFlag={() => toggleFlag(problem.problemId)}
            />
          </li>
        ))}
      </ol>

      {/* feat §A — 미응답 확인 모달. 강제 X — 실전이므로 그래도 제출 허용. */}
      {confirmFinishOpen ? (
        <UnansweredModal
          problems={problems}
          selected={selected}
          isExam={isExam}
          onJump={(idx) => {
            setConfirmFinishOpen(false);
            jumpTo(idx);
          }}
          onCancel={() => setConfirmFinishOpen(false)}
          onProceed={() => {
            setConfirmFinishOpen(false);
            completeSession();
          }}
        />
      ) : null}

      {/* 하단 끝내기 — sticky 헤더와 별개로 한 번 더 노출. */}
      <div className="border-border mt-8 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-muted-foreground text-xs tabular-nums">
          응답 {totalAnswered} / {totalProblems}
          {!isExam && graded ? ` · 정답 ${correctCount}/${totalProblems}` : ""}
        </p>
        <div className="inline-flex gap-2">
          {!isExam && !graded ? (
            <Button
              className="rounded-full"
              onClick={onGrade}
              disabled={totalAnswered === 0}
              data-testid="sheet-grade-bottom"
            >
              <BookOpenCheckIcon className="size-4" /> 전체 채점하기
            </Button>
          ) : null}
          <Form
            method="post"
            action="/api/study/session-complete"
            onSubmit={(e) => {
              if (!confirm("응시를 종료하고 결과 통계를 확인하시겠습니까?")) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="sessionId" value={session.sessionId} />
            <input
              type="hidden"
              name="redirectTo"
              value={`/latest/mcq/${pack.packId}/result/${session.sessionId}`}
            />
            <Button
              type="submit"
              variant={graded || isExam ? "default" : "outline"}
              className="rounded-full"
              data-testid="sheet-finish-bottom"
            >
              <FlagIcon className="size-4" /> 결과 페이지로 이동
            </Button>
          </Form>
        </div>
      </div>
    </McqAreaShell>
  );
}

function ProblemBlock({
  problem,
  index,
  selectedChoice,
  graded,
  isExam,
  flagged,
  onSelect,
  onToggleFlag,
}: {
  problem: ProblemDetail;
  index: number;
  selectedChoice: number | null;
  graded: boolean;
  isExam: boolean;
  flagged: boolean;
  onSelect: (choiceIndex: number) => void;
  onToggleFlag: () => void;
}) {
  const showAnswers = graded && !isExam;
  return (
    <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
      <div className="border-border bg-muted/40 flex flex-wrap items-start gap-2 border-b px-4 py-3">
        <span className="bg-background border-border inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums">
          {index}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <Pill tone="primary">{ORIGIN_LABEL[problem.origin]}</Pill>
          <Pill tone="outline">{FORMAT_LABEL[problem.format]}</Pill>
          {problem.polarity ? (
            <Pill tone="outline">{POLARITY_LABEL[problem.polarity]}</Pill>
          ) : null}
          {problem.scope ? (
            <Pill tone="outline">{SCOPE_LABEL[problem.scope]}</Pill>
          ) : null}
          {problem.year ? (
            <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
              {problem.year}년
              {problem.examRoundNo ? ` ${problem.examRoundNo}회` : ""}
              {problem.problemNumber ? ` · ${problem.problemNumber}번` : ""}
            </span>
          ) : null}
          {/* feat §A — 다시 볼 문제 플래그 toggle. */}
          <button
            type="button"
            onClick={onToggleFlag}
            aria-pressed={flagged}
            data-testid={`sheet-flag-${index}`}
            aria-label={flagged ? "다시 볼 문제 해제" : "다시 볼 문제로 표시"}
            className={cn(
              "border-border ml-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
              flagged
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            <BookmarkIcon
              className={cn("size-3.5", flagged && "fill-current")}
              strokeWidth={flagged ? 0 : 2}
            />
          </button>
        </div>
      </div>
      <div className="space-y-4 px-4 py-4">
        {MD_IMAGE_RE.test(problem.bodyMd) ? (
          <MarkdownView text={problem.bodyMd} className="text-[15px]" />
        ) : (
          <p className="text-[15px] leading-relaxed font-medium whitespace-pre-line">
            {problem.bodyMd}
          </p>
        )}

        {problem.boxItems.length > 0 ? (
          <div className="border-foreground/30 bg-muted/40 rounded-xl border-2 px-4 py-3">
            <ul className="space-y-1.5">
              {problem.boxItems.map((bi) => (
                <li
                  key={bi.boxItemId}
                  className="flex gap-2 text-sm leading-relaxed"
                >
                  <span className="text-foreground/80 shrink-0 font-semibold">
                    {bi.marker}
                  </span>
                  <span className="flex-1 whitespace-pre-line">
                    {bi.bodyMd}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="space-y-2">
          {problem.choices.map((c) => {
            const isSelected = selectedChoice === c.choiceIndex;
            const showCorrect = showAnswers && c.isCorrect;
            const showWrong = showAnswers && isSelected && !c.isCorrect;
            const locked = showAnswers;
            return (
              <li key={c.choiceId}>
                <button
                  type="button"
                  data-testid={`sheet-choice-${index}-${c.choiceIndex}`}
                  onClick={() => !locked && onSelect(c.choiceIndex)}
                  disabled={locked}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    locked
                      ? "cursor-default"
                      : "hover:bg-accent cursor-pointer",
                    isSelected && !locked && "border-primary bg-primary/[0.06]",
                    !isSelected && !showCorrect && !showWrong && "border-border",
                    showCorrect &&
                      "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
                    showWrong &&
                      "border-rose-500 bg-rose-50 dark:bg-rose-950/30",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                      isSelected && !locked
                        ? "border-primary text-link"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {c.choiceIndex}
                  </span>
                  <span className="flex-1 whitespace-pre-line">
                    {c.bodyMd}
                  </span>
                  {showCorrect ? (
                    <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600" />
                  ) : null}
                  {showWrong ? (
                    <CircleXIcon className="size-5 shrink-0 text-rose-600" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        {showAnswers ? <ExplanationBlock problem={problem} /> : null}
      </div>
    </div>
  );
}

function ExplanationBlock({ problem }: { problem: ProblemDetail }) {
  const correctChoiceBody =
    problem.choices.find((c) => c.isCorrect)?.bodyMd ?? null;
  return (
    <div className="border-border space-y-2 rounded-xl border border-dashed p-4">
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
        해설
      </p>
      {problem.boxItems.length > 0
        ? problem.boxItems.map((bi) => {
            // oxIneligible(정오문제 부적격)은 풀이 O/X 표시와 별개 개념 → 무시.
            const truth: "O" | "X" | null = deriveDisplayBoxItemOx({
              oxTruth: bi.oxTruth,
              explanationMd: bi.explanationMd,
              polarity: problem.polarity,
              format: problem.format,
              marker: bi.marker,
              correctChoiceBody,
              allMarkers: problem.boxItems.map((b) => b.marker),
            });
            return (
              <div
                key={bi.boxItemId}
                className="flex items-start gap-2 text-sm"
              >
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    truth === "O"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                      : truth === "X"
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {bi.marker}
                </span>
                <p className="flex-1">
                  <span className="font-semibold">{truth ?? "—"}</span>
                  {bi.explanationMd ? (
                    <span className="text-muted-foreground ml-2">
                      {truth
                        ? stripLeadingOxMark(bi.explanationMd)
                        : bi.explanationMd}
                    </span>
                  ) : null}
                </p>
              </div>
            );
          })
        : null}
      {problem.boxItems.length > 0 ? (
        <div className="border-border border-t" />
      ) : null}
      {problem.choices.map((c) => {
        // mc_short·mc_case: 정오문제 적격성과 무관하게 지문 진위 O/X 표시.
        const derivedOx =
          c.oxTruth ??
          deriveDisplayChoiceOx({
            polarity: problem.polarity,
            format: problem.format,
            isCorrect: c.isCorrect,
          });
        const label =
          problem.format === "mc_box"
            ? c.isCorrect
              ? "정답"
              : ""
            : (derivedOx ?? (c.isCorrect ? "정답" : ""));
        const tone = c.isCorrect
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
          : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200";
        return (
          <div key={c.choiceId} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                tone,
              )}
            >
              {c.choiceIndex}
            </span>
            <p className="flex-1">
              <span className="font-semibold">{label || "—"}</span>
              {c.explanationMd ? (
                <span className="text-muted-foreground ml-2">
                  {label
                    ? stripLeadingOxMark(c.explanationMd)
                    : c.explanationMd}
                </span>
              ) : null}
            </p>
          </div>
        );
      })}
      {problem.explanationMd ? (
        <div className="border-border border-t pt-2 text-sm leading-relaxed">
          <p className="text-muted-foreground mb-1 text-xs font-mono font-semibold tracking-[0.06em] uppercase">
            종합 해설
          </p>
          {MD_IMAGE_RE.test(problem.explanationMd) ||
          MD_FORMAT_RE.test(problem.explanationMd) ? (
            <MarkdownView text={problem.explanationMd} />
          ) : (
            <p className="whitespace-pre-line">{problem.explanationMd}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// feat §A — 제출 직전 미응답 안내 모달. 강제 X — 실전이므로 그대로 제출 가능.
function UnansweredModal({
  problems,
  selected,
  isExam,
  onJump,
  onCancel,
  onProceed,
}: {
  problems: ProblemDetail[];
  selected: SelectedChoiceState;
  isExam: boolean;
  onJump: (idx: number) => void;
  onCancel: () => void;
  onProceed: () => void;
}) {
  const unansweredIdxs: number[] = [];
  problems.forEach((p, idx) => {
    if (selected[p.problemId] === undefined) unansweredIdxs.push(idx);
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="sheet-unanswered-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="border-border bg-card max-h-[80vh] w-full max-w-md overflow-auto rounded-2xl border p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold tracking-tight">
          미응답 {unansweredIdxs.length}문항이 있습니다
        </h2>
        <p className="text-muted-foreground mb-3 text-xs">
          {isExam
            ? "시험 모드에서는 그래도 제출하면 미응답이 0점으로 처리됩니다."
            : "그래도 제출하면 결과 통계로 이동합니다."}
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {unansweredIdxs.map((idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onJump(idx)}
              className="border-border hover:border-primary inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-bold tabular-nums"
              data-testid={`sheet-unanswered-jump-${idx + 1}`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            data-testid="sheet-unanswered-cancel"
          >
            계속 풀기
          </Button>
          <Button
            variant={isExam ? "destructive" : "default"}
            size="sm"
            onClick={onProceed}
            data-testid="sheet-unanswered-proceed"
          >
            그래도 제출
          </Button>
        </div>
      </div>
    </div>
  );
}
