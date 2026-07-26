// 한 학생 상세 — 과목별 진도/통계, 최근 활동, 빈칸 (feat-7-010).
// staff 권한: admin 전부, instructor 는 본인 cohort 멤버만.

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BrainIcon,
  CheckCheckIcon,
  ClipboardListIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  FlameIcon,
  GavelIcon,
  ListChecksIcon,
  MailIcon,
  MessageSquareIcon,
  MinusIcon,
  PencilIcon,
  PhoneIcon,
  PinIcon,
  PlusIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";
import {
  listCsActionsForUser,
  type CsActionRow,
} from "~/features/orders/cs.server";
import {
  getUserWatchHistory,
  type UserWatchCourse,
} from "~/features/lms/watch.server";
import { getLectureNoteViewLog } from "~/features/lectures/queries.server";
import {
  getStudentActivity,
  type StudentActivity,
} from "~/features/admin/queries/student-activity.server";
import {
  getMemberEnrollments,
  getMemberPoints,
  getMemberProfile,
  listMemberCoupons,
  listMemberNotifications,
  listMemberOrders,
  listMemberSends,
  listUserAccessLogs,
  listUserBookDownloads,
  type AccessLogRow,
  type DownloadRow,
  type MemberCoupons,
  type MemberEnrollmentCourse,
  type MemberNotificationRow,
  type MemberOrder,
  type MemberPoints,
  type MemberProfile,
  type MemberSendRow,
} from "~/features/admin/queries/member-crm.server";
import { isPasswordLoginEnabled } from "~/features/auth/settings.server";
import { CS_CATEGORY_LABEL } from "~/features/cs-inquiries/labels";
import {
  isFirstExamSubject,
  isSecondExamSubject,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";
import adminClient from "~/core/lib/supa-admin-client.server";
import {
  getDailyStudyStats,
  getUserPassPredictionTrend,
  type DailyStudyDay,
  type PassPredictionSnapshotItem,
} from "~/features/study/queries.server";
import {
  getNodeMastery,
  type NodeMasteryRow,
} from "~/features/study/mastery.server";
import {
  getGamificationSummary,
  type GamificationSummary,
} from "~/features/study/gamification.server";
import { summarizeMastery } from "~/features/study/lib/mastery";
import {
  getStudentCohortStudyRank,
  type CohortStudyBand,
} from "~/features/study/cohort-percentile.server";
import { listMyExamResults } from "~/features/exam-results/queries.server";
import {
  EXAM_ROUND_LABEL,
  EXAM_RESULT_STATUS_LABEL,
  EXAM_VERIFICATION_STATUS_LABEL,
  type ExamResultRow,
} from "~/features/exam-results/labels";
import { OxDiagnosisView } from "~/features/study/components/ox-diagnosis-view";
import { computeOxDiagnosis } from "~/features/study/lib/ox-diagnosis.server";
import {
  getStudentCohortComparisons,
  getStudentDetail,
  listStudentMockSessions,
  type StudentCohortComparison,
  type StudentMockSession,
} from "~/features/admin/queries/student-progress.server";
import {
  getSchoolAverages,
  type SchoolAverages,
} from "~/features/admin/queries/all-students-overview.server";
import {
  type StudentSrsSummary,
  getStudentSrsSummary,
} from "~/features/admin/queries/student-srs.server";
import {
  listNotesForStudent,
  type StudentNote,
} from "~/features/student-notes/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  listPaymentsForUser,
  listUserSubscriptionHistory,
} from "~/features/subscriptions/admin-queries.server";
import { AdminSubscriptionPanel } from "~/features/subscriptions/components/admin-subscription-panel";
import { listSubscriptionPlans } from "~/features/subscriptions/queries.server";
import { listStudentAssignments } from "~/features/assignments/queries.server";
import {
  ASSIGNMENT_STATUS_LABEL,
  type AssignmentStatus,
  type StudentAssignmentRow,
} from "~/features/assignments/labels";

