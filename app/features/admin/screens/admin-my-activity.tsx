// 운영자 "내 활동" (/admin/my-activity) — 내가 학생/반에 한 조치(상담 코멘트·과제 부여)와
// 상대 반응(학생 열람·과제 완수)을 한 타임라인에서. staff 게이트. 상세는 각 화면으로 드릴다운.
import {
  BugIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  ClockIcon,
  EyeOffIcon,
  MessageCircleQuestionIcon,
  MessageSquareIcon,
} from "lucide-react";
import { Link, data, redirect } from "react-router";

import type { BugReportStatus } from "~/features/bug-reports/labels";
import { QNA_STATUS_LABEL } from "~/features/qna/labels";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, MemberLink } from "~/features/admin/components/admin-ui";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import {
  type ActivityAssignment,
  type ActivityBug,
  type ActivityNote,
  type ActivityQna,
  getStaffActivity,
} from "../queries/staff-activity.server";

import type { Route } from "./+types/admin-my-activity";

export function meta() {
  return [{ title: "내 활동 | 운영관리" }];
}

type FilterKind = "all" | "unresponded";

const BUG_STATUS_LABEL: Record<BugReportStatus, string> = {
  open: "접수",
  in_progress: "처리중",
  done: "완료",
};

// 상담 코멘트가 "미반응"인가 — 학생에게 공유했는데 아직 안 읽음.
function noteUnresponded(n: ActivityNote): boolean {
  return n.visibility === "share_with_student" && !n.readAt;
}

// 과제가 "미반응"인가 — 대상이 있는데 아직 아무도 완수 안 함(부분 완수 포함).
function assignmentUnresponded(a: ActivityAssignment): boolean {
  return a.totalMembers > 0 && a.completedMembers < a.totalMembers;
}

// Q&A가 "미반응"인가 — 내게 배정됐는데 아직 답변 안 함.
function qnaUnresponded(q: ActivityQna): boolean {
  return !q.answered;
}

// 오류 신고가 "미반응"인가 — 아직 처리 완료(done) 아님.
function bugUnresponded(b: ActivityBug): boolean {
  return b.status !== "done";
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");

  const url = new URL(request.url);
  const filter: FilterKind =
    url.searchParams.get("filter") === "unresponded" ? "unresponded" : "all";

  const { notes, assignments, qnaAnswers, bugReports } =
    await getStaffActivity(user.id);

  const pendingNotes = notes.filter(noteUnresponded).length;
  const pendingAssignments = assignments.filter(assignmentUnresponded).length;
  const pendingQna = qnaAnswers.filter(qnaUnresponded).length;
  const pendingBugs = bugReports.filter(bugUnresponded).length;

  return {
    role,
    filter,
    notes,
    assignments,
    qnaAnswers,
    bugReports,
    pendingNotes,
    pendingAssignments,
    pendingQna,
    pendingBugs,
  };
}

// 상담 코멘트 + 과제 + Q&A + 오류신고를 시각 역순으로 합친 통합 타임라인 아이템.
type TimelineItem =
  | { kind: "note"; at: string; note: ActivityNote }
  | { kind: "assignment"; at: string; assignment: ActivityAssignment }
  | { kind: "qna"; at: string; qna: ActivityQna }
  | { kind: "bug"; at: string; bug: ActivityBug };

