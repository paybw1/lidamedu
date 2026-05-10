// 온라인 GS — 학생 진입. Phase 1: 노출 회차 목록 + 내 응시 이력.

import {
  CalendarClockIcon,
  ChartLineIcon,
  ClipboardListIcon,
  CoinsIcon,
  UsersIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
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
  { title: "온라인 GS | Lidam Edu" },
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
const PHASE_TONE: Record<RoundView["phase"], string> = {
  upcoming: "bg-muted text-muted-foreground",
  open: "bg-emerald-600 text-white",
  closed: "bg-slate-500 text-white",
};

export default function OnlineGs({ loaderData }: Route.ComponentProps) {
  const { views, peerAssignments, mySeries, points } = loaderData;

  const open = views.filter((v) => v.phase === "open");
  const upcoming = views.filter((v) => v.phase === "upcoming");
  const closed = views.filter((v) => v.phase === "closed");
  const peerPending = peerAssignments.filter((a) => a.submittedAt == null);
  const peerDone = peerAssignments.filter((a) => a.submittedAt != null);

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <ClipboardListIcon className="size-3.5" /> 온라인 GS
        </p>
        <h1 className="text-2xl font-bold tracking-tight">정기 모의고사</h1>
        <p className="text-muted-foreground text-sm">
          공개된 회차에 응시해 답안을 작성하면 강사가 채점합니다. (응시·채점은 다음
          단계에서 활성화 예정)
        </p>
      </header>

      <Link to="/gs/points" viewTransition className="mb-6 block">
        <Card className="hover:border-primary transition-colors">
          <CardContent className="flex items-center gap-3 py-4">
            <CoinsIcon className="text-amber-500 size-6" />
            <div className="flex-1">
              <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                내 GS 포인트
              </p>
              <p className="text-foreground text-2xl font-bold tabular-nums">
                {points.balance}
                <span className="text-muted-foreground ml-1 text-sm font-normal">
                  P
                </span>
              </p>
            </div>
            <span className="text-muted-foreground text-xs">
              이력 보기 →
            </span>
          </CardContent>
        </Card>
      </Link>

      {mySeries.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight">
            <ChartLineIcon className="size-3.5" />
            내 시리즈 추이
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {mySeries.map((s) => (
              <Link
                key={s.seriesId}
                to={`/gs/series/${s.seriesId}`}
                viewTransition
                className="block"
              >
                <Card className="hover:border-primary transition-colors">
                  <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                    <Badge variant="secondary" className="text-[10px]">
                      {LAW_SUBJECTS[s.subject]?.name ?? s.subject}
                    </Badge>
                    <span className="font-medium">{s.title}</span>
                    <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
                      응시 {s.roundsTaken} / {s.expectedRounds}회
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {peerAssignments.length > 0 ? (
        <PeerAssignmentSection pending={peerPending} done={peerDone} />
      ) : null}

      {views.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            현재 공개된 GS 회차가 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {open.length > 0 ? (
            <Section title="응시 가능" views={open} />
          ) : null}
          {upcoming.length > 0 ? (
            <Section title="예정" views={upcoming} />
          ) : null}
          {closed.length > 0 ? (
            <Section title="종료" views={closed} muted />
          ) : null}
        </div>
      )}
    </div>
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
  return (
    <section className="mb-6">
      <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight">
        <UsersIcon className="size-3.5" />
        동료 채점 배정
        <span className="text-muted-foreground ml-1 text-xs font-normal tabular-nums">
          미완료 {pending.length} / 완료 {done.length}
        </span>
      </h2>
      <div className="space-y-2">
        {pending.map((a) => (
          <Link
            key={a.assignmentId}
            to={`/gs/peer-review/${a.assignmentId}`}
            viewTransition
            className="block"
          >
            <Card className="hover:border-primary transition-colors">
              <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <Badge className="bg-amber-500 text-white text-[10px] hover:bg-amber-500">
                  진행 중
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {LAW_SUBJECTS[a.roundSubject as keyof typeof LAW_SUBJECTS]
                    ?.name ?? a.roundSubject}
                </Badge>
                <span className="font-medium">{a.roundTitle}</span>
                <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
                  진행 {a.questionsScored}/{a.questionsTotal}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {done.map((a) => (
          <Link
            key={a.assignmentId}
            to={`/gs/peer-review/${a.assignmentId}`}
            viewTransition
            className="block opacity-70"
          >
            <Card className="hover:border-primary transition-colors">
              <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <Badge className="bg-emerald-600 text-white text-[10px] hover:bg-emerald-600">
                  완료
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {LAW_SUBJECTS[a.roundSubject as keyof typeof LAW_SUBJECTS]
                    ?.name ?? a.roundSubject}
                </Badge>
                <span className="font-medium">{a.roundTitle}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Section({
  title,
  views,
  muted = false,
}: {
  title: string;
  views: RoundView[];
  muted?: boolean;
}) {
  return (
    <section>
      <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
        {title} ({views.length})
      </h2>
      <div className={cn("space-y-2", muted && "opacity-80")}>
        {views.map((v) => (
          <RoundCard key={v.round.roundId} view={v} />
        ))}
      </div>
    </section>
  );
}

function RoundCard({ view }: { view: RoundView }) {
  const { round, phase, ownSubmission } = view;
  const subjectMeta = LAW_SUBJECTS[round.subject];
  const submitted = ownSubmission?.submittedAt != null;
  const graded = ownSubmission?.gradedAt != null;
  const status =
    graded
      ? `채점 완료 · ${ownSubmission?.totalScore ?? "?"}점`
      : submitted
        ? "제출 완료 · 채점 대기"
        : ownSubmission
          ? "응시 시작됨 (미제출)"
          : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("text-[10px]", PHASE_TONE[phase])}>
            {PHASE_LABEL[phase]}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {subjectMeta?.name ?? round.subject}
          </Badge>
          <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 text-[11px] tabular-nums">
            <CalendarClockIcon className="size-3" />
            {formatRange(round.startAt, round.endAt)} · {round.durationMin}분
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <h3 className="mb-1 font-semibold">{round.title}</h3>
        {round.descriptionMd ? (
          <p className="text-muted-foreground text-sm whitespace-pre-line">
            {round.descriptionMd}
          </p>
        ) : null}
        {status ? (
          <p className="text-primary mt-2 text-xs font-medium">{status}</p>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          {phase === "upcoming" ? (
            <span className="text-muted-foreground text-xs">
              {formatCountdown(round.startAt)}
            </span>
          ) : null}
          {phase === "open" && !submitted ? (
            <Button asChild size="sm" className="ml-auto h-8">
              <Link to={`/gs/${round.roundId}/take`} viewTransition>
                {ownSubmission ? "이어서 응시" : "응시 시작"} →
              </Link>
            </Button>
          ) : null}
          {submitted && !graded ? (
            <Link
              to={`/gs/${round.roundId}/result`}
              className="text-muted-foreground text-xs hover:underline ml-auto"
            >
              제출 답안 보기 →
            </Link>
          ) : null}
          {graded ? (
            <Link
              to={`/gs/${round.roundId}/result`}
              className="text-primary text-xs hover:underline ml-auto"
            >
              결과 보기 →
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
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
