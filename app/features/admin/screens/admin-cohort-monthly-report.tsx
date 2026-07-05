// 월간 개인 성적표 — 반 학생별 한 달 학습 리포트를 학생당 1페이지로 렌더,
// 브라우저 인쇄 대화상자에서 "PDF로 저장"(offline-test-print 와 같은 패턴).
// ?month=YYYY-MM(기본 이번 달) · ?student=<profileId>(선택, 1명만).

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PrinterIcon,
  XIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import {
  parseMonthParam,
  shiftMonth,
  type MonthlyStudentReport,
} from "~/features/admin/lib/monthly-report";
import { getMonthlyReport } from "~/features/admin/lib/monthly-report.server";
import {
  ATTENDANCE_STATUS_LABEL,
  attendanceRatePct,
  EMPTY_ATTENDANCE_COUNTS,
  type AttendanceCounts,
} from "~/features/attendance/labels";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-cohort-monthly-report";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d) return [{ title: "월간 성적표 | 리담변리사학원" }];
  return [
    { title: `${d.cohortName} ${d.report.monthLabel} 성적표 | 리담변리사학원` },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.cohortId) throw data("Missing cohortId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const cohort = await getCohortById(client, params.cohortId);
  if (!cohort) throw data("Cohort not found", { status: 404 });
  if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 접근 가능", { status: 403 });
  }

  const url = new URL(request.url);
  const month = parseMonthParam(url.searchParams.get("month"));
  const onlyProfileId = url.searchParams.get("student") ?? undefined;

  const report = await getMonthlyReport(params.cohortId, month, {
    onlyProfileId,
  });
  return {
    cohortId: params.cohortId,
    cohortName: cohort.name,
    onlyProfileId: onlyProfileId ?? null,
    report,
  };
}

