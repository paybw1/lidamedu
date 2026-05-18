// 운영자 채점 — 회차의 제출 목록. 채점 안 된 학생부터.
// P6 REVIEW QUEUE 디자인. cluster="gs".

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  ClockIcon,
  InboxIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Bar,
  Chip,
  IndexTable,
  StatusChip,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import {
  getGsRound,
  listGradingTargets,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-grade-list";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 채점 | Lidam Patent Attorney Academy`
      : "GS 채점 | Lidam Patent Attorney Academy",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const roundId = params.roundId;
  if (!roundId) throw data("Missing roundId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const round = await getGsRound(client, roundId);
  if (!round) throw data("Round not found", { status: 404 });

  const targets = await listGradingTargets(client, roundId);
  // 정렬: 미채점 > 채점 중 > 완료, 그 안에서는 제출 시각 빠른 순(먼저 제출한 사람부터).
  targets.sort((a, b) => {
    const aDone = a.submission.gradedAt != null;
    const bDone = b.submission.gradedAt != null;
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aSubmitted = a.submission.submittedAt;
    const bSubmitted = b.submission.submittedAt;
    if (aSubmitted && bSubmitted)
      return new Date(aSubmitted).getTime() - new Date(bSubmitted).getTime();
    if (aSubmitted) return -1;
    if (bSubmitted) return 1;
    return 0;
  });

  return { round, targets, role };
}

export default function AdminGsGradeList({ loaderData }: Route.ComponentProps) {
  const { round, targets, role } = loaderData;
  const submitted = targets.filter((t) => t.submission.submittedAt != null);
  const inProgress = targets.filter((t) => t.submission.submittedAt == null);
  const gradedCount = submitted.filter((t) => t.submission.gradedAt != null).length;
  const ungraded = submitted.length - gradedCount;

  return (
    <AdminShell
      cluster="gs"
      role={role}
      title={round.title}
      desc={`${LAW_SUBJECTS[round.subject]?.name ?? round.subject} · 제출 ${submitted.length}건 · 채점 대기 ${ungraded}건`}
      headerRight={
        ungraded > 0 ? (
          <Chip tone="coral">
            <ClockIcon className="size-3" /> 미채점 {ungraded}
          </Chip>
        ) : submitted.length > 0 ? (
          <Chip tone="emerald">
            <CheckCircle2Icon className="size-3" /> 전원 채점 완료
          </Chip>
        ) : undefined
      }
      width={1280}
    >
      {submitted.length === 0 ? (
        <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border p-12 text-center shadow-sm">
          <InboxIcon className="text-muted-foreground/60 size-8" />
          <p className="text-sm font-semibold">아직 제출된 답안이 없습니다</p>
          <p className="text-muted-foreground text-xs">
            학생이 답안을 제출하면 이곳에 모입니다.
          </p>
        </div>
      ) : (
        <IndexTable
          headers={[
            { label: "학생" },
            { label: "제출", width: "160px" },
            { label: "채점 진행", width: "160px" },
            { label: "총점", align: "right", width: "100px" },
            { label: "상태", width: "120px" },
            { label: "", width: "80px" },
          ]}
          minWidth={640}
        >
          {submitted.map((t) => {
            const pct =
              t.answersTotal > 0
                ? Math.round((t.answersGraded / t.answersTotal) * 100)
                : 0;
            const gradeStatus =
              t.submission.gradedAt != null
                ? "done"
                : t.answersGraded > 0
                  ? "partial"
                  : "pending";
            return (
              <TR
                key={t.submission.submissionId}
                testid={`grade-row-${t.submission.submissionId}`}
              >
                <TD>
                  <span className="font-semibold">
                    {t.studentName ?? (
                      <span className="text-muted-foreground font-normal italic">
                        이름 미설정
                      </span>
                    )}
                  </span>
                  <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tabular-nums">
                    {t.submission.userId.slice(0, 8)}
                  </p>
                </TD>
                <TD soft mono>
                  {formatDateTime(t.submission.submittedAt)}
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Bar
                      value={t.answersGraded}
                      max={t.answersTotal}
                      tone={
                        pct === 100
                          ? "emerald"
                          : pct > 0
                            ? "amber"
                            : "coral"
                      }
                      className="w-16"
                    />
                    <span className="text-muted-foreground tabular-nums text-[11px]">
                      {t.answersGraded}/{t.answersTotal}
                    </span>
                  </div>
                </TD>
                <TD align="right" mono>
                  {t.submission.totalScore != null
                    ? `${t.submission.totalScore}점`
                    : "—"}
                </TD>
                <TD>
                  {gradeStatus === "done" ? (
                    <Chip tone="emerald">
                      <CheckCircle2Icon className="size-3" /> 채점 완료
                    </Chip>
                  ) : gradeStatus === "partial" ? (
                    <Chip tone="amber">
                      <ClipboardCheckIcon className="size-3" /> 채점 중
                    </Chip>
                  ) : (
                    <StatusChip status="pending" label="채점 대기" />
                  )}
                </TD>
                <TD>
                  <Link
                    to={`/admin/gs/${round.roundId}/grade/${t.submission.submissionId}`}
                    data-testid={`grade-link-${t.submission.submissionId}`}
                    className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                  >
                    채점 <ArrowRightIcon className="size-3" />
                  </Link>
                </TD>
              </TR>
            );
          })}
        </IndexTable>
      )}

      {/* 진행 중 (미제출) */}
      {inProgress.length > 0 ? (
        <div className="mt-6">
          <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            진행 중 (미제출) · {inProgress.length}
          </p>
          <IndexTable
            headers={[
              { label: "학생" },
              { label: "시작", width: "160px" },
              { label: "상태", width: "120px" },
            ]}
            minWidth={400}
          >
            {inProgress.map((t) => (
              <TR key={t.submission.submissionId}>
                <TD>
                  {t.studentName ?? (
                    <span className="text-muted-foreground italic">
                      {t.submission.userId.slice(0, 8)}
                    </span>
                  )}
                </TD>
                <TD soft mono>
                  {formatDateTime(t.submission.startedAt)}
                </TD>
                <TD>
                  <StatusChip status="pending" label="답안 작성 중" />
                </TD>
              </TR>
            ))}
          </IndexTable>
        </div>
      ) : null}
    </AdminShell>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