function buildTimeline(
  data: {
    notes: ActivityNote[];
    assignments: ActivityAssignment[];
    qnaAnswers: ActivityQna[];
    bugReports: ActivityBug[];
  },
  filter: FilterKind,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const note of data.notes) {
    if (filter === "unresponded" && !noteUnresponded(note)) continue;
    items.push({ kind: "note", at: note.createdAt, note });
  }
  for (const assignment of data.assignments) {
    if (filter === "unresponded" && !assignmentUnresponded(assignment))
      continue;
    items.push({ kind: "assignment", at: assignment.assignedAt, assignment });
  }
  for (const qna of data.qnaAnswers) {
    if (filter === "unresponded" && !qnaUnresponded(qna)) continue;
    // 정렬 기준: 답변했으면 답변시각, 아니면 질문 접수시각.
    items.push({ kind: "qna", at: qna.answeredAt ?? qna.createdAt, qna });
  }
  for (const bug of data.bugReports) {
    if (filter === "unresponded" && !bugUnresponded(bug)) continue;
    items.push({ kind: "bug", at: bug.createdAt, bug });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items;
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function AdminMyActivity({ loaderData }: Route.ComponentProps) {
  const {
    role,
    filter,
    notes,
    assignments,
    qnaAnswers,
    bugReports,
    pendingNotes,
    pendingAssignments,
    pendingQna,
    pendingBugs,
  } = loaderData;
  const timeline = buildTimeline(
    { notes, assignments, qnaAnswers, bugReports },
    filter,
  );
  const totalPending =
    pendingNotes + pendingAssignments + pendingQna + pendingBugs;

  const tabs: Array<{ value: FilterKind; label: string }> = [
    { value: "all", label: "전체" },
    { value: "unresponded", label: `미반응만${totalPending > 0 ? ` ${totalPending}` : ""}` },
  ];

  return (
    <AdminShell
      cluster="my-activity"
      role={role}
      title="내 활동"
      desc="내가 보낸 상담 코멘트·부여한 과제·Q&A 답변과 오류 신고를 한곳에서 보고, 상대의 반응(열람·완수·답변 대기·처리)을 바로 확인합니다."
      headerRight={
        <Chip tone={totalPending > 0 ? "amber" : "emerald"}>
          미반응 {totalPending}
        </Chip>
      }
    >
      <div className="p-5 md:p-8">
        {/* 요약 밴드 */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            Icon={MessageSquareIcon}
            label="상담 코멘트"
            total={notes.length}
            pending={pendingNotes}
            pendingLabel="미열람"
          />
          <SummaryCard
            Icon={ClipboardListIcon}
            label="부여한 과제"
            total={assignments.length}
            pending={pendingAssignments}
            pendingLabel="미완수"
          />
          <SummaryCard
            Icon={MessageCircleQuestionIcon}
            label="내 Q&A 답변"
            total={qnaAnswers.length}
            pending={pendingQna}
            pendingLabel="답변 대기"
          />
          <SummaryCard
            Icon={BugIcon}
            label="오류 신고"
            total={bugReports.length}
            pending={pendingBugs}
            pendingLabel="미처리"
          />
        </div>

        {/* 필터 탭 */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const active = t.value === filter;
            const to =
              t.value === "all"
                ? "/admin/my-activity"
                : `/admin/my-activity?filter=${t.value}`;
            return (
              <Link
                key={t.value}
                to={to}
                className={
                  active
                    ? "bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-semibold"
                    : "border-border text-muted-foreground hover:bg-muted rounded-full border px-3 py-1 text-xs"
                }
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {timeline.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
            {filter === "unresponded"
              ? "미반응 항목이 없습니다. 열람·완수·답변·처리가 모두 끝났습니다."
              : "아직 상담 코멘트·과제·Q&A 답변·오류 신고 내역이 없습니다."}
          </div>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {timeline.map((item) => {
              if (item.kind === "note")
                return <NoteRow key={`n-${item.note.noteId}`} note={item.note} />;
              if (item.kind === "assignment")
                return (
                  <AssignmentRow
                    key={`a-${item.assignment.assignmentId}`}
                    assignment={item.assignment}
                  />
                );
              if (item.kind === "qna")
                return <QnaRow key={`q-${item.qna.threadId}`} qna={item.qna} />;
              return <BugRow key={`b-${item.bug.reportId}`} bug={item.bug} />;
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

function SummaryCard({
  Icon,
  label,
  total,
  pending,
  pendingLabel,
}: {
  Icon: typeof MessageSquareIcon;
  label: string;
  total: number;
  pending: number;
  pendingLabel: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-3.5">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{total}</p>
      <p
        className={
          pending > 0
            ? "text-amber-600 dark:text-amber-400 mt-0.5 text-xs font-semibold"
            : "text-muted-foreground mt-0.5 text-xs"
        }
      >
        {pending > 0 ? `${pendingLabel} ${pending}` : "모두 확인됨"}
      </p>
    </div>
  );
}

function NoteRow({ note }: { note: ActivityNote }) {
  const isShared = note.visibility === "share_with_student";
  return (
    <li>
      <Link
        to={`/admin/students/${note.studentId}#notes`}
        className="hover:bg-muted/40 flex items-start gap-3 px-4 py-3"
      >
        <MessageSquareIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">상담 코멘트</span>
            <span className="text-muted-foreground">·</span>
            <MemberLink
              profileId={note.studentId}
              name={note.studentName ?? "회원"}
              className="font-medium"
            />
          </span>
          <span className="text-foreground/80 mt-0.5 block truncate text-[13px]">
            {note.preview}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-[11px]">
            {fmtDate(note.createdAt)}
          </span>
        </span>
        {!isShared ? (
          <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[11px]">
            <EyeOffIcon className="size-3" />
            내부 메모
          </span>
        ) : note.readAt ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-3" />
            열람함
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <ClockIcon className="size-3" />
            미열람
          </span>
        )}
      </Link>
    </li>
  );
}

function AssignmentRow({ assignment }: { assignment: ActivityAssignment }) {
  const done = assignment.completedMembers;
  const total = assignment.totalMembers;
  const complete = total > 0 && done >= total;
  return (
    <li>
      <Link
        to={`/admin/cohorts/${assignment.cohortId}/assignments/${assignment.assignmentId}`}
        className="hover:bg-muted/40 flex items-start gap-3 px-4 py-3"
      >
        <ClipboardListIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">과제</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{assignment.scopeLabel}</span>
          </span>
          <span className="text-foreground mt-0.5 block truncate text-[13px] font-medium">
            {assignment.title}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-[11px]">
            부여 {fmtDate(assignment.assignedAt)} · 마감 {fmtDate(assignment.dueAt)}
          </span>
        </span>
        {total === 0 ? (
          <span className="text-muted-foreground shrink-0 text-[11px]">
            대상 없음
          </span>
        ) : complete ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-3" />
            완수 {done}/{total}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <ClockIcon className="size-3" />
            완수 {done}/{total}
          </span>
        )}
      </Link>
    </li>
  );
}

function QnaRow({ qna }: { qna: ActivityQna }) {
  return (
    <li>
      <Link
        to={`/qna/${qna.threadId}`}
        className="hover:bg-muted/40 flex items-start gap-3 px-4 py-3"
      >
        <MessageCircleQuestionIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Q&A</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground tabular-nums">
              Q-{qna.displayNo}
            </span>
            {qna.askerName ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{qna.askerName}</span>
              </>
            ) : null}
          </span>
          <span className="text-foreground mt-0.5 block truncate text-[13px] font-medium">
            {qna.title}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-[11px]">
            {qna.answered && qna.answeredAt
              ? `답변 ${fmtDate(qna.answeredAt)}`
              : `질문 ${fmtDate(qna.createdAt)}`}
          </span>
        </span>
        {qna.answered ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-3" />
            {QNA_STATUS_LABEL[qna.status]}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <ClockIcon className="size-3" />
            답변 대기
          </span>
        )}
      </Link>
    </li>
  );
}

function BugRow({ bug }: { bug: ActivityBug }) {
  const done = bug.status === "done";
  const preview =
    bug.message.length > 80 ? `${bug.message.slice(0, 80)}…` : bug.message;
  return (
    <li>
      <Link
        to="/admin/bug-reports"
        className="hover:bg-muted/40 flex items-start gap-3 px-4 py-3"
      >
        <BugIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">오류 신고</span>
            {bug.reporterName ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {bug.reporterName}
                </span>
              </>
            ) : null}
          </span>
          <span className="text-foreground/80 mt-0.5 block truncate text-[13px]">
            {preview}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-[11px]">
            {fmtDate(bug.createdAt)}
          </span>
        </span>
        {done ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-3" />
            {BUG_STATUS_LABEL[bug.status]}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <ClockIcon className="size-3" />
            {BUG_STATUS_LABEL[bug.status]}
          </span>
        )}
      </Link>
    </li>
  );
}