export default function AdminCohortMonthlyReport({
  loaderData,
}: Route.ComponentProps) {
  const { cohortId, cohortName, onlyProfileId, report } = loaderData;
  const base = `/admin/cohorts/${cohortId}/monthly-report`;
  const studentQs = onlyProfileId ? `&student=${onlyProfileId}` : "";

  return (
    <div className="min-h-screen bg-white text-neutral-800">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 12mm; }
          .pb-avoid { break-inside: avoid; }
          .report-page { break-after: page; }
          .report-page:last-child { break-after: auto; }
        }
      `}</style>

      {/* 화면 전용 툴바 */}
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-white/95 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-neutral-700">
            {cohortName} · {report.monthLabel} 성적표
            {onlyProfileId ? " (1명)" : ` (${report.students.length}명)`}
          </p>
          <Link
            to={`${base}?month=${shiftMonth(report.month, -1)}${studentQs}`}
            className="inline-flex items-center rounded-full border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100"
            aria-label="이전 달"
          >
            <ChevronLeftIcon className="size-4" />
          </Link>
          <Link
            to={`${base}?month=${shiftMonth(report.month, 1)}${studentQs}`}
            className="inline-flex items-center rounded-full border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100"
            aria-label="다음 달"
          >
            <ChevronRightIcon className="size-4" />
          </Link>
          {onlyProfileId ? (
            <Link
              to={`${base}?month=${report.month}`}
              className="rounded-full border border-neutral-300 px-3 py-1.5 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-100"
            >
              전체 학생 보기
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-neutral-600"
          >
            <PrinterIcon className="size-3.5" /> PDF로 저장 / 인쇄
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-3 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-100"
          >
            <XIcon className="size-3.5" /> 닫기
          </button>
        </div>
      </div>

      {report.students.length === 0 ? (
        <p className="px-8 py-16 text-center text-sm text-neutral-500">
          이 반에 학생이 없습니다.
        </p>
      ) : (
        report.students.map((s) => (
          <StudentReportPage
            key={s.profileId}
            student={s}
            cohortName={cohortName}
            monthLabel={report.monthLabel}
          />
        ))
      )}
    </div>
  );
}

function pctTone(pct: number | null): string {
  if (pct === null) return "text-neutral-400";
  if (pct >= 80) return "text-emerald-700";
  if (pct >= 60) return "text-lime-700";
  if (pct >= 40) return "text-amber-700";
  return "text-rose-700";
}

function StudentReportPage({
  student,
  cohortName,
  monthLabel,
}: {
  student: MonthlyStudentReport;
  cohortName: string;
  monthLabel: string;
}) {
  const { study } = student;
  const attemptsDelta =
    study.prevAttempts > 0 ? study.attempts - study.prevAttempts : null;
  const accuracyDelta =
    study.accuracyPct !== null && study.prevAccuracyPct !== null
      ? study.accuracyPct - study.prevAccuracyPct
      : null;

  const attendanceCounts: AttendanceCounts = {
    ...EMPTY_ATTENDANCE_COUNTS,
  };
  for (const a of student.attendance) {
    if (a.status) attendanceCounts[a.status] += 1;
  }
  const recorded = student.attendance.filter((a) => a.status !== null).length;
  const attendanceRate = recorded > 0 ? attendanceRatePct(attendanceCounts) : null;

  const assignmentsDone = student.assignments.filter((a) => a.completed).length;

  return (
    <section className="report-page mx-auto max-w-3xl px-8 py-8">
      {/* 머리표 */}
      <header className="pb-avoid mb-5 border-2 border-neutral-800">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
          <p className="text-[12px] font-bold tracking-widest text-neutral-600">
            리담변리사학원 · {cohortName}
          </p>
          <p className="text-[12px] text-neutral-500">{monthLabel}</p>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-extrabold tracking-tight text-neutral-900">
            월간 학습 리포트
          </h1>
          <p className="text-base font-bold text-neutral-900">
            {student.name ?? "이름 미설정"}
          </p>
        </div>
      </header>

      {/* 학습량 요약 */}
      <div className="pb-avoid mb-5 grid grid-cols-4 gap-2">
        <SummaryCell
          label="문제 풀이"
          value={`${study.attempts}문항`}
          sub={
            attemptsDelta !== null
              ? `전월 대비 ${attemptsDelta >= 0 ? "+" : ""}${attemptsDelta}`
              : "전월 기록 없음"
          }
        />
        <SummaryCell
          label="정답률"
          value={study.accuracyPct !== null ? `${study.accuracyPct}%` : "—"}
          valueClass={pctTone(study.accuracyPct)}
          sub={
            accuracyDelta !== null
              ? `전월 대비 ${accuracyDelta >= 0 ? "+" : ""}${accuracyDelta}%p`
              : "전월 기록 없음"
          }
        />
        <SummaryCell
          label="학습일"
          value={`${study.studyDays}일`}
          sub="문제를 푼 날 수"
        />
        <SummaryCell
          label="출석률"
          value={attendanceRate !== null ? `${attendanceRate}%` : "—"}
          valueClass={pctTone(attendanceRate)}
          sub={
            recorded > 0
              ? `수업 ${recorded}회 기준`
              : "이 달 출결 기록 없음"
          }
        />
      </div>

      {/* 과목별 풀이 */}
      {study.bySubject.length > 0 ? (
        <ReportBlock title="과목별 풀이">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500">
                <th className="px-2 py-1 font-medium">과목</th>
                <th className="px-2 py-1 text-right font-medium">풀이</th>
                <th className="px-2 py-1 text-right font-medium">정답</th>
                <th className="px-2 py-1 text-right font-medium">정답률</th>
              </tr>
            </thead>
            <tbody>
              {study.bySubject.map((sub) => (
                <tr key={sub.label} className="border-b border-neutral-200 last:border-0">
                  <td className="px-2 py-1">{sub.label}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {sub.attempts}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {sub.correct}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1 text-right font-semibold tabular-nums",
                      pctTone(sub.accuracyPct),
                    )}
                  >
                    {sub.accuracyPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportBlock>
      ) : (
        <ReportBlock title="과목별 풀이">
          <p className="px-2 py-1.5 text-[12px] text-neutral-500">
            이 달 문제 풀이 기록이 없습니다.
          </p>
        </ReportBlock>
      )}

      {/* 시험 */}
      {student.tests.length > 0 ? (
        <ReportBlock title="시험 결과">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500">
                <th className="px-2 py-1 font-medium">시험</th>
                <th className="px-2 py-1 text-right font-medium">점수</th>
                <th className="px-2 py-1 text-right font-medium">득점률</th>
                <th className="px-2 py-1 text-right font-medium">반 평균</th>
                <th className="px-2 py-1 text-right font-medium">석차</th>
              </tr>
            </thead>
            <tbody>
              {student.tests.map((t, i) => (
                <tr key={i} className="border-b border-neutral-200 last:border-0">
                  <td className="px-2 py-1">
                    {t.title}
                    {t.roundNo !== null ? (
                      <span className="ml-1 text-neutral-500">
                        ({t.roundNo}회)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {t.score}
                    {t.maxScore !== null ? ` / ${t.maxScore}` : ""}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1 text-right font-semibold tabular-nums",
                      pctTone(t.pct),
                    )}
                  >
                    {t.pct !== null ? `${t.pct}%` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {t.avgPct !== null ? `${t.avgPct}%` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {t.rank} / {t.taken}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportBlock>
      ) : null}

      {/* 출결 */}
      {student.attendance.length > 0 ? (
        <ReportBlock title="출결">
          <div className="flex flex-wrap gap-1.5 px-2 py-1.5">
            {student.attendance.map((a) => (
              <span
                key={`${a.sessionNo}-${a.heldOn}`}
                title={a.title ?? undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] tabular-nums",
                  a.status === "absent"
                    ? "border-rose-300 bg-rose-50 font-semibold text-rose-700"
                    : a.status === "late"
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : a.status === null
                        ? "border-neutral-200 text-neutral-400"
                        : "border-neutral-300 text-neutral-700",
                )}
              >
                {a.sessionNo}회({a.heldOn.slice(5)}){" "}
                {a.status ? ATTENDANCE_STATUS_LABEL[a.status] : "미기록"}
              </span>
            ))}
          </div>
        </ReportBlock>
      ) : null}

      {/* 과제 */}
      {student.assignments.length > 0 ? (
        <ReportBlock
          title={`과제 (완수 ${assignmentsDone} / ${student.assignments.length})`}
        >
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500">
                <th className="px-2 py-1 font-medium">과제</th>
                <th className="px-2 py-1 text-right font-medium">마감</th>
                <th className="px-2 py-1 text-right font-medium">진척</th>
                <th className="px-2 py-1 text-right font-medium">완수</th>
              </tr>
            </thead>
            <tbody>
              {student.assignments.map((a, i) => (
                <tr key={i} className="border-b border-neutral-200 last:border-0">
                  <td className="px-2 py-1">
                    {a.personal ? (
                      <span className="mr-1 rounded border border-amber-300 bg-amber-50 px-1 text-[10px] font-semibold text-amber-700">
                        개인
                      </span>
                    ) : null}
                    {a.title}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                    {a.dueAt.slice(5, 10)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {a.totalItems > 0
                      ? `${a.completedItems}/${a.totalItems}`
                      : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {a.completed ? (
                      <span className="font-semibold text-emerald-700">완수</span>
                    ) : (
                      <span className="text-neutral-400">미완</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportBlock>
      ) : null}

      {/* 취약 단원 */}
      {student.weakNodes.length > 0 ? (
        <ReportBlock title="이 달의 취약 단원 (보완 권장)">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500">
                <th className="px-2 py-1 font-medium">과목</th>
                <th className="px-2 py-1 font-medium">단원</th>
                <th className="px-2 py-1 text-right font-medium">풀이</th>
                <th className="px-2 py-1 text-right font-medium">정답률</th>
              </tr>
            </thead>
            <tbody>
              {student.weakNodes.map((w, i) => (
                <tr key={i} className="border-b border-neutral-200 last:border-0">
                  <td className="px-2 py-1 whitespace-nowrap">{w.lawName}</td>
                  <td className="px-2 py-1">{w.nodeLabel}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {w.attempts}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1 text-right font-semibold tabular-nums",
                      pctTone(w.accuracyPct),
                    )}
                  >
                    {w.accuracyPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportBlock>
      ) : null}

      {/* 강사 코멘트 수기란 */}
      <div className="pb-avoid mt-4 rounded border border-neutral-300">
        <p className="border-b border-neutral-300 bg-neutral-50 px-3 py-1.5 text-[12px] font-bold text-neutral-700">
          강사 코멘트
        </p>
        <div className="h-20" />
      </div>
    </section>
  );
}

function SummaryCell({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="pb-avoid rounded border border-neutral-300 px-3 py-2">
      <p className="text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-extrabold tabular-nums",
          valueClass ?? "text-neutral-900",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-neutral-500">{sub}</p>
    </div>
  );
}

function ReportBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pb-avoid mb-4 rounded border border-neutral-300">
      <p className="border-b border-neutral-300 bg-neutral-50 px-3 py-1.5 text-[12px] font-bold text-neutral-700">
        {title}
      </p>
      {children}
    </div>
  );
}
