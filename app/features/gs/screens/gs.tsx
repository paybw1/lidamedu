// 온라인 GS — 학생 진입. Phase 1: 노출 회차 목록 + 내 응시 이력.
// 커뮤니티 셸 reskin — 키트 lidam-community/GsHubScreen 디자인.

import {
  ArrowRightIcon,
  CalendarClockIcon,
  CheckIcon,
  ChartLineIcon,
  ClipboardListIcon,
  CoinsIcon,
  PencilLineIcon,
  UsersIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import {
  Chip,
  EmptyState,
  Section,
} from "~/features/community/components/community-ui";
import {
  type GsRound,
  type GsSubmissionSummary,
  listMySeries,
  listOwnSubmissions,
  listVisibleGsRounds,
} from "~/features/gs/queries.server";
import { listOwnPeerAssignments } from "~/features/gs/queries-peer.server";
import { getMyPointsBalance } from "~/features/gs/queries-distinctions.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/gs";

export const meta: Route.MetaFunction = () => [
  { title: "온라인 GS | Lidam Patent Attorney Academy" },
];

interface RoundView {
  round: GsRound;
  phase: "upcoming" | "open" | "closed";
  ownSubmission: GsSubmissionSummary | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [rounds, ownSubmissions, peerAssignments, mySeries, points] =
    await Promise.all([
      listVisibleGsRounds(client),
      listOwnSubmissions(client, user.id),
      listOwnPeerAssignments(client, user.id),
      listMySeries(client),
      getMyPointsBalance(client),
    ]);
  const now = Date.now();
  const subByRound = new Map<string, GsSubmissionSummary>();
  for (const s of ownSubmissions) subByRound.set(s.roundId, s);

  const views: RoundView[] = rounds.map((round) => {
    const start = new Date(round.startAt).getTime();
    const end = new Date(round.endAt).getTime();
    const phase: RoundView["phase"] =
      now < start ? "upcoming" : now > end || round.status === "closed" ? "closed" : "open";
    return {
      round,
      phase,
      ownSubmission: subByRound.get(round.roundId) ?? null,
    };
  });

  return { views, peerAssignments, mySeries, points };
}

const PHASE_LABEL: Record<RoundView["phase"], string> = {
  upcoming: "예정",
  open: "응시 가능",
  closed: "종료",
};

export default function OnlineGs({ loaderData }: Route.ComponentProps) {
  const { views, peerAssignments, mySeries, points } = loaderData;

  const open = views.filter((v) => v.phase === "open");
  const upcoming = views.filter((v) => v.phase === "upcoming");
  const closed = views.filter((v) => v.phase === "closed");
  const peerPending = peerAssignments.filter((a) => a.submittedAt == null);
  const peerDone = peerAssignments.filter((a) => a.submittedAt != null);

  return (
    <MockExamShell
      category="gs"
      title="2차 모의고사"
      desc={
        <>
          공개된 회차에 응시해 답안을 작성하면 강사가 채점합니다. 진행 중{" "}
          <strong className="text-foreground">{open.length}</strong> · 예정{" "}
          {upcoming.length} · 마감 {closed.length}.
        </>
      }
    >
      {/* §4 — 논점 추출 훈련 진입 카드 (가벼운 반복 학습) */}
      <Link
        to="/gs/issues"
        viewTransition
        className="border-primary/20 bg-primary/[0.05] hover:border-primary/40 group mb-3 flex items-center gap-3.5 rounded-2xl border p-4 transition-colors"
      >
        <span className="bg-primary text-primary-foreground inline-flex size-11 shrink-0 items-center justify-center rounded-xl">
          <PencilLineIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-link font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            논점 추출 훈련
          </p>
          <p className="text-foreground text-base font-bold tracking-tight">
            답안 전체 말고 핵심 논점만 — 백지에서 빠르게 반복
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            사례 → 떠올린 논점 적기 → 모범과 대조 → 빠뜨린 논점의 조문/판례로 이동
          </p>
        </div>
        <span className="border-border text-foreground/80 group-hover:border-foreground/30 inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-[13px] font-semibold transition-colors">
          시작 <ArrowRightIcon className="size-3.5" />
        </span>
      </Link>

      {/* GS 포인트 카드 */}
      <Link
        to="/gs/points"
        viewTransition
        className="border-amber-500/20 bg-amber-500/[0.07] hover:border-amber-500/40 group flex items-center gap-3.5 rounded-2xl border p-4 transition-colors"
      >
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
          <CoinsIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-amber-700 dark:text-amber-400 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            GS 포인트
          </p>
          <p className="text-foreground text-2xl font-extrabold tracking-tight tabular-nums">
            {points.balance.toLocaleString("ko-KR")}
            <span className="text-muted-foreground ml-1 text-sm font-semibold">
              P
            </span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            누적 거래 {points.txCount}건
          </p>
        </div>
        <span className="border-border text-foreground/80 group-hover:border-foreground/30 inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-[13px] font-semibold transition-colors">
          이력 보기 <ArrowRightIcon className="size-3.5" />
        </span>
      </Link>

      {mySeries.length > 0 ? (
        <Section eyebrow="내 시리즈 추이">
          <div className="grid gap-3 sm:grid-cols-2">
            {mySeries.map((s) => {
              const pct =
                s.expectedRounds > 0
                  ? Math.min(100, (s.roundsTaken / s.expectedRounds) * 100)
                  : 0;
              return (
                <Link
                  key={s.seriesId}
                  to={`/gs/series/${s.seriesId}`}
                  viewTransition
                  className="border-border bg-card hover:border-primary/40 block rounded-2xl border p-4 transition-colors"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Chip tone="primary">
                      {LAW_SUBJECTS[s.subject]?.name ?? s.subject}
                    </Chip>
                    <span className="text-foreground ml-auto font-mono text-xs font-bold tabular-nums">
                      {s.roundsTaken}/{s.expectedRounds}회
                    </span>
                  </div>
                  <p className="text-foreground mb-2.5 font-semibold tracking-tight">
                    {s.title}
                  </p>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </Section>
      ) : null}

      {peerAssignments.length > 0 ? (
        <PeerAssignmentSection pending={peerPending} done={peerDone} />
      ) : null}

      {views.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ClipboardListIcon}
            tone="subdued"
            title="공개된 GS 회차가 없습니다"
            body="새 모의고사 회차가 공개되면 이곳에 진행 중·예정·마감 순으로 모입니다."
          />
        </div>
      ) : (
        <>
          {open.length > 0 ? (
            <RoundsSection title="진행 중" views={open} tone="open" />
          ) : null}
          {upcoming.length > 0 ? (
            <RoundsSection title="예정" views={upcoming} tone="upcoming" />
          ) : null}
          {closed.length > 0 ? (
            <RoundsSection title="마감" views={closed} tone="closed" />
          ) : null}
        </>
      )}
    </MockExamShell>
  );
}

function PeerAssignmentSection({
  pending,
  done,
}: {
  pending: ReturnType<typeof listOwnPeerAssignments> extends Promise<infer T>
    ? T
    : never;
  done: ReturnType<typeof listOwnPeerAssignments> extends Promise<infer T>
    ? T
    : never;
}) {
  // 라운드 단위로 묶기 — 한 reviewer 가 같은 라운드에서 여러 답안을 받았으면
  // 매트릭스(/gs/peer-review/round/:roundId) 진입이 기본.
  const byRound = new Map<
    string,
    {
      roundId: string;
      roundTitle: string;
      roundSubject: string;
      pending: typeof pending;
      done: typeof done;
    }
  >();
  for (const a of pending) {
    const r = byRound.get(a.roundId) ?? {
      roundId: a.roundId,
      roundTitle: a.roundTitle,
      roundSubject: a.roundSubject,
      pending: [],
      done: [],
    };
    r.pending.push(a);
    byRound.set(a.roundId, r);
  }
  for (const a of done) {
    const r = byRound.get(a.roundId) ?? {
      roundId: a.roundId,
      roundTitle: a.roundTitle,
      roundSubject: a.roundSubject,
      pending: [],
      done: [],
    };
    r.done.push(a);
    byRound.set(a.roundId, r);
  }
  const groups = [...byRound.values()];
  const allComplete = pending.length === 0;

  return (
    <Section
      eyebrow="동료 채점 배정"
      right={
        <Chip tone={allComplete ? "emerald" : "amber"}>
          완료 {done.length}/{pending.length + done.length}건
        </Chip>
      }
    >
      <div className="space-y-2">
        {groups.map((g) => {
          const total = g.pending.length + g.done.length;
          const allDone = g.pending.length === 0;
          return (
            <Link
              key={g.roundId}
              to={`/gs/peer-review/round/${g.roundId}`}
              viewTransition
              className={cn(
                "border-border bg-card hover:border-primary/40 flex items-center gap-3.5 rounded-2xl border p-3.5 transition-colors",
                allDone && "opacity-80",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-9 shrink-0 items-center justify-center rounded-[10px]",
                  allDone
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                )}
              >
                {allDone ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <PencilLineIcon className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="primary">
                    {LAW_SUBJECTS[g.roundSubject as keyof typeof LAW_SUBJECTS]
                      ?.name ?? g.roundSubject}
                  </Chip>
                  <span className="text-foreground font-semibold">
                    {g.roundTitle}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                  {allDone
                    ? "채점 완료"
                    : `배정 ${total}개 · 완료 ${g.done.length}/${total}`}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold",
                  allDone
                    ? "border-border text-foreground/80 border"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {allDone ? "결과 보기" : `매트릭스로 채점 (${total}개)`}
                <ArrowRightIcon className="size-3" />
              </span>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

function RoundsSection({
  title,
  views,
  tone,
}: {
  title: string;
  views: RoundView[];
  tone: RoundView["phase"];
}) {
  return (
    <Section eyebrow={`${title} · ${views.length}회`}>
      <div className={cn("space-y-2", tone === "closed" && "opacity-80")}>
        {views.map((v) => (
          <RoundCard key={v.round.roundId} view={v} />
        ))}
      </div>
    </Section>
  );
}

function RoundCard({ view }: { view: RoundView }) {
  const { round, phase, ownSubmission } = view;
  const subjectMeta = LAW_SUBJECTS[round.subject];
  const submitted = ownSubmission?.submittedAt != null;
  const graded = ownSubmission?.gradedAt != null;

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:gap-4">
      <Chip tone="primary" className="self-start">
        {subjectMeta?.name ?? round.subject}
      </Chip>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-foreground font-semibold tracking-tight">
            {round.title}
          </span>
          <Chip tone={phase === "open" ? "emerald" : "neutral"}>
            {PHASE_LABEL[phase]}
          </Chip>
          {graded ? (
            <Chip tone="primary">
              채점 완료 · {ownSubmission?.totalScore ?? "?"}점
            </Chip>
          ) : submitted ? (
            <Chip tone="coral">제출 완료 · 채점 대기</Chip>
          ) : ownSubmission ? (
            <Chip tone="amber">응시 중 (미제출)</Chip>
          ) : null}
        </div>
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums">
          <CalendarClockIcon className="size-3" />
          {formatRange(round.startAt, round.endAt)} · {round.durationMin}분
          {phase === "upcoming" ? (
            <span className="text-muted-foreground ml-1">
              · {formatCountdown(round.startAt)}
            </span>
          ) : null}
        </p>
        {round.descriptionMd ? (
          <p className="text-muted-foreground line-clamp-2 text-sm whitespace-pre-line">
            {round.descriptionMd}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        {phase === "open" && !submitted ? (
          <Button asChild size="sm" className="h-8 rounded-full">
            <Link to={`/gs/${round.roundId}/take`} viewTransition>
              {ownSubmission ? "이어서 응시" : "응시하기"}
              <ArrowRightIcon className="size-3" />
            </Link>
          </Button>
        ) : submitted && !graded ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 rounded-full"
          >
            <Link to={`/gs/${round.roundId}/result`} viewTransition>
              제출 답안 보기
              <ArrowRightIcon className="size-3" />
            </Link>
          </Button>
        ) : graded ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 rounded-full"
          >
            <Link to={`/gs/${round.roundId}/result`} viewTransition>
              결과 보기
              <ArrowRightIcon className="size-3" />
            </Link>
          </Button>
        ) : phase === "upcoming" ? (
          <span className="text-muted-foreground inline-flex h-8 items-center text-xs">
            대기
          </span>
        ) : null}
      </div>
    </div>
  );
}

function formatRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function formatCountdown(startIso: string): string {
  const ms = new Date(startIso).getTime() - Date.now();
  if (ms <= 0) return "곧 시작";
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hrs = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days >= 1) return `${days}일 ${hrs}시간 후 시작`;
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hrs}시간 ${mins}분 후 시작`;
}
