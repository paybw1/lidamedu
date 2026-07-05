// 반 상세 + 멤버 관리. 본인 소유 반(또는 admin)만 접근.

import {
  ArchiveIcon,
  ArrowRightIcon,
  BarChart3Icon,
  BookCheckIcon,
  CalendarRangeIcon,
  ClipboardCheckIcon,
  LineChartIcon,
  MailIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  data,
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { ROLE_LABEL } from "~/core/lib/roles";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Separator } from "~/core/components/ui/separator";
import makeServerClient from "~/core/lib/supa-client.server";
import type { CohortListItem, CohortMember } from "~/features/cohorts/labels";
import {
  getCohortById,
  listCohortMembers,
  searchStudents,
  type SearchStudentResult,
} from "~/features/cohorts/queries.server";
import {
  listCohortCurricula,
  listCurricula,
  type CohortCurriculumRow,
  type CurriculumListItem,
} from "~/features/curricula/queries.server";
import {
  getAtRiskStudents,
  type AtRiskStudent,
  type AtRiskSummary,
} from "~/features/exam-results/at-risk.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";

import type { Route } from "./+types/admin-cohort-detail";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.cohort) return [{ title: "반 상세 | 리담변리사학원" }];
  return [{ title: `${d.cohort.name} | 리담변리사학원` }];
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

  const members = await listCohortMembers(client, params.cohortId);

  const url = new URL(request.url);
  const searchQuery = (url.searchParams.get("add_q") ?? "").trim().slice(0, 100);
  const searchResults: SearchStudentResult[] =
    searchQuery.length >= 2 ? await searchStudents(searchQuery) : [];

  const [cohortCurricula, allCurricula, atRisk] = await Promise.all([
    listCohortCurricula(params.cohortId),
    listCurricula(),
    getAtRiskStudents(params.cohortId),
  ]);

  return {
    cohort,
    members,
    searchQuery,
    searchResults,
    role,
    cohortCurricula,
    allCurricula,
    atRisk,
  };
}