import type { Route } from "./+types/admin-student-detail";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.student) return [{ title: "학생 상세 | 리담변리사학원" }];
  return [{ title: `${d.student.name} 학생 진도 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.profileId) throw data("Missing profileId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  // manager 미만(instructor)이면 본인 소속 cohort 의 멤버인지 확인.
  if (!roleAtLeast(role, "manager")) {
    const { data: rows } = await adminClient
      .from("cohort_members")
      .select("cohort_id, cohorts!inner(owner_id)")
      .eq("profile_id", params.profileId);
    const ownsAnyCohort = (rows ?? []).some(
      (r) => r.cohorts?.owner_id === user.id,
    );
    if (!ownsAnyCohort) {
      throw data("이 학생을 조회할 권한이 없습니다.", { status: 403 });
    }
  }

  const [
    student,
    cohortComparisons,
    notes,
    passTrend,
    subscriptions,
    payments,
    plans,
    srsSummary,
    oxDiagnosis,
    oxPasser,
    nodeMastery,
    examResults,
    studyRank,
    studyDaily,
    studentAssignments,
    studentMockSessions,
    schoolAverages,
  ] = await Promise.all([
    getStudentDetail(params.profileId),
    getStudentCohortComparisons(params.profileId),
    listNotesForStudent(params.profileId),
    getUserPassPredictionTrend(adminClient, params.profileId, { days: 30 }),
    // feat-7-014 — manager+ 만 구독 패널에 데이터 노출.
    roleAtLeast(role, "manager")
      ? listUserSubscriptionHistory(params.profileId)
      : Promise.resolve([]),
    roleAtLeast(role, "manager")
      ? listPaymentsForUser(params.profileId)
      : Promise.resolve([]),
    roleAtLeast(role, "manager")
      ? listSubscriptionPlans(client)
      : Promise.resolve([]),
    getStudentSrsSummary(params.profileId),
    // feat-2-022 — 이 학생의 OX 약점 진단(adminClient = RLS 우회, 타 사용자 데이터).
    computeOxDiagnosis(adminClient, params.profileId),
    // 합격자 비교 게이트 — OFF(1년차) 시 placeholder 만. 학생 화면과 동일 처리.
    (async () => {
      const { isPasserBenchmarkEnabled } = await import(
        "~/features/exam-results/passer-benchmark-gate.server"
      );
      const g = await isPasserBenchmarkEnabled();
      return {
        enabled: g.enabled,
        sampleSize: g.realSampleSize,
        minSample: g.minSample,
      };
    })(),
    // feat-2-027 — 단원 마스터리(파생: 노드별 정답률 + SRS 파지). 학생 화면과 동일 계산.
    getNodeMastery(adminClient, params.profileId, [...LAW_SUBJECT_SLUGS]),
    // feat-7-040 P1 — 실제 응시결과(자가신고·인증). adminClient = 타 사용자 private 데이터.
    listMyExamResults(adminClient, params.profileId),
    // feat-7-040 P1 — 공부량 반내 위치(약관 제7조 근거 반 전체 변형, B동의 무관). adminClient 내부.
    getStudentCohortStudyRank(params.profileId),
    // feat-7-040 후속 — 최근 8주 학습 추세 미니차트용(주별 시간·풀이수).
    getDailyStudyStats(adminClient, params.profileId, { daysBack: 56 }),
    // feat-7-040 후속 P1-b — 과제 이행(완료/미완). adminClient 내부, profileId 스코프.
    listStudentAssignments(params.profileId),
    // feat-7-040 후속 P3 — 플랫폼 모의(exam) 응시 이력(자습과 구분).
    listStudentMockSessions(params.profileId),
    // feat-7-041 #3 — 전체(학원) 평균(반 평균과 같은 축에 "전체 대비" 표시).
    getSchoolAverages(),
  ]);
  if (!student) throw data("Student not found", { status: 404 });

  // feat-2-027 게임화 요약(레벨=마스터 단원 수 파생 + 스트릭 + 공부량). ★persist=false:
  // 관리자 조회가 학생의 last_active/level_seen 을 쓰지 않도록(읽기 미러는 무부작용).
  const masteredCount = summarizeMastery(
    nodeMastery.map((r) => r.stage),
  ).mastered;
  // feat-7-040 후속(가) — 개별 약점 단원 → 반 과제 CTA용. 시도≥3·정답률<70·미마스터.
  const studentWeakNodes = nodeMastery
    .filter(
      (r) => r.attempts >= 3 && r.accuracyPct < 70 && r.stage !== "mastered",
    )
    .sort((a, b) => a.accuracyPct - b.accuracyPct)
    .slice(0, 8)
    .map((r) => ({ nodeId: r.nodeId, displayLabel: r.displayLabel }));
  const todayYmd = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const gamification = await getGamificationSummary(
    adminClient,
    params.profileId,
    todayYmd,
    masteredCount,
    { persist: false },
  );

  // feat-7-040 후속 — 최근 8주 주간 집계(공부 시간·풀이수). days 는 오래된→오늘, 가장 최근 주가 끝.
  const TREND_WEEKS = 8;
  const DAYS_PER_WEEK = 7;
  const trendTail = studyDaily.days.slice(-TREND_WEEKS * DAYS_PER_WEEK);
  const studyTrendWeeks = Array.from({ length: TREND_WEEKS }, (_, w) => {
    const slice = trendTail.slice(w * DAYS_PER_WEEK, (w + 1) * DAYS_PER_WEEK);
    const ms = slice.reduce((s, d) => s + d.timeMs, 0);
    return {
      hours: Math.round((ms / 3_600_000) * 10) / 10,
      attempts: slice.reduce((s, d) => s + d.attemptCount, 0),
    };
  });

  // CS 처리 이력(cs_actions) + 영상 시청 기록 + 활동 내역(질의·문의·커뮤니티) — manager+ 만.
  const [csActions, watchHistory, activity, noteViewLog] = roleAtLeast(
    role,
    "manager",
  )
    ? await Promise.all([
        listCsActionsForUser(params.profileId),
        getUserWatchHistory(params.profileId),
        getStudentActivity(params.profileId),
        getLectureNoteViewLog(params.profileId),
      ])
    : [
        [],
        [],
        { qna: [], inquiries: [], posts: [], bugReports: [] },
        { events: [], recent10minUnique: 0, totalEvents: 0 },
      ];

  // ── feat-7-046 회원 CRM — 회원정보/이력 데이터 ──
  // 회원정보(신원·연락처·로그인 계정)는 instructor 도 조회 가능(로더가 조회 권한 통과).
  // 접속 로그·다운로드는 IP 등 민감 정보라 manager+ 만.
  const [
    memberProfile,
    accessLogs,
    bookDownloads,
    passwordLoginEnabled,
    memberOrders,
    memberCoupons,
    memberEnrollments,
    memberPoints,
    memberSends,
    memberNotifications,
  ] = await Promise.all([
    getMemberProfile(params.profileId),
    roleAtLeast(role, "manager")
      ? listUserAccessLogs(params.profileId, 40)
      : Promise.resolve([] as AccessLogRow[]),
    roleAtLeast(role, "manager")
      ? listUserBookDownloads(params.profileId, 40)
      : Promise.resolve([] as DownloadRow[]),
    isPasswordLoginEnabled(client),
    roleAtLeast(role, "manager")
      ? listMemberOrders(params.profileId)
      : Promise.resolve([] as MemberOrder[]),
    roleAtLeast(role, "manager")
      ? listMemberCoupons(params.profileId)
      : Promise.resolve({
          subscription: [],
          lectureGrants: [],
          lectureRedemptions: [],
        } as MemberCoupons),
    roleAtLeast(role, "manager")
      ? getMemberEnrollments(params.profileId)
      : Promise.resolve([] as MemberEnrollmentCourse[]),
    roleAtLeast(role, "manager")
      ? getMemberPoints(params.profileId)
      : Promise.resolve({ balance: 0, transactions: [] } as MemberPoints),
    roleAtLeast(role, "manager")
      ? listMemberSends(params.profileId)
      : Promise.resolve([] as MemberSendRow[]),
    roleAtLeast(role, "manager")
      ? listMemberNotifications(params.profileId)
      : Promise.resolve([] as MemberNotificationRow[]),
  ]);
  const memberHeader = {
    memberNo: memberProfile?.memberNo ?? null,
    phoneE164: memberProfile?.phoneE164 ?? null,
    nickname: memberProfile?.nickname ?? null,
    avatarUrl: memberProfile?.avatarUrl ?? null,
    lastAccessAt: memberProfile?.lastSignInAt ?? null,
    cohortNames: cohortComparisons.map((c) => c.cohortName),
  };
  // 회원이력 · 과정학습 — 최근 14일 일별 공부(활동 없는 날 포함, 컴포넌트에서 필터).
  const recentStudyDays = studyDaily.days.slice(-14);

  return {
    student,
    memberHeader,
    memberProfile,
    passwordLoginEnabled,
    accessLogs,
    bookDownloads,
    recentStudyDays,
    memberOrders,
    memberCoupons,
    memberEnrollments,
    memberPoints,
    memberSends,
    memberNotifications,
    cohortComparisons,
    notes,
    csActions,
    watchHistory,
    activity,
    noteViewLog,
    passTrend,
    subscriptions,
    payments,
    plans,
    srsSummary,
    oxDiagnosis,
    oxPasser,
    nodeMastery,
    gamification,
    examResults,
    studyRank,
    studyTrendWeeks,
    studentAssignments,
    studentMockSessions,
    studentWeakNodes,
    schoolAverages,
    currentUserId: user.id,
    isAdmin: roleAtLeast(role, "manager"),
    role,
  };
}

function accuracyTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-lime-600 dark:text-lime-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export default function AdminStudentDetail({
  loaderData,
}: Route.ComponentProps) {
  const {
    student,
    memberHeader,
    memberProfile,
    passwordLoginEnabled,
    accessLogs,
    bookDownloads,
    recentStudyDays,
    memberOrders,
    memberCoupons,
    memberEnrollments,
    memberPoints,
    memberSends,
    memberNotifications,
    cohortComparisons,
    notes,
    csActions,
    watchHistory,
    activity,
    noteViewLog,
    passTrend,
    subscriptions,
    payments,
    plans,
    srsSummary,
    oxDiagnosis,
    oxPasser,
    nodeMastery,
    gamification,
    examResults,
    studyRank,
    studyTrendWeeks,
    studentAssignments,
    studentMockSessions,
    studentWeakNodes,
    schoolAverages,
    currentUserId,
    isAdmin,
    role,
  } = loaderData;
  const roleLabel =
    student.role === "admin"
      ? "원장"
      : student.role === "instructor"
        ? "강사"
        : "수험생";

  // Stage 0 (feat-7-046) — CRM 탭. #activity/#watch-history → 활동·결제,
  // #notes/#cs-history → 상담·메모 로 딥링크 보존(기존 /admin/users 링크 앵커).
  const [tab, setTab] = useState<
    | "study"
    | "enroll"
    | "info"
    | "history"
    | "orders"
    | "coupons"
    | "points"
    | "sends"
    | "memo"
    | "activity"
    | "notelog"
  >("study");
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (h === "watch-history" && isAdmin) setTab("history");
    else if (h === "activity" && isAdmin) setTab("activity");
    else if (h === "notes" || h === "cs-history") setTab("memo");
    else if (h === "notelog" && isAdmin) setTab("notelog");
  }, [isAdmin]);

  return (
    <AdminShell
      cluster="students"
      role={role}
      title={`수강생 · ${student.name || "(이름 없음)"}`}
      desc={`${roleLabel} · 가입 ${student.joinedAt.slice(0, 10)}`}
      headerRight={
        <Link
          to="/admin/cohorts"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeftIcon className="size-3" /> 반 목록
        </Link>
      }
    >
      {/* ── 회원 헤더 (항상 표시) — 신원·연락처·소속·가입/최근접속 + 핵심 지표 ── */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-start gap-x-6 gap-y-4 px-5 py-5">
          <div className="flex min-w-0 items-start gap-4">
            {memberHeader.avatarUrl ? (
              <img
                src={memberHeader.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-14 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="bg-primary text-primary-foreground inline-flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold">
                {(student.name || "?").trim().charAt(0) || "?"}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-extrabold tracking-tight">
                  {student.name || "(이름 없음)"}
                </h2>
                <Chip tone="outline">
                  <UserIcon className="size-3" />
                  {roleLabel}
                </Chip>
                {memberHeader.memberNo != null ? (
                  <Chip tone="solid">회원 {memberHeader.memberNo}</Chip>
                ) : null}
              </div>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {student.email ? (
                  <span className="inline-flex items-center gap-1">
                    <MailIcon className="size-3.5" />
                    {student.email}
                  </span>
                ) : null}
                {memberHeader.phoneE164 ? (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <PhoneIcon className="size-3.5" />
                    {memberHeader.phoneE164}
                  </span>
                ) : null}
                {memberHeader.nickname &&
                memberHeader.nickname !== student.name ? (
                  <span className="text-xs">({memberHeader.nickname})</span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {memberHeader.cohortNames.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Chip tone="violet">종합반</Chip>
                    <span className="text-muted-foreground text-xs">
                      {memberHeader.cohortNames.join(", ")}
                    </span>
                  </span>
                ) : null}
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  가입 {student.joinedAt.slice(0, 10)}
                  {" · 최근접속 "}
                  {memberHeader.lastAccessAt
                    ? memberHeader.lastAccessAt.slice(0, 10)
                    : "기록 없음"}
                </span>
              </div>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-x-6 gap-y-3">
            <SummaryStat
              label="문제 풀이"
              value={`${student.totals.problemsCorrect} / ${student.totals.problemsAttempted}`}
            />
            <SummaryStat
              label="전체 정답률"
              value={
                student.totals.accuracyPct !== null
                  ? `${student.totals.accuracyPct}%`
                  : "—"
              }
              tone={accuracyTone(student.totals.accuracyPct)}
            />
            <SummaryStat
              label="조문 열람"
              value={`${student.totals.articlesViewed}`}
            />
            <SummaryStat
              label="빈칸 정답률"
              value={
                student.blanks.accuracyPct !== null
                  ? `${student.blanks.accuracyPct}%`
                  : "—"
              }
              tone={accuracyTone(student.blanks.accuracyPct)}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="study">학습현황</TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="enroll">수강정보</TabsTrigger>
          ) : null}
          <TabsTrigger value="info">회원정보</TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="history">회원이력</TabsTrigger>
          ) : null}
          {isAdmin ? (
            <TabsTrigger value="notelog">강의노트</TabsTrigger>
          ) : null}
          {isAdmin ? <TabsTrigger value="orders">주문</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="coupons">쿠폰</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="points">포인트</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="sends">발송</TabsTrigger> : null}
          <TabsTrigger value="memo">상담·메모</TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="activity">활동·결제</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="study" className="mt-3">
          {cohortComparisons.length > 0 ? (
        <div className="mb-6 space-y-3">
          {cohortComparisons.map((c) => (
            <CohortComparisonCard
              key={c.cohortId}
              comparison={c}
              school={schoolAverages}
            />
          ))}
        </div>
      ) : null}

      {/* feat-2-027 — 정착도(단원 마스터리) + 성장(레벨·스트릭·공부량). 학생 화면과 동일 계산, 관리자 시점 미러. */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <MasteryCard rows={nodeMastery} />
        <GrowthCard g={gamification} studyRank={studyRank} />
      </div>

      {/* feat-7-040 후속(가) — 개별 약점 단원 → ★반 과제로 출제 */}
      {studentWeakNodes.length > 0 && cohortComparisons.length > 0 ? (
        <div className="mb-6">
          <StudentWeakAssignmentForm
            weakNodes={studentWeakNodes}
            cohorts={cohortComparisons.map((c) => ({
              cohortId: c.cohortId,
              cohortName: c.cohortName,
            }))}
            studentName={student.name || "학생"}
          />
        </div>
      ) : null}

      {/* feat-7-040 후속 — 최근 8주 학습 추세 미니차트(주별 시간·풀이수) */}
      <div className="mb-6">
        <StudyTrendCard weeks={studyTrendWeeks} />
      </div>

      {passTrend.length > 0 ? (
        <div className="mb-6">
          <PassTrendCard items={passTrend} />
        </div>
      ) : null}

      {/* feat-7-040 P1 — 실제 응시결과(자가신고·인증). 합격 예측 옆 실제 결과. */}
      {examResults.length > 0 ? (
        <div className="mb-6">
          <ExamResultsCard results={examResults} />
        </div>
      ) : null}

      {/* feat-7-040 P3 — 플랫폼 모의 응시(exam 모드, 자습과 구분) */}
      {studentMockSessions.length > 0 ? (
        <div className="mb-6">
          <MockSessionsCard sessions={studentMockSessions} />
        </div>
      ) : null}

      {/* feat-2-017 학생별 SRS 큐 요약 */}
      <div className="mb-6">
        <StudentSrsCard summary={srsSummary} />
      </div>

      {/* feat-7-040 후속 P1-b — 과제 이행(행동→파악 가시성) */}
      <div className="mb-6">
        <AssignmentProgressCard assignments={studentAssignments} />
      </div>

      {/* feat-2-022 학생별 정오문제 약점 진단 (단원 × 지식종류) — 학생 화면과 동일 게이트·톤 */}
      <div className="mb-6 space-y-3">
        <h2 className="text-sm font-bold tracking-tight">
          정오문제 약점 진단 (단원 × 지식종류)
        </h2>
        <OxDiagnosisView
          diagnosis={oxDiagnosis}
          passer={oxPasser}
          audience="staff"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <p className="text-sm font-semibold">법률 과목별 진도</p>
              <p className="text-muted-foreground text-xs">
                과목별 조문 열람 + 문제 풀이/정답률
              </p>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              {student.bySubject.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    법률 과목 학습 기록이 없습니다.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>과목</TableHead>
                      <TableHead className="text-right">조문 열람</TableHead>
                      <TableHead className="text-right">문제</TableHead>
                      <TableHead className="text-right">정답률</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      {
                        label: "1차 · 객관식",
                        rows: student.bySubject.filter((s) =>
                          isFirstExamSubject(s.lawCode),
                        ),
                      },
                      {
                        label: "2차 · 주관식",
                        rows: student.bySubject.filter((s) =>
                          isSecondExamSubject(s.lawCode),
                        ),
                      },
                    ].map((g) => (
                      <Fragment key={g.label}>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell
                            colSpan={4}
                            className="text-link py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] uppercase"
                          >
                            {g.label}
                          </TableCell>
                        </TableRow>
                        {g.rows.map((s) => (
                          <TableRow key={s.lawCode}>
                            <TableCell className="text-sm font-medium">
                              {s.lawName}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {s.articlesViewed}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {s.problemsAttempted > 0
                                ? `${s.problemsCorrect}/${s.problemsAttempted}`
                                : "—"}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-xs font-semibold tabular-nums",
                                accuracyTone(s.accuracyPct),
                              )}
                            >
                              {s.accuracyPct !== null
                                ? `${s.accuracyPct}%`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {student.byScience.length > 0 ? (
            <Card>
              <CardHeader>
                <p className="text-sm font-semibold">자연과학 진도</p>
                <p className="text-muted-foreground text-xs">
                  과목별 풀이/정답률
                </p>
              </CardHeader>
              <Separator />
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>과목</TableHead>
                      <TableHead className="text-right">풀이/총</TableHead>
                      <TableHead className="text-right">정답률</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.byScience.map((s) => (
                      <TableRow key={s.slug}>
                        <TableCell className="text-sm font-medium">
                          {s.name}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {s.attempted} / {s.total}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs font-semibold tabular-nums",
                            accuracyTone(s.accuracyPct),
                          )}
                        >
                          {s.accuracyPct !== null ? `${s.accuracyPct}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <p className="inline-flex items-center gap-1 text-sm font-semibold">
              <ClockIcon className="text-link size-4" /> 최근 활동
            </p>
            <p className="text-muted-foreground text-xs">최근 12건</p>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {student.recent.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-muted-foreground text-sm">
                  학습 활동 기록이 없습니다.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {student.recent.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 px-4 py-2.5">
                    <ActivityIcon type={r.targetType} />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-medium">
                        {labelForType(r.targetType)}
                        {r.subject ? (
                          <span className="text-muted-foreground">
                            {" · "}
                            {r.subject}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        {r.occurredAt.slice(0, 16).replace("T", " ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="enroll" className="mt-3">
            <MemberEnrollmentsTab
              userId={student.profileId}
              courses={memberEnrollments}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="info" className="mt-3">
          {memberProfile ? (
            <MemberInfoTab
              profile={memberProfile}
              passwordLoginEnabled={passwordLoginEnabled}
              canEdit={isAdmin}
            />
          ) : (
            <p className="text-muted-foreground p-6 text-center text-sm">
              회원 정보를 불러올 수 없습니다.
            </p>
          )}
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="history" className="mt-3">
            <MemberHistoryTab
              recentStudyDays={recentStudyDays}
              watchHistory={watchHistory}
              bookDownloads={bookDownloads}
              accessLogs={accessLogs}
            />
          </TabsContent>
        ) : null}

        {isAdmin ? (
          <TabsContent value="notelog" className="mt-3">
            <NoteViewLogTab log={noteViewLog} />
          </TabsContent>
        ) : null}

        {isAdmin ? (
          <TabsContent value="orders" className="mt-3">
            <MemberOrdersTab orders={memberOrders} />
          </TabsContent>
        ) : null}

        {isAdmin ? (
          <TabsContent value="coupons" className="mt-3">
            <MemberCouponsTab coupons={memberCoupons} />
          </TabsContent>
        ) : null}

        {isAdmin ? (
          <TabsContent value="points" className="mt-3">
            <MemberPointsTab
              userId={student.profileId}
              points={memberPoints}
            />
          </TabsContent>
        ) : null}

        {isAdmin ? (
          <TabsContent value="sends" className="mt-3">
            <MemberSendsTab
              sends={memberSends}
              notifications={memberNotifications}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="memo" className="mt-3">
          <div className="mb-6">
            <NotesSection
              studentId={student.profileId}
              notes={notes}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
            />
          </div>
          {isAdmin ? (
            <div className="mb-6">
              <CsHistorySection
                studentId={student.profileId}
                actions={csActions}
              />
            </div>
          ) : null}
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="activity" className="mt-3">
            <div className="mb-6">
              <ActivitySection activity={activity} />
            </div>
            {/* feat-7-014 — manager+ 만 노출. loader 가 비 manager 면 빈 배열 반환. */}
            {plans.length > 0 ? (
              <div className="mb-6">
                <AdminSubscriptionPanel
                  userId={student.profileId}
                  subscriptions={subscriptions}
                  payments={payments}
                  plans={plans}
                />
              </div>
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </AdminShell>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-extrabold tracking-tight tabular-nums",
          tone ?? "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ── feat-7-046 회원정보 탭 ────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-muted-foreground w-24 shrink-0 text-xs font-semibold">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-sm break-words">{value}</span>
    </div>
  );
}

function EditField({
  name,
  label,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-sm outline-none"
      />
    </label>
  );
}

function MemberInfoTab({
  profile,
  passwordLoginEnabled,
  canEdit,
}: {
  profile: MemberProfile;
  passwordLoginEnabled: boolean;
  canEdit: boolean;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const saving = fetcher.state !== "idle";
  const saved = !!(fetcher.data && "ok" in fetcher.data && fetcher.data.ok);
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  const examLabel = profile.nextExamYear
    ? `${profile.nextExamYear}년 ${
        profile.nextExamRound === "second"
          ? "2차"
          : profile.nextExamRound === "first"
            ? "1차"
            : "-"
      }`
    : "미설정";
  const dateOnly = (s: string | null) => (s ? s.slice(0, 10) : "—");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <p className="text-sm font-semibold">회원 기재사항</p>
          <p className="text-muted-foreground text-xs">
            가입 시 입력한 신원·연락 정보
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="divide-y py-2">
          <InfoRow label="이름" value={profile.name || "—"} />
          <InfoRow label="닉네임" value={profile.nickname || "—"} />
          <InfoRow
            label="회원번호"
            value={profile.memberNo != null ? String(profile.memberNo) : "—"}
          />
          <InfoRow label="휴대전화" value={profile.phoneE164 || "—"} />
          <InfoRow label="주소" value={profile.address || "—"} />
          <InfoRow label="시험 차수" value={examLabel} />
          <InfoRow
            label="마케팅 수신"
            value={profile.marketingConsent ? "동의" : "미동의"}
          />
          <InfoRow
            label="알림 채널"
            value={
              profile.notifyChannels.length
                ? profile.notifyChannels.join(", ")
                : "—"
            }
          />
          <InfoRow label="가입일" value={dateOnly(profile.createdAt)} />
          <InfoRow label="온보딩" value={dateOnly(profile.onboardedAt)} />
          <InfoRow label="이용 승인" value={dateOnly(profile.accessApprovedAt)} />
          <InfoRow label="체험 만료" value={dateOnly(profile.trialEndsAt)} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <p className="text-sm font-semibold">로그인 계정</p>
          </CardHeader>
          <Separator />
          <CardContent className="divide-y py-2">
            <InfoRow
              label="이메일"
              value={
                profile.email ? (
                  <span className="inline-flex items-center gap-1.5">
                    {profile.email}
                    <Chip tone="outline">
                      {profile.emailConfirmedAt ? "인증" : "미인증"}
                    </Chip>
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <InfoRow
              label="로그인 수단"
              value={
                profile.providers.length
                  ? profile.providers
                      .map((p) => (p === "kakao" ? "카카오" : p))
                      .join(", ")
                  : "—"
              }
            />
            <InfoRow
              label="ID/PW 로그인"
              value={
                passwordLoginEnabled ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    활성
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    비활성 (카카오 전용)
                  </span>
                )
              }
            />
            <InfoRow
              label="최근 로그인"
              value={dateOnly(profile.lastSignInAt)}
            />
          </CardContent>
          <Separator />
          <CardContent className="py-3">
            {passwordLoginEnabled ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                이메일·비밀번호 로그인이 활성화되어 있습니다. 비밀번호 재설정
                기능은 다음 단계에서 제공됩니다.
              </p>
            ) : (
              <p className="text-muted-foreground text-xs leading-relaxed">
                현재 <b>카카오 단일 로그인</b>이라 비밀번호가 없습니다.{" "}
                <code className="bg-muted rounded px-1">/admin/auth</code> 에서
                이메일·비밀번호 로그인을 켜면 비밀번호 재설정을 제공합니다.
              </p>
            )}
          </CardContent>
        </Card>

        {canEdit ? (
          <Card>
            <CardHeader>
              <p className="text-sm font-semibold">정보 수정</p>
              <p className="text-muted-foreground text-xs">
                연락·신원 정정용. 역할·이용승인·수강권은 별도 화면에서 관리.
              </p>
            </CardHeader>
            <Separator />
            <CardContent className="py-4">
              <fetcher.Form
                method="post"
                action="/api/admin/member-profile"
                className="space-y-3"
              >
                <input
                  type="hidden"
                  name="profileId"
                  value={profile.profileId}
                />
                <EditField
                  name="name"
                  label="이름"
                  defaultValue={profile.name}
                  required
                />
                <EditField
                  name="nickname"
                  label="닉네임"
                  defaultValue={profile.nickname ?? ""}
                />
                <EditField
                  name="phoneE164"
                  label="휴대전화"
                  defaultValue={profile.phoneE164 ?? ""}
                />
                <EditField
                  name="address"
                  label="주소"
                  defaultValue={profile.address ?? ""}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="marketingConsent"
                    value="1"
                    defaultChecked={profile.marketingConsent}
                    className="size-4"
                  />
                  마케팅 수신 동의
                </label>
                {err ? <p className="text-rose-600 text-xs">{err}</p> : null}
                {saved ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    저장되었습니다.
                  </p>
                ) : null}
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "저장 중…" : "저장"}
                </Button>
              </fetcher.Form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// ── feat-7-046 회원이력 탭 ────────────────────────────────────────────────
function HistEmpty({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground py-6 text-center text-sm">{text}</p>
  );
}

// 강의노트 열람 로그 — 이상 열람 알림 확인용. 최근 10분 고유 페이지 + 이벤트 목록.
function NoteViewLogTab({
  log,
}: {
  log: {
    events: {
      viewedAt: string;
      kind: "src" | "res";
      noteTitle: string;
      fromPage: number;
      toPage: number;
    }[];
    recent10minUnique: number;
    totalEvents: number;
  };
}) {
  const hot = log.recent10minUnique >= 180;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div
          className={cn(
            "rounded-xl border px-4 py-3",
            hot
              ? "border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20"
              : "border-border bg-card",
          )}
        >
          <p className="text-muted-foreground text-[11px]">최근 10분 고유 페이지</p>
          <p
            className={cn(
              "text-lg font-bold tabular-nums",
              hot ? "text-amber-700 dark:text-amber-300" : "text-foreground",
            )}
          >
            {log.recent10minUnique}
            {hot ? " ⚠" : ""}
          </p>
        </div>
        <div className="border-border bg-card rounded-xl border px-4 py-3">
          <p className="text-muted-foreground text-[11px]">총 열람 이벤트</p>
          <p className="text-foreground text-lg font-bold tabular-nums">
            {log.totalEvents}
          </p>
        </div>
      </div>
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        겹치는 스크롤 창은 중복 제거한 <b>고유 페이지</b> 기준입니다. 페이지가
        비순차로 점프하고 요청 간격에 수 분의 정독 멈춤이 섞여 있으면 정상 학습,
        1→2→3…처럼 순차로 짧은 간격에 전 범위를 훑으면 자동 캡처 의심입니다.
      </p>
      {log.events.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-8 text-center text-sm">
          강의노트 열람 기록이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-[11px]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">시각(KST)</th>
                <th className="px-3 py-2 text-left font-semibold">강의노트</th>
                <th className="px-3 py-2 text-center font-semibold">종류</th>
                <th className="px-3 py-2 text-right font-semibold">페이지</th>
              </tr>
            </thead>
            <tbody>
              {log.events.map((e, i) => (
                <tr key={i} className="border-border/60 border-t">
                  <td className="text-muted-foreground px-3 py-1.5 tabular-nums whitespace-nowrap">
                    {fmt(e.viewedAt)}
                  </td>
                  <td className="px-3 py-1.5">{e.noteTitle}</td>
                  <td className="text-muted-foreground px-3 py-1.5 text-center text-xs">
                    {e.kind === "src" ? "통합본" : "자료"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {e.fromPage}–{e.toPage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MemberHistoryTab({
  recentStudyDays,
  watchHistory,
  bookDownloads,
  accessLogs,
}: {
  recentStudyDays: DailyStudyDay[];
  watchHistory: UserWatchCourse[];
  bookDownloads: DownloadRow[];
  accessLogs: AccessLogRow[];
}) {
  const activeDays = recentStudyDays.filter(
    (d) => d.timeMs > 0 || d.attemptCount > 0,
  );
  const fmtMin = (ms: number) => `${Math.round(ms / 60000)}분`;
  const fmtDt = (s: string) => s.slice(0, 16).replace("T", " ");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <p className="text-sm font-semibold">과정 학습 (최근 14일)</p>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {activeDays.length === 0 ? (
            <HistEmpty text="최근 학습 기록이 없습니다." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead className="text-right">공부 시간</TableHead>
                  <TableHead className="text-right">문제 풀이</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...activeDays].reverse().map((d) => (
                  <TableRow key={d.date}>
                    <TableCell className="text-sm tabular-nums">
                      {d.date}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {fmtMin(d.timeMs)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {d.attemptCount > 0
                        ? `${d.correctCount}/${d.attemptCount}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {watchHistory.length > 0 ? (
        <WatchHistorySection courses={watchHistory} />
      ) : (
        <Card>
          <CardHeader>
            <p className="text-sm font-semibold">영상 시청</p>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            <HistEmpty text="영상 시청 기록이 없습니다." />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <p className="text-sm font-semibold">도서 다운로드</p>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {bookDownloads.length === 0 ? (
            <HistEmpty text="다운로드 기록이 없습니다." />
          ) : (
            <ul className="divide-y">
              {bookDownloads.map((d, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">{d.label}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {fmtDt(d.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <p className="text-sm font-semibold">접속 기록</p>
          <p className="text-muted-foreground text-xs">최근 40건</p>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {accessLogs.length === 0 ? (
            <HistEmpty text="접속 기록이 없습니다." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일시</TableHead>
                  <TableHead>종류</TableHead>
                  <TableHead>기기·브라우저</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessLogs.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs tabular-nums">
                      {fmtDt(l.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">{l.kind}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {[l.device, l.browser].filter(Boolean).join(" · ") ||
                        l.client ||
                        "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      {l.ip ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── feat-7-046 주문 탭 ────────────────────────────────────────────────────
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: "결제 대기",
  pending_deposit: "입금 대기",
  paid: "결제 완료",
  partially_refunded: "부분 환불",
  refunded: "환불 완료",
  cancelled: "취소",
  failed: "실패",
  draft: "임시",
};
const ORDER_STATUS_TONE: Record<string, string> = {
  paid: "text-emerald-600 dark:text-emerald-400",
  refunded: "text-rose-600 dark:text-rose-400",
  partially_refunded: "text-amber-600 dark:text-amber-400",
};
const REFUND_STATUS_LABEL: Record<string, string> = {
  pending: "환불 요청",
  approved: "환불 승인",
  rejected: "환불 거절",
};

function MemberOrdersTab({ orders }: { orders: MemberOrder[] }) {
  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <HistEmpty text="주문 내역이 없습니다." />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <Card key={o.orderId}>
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
            <div>
              <p className="text-sm font-semibold">
                주문 {o.orderNo}
                <span
                  className={cn(
                    "ml-2 text-xs font-bold",
                    ORDER_STATUS_TONE[o.status] ?? "text-foreground",
                  )}
                >
                  {ORDER_STATUS_LABEL[o.status] ?? o.status}
                </span>
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {o.createdAt.slice(0, 10)} · {o.paymentMethod ?? "-"}
              </p>
            </div>
            <p className="shrink-0 text-sm font-bold tabular-nums">
              ₩{o.totalKrw.toLocaleString("ko-KR")}
            </p>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            <ul className="divide-y">
              {o.items.map((it) => (
                <li
                  key={it.orderItemId}
                  className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{it.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {" · "}
                      {it.itemType === "book" ? "도서" : "강의"}
                      {it.quantity > 1 ? ` ×${it.quantity}` : ""}
                    </span>
                    {it.refundedAt ? (
                      <span className="ml-1">
                        <Chip tone="outline">환불됨</Chip>
                      </span>
                    ) : null}
                    {it.refundStatus ? (
                      <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                        {REFUND_STATUS_LABEL[it.refundStatus] ?? it.refundStatus}
                      </span>
                    ) : null}
                    {it.shipment ? (
                      <span className="text-muted-foreground ml-1 text-xs">
                        · 배송 {it.shipment.status}
                        {it.shipment.trackingNo
                          ? ` (${it.shipment.trackingNo})`
                          : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    ₩{it.unitPriceKrw.toLocaleString("ko-KR")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── feat-7-046 쿠폰 탭 ────────────────────────────────────────────────────
function CouponChip({
  status,
}: {
  status: "available" | "used" | "expired" | "revoked";
}) {
  const map = {
    available: {
      label: "보유",
      cls: "border-emerald-500 text-emerald-700 dark:text-emerald-300",
    },
    used: { label: "사용", cls: "text-muted-foreground" },
    expired: { label: "만료", cls: "text-muted-foreground" },
    revoked: { label: "회수", cls: "text-rose-600 dark:text-rose-400" },
  }[status];
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
        map.cls,
      )}
    >
      {map.label}
    </span>
  );
}

function MemberCouponsTab({ coupons }: { coupons: MemberCoupons }) {
  const now = Date.now();
  const fmtDt = (s: string | null) => (s ? s.slice(0, 10) : "—");
  const subStatus = (
    c: MemberCoupons["subscription"][number],
  ): "available" | "used" | "expired" =>
    c.usedAt
      ? "used"
      : c.expiresAt && new Date(c.expiresAt).getTime() < now
        ? "expired"
        : "available";
  const grantStatus = (
    g: MemberCoupons["lectureGrants"][number],
  ): "available" | "revoked" | "expired" =>
    g.revokedAt
      ? "revoked"
      : g.expiresAt && new Date(g.expiresAt).getTime() < now
        ? "expired"
        : "available";

  const empty =
    coupons.subscription.length === 0 &&
    coupons.lectureGrants.length === 0 &&
    coupons.lectureRedemptions.length === 0;
  if (empty) {
    return (
      <Card>
        <CardContent className="py-10">
          <HistEmpty text="쿠폰 내역이 없습니다." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <p className="text-sm font-semibold">구독 쿠폰</p>
          <p className="text-muted-foreground text-xs">
            수강권·구독 할인 (user_coupons)
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {coupons.subscription.length === 0 ? (
            <HistEmpty text="구독 쿠폰이 없습니다." />
          ) : (
            <ul className="divide-y">
              {coupons.subscription.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      {c.valueLabel}
                      {c.code ? ` · ${c.code}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {c.usedAt
                        ? `사용 ${fmtDt(c.usedAt)}`
                        : `만료 ${fmtDt(c.expiresAt)}`}
                    </span>
                    <CouponChip status={subStatus(c)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <p className="text-sm font-semibold">강의 쿠폰</p>
          <p className="text-muted-foreground text-xs">
            강의몰 장바구니 쿠폰 (발급·사용)
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {coupons.lectureGrants.length === 0 &&
          coupons.lectureRedemptions.length === 0 ? (
            <HistEmpty text="강의 쿠폰이 없습니다." />
          ) : (
            <ul className="divide-y">
              {coupons.lectureGrants.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      {g.valueLabel}
                      {g.code ? ` · ${g.code}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      발급 {fmtDt(g.grantedAt)}
                    </span>
                    <CouponChip status={grantStatus(g)} />
                  </span>
                </li>
              ))}
              {coupons.lectureRedemptions.map((r, i) => (
                <li
                  key={`r${i}`}
                  className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      −₩{r.discountKrw.toLocaleString("ko-KR")}
                      {r.code ? ` · ${r.code}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      사용 {fmtDt(r.redeemedAt)}
                    </span>
                    <CouponChip status="used" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── feat-7-046 수강정보 탭 (진도율 + 개별완료처리) ────────────────────────
const ENROLL_STATUS_LABEL: Record<string, string> = {
  active: "수강중",
  expired: "만료",
  revoked: "회수",
};

function LessonCompleteToggle({
  userId,
  lessonId,
  manualComplete,
}: {
  userId: string;
  lessonId: string;
  manualComplete: boolean;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/lesson-completion"
      className="inline"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="lessonId" value={lessonId} />
      <input
        type="hidden"
        name="intent"
        value={manualComplete ? "uncomplete" : "complete"}
      />
      <Button
        type="submit"
        size="sm"
        variant={manualComplete ? "outline" : "default"}
        disabled={busy}
        className="h-6 px-2 text-[11px]"
      >
        {busy ? "…" : manualComplete ? "완료 취소" : "완료 처리"}
      </Button>
    </fetcher.Form>
  );
}

function MemberEnrollmentsTab({
  userId,
  courses,
}: {
  userId: string;
  courses: MemberEnrollmentCourse[];
}) {
  if (courses.length === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <HistEmpty text="수강 중인 과정이 없습니다." />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {courses.map((c) => (
        <Card key={c.enrollmentId}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{c.courseLabel}</p>
              <span className="flex items-center gap-2">
                <Chip tone={c.revokedAt ? "outline" : "solid"}>
                  {c.revokedAt
                    ? "회수"
                    : (ENROLL_STATUS_LABEL[c.status] ?? c.status)}
                </Chip>
                <span className="text-muted-foreground text-xs tabular-nums">
                  ~{c.expiresAt.slice(0, 10)}
                </span>
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${c.progressPct}%` }}
                />
              </div>
              <span className="text-muted-foreground shrink-0 text-xs font-semibold tabular-nums">
                {c.completedCount}/{c.totalCount} · {c.progressPct}%
              </span>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {c.lessons.length === 0 ? (
              <HistEmpty text="등록된 회차가 없습니다." />
            ) : (
              <ul className="divide-y">
                {c.lessons.map((l) => (
                  <li
                    key={l.lessonId}
                    className="flex items-center gap-2 px-4 py-2 text-sm"
                  >
                    <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">
                      {l.lessonNo}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {Math.round(l.progressRatio * 100)}%
                    </span>
                    {l.manualComplete ? (
                      <Chip tone="outline">수동완료</Chip>
                    ) : l.completed ? (
                      <Chip tone="solid">완강</Chip>
                    ) : null}
                    {l.manualComplete || !l.completed ? (
                      <LessonCompleteToggle
                        userId={userId}
                        lessonId={l.lessonId}
                        manualComplete={l.manualComplete}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── feat-7-046 포인트 탭 (적립금 잔액·이력 + 원장 수동 조정) ──────────────
function MemberPointsTab({
  userId,
  points,
}: {
  userId: string;
  points: MemberPoints;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const busy = fetcher.state !== "idle";
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const saved = !!(fetcher.data && "ok" in fetcher.data && fetcher.data.ok);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div>
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
              보유 포인트
            </p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">
              {points.balance.toLocaleString("ko-KR")}
              <span className="ml-1 text-base font-bold">P</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <p className="text-sm font-semibold">포인트 조정</p>
          <p className="text-muted-foreground text-xs">
            적립(+) / 차감(−) 1건을 기록합니다. 사유 필수 · 감사 로그 남음.
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="py-4">
          <fetcher.Form
            method="post"
            action="/api/admin/member-points"
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="userId" value={userId} />
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px] font-semibold">
                구분
              </span>
              <select
                name="direction"
                defaultValue="earn"
                className="border-input bg-background h-9 rounded-md border px-2 text-sm outline-none"
              >
                <option value="earn">적립 (+)</option>
                <option value="spend">차감 (−)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px] font-semibold">
                포인트
              </span>
              <input
                name="amount"
                type="number"
                min={1}
                required
                className="border-input bg-background h-9 w-28 rounded-md border px-3 text-sm tabular-nums outline-none"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-muted-foreground text-[11px] font-semibold">
                사유
              </span>
              <input
                name="reason"
                required
                placeholder="예: 이벤트 적립 / 오류 보정"
                className="border-input bg-background h-9 min-w-[160px] rounded-md border px-3 text-sm outline-none"
              />
            </label>
            <Button type="submit" size="sm" disabled={busy} className="h-9">
              {busy ? "처리 중…" : "적용"}
            </Button>
          </fetcher.Form>
          {err ? <p className="text-rose-600 mt-2 text-xs">{err}</p> : null}
          {saved ? (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              조정되었습니다.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <p className="text-sm font-semibold">포인트 내역</p>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {points.transactions.length === 0 ? (
            <HistEmpty text="포인트 내역이 없습니다." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일시</TableHead>
                  <TableHead>내역</TableHead>
                  <TableHead className="text-right">증감</TableHead>
                  <TableHead className="text-right">잔액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.transactions.map((t) => (
                  <TableRow key={t.txnId}>
                    <TableCell className="text-xs tabular-nums">
                      {t.createdAt.slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-sm">{t.reason ?? "—"}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-xs font-semibold tabular-nums",
                        t.delta >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {t.delta >= 0 ? "+" : ""}
                      {t.delta.toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                      {t.balanceAfter != null
                        ? t.balanceAfter.toLocaleString("ko-KR")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── feat-7-046 발송 탭 (전송 로그 + 인앱 알림) ────────────────────────────
const SEND_CHANNEL_LABEL: Record<string, string> = {
  email: "메일",
  kakao: "알림톡",
  sms: "SMS",
};

function MemberSendsTab({
  sends,
  notifications,
}: {
  sends: MemberSendRow[];
  notifications: MemberNotificationRow[];
}) {
  const fmtDt = (s: string) => s.slice(0, 16).replace("T", " ");
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <p className="text-sm font-semibold">전송 이력 (메일·알림톡)</p>
          <p className="text-muted-foreground text-xs">
            실제 발송 기록 — 발송 로그 도입 이후분만 표시됩니다.
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {sends.length === 0 ? (
            <HistEmpty text="전송 이력이 없습니다." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일시</TableHead>
                  <TableHead>채널</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sends.map((s) => (
                  <TableRow key={s.logId}>
                    <TableCell className="text-xs tabular-nums">
                      {fmtDt(s.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {SEND_CHANNEL_LABEL[s.channel] ?? s.channel}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="block max-w-[22rem] truncate">
                        {s.subject ?? s.kind ?? "—"}
                      </span>
                      {s.toAddress ? (
                        <span className="text-muted-foreground block max-w-[22rem] truncate text-[10px]">
                          {s.toAddress}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.status === "sent" ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          발송
                        </span>
                      ) : (
                        <span
                          className="text-rose-600 dark:text-rose-400"
                          title={s.error ?? undefined}
                        >
                          실패
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <p className="text-sm font-semibold">인앱 알림</p>
          <p className="text-muted-foreground text-xs">
            대시보드 알림함에 전달된 알림 카드
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {notifications.length === 0 ? (
            <HistEmpty text="인앱 알림이 없습니다." />
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n.notificationId} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">
                      {n.title}
                    </span>
                    <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs tabular-nums">
                      {n.readAt ? (
                        <Chip tone="outline">읽음</Chip>
                      ) : (
                        <Chip tone="solid">안읽음</Chip>
                      )}
                      {fmtDt(n.createdAt)}
                    </span>
                  </div>
                  {n.body ? (
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                      {n.body}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function labelForType(type: string): string {
  if (type === "article") return "조문 학습";
  if (type === "case") return "판례 학습";
  if (type === "problem") return "문제 풀이";
  return type || "활동";
}

function ActivityIcon({ type }: { type: string }) {
  const cls = "text-muted-foreground size-3.5 shrink-0 mt-0.5";
  if (type === "article") return <FileTextIcon className={cls} />;
  if (type === "case") return <GavelIcon className={cls} />;
  if (type === "problem") return <ListChecksIcon className={cls} />;
  return <ClockIcon className={cls} />;
}

function CohortComparisonCard({
  comparison,
  school,
}: {
  comparison: StudentCohortComparison;
  school: SchoolAverages;
}) {
  const c = comparison;
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const accSchoolDiff =
    c.selfAccuracyPct !== null && school.avgAccuracyPct !== null
      ? Math.round(c.selfAccuracyPct - school.avgAccuracyPct)
      : null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <UsersIcon className="text-link size-4" />
            반 평균 대비 — {c.cohortName}
          </p>
          <div className="flex items-center gap-2">
            {c.quartile !== null ? (
              <Badge
                variant={c.quartile >= 3 ? "default" : "secondary"}
                className="text-[10px]"
              >
                {c.quartile === 4
                  ? "상위 25%"
                  : c.quartile === 3
                    ? "상위 50%"
                    : c.quartile === 2
                      ? "하위 50%"
                      : "하위 25%"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                시도 부족
              </Badge>
            )}
            <Link
              to={`/admin/cohorts/${c.cohortId}/stats`}
              className="text-link inline-flex items-center gap-1 text-xs hover:underline"
            >
              반 통계 <ArrowRightIcon className="size-3" />
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          멤버 {c.memberCount}명 · 전체 {school.studentCount}명 평균 기준
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        <CompareChip
          label="정답률"
          self={c.selfAccuracyPct === null ? "—" : `${c.selfAccuracyPct}%`}
          unit="%p"
          higherIsBetter
          cohortAvg={c.avgAccuracyPct === null ? "—" : `${c.avgAccuracyPct}%`}
          cohortDiff={c.diffAccuracyPct}
          schoolAvg={
            school.avgAccuracyPct === null ? "—" : `${school.avgAccuracyPct}%`
          }
          schoolDiff={accSchoolDiff}
        />
        <CompareChip
          label="문제 풀이"
          self={`${c.selfProblemsAttempted}`}
          unit="문"
          higherIsBetter
          cohortAvg={`${c.avgProblemsAttempted}`}
          cohortDiff={c.diffProblemsAttempted}
          schoolAvg={`${school.avgProblemsAttempted}`}
          schoolDiff={round1(c.selfProblemsAttempted - school.avgProblemsAttempted)}
        />
        <CompareChip
          label="조문 열람"
          self={`${c.selfArticlesViewed}`}
          unit="조"
          higherIsBetter
          cohortAvg={`${c.avgArticlesViewed}`}
          cohortDiff={c.diffArticlesViewed}
          schoolAvg={`${school.avgArticlesViewed}`}
          schoolDiff={round1(c.selfArticlesViewed - school.avgArticlesViewed)}
        />
      </CardContent>
    </Card>
  );
}

function CompareChip({
  label,
  self,
  unit,
  higherIsBetter,
  cohortAvg,
  cohortDiff,
  schoolAvg,
  schoolDiff,
}: {
  label: string;
  self: string;
  unit: string;
  higherIsBetter: boolean;
  cohortAvg: string;
  cohortDiff: number | null;
  schoolAvg: string;
  schoolDiff: number | null;
}) {
  return (
    <div className="bg-muted/40 rounded-md border p-3">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <span className="mt-1 block text-lg font-bold tabular-nums">{self}</span>
      <div className="mt-1.5 space-y-1">
        <CompareLine
          scope="반"
          avg={cohortAvg}
          diff={cohortDiff}
          unit={unit}
          higherIsBetter={higherIsBetter}
        />
        <CompareLine
          scope="전체"
          avg={schoolAvg}
          diff={schoolDiff}
          unit={unit}
          higherIsBetter={higherIsBetter}
        />
      </div>
    </div>
  );
}

// "반 평균 50%  ▼ −4%p" 한 줄 — 반/전체 두 축을 같은 모양으로.
function CompareLine({
  scope,
  avg,
  diff,
  unit,
  higherIsBetter,
}: {
  scope: string;
  avg: string;
  diff: number | null;
  unit: string;
  higherIsBetter: boolean;
}) {
  const diffTone =
    diff === null
      ? "text-muted-foreground"
      : diff === 0
        ? "text-muted-foreground"
        : (diff > 0) === higherIsBetter
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400";
  const DiffIcon =
    diff === null || diff === 0
      ? MinusIcon
      : diff > 0
        ? TrendingUpIcon
        : TrendingDownIcon;
  const sign = diff === null || diff === 0 ? "" : diff > 0 ? "+" : "";
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground tabular-nums">
        {scope} {avg}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-semibold tabular-nums",
          diffTone,
        )}
      >
        <DiffIcon className="size-3" />
        {diff === null ? "—" : `${sign}${diff}${unit}`}
      </span>
    </div>
  );
}

// ─── 합격 예측 점수 추이 (feat-7-027) ───

function PassTrendCard({ items }: { items: PassPredictionSnapshotItem[] }) {
  const latest = items[items.length - 1];
  const oldest = items[0];
  const delta = latest.score - oldest.score;
  const bgTone = (score: number) =>
    score >= 80
      ? "bg-emerald-500/80"
      : score >= 60
        ? "bg-lime-500/80"
        : score >= 40
          ? "bg-amber-500/80"
          : score >= 20
            ? "bg-orange-500/80"
            : "bg-rose-500/80";
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            합격 예측 점수 추이 ({items.length}일)
          </p>
          <Badge variant="outline" className="text-[10px]">
            현재 {latest.score} · 시작 {oldest.score} ·{" "}
            <span
              className={cn(
                delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : delta < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "",
              )}
            >
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1">
          {items.map((it) => (
            <div
              key={it.snapshotDate}
              className="flex flex-1 flex-col"
              title={`${it.snapshotDate} · ${it.score}점 (${it.rating})`}
            >
              <div className="bg-muted/40 relative flex h-20 items-end overflow-hidden rounded">
                <div
                  className={cn("w-full transition-all", bgTone(it.score))}
                  style={{ height: `${Math.max(2, it.score)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── feat-2-027 단원 마스터리 (학생 화면과 동일 계산, 관리자 시점 미러) ───

function MasteryCard({ rows }: { rows: NodeMasteryRow[] }) {
  const summary = summarizeMastery(rows.map((r) => r.stage));
  const engaged = summary.learning + summary.familiar + summary.mastered;
  const mastered = rows.filter((r) => r.stage === "mastered");
  const widthPct = (n: number) => (engaged > 0 ? (n / engaged) * 100 : 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <BrainIcon className="text-link size-4" /> 단원 마스터리
        </p>
        <p className="text-muted-foreground text-xs">
          학습한 단원의 숙련도 · 마스터 = 정답률 85%+ &amp; 복습 2회 통과(파지)
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-4">
        {engaged === 0 ? (
          <p className="text-muted-foreground text-sm">
            아직 학습한 단원이 없습니다.
          </p>
        ) : (
          <>
            <div className="bg-muted flex h-2.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-muted-foreground/30"
                style={{ width: `${widthPct(summary.learning)}%` }}
              />
              <div
                className="bg-sky-500"
                style={{ width: `${widthPct(summary.familiar)}%` }}
              />
              <div
                className="bg-emerald-600"
                style={{ width: `${widthPct(summary.mastered)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">
                학습 중 {summary.learning}
              </span>
              <span className="font-medium text-sky-600 dark:text-sky-400">
                익숙 {summary.familiar}
              </span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                마스터 {summary.mastered}
              </span>
              <span className="text-muted-foreground">
                · 학습 단원 {engaged}개
              </span>
            </div>
            {mastered.length > 0 ? (
              <p className="text-sm">
                정복한 단원{" "}
                <b className="text-emerald-600 dark:text-emerald-400">
                  {mastered.length}
                </b>
                개
                <span className="text-muted-foreground">
                  {" · "}
                  {mastered
                    .slice(0, 6)
                    .map((m) => m.displayLabel)
                    .join(" · ")}
                  {mastered.length > 6 ? " …" : ""}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                익숙한 단원을 복습으로 2회 이상 통과하면 마스터(정복)로 올라갑니다.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── feat-2-027 성장 (레벨·스트릭·공부량) — 학생 화면과 동일 계산 ───

function GrowthCard({
  g,
  studyRank,
}: {
  g: GamificationSummary;
  studyRank: CohortStudyBand;
}) {
  const { level, thisWeekActiveDays, currentStreak, longestStreak } = g;
  const thisWeekH = g.thisWeekStudyMs / 3_600_000;
  const delta = g.studyDeltaPct;
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <TrendingUpIcon className="text-link size-4" /> 성장 · 공부량
        </p>
        <p className="text-muted-foreground text-xs">
          마스터 단원 수로 단계 · 이번 주 학습일과 공부량
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-lg font-bold tracking-tight">{level.name}</span>
          <span className="text-muted-foreground text-xs">
            단계 {level.levelNumber}/5 · 마스터 {level.masteredCount}단원
          </span>
        </div>
        {level.nextName ? (
          <p className="text-muted-foreground text-xs">
            <b className="text-foreground">{level.toNext}단원</b> 더 마스터하면{" "}
            <b className="text-foreground">{level.nextName}</b> 단계
          </p>
        ) : (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            최고 단계 통달
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm">
          <span>
            이번 주 <b>{thisWeekActiveDays}</b>일 학습
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <FlameIcon className="size-3.5 text-orange-500" /> 연속{" "}
            {currentStreak}일 · 최장 {longestStreak}일
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span>
            이번 주 <b className="text-base">{thisWeekH.toFixed(1)}</b>h 학습
          </span>
          {delta === null ? (
            <span className="text-muted-foreground text-xs">
              지난주 대비 — (첫 주)
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
                delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : delta < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground",
              )}
            >
              {delta > 0 ? (
                <TrendingUpIcon className="size-3" />
              ) : delta < 0 ? (
                <TrendingDownIcon className="size-3" />
              ) : (
                <MinusIcon className="size-3" />
              )}
              지난주 대비 {delta > 0 ? "+" : ""}
              {delta}%
            </span>
          )}
        </div>
        {studyRank.state === "ok" ? (
          <p className="text-muted-foreground text-xs">
            반 {studyRank.sampleSize}명 중 공부량{" "}
            <span className="text-foreground font-semibold">
              상위 {studyRank.topPercent}%
            </span>{" "}
            · {studyRank.band}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── feat-7-040 후속 — 최근 8주 학습 추세 미니차트 ───

function StudyTrendCard({
  weeks,
}: {
  weeks: Array<{ hours: number; attempts: number }>;
}) {
  const maxHours = Math.max(1, ...weeks.map((w) => w.hours));
  const hasData = weeks.some((w) => w.hours > 0 || w.attempts > 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <TrendingUpIcon className="text-link size-4" /> 최근 8주 학습 추세
        </p>
        <p className="text-muted-foreground text-xs">
          주별 학습 시간(막대). 가장 오른쪽이 이번 주 — 하락·정체 추세를 한눈에.
        </p>
      </CardHeader>
      <Separator />
      <CardContent>
        {!hasData ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            최근 8주 학습 기록이 없습니다.
          </p>
        ) : (
          <div className="flex items-end gap-1.5">
            {weeks.map((w, i) => {
              const isCurrent = i === weeks.length - 1;
              return (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${w.hours}h · ${w.attempts}문`}
                >
                  <div className="bg-muted/40 relative flex h-20 w-full items-end overflow-hidden rounded">
                    <div
                      className={cn(
                        "w-full transition-all",
                        isCurrent ? "bg-primary" : "bg-muted-foreground/30",
                      )}
                      style={{
                        height: `${Math.max(2, (w.hours / maxHours) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-muted-foreground text-[10px] tabular-nums">
                    {w.hours}h
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── feat-7-040 후속(가) — 개별 약점 단원 → 반 과제 출제 ───

function StudentWeakAssignmentForm({
  weakNodes,
  cohorts,
  studentName,
}: {
  weakNodes: Array<{ nodeId: string; displayLabel: string }>;
  cohorts: Array<{ cohortId: string; cohortName: string }>;
  studentName: string;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{
    ok?: true;
    assignmentId?: string;
    cohortId?: string;
    error?: string;
  }>();
  const navigate = useNavigate();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data?.ok &&
      fetcher.data.assignmentId
    ) {
      const cid = fetcher.data.cohortId ?? cohorts[0]?.cohortId;
      if (cid)
        navigate(
          `/admin/cohorts/${cid}/assignments/${fetcher.data.assignmentId}`,
        );
    }
  }, [fetcher.state, fetcher.data, navigate, cohorts]);

  return (
    <Card>
      <CardContent className="px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardListIcon className="text-link size-4" /> 약점 단원 → 반 과제
            출제
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "닫기" : `약점 단원 ${weakNodes.length}개로 과제 만들기`}
          </Button>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {studentName} 학생의 약점 단원(
          {weakNodes
            .slice(0, 4)
            .map((w) => w.displayLabel)
            .join(" · ")}
          {weakNodes.length > 4 ? " …" : ""})에서 승인 문제를 골라{" "}
          <b className="text-foreground">★ 반 전체 과제</b>로 출제합니다.
        </p>
        {open ? (
          <fetcher.Form
            method="post"
            action="/api/admin/assignment"
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="intent" value="create_from_weak" />
            <input
              type="hidden"
              name="nodeIds"
              value={weakNodes.map((w) => w.nodeId).join(",")}
            />
            {cohorts.length === 1 ? (
              <input
                type="hidden"
                name="cohortId"
                value={cohorts[0].cohortId}
              />
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground text-[11px]">반</span>
                <select
                  name="cohortId"
                  required
                  className="border-input bg-background h-9 rounded-md border px-2 text-[13px]"
                >
                  {cohorts.map((c) => (
                    <option key={c.cohortId} value={c.cohortId}>
                      {c.cohortName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">제목</span>
              <input
                name="title"
                defaultValue={`${studentName} 약점 보충 과제`}
                maxLength={200}
                className="border-input bg-background h-9 w-48 rounded-md border px-2 text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">마감</span>
              <input
                name="dueAt"
                type="datetime-local"
                required
                className="border-input bg-background h-9 rounded-md border px-2 text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">문항</span>
              <input
                name="n"
                type="number"
                min={1}
                max={50}
                defaultValue={10}
                className="border-input bg-background h-9 w-16 rounded-md border px-2 text-[13px]"
              />
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              반 과제 만들기
            </Button>
            {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
              <p className="w-full text-xs text-rose-600">
                {fetcher.data.error}
              </p>
            ) : null}
          </fetcher.Form>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── feat-7-040 P3 플랫폼 모의 응시 (exam 모드, 자습과 구분) ───

function MockSessionsCard({ sessions }: { sessions: StudentMockSession[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <ListChecksIcon className="text-link size-4" /> 플랫폼 모의 응시
        </p>
        <p className="text-muted-foreground text-xs">
          실전(exam) 모드 응시만 — 자습 풀이와 구분된 모의 성적·추이.
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <ul className="divide-y">
          {sessions.map((s) => (
            <li
              key={s.sessionId}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <Badge variant="outline" className="text-[10px]">
                {s.examKind === "ox" ? "OX" : "객관식"}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-sm">
                {s.packTitle ?? "모의고사"}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {s.correct}/{s.total}
              </span>
              <span
                className={cn(
                  "w-12 text-right text-sm font-bold tabular-nums",
                  accuracyTone(s.accuracyPct),
                )}
              >
                {s.accuracyPct}%
              </span>
              <span className="text-muted-foreground w-20 text-right text-[11px] tabular-nums">
                {s.completedAt.slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── feat-7-040 후속 P1-b 과제 이행 ───

function assignmentStatusBadge(status: AssignmentStatus): {
  variant: "default" | "outline";
  cls: string;
} {
  if (status === "completed") return { variant: "default", cls: "" };
  if (status === "partial")
    return {
      variant: "outline",
      cls: "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400",
    };
  return { variant: "outline", cls: "text-muted-foreground" };
}

function AssignmentProgressCard({
  assignments,
}: {
  assignments: StudentAssignmentRow[];
}) {
  const nowMs = Date.now();
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardListIcon className="text-link size-4" /> 과제 이행 (
          {assignments.length})
        </p>
        <p className="text-muted-foreground text-xs">
          담당 반 과제의 완료 상태 — 자동 채점(풀이·열람 기준).
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        {assignments.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            배정된 과제가 없습니다.
          </p>
        ) : (
          <ul className="divide-y">
            {assignments.map((a) => {
              const status = a.submission?.status ?? "pending";
              const done = a.submission?.completedItems ?? 0;
              const total = a.submission?.totalItems ?? 0;
              const badge = assignmentStatusBadge(status);
              const overdue =
                status !== "completed" &&
                new Date(a.dueAt).getTime() < nowMs;
              return (
                <li
                  key={a.assignmentId}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <Badge
                    variant={badge.variant}
                    className={cn("text-[10px]", badge.cls)}
                  >
                    {ASSIGNMENT_STATUS_LABEL[status]}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {a.title}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {done}/{total}
                  </span>
                  <span
                    className={cn(
                      "w-24 text-right text-[11px] tabular-nums",
                      overdue
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground",
                    )}
                  >
                    마감 {a.dueAt.slice(0, 10)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── feat-7-040 P1 실제 응시 결과 (자가신고·인증) ───

function examStatusTone(status: ExamResultRow["status"]): string {
  if (status === "passed") return "text-emerald-600 dark:text-emerald-400";
  if (status === "failed") return "text-rose-600 dark:text-rose-400";
  if (status === "pending") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function ExamResultsCard({ results }: { results: ExamResultRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <FileTextIcon className="text-link size-4" /> 실제 응시 결과
        </p>
        <p className="text-muted-foreground text-xs">
          자가 신고·인증 기준. 합격 예측과 별개의 실제 결과.
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>연도</TableHead>
              <TableHead>차수</TableHead>
              <TableHead>결과</TableHead>
              <TableHead className="text-right">자가신고 점수</TableHead>
              <TableHead className="text-right">인증</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r) => (
              <TableRow key={r.resultId}>
                <TableCell className="text-sm tabular-nums">
                  {r.examYear}
                </TableCell>
                <TableCell className="text-sm">
                  {EXAM_ROUND_LABEL[r.examRound]}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-sm font-semibold",
                    examStatusTone(r.status),
                  )}
                >
                  {EXAM_RESULT_STATUS_LABEL[r.status]}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {r.selfReportedTotalScore !== null
                    ? r.selfReportedTotalScore
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={
                      r.verificationStatus === "verified"
                        ? "default"
                        : "outline"
                    }
                    className="text-[10px]"
                  >
                    {EXAM_VERIFICATION_STATUS_LABEL[r.verificationStatus]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── feat-2-017 학생별 SRS 큐 요약 ───

function StudentSrsCard({ summary }: { summary: StudentSrsSummary }) {
  const totalDue =
    summary.problemDue + summary.blankDueBlanks + summary.oxDue + summary.articleDue;
  const totalLapses =
    summary.problemLapses + summary.blankLapses + summary.oxLapses;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold tracking-tight">복습 큐</h2>
          <div className="text-xs font-mono">
            <span className="text-muted-foreground">총 due </span>
            <span
              className={
                totalDue > 0
                  ? "text-rose-700 dark:text-rose-300 font-bold"
                  : "text-muted-foreground"
              }
            >
              {totalDue.toLocaleString("ko-KR")}건
            </span>
            {summary.oldestOverdueDays > 0 ? (
              <span className="text-rose-600 dark:text-rose-400 ml-2">
                · 가장 오래된 {summary.oldestOverdueDays}일 지남
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          객관식·빈칸·정오문제·조문 4 종 복습 통합. 학생이 다음 학습 진입 시 자동 큐잉.
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <SrsTile
            label="객관식"
            due={summary.problemDue}
            total={summary.problemTotal}
            lapses={summary.problemLapses}
          />
          <SrsTile
            label="빈칸 (세트)"
            due={summary.blankDueSets}
            total={summary.blankTotalBlanks}
            lapses={summary.blankLapses}
            note={`빈칸 ${summary.blankDueBlanks}개`}
          />
          <SrsTile
            label="정오문제"
            due={summary.oxDue}
            total={summary.oxTotal}
            lapses={summary.oxLapses}
          />
          <SrsTile
            label="조문 복습"
            due={summary.articleDue}
            total={summary.articleVisited}
            lapses={null}
            note="방문 기반"
          />
        </div>
        <p className="text-muted-foreground mt-3 text-[11px]">
          누적 실패 합산: {totalLapses.toLocaleString("ko-KR")}회 (객관식+빈칸+정오문제).
        </p>
      </CardContent>
    </Card>
  );
}

function SrsTile({
  label,
  due,
  total,
  lapses,
  note,
}: {
  label: string;
  due: number;
  total: number;
  lapses: number | null;
  note?: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-3.5 shadow-sm">
      <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        {label}
      </p>
      <p
        className={
          (due > 0
            ? "text-rose-700 dark:text-rose-300"
            : "text-foreground") +
          " mt-1.5 text-xl font-extrabold tabular-nums"
        }
      >
        {due.toLocaleString("ko-KR")}
        <span className="text-muted-foreground ml-1 text-xs font-medium">
          / {total.toLocaleString("ko-KR")}
        </span>
      </p>
      <p className="text-muted-foreground mt-1 text-[10px]">
        {note
          ? note
          : lapses !== null
            ? `실패 ${lapses.toLocaleString("ko-KR")}회`
            : ""}
      </p>
    </div>
  );
}

// ─── 1:1 상담 코멘트 (feat-7-025) ───

const CS_ACTION_LABEL: Record<string, string> = {
  device_reset: "기기 초기화",
  multiplier_credit: "배수 복구",
  multiplier_reset: "사용량 초기화",
  period_extend: "수강기간 연장",
  enrollment_block: "회차 차단",
  enrollment_grant: "수강권 지급",
  enrollment_revoke: "수강권 회수",
  pause_admin: "일시정지",
  refund_assist: "환불 지원",
  memo: "상담 메모",
  set_dates: "수강기간 수정",
};

function fmtCsTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

function fmtWatchDur(sec: number): string {
  if (sec <= 0) return "0분";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function WatchHistorySection({ courses }: { courses: UserWatchCourse[] }) {
  return (
    <Card id="watch-history" className="scroll-mt-20">
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <ClockIcon className="text-link size-4" />
          영상 시청 기록
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4 p-4">
        {courses.map((c) => (
          <div key={c.courseId} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold">{c.courseLabel}</p>
              <span className="text-muted-foreground text-[11px]">
                총 {fmtWatchDur(c.totalWatchedSeconds)} · {c.lessons.length}개 회차
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-[11px]">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-1 pr-2 font-medium">회차</th>
                    <th className="py-1 pr-2 text-right font-medium">시청</th>
                    <th className="py-1 pr-2 text-right font-medium">진도</th>
                    <th className="py-1 pr-2 font-medium">최초</th>
                    <th className="py-1 font-medium">마지막</th>
                  </tr>
                </thead>
                <tbody>
                  {c.lessons.map((l) => (
                    <tr key={l.lessonId} className="border-border/40 border-b last:border-0">
                      <td className="py-1 pr-2">
                        <span className="text-muted-foreground tabular-nums">
                          {l.lessonNo}강
                        </span>{" "}
                        {l.title}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {fmtWatchDur(l.watchedSeconds)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {Math.round(l.progressRatio * 100)}%
                      </td>
                      <td className="text-muted-foreground py-1 pr-2 tabular-nums">
                        {l.firstAt ? fmtCsTime(l.firstAt).slice(0, 10) : "-"}
                      </td>
                      <td className="text-muted-foreground py-1 tabular-nums">
                        {l.lastAt ? fmtCsTime(l.lastAt).slice(0, 10) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const QNA_STATUS_LABEL: Record<string, string> = {
  open: "답변 대기",
  answered: "답변 완료",
  ai_answered: "AI 답변",
  reviewing: "검토 중",
  closed: "종료",
  resolved: "해결",
};
const CS_STATUS_LABEL_MAP: Record<string, string> = {
  open: "답변 대기",
  answered: "답변 완료",
  closed: "종료",
};
const BOARD_LABEL: Record<string, string> = {
  free: "자유",
  qna: "질문",
  review: "합격수기",
  study: "스터디",
  notice: "공지",
};
const BUG_STATUS_LABEL: Record<string, string> = {
  open: "접수",
  in_progress: "처리중",
  done: "완료",
};

function ActivitySection({ activity }: { activity: StudentActivity }) {
  const { qna, inquiries, posts, bugReports } = activity;
  const empty =
    qna.length === 0 &&
    inquiries.length === 0 &&
    posts.length === 0 &&
    bugReports.length === 0;
  return (
    <Card id="activity" className="scroll-mt-20">
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquareIcon className="text-link size-4" />
          플랫폼 활동 내역
        </p>
        <p className="text-muted-foreground text-[11px]">
          이 수강생이 남긴 질의(Q&amp;A)·고객센터 문의·커뮤니티 글입니다.
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4 p-4">
        {empty ? (
          <p className="text-muted-foreground text-[13px]">활동 내역이 없습니다.</p>
        ) : null}

        {bugReports.length > 0 ? (
          <ActivityGroup title="오류신고" count={bugReports.length}>
            {bugReports.map((b) => (
              <ActivityRow
                key={b.reportId}
                to="/admin/bug-reports"
                title={b.message}
                status={BUG_STATUS_LABEL[b.status] ?? b.status}
                answered={b.status === "done"}
                createdAt={b.createdAt}
              />
            ))}
          </ActivityGroup>
        ) : null}

        {qna.length > 0 ? (
          <ActivityGroup title="질의 (Q&A)" count={qna.length}>
            {qna.map((q) => (
              <ActivityRow
                key={q.threadId}
                to={`/qna/${q.threadId}`}
                title={q.title || "(제목 없음)"}
                status={QNA_STATUS_LABEL[q.status] ?? q.status}
                answered={q.answeredAt != null}
                createdAt={q.createdAt}
              />
            ))}
          </ActivityGroup>
        ) : null}

        {inquiries.length > 0 ? (
          <ActivityGroup title="고객센터 문의" count={inquiries.length}>
            {inquiries.map((i) => (
              <ActivityRow
                key={i.inquiryId}
                to="/admin/cs-inquiries"
                title={i.title}
                badge={CS_CATEGORY_LABEL[i.category as keyof typeof CS_CATEGORY_LABEL] ?? i.category}
                status={CS_STATUS_LABEL_MAP[i.status] ?? i.status}
                answered={i.answeredAt != null}
                createdAt={i.createdAt}
              />
            ))}
          </ActivityGroup>
        ) : null}

        {posts.length > 0 ? (
          <ActivityGroup title="커뮤니티 글" count={posts.length}>
            {posts.map((p) => (
              <ActivityRow
                key={p.postId}
                title={p.title}
                badge={BOARD_LABEL[p.board] ?? p.board}
                createdAt={p.createdAt}
              />
            ))}
          </ActivityGroup>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActivityGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-[11px] font-bold tracking-wide">
        {title} <span className="tabular-nums">({count})</span>
      </p>
      <ul className="divide-border/40 divide-y">{children}</ul>
    </div>
  );
}

function ActivityRow({
  to,
  title,
  badge,
  status,
  answered,
  createdAt,
}: {
  to?: string;
  title: string;
  badge?: string;
  status?: string;
  answered?: boolean;
  createdAt: string;
}) {
  const inner = (
    <div className="flex items-center gap-2 py-1.5 text-[12px]">
      {badge ? (
        <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold">
          {badge}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {status ? (
        <span
          className={
            "shrink-0 text-[11px] font-semibold " +
            (answered
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400")
          }
        >
          {status}
        </span>
      ) : null}
      <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
        {createdAt.slice(0, 10)}
      </span>
    </div>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="hover:bg-muted/50 block rounded px-1">
          {inner}
        </Link>
      ) : (
        <div className="px-1">{inner}</div>
      )}
    </li>
  );
}

function CsHistorySection({
  studentId,
  actions,
}: {
  studentId: string;
  actions: CsActionRow[];
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      formRef.current?.reset();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  return (
    <Card id="cs-history" className="scroll-mt-20">
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardListIcon className="text-link size-4" />
          CS 처리 이력 ({actions.length})
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 p-4">
        <fetcher.Form
          ref={formRef}
          method="post"
          action="/api/admin/cs-memo"
          className="bg-muted/30 flex items-end gap-2 rounded-md border p-3"
        >
          <input type="hidden" name="studentId" value={studentId} />
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-[11px] font-semibold">
              상담 메모 (내부용 — 응대·문의·처리 내용 기록)
            </span>
            <input
              name="note"
              required
              maxLength={2000}
              placeholder="예: 결제 오류 문의 — 카드사 승인지연 안내, 재시도 요청"
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            />
          </label>
          <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
            <PlusIcon className="size-3.5" /> 메모
          </Button>
        </fetcher.Form>
        {fetcher.data && "error" in fetcher.data ? (
          <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
        ) : null}

        {actions.length === 0 ? (
          <p className="text-muted-foreground py-2 text-center text-xs">
            아직 CS 처리 이력이 없습니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {actions.map((a) => (
              <li
                key={a.actionId}
                className="bg-card flex items-start gap-2 rounded-md border p-2.5 text-xs"
              >
                <span className="bg-muted text-foreground/80 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                  {CS_ACTION_LABEL[a.kind] ?? a.kind}
                </span>
                <span className="min-w-0 flex-1 break-words">{a.note}</span>
                <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                  {a.actorName ?? "-"} · {fmtCsTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NotesSection({
  studentId,
  notes,
  currentUserId,
  isAdmin,
}: {
  studentId: string;
  notes: StudentNote[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <Card id="notes" className="scroll-mt-20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <MessageSquareIcon className="text-link size-4" />
            상담 코멘트 ({notes.length})
          </p>
          <Button
            size="sm"
            variant={creating ? "ghost" : "outline"}
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? (
              <>
                <XIcon className="size-3.5" /> 취소
              </>
            ) : (
              <>
                <PlusIcon className="size-3.5" /> 신규
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 p-4">
        {creating ? (
          <NewNoteForm
            studentId={studentId}
            onClose={() => setCreating(false)}
          />
        ) : null}
        {notes.length === 0 ? (
          <p className="text-muted-foreground py-2 text-center text-xs">
            아직 코멘트가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <NoteRow
                key={n.noteId}
                note={n}
                canEdit={isAdmin || n.authorId === currentUserId}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NewNoteForm({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, onClose, navigate, location.pathname, location.search]);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/student-note"
      className="bg-muted/30 space-y-2 rounded-md border p-3"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="studentId" value={studentId} />
      <textarea
        name="bodyMd"
        required
        rows={3}
        maxLength={4000}
        placeholder="이 학생에게 남길 코멘트… (마크다운 가능)"
        className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input
            type="radio"
            name="visibility"
            value="staff_only"
            defaultChecked
          />
          <EyeOffIcon className="size-3" /> 강사만
        </label>
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input
            type="radio"
            name="visibility"
            value="share_with_student"
          />
          <EyeIcon className="size-3" /> 학생도 보기
        </label>
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input type="checkbox" name="isPinned" value="1" />
          <PinIcon className="size-3" /> 핀
        </label>
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
            저장
          </Button>
        </div>
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
    </fetcher.Form>
  );
}

function NoteRow({
  note,
  canEdit,
}: {
  note: StudentNote;
  canEdit: boolean;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  return (
    <li className="bg-card space-y-1.5 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {note.isPinned ? (
          <Badge variant="default" className="text-[10px]">
            <PinIcon className="size-3" /> 핀
          </Badge>
        ) : null}
        <Badge
          variant={
            note.visibility === "share_with_student" ? "default" : "outline"
          }
          className="text-[10px]"
        >
          {note.visibility === "share_with_student" ? (
            <>
              <EyeIcon className="size-3" /> 학생 공개
            </>
          ) : (
            <>
              <EyeOffIcon className="size-3" /> 강사만
            </>
          )}
        </Badge>
        {note.visibility === "share_with_student" ? (
          note.readAt ? (
            <Badge
              variant="outline"
              className="border-emerald-300 text-[10px] text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
            >
              <CheckCheckIcon className="size-3" /> 읽음 ·{" "}
              {note.readAt.slice(5, 16).replace("T", " ")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground text-[10px]">
              안읽음
            </Badge>
          )
        ) : null}
        <span className="text-muted-foreground ml-auto text-[10px] tabular-nums">
          {note.authorName ?? "(작성자)"} · {note.createdAt.slice(0, 16).replace("T", " ")}
        </span>
        {canEdit ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6"
            onClick={() => setEditing((v) => !v)}
            title="수정"
          >
            <PencilIcon className="size-3" />
          </Button>
        ) : null}
        {canEdit ? (
          <fetcher.Form method="post" action="/api/admin/student-note">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="noteId" value={note.noteId} />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="size-6 text-rose-600 hover:text-rose-700"
              onClick={(e) => {
                if (!confirm("이 코멘트를 삭제합니까?")) {
                  e.preventDefault();
                }
              }}
              disabled={fetcher.state !== "idle"}
            >
              <Trash2Icon className="size-3" />
            </Button>
          </fetcher.Form>
        ) : null}
      </div>
      {editing ? (
        <EditNoteForm note={note} onClose={() => setEditing(false)} />
      ) : (
        <MarkdownView text={note.bodyMd} trusted={false} className="text-sm" />
      )}
    </li>
  );
}

function EditNoteForm({
  note,
  onClose,
}: {
  note: StudentNote;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, onClose, navigate, location.pathname, location.search]);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/student-note"
      className="bg-muted/30 space-y-2 rounded-md border p-3"
    >
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="noteId" value={note.noteId} />
      <textarea
        name="bodyMd"
        required
        rows={3}
        maxLength={4000}
        defaultValue={note.bodyMd}
        placeholder="코멘트… (마크다운 가능)"
        className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input
            type="radio"
            name="visibility"
            value="staff_only"
            defaultChecked={note.visibility === "staff_only"}
          />
          <EyeOffIcon className="size-3" /> 강사만
        </label>
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input
            type="radio"
            name="visibility"
            value="share_with_student"
            defaultChecked={note.visibility === "share_with_student"}
          />
          <EyeIcon className="size-3" /> 학생도 보기
        </label>
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input
            type="checkbox"
            name="isPinned"
            value="1"
            defaultChecked={note.isPinned}
          />
          <PinIcon className="size-3" /> 핀
        </label>
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
            저장
          </Button>
        </div>
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
    </fetcher.Form>
  );
}