export default function AdminCohortDetail({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, members, searchQuery, searchResults, role, cohortCurricula, allCurricula, atRisk } =
    loaderData;
  const [editing, setEditing] = useState(false);

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      title={cohort.name}
      desc={
        [
          cohort.ownerName ? `담당 ${cohort.ownerName}` : null,
          cohort.isArchived ? "아카이브" : "활성",
          `멤버 ${members.length}명`,
          cohort.startsOn && cohort.endsOn
            ? `${cohort.startsOn} ~ ${cohort.endsOn}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      }
      headerRight={
        !editing ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to={`/admin/cohorts/${cohort.cohortId}/progress`}>
                <TrendingUpIcon className="size-3.5" /> 진도
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/cohorts/${cohort.cohortId}/stats`}>
                <BarChart3Icon className="size-3.5" /> 통계
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/cohorts/${cohort.cohortId}/assignments`}>
                <BookCheckIcon className="size-3.5" /> 과제
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/cohorts/${cohort.cohortId}/attendance`}>
                <ClipboardCheckIcon className="size-3.5" /> 출결
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/cohorts/${cohort.cohortId}/test-series`}>
                <LineChartIcon className="size-3.5" /> 시험 추이
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              <PencilIcon className="size-3.5" /> 반 정보 수정
            </Button>
          </div>
        ) : null
      }
      width={960}
    >
      {/* 요약 Chip 행 */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {cohort.isArchived ? (
          <Chip tone="neutral">
            <ArchiveIcon className="size-3" /> 아카이브
          </Chip>
        ) : (
          <Chip tone="emerald">활성</Chip>
        )}
        {cohort.ownerName ? (
          <Chip tone="blue">담당 {cohort.ownerName}</Chip>
        ) : null}
        <Chip tone="outline">
          <UsersIcon className="size-3" /> {members.length}명
        </Chip>
        {cohort.startsOn ? (
          <Chip tone="neutral">
            <CalendarRangeIcon className="size-3" />
            {cohort.startsOn} ~ {cohort.endsOn ?? "—"}
          </Chip>
        ) : null}
        {cohort.description ? (
          <p className="text-muted-foreground mt-1 w-full text-xs whitespace-pre-line">
            {cohort.description}
          </p>
        ) : null}
      </div>

      {editing ? (
        <div className="mb-6">
          <CohortEditForm cohort={cohort} onClose={() => setEditing(false)} />
        </div>
      ) : null}

      <div className="mb-6">
        <CurriculumSection
          cohortId={cohort.cohortId}
          applied={cohortCurricula}
          available={allCurricula}
        />
      </div>

      <div className="mb-6">
        <AtRiskCard summary={atRisk} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="px-4 pb-2">
            <p className="text-sm font-semibold">멤버 ({members.length}명)</p>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {members.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-muted-foreground text-sm">
                  멤버가 없습니다. 우측 검색으로 학생을 추가하세요.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {members.map((m) => (
                  <MemberRow
                    key={m.profileId}
                    member={m}
                    cohortId={cohort.cohortId}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 pb-2">
            <p className="inline-flex items-center gap-1 text-sm font-semibold">
              <PlusIcon className="text-link size-4" /> 멤버 추가
            </p>
            <p className="text-muted-foreground text-xs">
              이름 또는 이메일로 학생을 검색해 추가하세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            <form method="get" className="flex gap-1.5">
              <Input
                name="add_q"
                defaultValue={searchQuery}
                placeholder="이름·이메일 (2자 이상)"
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" className="h-8">
                <SearchIcon className="size-3.5" />
              </Button>
            </form>
            {searchQuery.length > 0 && searchQuery.length < 2 ? (
              <p className="text-muted-foreground text-xs">
                2자 이상 입력하세요.
              </p>
            ) : null}
            {searchQuery.length >= 2 && searchResults.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                일치하는 사용자가 없습니다.
              </p>
            ) : null}
            <ul className="space-y-1.5">
              {searchResults.map((s) => {
                const alreadyMember = members.some(
                  (m) => m.profileId === s.profileId,
                );
                return (
                  <SearchResultRow
                    key={s.profileId}
                    student={s}
                    cohortId={cohort.cohortId}
                    alreadyMember={alreadyMember}
                  />
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

function MemberRow({
  member,
  cohortId,
}: {
  member: CohortMember;
  cohortId: string;
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
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);

  const roleChipTone =
    member.role === "admin"
      ? "solid" as const
      : member.role === "instructor"
        ? "blue" as const
        : "outline" as const;

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <UserIcon className="text-muted-foreground size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to={`/admin/students/${member.profileId}`}
            viewTransition
            className="hover:text-link text-sm font-medium"
          >
            {member.name}
          </Link>
          <Chip tone={roleChipTone}>{ROLE_LABEL[member.role]}</Chip>
        </div>
        {member.email ? (
          <p className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <MailIcon className="size-3" />
            {member.email}
          </p>
        ) : null}
      </div>
      <span className="text-muted-foreground hidden text-xs tabular-nums sm:inline">
        {member.joinedAt.slice(0, 10)}
      </span>
      <fetcher.Form method="post" action="/api/admin/cohort">
        <input type="hidden" name="intent" value="remove_member" />
        <input type="hidden" name="cohortId" value={cohortId} />
        <input type="hidden" name="profileId" value={member.profileId} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          aria-label="제거"
          className="size-7 text-rose-600 hover:text-rose-700"
          disabled={fetcher.state !== "idle"}
          onClick={(e) => {
            if (!confirm(`"${member.name}" 을(를) 반에서 제거하시겠습니까?`)) {
              e.preventDefault();
            }
          }}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </fetcher.Form>
    </li>
  );
}

function SearchResultRow({
  student,
  cohortId,
  alreadyMember,
}: {
  student: SearchStudentResult;
  cohortId: string;
  alreadyMember: boolean;
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
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <li className="flex items-center gap-2 rounded-md border p-2">
      <UserIcon className="text-muted-foreground size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">
          {student.name || "(이름 없음)"}{" "}
          <span className="text-muted-foreground text-[10px]">
            · {ROLE_LABEL[student.role]}
          </span>
        </p>
        {student.email ? (
          <p className="text-muted-foreground truncate text-[10px]">
            {student.email}
          </p>
        ) : null}
      </div>
      {alreadyMember ? (
        <Chip tone="neutral">이미 멤버</Chip>
      ) : (
        <fetcher.Form method="post" action="/api/admin/cohort">
          <input type="hidden" name="intent" value="add_member" />
          <input type="hidden" name="cohortId" value={cohortId} />
          <input type="hidden" name="profileId" value={student.profileId} />
          <Button
            type="submit"
            size="sm"
            className="h-7"
            disabled={fetcher.state !== "idle"}
          >
            <PlusIcon className="size-3" /> 추가
          </Button>
        </fetcher.Form>
      )}
      {err ? <span className="text-rose-600 text-[10px]">{err}</span> : null}
    </li>
  );
}

function CurriculumSection({
  cohortId,
  applied,
  available,
}: {
  cohortId: string;
  applied: CohortCurriculumRow[];
  available: CurriculumListItem[];
}) {
  const [showApply, setShowApply] = useState(false);
  const appliedIds = new Set(applied.map((a) => a.curriculumId));
  const candidates = available.filter(
    (c) => !appliedIds.has(c.curriculumId) && c.isPublished,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <BookCheckIcon className="text-link size-4" />
            커리큘럼 ({applied.length})
          </p>
          {candidates.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowApply((v) => !v)}
            >
              <PlusIcon className="size-3.5" /> 커리큘럼 적용
            </Button>
          ) : (
            <Button asChild size="sm" variant="ghost">
              <Link to="/admin/curricula">
                관리 <ArrowRightIcon className="size-3" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">
        {applied.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            적용된 커리큘럼이 없습니다.
            {candidates.length === 0
              ? " 먼저 /admin/curricula 에서 커리큘럼을 만들고 발행하세요."
              : ""}
          </p>
        ) : (
          <ul className="divide-y">
            {applied.map((a) => (
              <CurriculumAppliedRow key={a.curriculumId} row={a} />
            ))}
          </ul>
        )}
        {showApply ? (
          <CurriculumApplyForm
            cohortId={cohortId}
            candidates={candidates}
            onClose={() => setShowApply(false)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function CurriculumAppliedRow({ row }: { row: CohortCurriculumRow }) {
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
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  return (
    <li className="flex items-center gap-2 py-2">
      <Link
        to={`/admin/curricula/${row.curriculumId}`}
        viewTransition
        className="hover:text-link min-w-0 flex-1 truncate text-sm font-medium"
      >
        {row.curriculumName}
      </Link>
      <span className="text-muted-foreground text-xs tabular-nums">
        시작 {row.startDate}
      </span>
      {row.isActive ? (
        <Chip tone="emerald">활성</Chip>
      ) : (
        <Chip tone="neutral">비활성</Chip>
      )}
      <fetcher.Form method="post" action="/api/admin/curriculum">
        <input type="hidden" name="intent" value="remove_from_cohort" />
        <input type="hidden" name="cohortId" value={row.cohortId} />
        <input type="hidden" name="curriculumId" value={row.curriculumId} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="size-6 text-rose-600 hover:text-rose-700"
          onClick={(e) => {
            if (!confirm(`"${row.curriculumName}" 적용을 해제합니까?`)) {
              e.preventDefault();
            }
          }}
          disabled={fetcher.state !== "idle"}
        >
          <Trash2Icon className="size-3" />
        </Button>
      </fetcher.Form>
    </li>
  );
}

function CurriculumApplyForm({
  cohortId,
  candidates,
  onClose,
}: {
  cohortId: string;
  candidates: CurriculumListItem[];
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
      action="/api/admin/curriculum"
      className="bg-muted/30 mt-2 space-y-2 rounded-md border p-3"
    >
      <input type="hidden" name="intent" value="apply_to_cohort" />
      <input type="hidden" name="cohortId" value={cohortId} />
      <div className="grid grid-cols-[1fr_140px] gap-2">
        <select
          name="curriculumId"
          required
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        >
          {candidates.map((c) => (
            <option key={c.curriculumId} value={c.curriculumId}>
              {c.name} ({c.durationWeeks}주, 항목 {c.itemCount})
            </option>
          ))}
        </select>
        <Input
          name="startDate"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="h-8 text-xs tabular-nums"
        />
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          적용
        </Button>
      </div>
    </fetcher.Form>
  );
}

function CohortEditForm({
  cohort,
  onClose,
}: {
  cohort: CohortListItem;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data;
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
      action="/api/admin/cohort"
      className="bg-card border-border space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        반 정보 수정
      </p>
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="cohortId" value={cohort.cohortId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_120px_1fr]">
        <FormField label="이름 *" full>
          <Input
            name="name"
            required
            maxLength={200}
            defaultValue={cohort.name}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="시작일">
          <Input
            name="startsOn"
            type="date"
            defaultValue={cohort.startsOn ?? ""}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="종료일">
          <Input
            name="endsOn"
            type="date"
            defaultValue={cohort.endsOn ?? ""}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="설명" full>
          <textarea
            name="description"
            maxLength={2000}
            defaultValue={cohort.description ?? ""}
            rows={3}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
          />
        </FormField>
        <FormField label="아카이브">
          <label className="border-input flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
            <input
              type="checkbox"
              name="isArchived"
              value="1"
              defaultChecked={cohort.isArchived}
              className="size-3.5"
            />
            <ArchiveIcon className="size-3" /> 아카이브로 표시
          </label>
        </FormField>
      </div>
      {hasError ? (
        <p className="text-rose-600 text-xs">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          <PencilIcon className="size-3.5" /> 저장
        </Button>
      </div>
    </fetcher.Form>
  );
}

function FormField({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Label className="text-muted-foreground text-[11px] sm:self-center">
        {label}
      </Label>
      <div className={full ? "sm:col-span-3" : ""}>{children}</div>
    </>
  );
}

// feat-8-014 위험 학생 자동 분류
function AtRiskCard({ summary }: { summary: AtRiskSummary }) {
  if (summary.students.length === 0) return null;
  // "상담 권장" = 위험(high)+주의(medium) 전원. 안정(low)은 제외, 상한 없음
  // (top 5 고정 캡 때문에 6번째부터 안 보이던 버그 수정). 이미 riskScore 내림차순.
  const topRisk = summary.students.filter((s) => s.riskLevel !== "low");
  const showBaseline = summary.baseline !== null && summary.baseline.sampleSize > 0;
  return (
    <Card className="border-rose-200 dark:border-rose-800">
      <CardHeader className="px-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
              1:1 상담 권장 학생
            </p>
            <p className="text-muted-foreground text-[11px]">
              합격자 평균 대비 격차 + 비활성을 weighted 합산해 위험 분류.
              {showBaseline ? (
                <>
                  {" "}
                  표본 {summary.baseline!.sampleSize}명 (평균 풀이{" "}
                  {Math.round(summary.baseline!.problemAttemptsMean).toLocaleString("ko-KR")}회 · 정답률{" "}
                  {Math.round(summary.baseline!.accuracyPctMean)}%).
                </>
              ) : (
                <span> (합격자 표본 없음 — 비활성·낮은 정답률만 기준)</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <Chip tone="coral">위험 {summary.highRiskCount}</Chip>
            <Chip tone="amber">주의 {summary.mediumRiskCount}</Chip>
            <Chip tone="emerald">안정 {summary.lowRiskCount}</Chip>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="px-0 py-0">
        {topRisk.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            현재 위험 분류 학생이 없습니다.
          </p>
        ) : (
          <ul className="divide-y">
            {topRisk.map((s) => (
              <AtRiskRow key={s.profileId} student={s} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AtRiskRow({ student }: { student: AtRiskStudent }) {
  const riskChipTone =
    student.riskLevel === "high"
      ? "coral" as const
      : student.riskLevel === "medium"
        ? "amber" as const
        : "emerald" as const;
  const label =
    student.riskLevel === "high"
      ? "위험"
      : student.riskLevel === "medium"
        ? "주의"
        : "안정";
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/admin/students/${student.profileId}`}
            className="text-sm font-semibold hover:underline"
          >
            {student.name}
          </Link>
          <Chip tone={riskChipTone}>
            {label} {Math.round(student.riskScore * 100)}점
          </Chip>
          {student.email ? (
            <span className="text-muted-foreground text-[10px]">{student.email}</span>
          ) : null}
        </div>
        <div className="text-muted-foreground mt-1 flex flex-wrap gap-2 text-[11px] tabular-nums">
          <span>풀이 {student.problemsAttempted.toLocaleString("ko-KR")}회</span>
          {student.accuracyPct !== null ? (
            <span>· 정답률 {student.accuracyPct}%</span>
          ) : null}
          <span>· 조문 열람 {student.articlesViewed}</span>
          {student.daysSinceActive !== null ? (
            <span>
              · 마지막 활동{" "}
              {student.daysSinceActive === 0
                ? "오늘"
                : `${student.daysSinceActive}일 전`}
            </span>
          ) : (
            <span>· 활동 기록 없음</span>
          )}
        </div>
        {student.reasons.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {student.reasons.map((r, i) => (
              <span
                key={i}
                className="bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300 rounded px-1.5 py-0.5 text-[10px]"
              >
                {r}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <Button asChild size="sm" variant="default">
        <Link to={`/admin/students/${student.profileId}#notes`}>
          <MailIcon className="size-3.5" /> 1:1 코멘트
        </Link>
      </Button>
    </li>
  );
}

